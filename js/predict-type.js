/**
 * VoicePredictType — orthography policy + typing fixes.
 * Depends on VoicePredictData (hard fail if missing).
 *
 * Public:
 *   formatSuggestion(word, isSentenceStart)
 *   orthographyFor(prefix, ctx) → { pinChips, candidates, boosts }
 *   applyInsert(text, start, end, chunk) → { text, caret, changed }
 *   stripApostrophes(s)
 */
(function (global) {
  "use strict";

  const D = global.VoicePredictData;
  if (!D) {
    throw new Error("[VoicePredictType] VoicePredictData missing — load predict-data.js first");
  }

  /** lowercase form → preferred display spelling */
  const CANONICAL = (() => {
    const m = new Map();
    for (const form of Object.values(D.CONTRACTION_SHORTCUTS)) {
      m.set(form.toLowerCase(), form);
    }
    for (const forms of Object.values(D.CONTRACTION_FORMS)) {
      for (const f of forms) m.set(f.toLowerCase(), f);
    }
    m.set("i", "I");
    return m;
  })();

  function stripApostrophes(s) {
    return String(s || "").toLowerCase().replace(/['’]/g, "");
  }

  /** Prefer contraction vs alt for ambiguous bare tokens (ill / id). */
  function preferAmbig(bare, prev1) {
    const row = D.AMBIGUOUS_READINGS[bare];
    if (!row) return null;
    const p1 = String(prev1 || "").toLowerCase();
    if (row.preferAltWhenPrev.has(p1)) return row.alt;
    return row.contraction;
  }

  /** Dictionary / I / contraction spelling only (no sentence capitalisation). */
  function canonicalizeToken(word) {
    if (!word) return "";
    let out = String(word);

    if (/\s/.test(out)) {
      return out
        .replace(/\bi\b/g, "I")
        .replace(/\bi(['’][a-z]+)/gi, (_, rest) => "I" + rest);
    }

    if (/^i$/i.test(out)) return "I";
    if (/^i['’][a-z]+$/i.test(out)) return "I" + out.slice(1);

    const lower = out.toLowerCase();
    if (CANONICAL.has(lower)) return CANONICAL.get(lower);

    const bare = stripApostrophes(out);
    if (D.CONTRACTION_SHORTCUTS[bare] && !D.AMBIGUOUS_SHORTCUTS.has(bare)) {
      return D.CONTRACTION_SHORTCUTS[bare];
    }

    // Preserve explicit ID chip casing; leave bare "ill"/"id" as words
    if (out === "ID") return "ID";
    return out;
  }

  function displayCase(word, isSentenceStart) {
    if (!word) return "";
    let out = String(word);
    if (isSentenceStart && /^[a-z]/.test(out)) {
      out = out.charAt(0).toUpperCase() + out.slice(1);
    }
    return out;
  }

  function formatSuggestion(word, isSentenceStart) {
    return displayCase(canonicalizeToken(word), isSentenceStart);
  }

  /** Forms only — ranking/pin owned by orthographyFor. */
  function contractionFormsFor(prefix, limit) {
    const p = stripApostrophes(prefix || "");
    if (!p) return [];
    const out = [];
    const seen = new Set();
    const push = (f) => {
      if (!f) return;
      const k = f.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(f);
    };

    if (p === "i") {
      D.I_FAMILY.forEach(push);
      return out.slice(0, limit || 8);
    }

    for (const [abbr, form] of Object.entries(D.CONTRACTION_SHORTCUTS)) {
      if (abbr === p || abbr.startsWith(p)) push(form);
    }
    for (const form of Object.values(D.CONTRACTION_SHORTCUTS)) {
      if (stripApostrophes(form).startsWith(p)) push(form);
    }
    if (D.CONTRACTION_FORMS[p]) D.CONTRACTION_FORMS[p].forEach(push);

    const ambig = D.AMBIGUOUS_READINGS[p];
    if (ambig) push(ambig.alt);

    return out.slice(0, limit || 8);
  }

  function dedupePreserve(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const k = String(item).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
    return out;
  }

  /**
   * Single orthography policy for chips + scoring.
   * @returns {{ pinChips: string[], candidates: string[], boosts: Map<string, number> }}
   */
  function orthographyFor(prefix, ctx) {
    const midWord = !!(ctx && ctx.midWord);
    const isSentenceStart = !!(ctx && ctx.isSentenceStart);
    const prev1 = (ctx && ctx.prev1) || "";
    const pfxBare = stripApostrophes(prefix || "");
    const pinChips = [];
    const candidates = [];
    const boosts = new Map();
    const W = D.SCORE_WEIGHTS.orthography;

    const addBoost = (word, amount) => {
      const k = String(word || "").toLowerCase();
      if (!k) return;
      boosts.set(k, Math.max(boosts.get(k) || 0, amount));
    };

    if (!midWord) {
      if (isSentenceStart) {
        D.I_FAMILY.forEach((f, i) => {
          candidates.push(f);
          addBoost(f, 0.25 - i * 0.02);
        });
      }
      return { pinChips, candidates, boosts };
    }

    if (!pfxBare) return { pinChips, candidates, boosts };

    if (pfxBare === "i") {
      D.I_FAMILY.forEach((f, i) => {
        pinChips.push(f);
        candidates.push(f);
        addBoost(f, W - i * 0.04);
      });
      return { pinChips: dedupePreserve(pinChips), candidates, boosts };
    }

    const forms = contractionFormsFor(prefix, 12);
    forms.forEach((f, i) => {
      candidates.push(f);
      addBoost(f, i === 0 ? W : W * 0.5 - i * 0.02);
    });

    const exact = D.CONTRACTION_SHORTCUTS[pfxBare];
    if (exact) {
      pinChips.push(exact);
      addBoost(exact, W + 0.08);
    }

    // One table drives both ill and id pin order
    const ambig = D.AMBIGUOUS_READINGS[pfxBare];
    if (ambig) {
      const preferred = preferAmbig(pfxBare, prev1);
      const other = preferred === ambig.contraction ? ambig.alt : ambig.contraction;
      pinChips.length = 0;
      pinChips.push(preferred, other);
      addBoost(preferred, W + 0.1);
      addBoost(other, W * 0.35);
    }

    return {
      pinChips: dedupePreserve(pinChips),
      candidates: dedupePreserve(candidates),
      boosts
    };
  }

  /** Final corrected form for a completed token, or null if no change. */
  function autoCorrectToken(token, prev1, isSentenceStart) {
    if (!token) return null;
    const raw = String(token);
    const bare = stripApostrophes(raw);

    if (bare === "i") return "I";

    if (D.AUTO_BOUNDARY_ALWAYS[bare]) {
      return formatSuggestion(D.AUTO_BOUNDARY_ALWAYS[bare], isSentenceStart);
    }

    const ambig = D.AMBIGUOUS_READINGS[bare];
    if (ambig) {
      const pref = preferAmbig(bare, prev1);
      // Auto only when preferred is the contraction (or explicit ID for badge context)
      if (pref === ambig.contraction) return ambig.contraction;
      if (pref === ambig.alt && bare === "id") return "ID";
      return null;
    }

    if (/^i['’][a-z]+$/i.test(raw)) {
      return formatSuggestion(raw, false);
    }
    return null;
  }

  function correctTokenBeforeCaret(text, caret) {
    const raw = String(text || "");
    let pos = Math.max(0, Math.min(caret, raw.length));
    const boundaryEnd = pos;
    while (pos > 0 && /[\s.,!?;:]/.test(raw[pos - 1])) pos--;
    const boundary = raw.slice(pos, boundaryEnd);
    if (!boundary) return null;

    let wordStart = pos;
    while (wordStart > 0 && /[A-Za-z']/.test(raw[wordStart - 1])) wordStart--;
    if (wordStart === pos) return null;
    const token = raw.slice(wordStart, pos);
    if (!token) return null;

    let p = wordStart;
    while (p > 0 && /\s/.test(raw[p - 1])) p--;
    const prevEnd = p;
    while (p > 0 && /[A-Za-z']/.test(raw[p - 1])) p--;
    const prev1 = raw.slice(p, prevEnd).toLowerCase();

    const beforeWord = raw.slice(0, wordStart);
    const isSentenceStart =
      !beforeWord.trim() || /[.!?]["')\]]*\s*$/.test(beforeWord);

    const corrected = autoCorrectToken(token, prev1, isSentenceStart);
    if (!corrected || corrected === token) return null;

    // autoCorrectToken already returns display form; only sentence-cap non-I leftovers
    const finalForm = formatSuggestion(corrected, isSentenceStart);
    if (finalForm === token) return null;

    return {
      text: raw.slice(0, wordStart) + finalForm + raw.slice(pos),
      caret: wordStart + finalForm.length + boundary.length
    };
  }

  /**
   * Typing-time fixes for inserting `chunk` at [start, end).
   * @returns {{ text: string, caret: number, changed: boolean }}
   */
  function applyInsert(text, start, end, chunk) {
    const src = String(text || "");
    let s = Math.max(0, Math.min(start == null ? src.length : start, src.length));
    let e = Math.max(s, Math.min(end == null ? s : end, src.length));
    let insert = chunk == null ? "" : String(chunk);
    if (!insert && s === e) {
      return { text: src, caret: s, changed: false };
    }

    if (
      insert.length === 1 &&
      D.SPACE_EATING_PUNCT.has(insert) &&
      s > 0 &&
      src[s - 1] === " "
    ) {
      const beforeSpace = s >= 2 ? src[s - 2] : "";
      if (/[A-Za-z0-9'"”)\]\}]/.test(beforeSpace)) {
        s -= 1;
        if (e >= s + 1) e -= 1;
      }
    }

    if (insert.length === 1 && /[a-zA-Z]/.test(insert)) {
      const before = src.slice(0, s);
      const atSentenceStart =
        !before.trim() || /[.!?]["')\]]*\s*$/.test(before);
      if (atSentenceStart) insert = insert.toUpperCase();
      else if (insert === "i" || insert === "I") {
        // Only force pronoun "I" when the letter is already a complete token
        // (word boundary after). Empty next means the user may still be typing
        // "if" / "in" / "interesting" — bare "i" is fixed on space/punct via
        // correctTokenBeforeCaret instead.
        const prevCh = s > 0 ? src[s - 1] : " ";
        const nextCh = e < src.length ? src[e] : "";
        if (
          (/\s/.test(prevCh) || s === 0) &&
          nextCh !== "" &&
          (/\s/.test(nextCh) || /[.,!?;:]/.test(nextCh))
        ) {
          insert = "I";
        }
      }
    }

    let next = src.slice(0, s) + insert + src.slice(e);
    let caret = s + insert.length;
    let changed = next !== src;

    const isBoundary =
      (insert.length === 1 &&
        (/\s/.test(insert) ||
          D.SPACE_EATING_PUNCT.has(insert) ||
          D.SENTENCE_END_PUNCT.has(insert))) ||
      (insert.length > 1 && /[\s.,!?;:]$/.test(insert));

    if (isBoundary) {
      const fixed = correctTokenBeforeCaret(next, caret);
      if (fixed) {
        next = fixed.text;
        caret = fixed.caret;
        changed = true;
      }
    }

    return { text: next, caret, changed };
  }

  global.VoicePredictType = {
    stripApostrophes,
    canonicalizeToken,
    displayCase,
    formatSuggestion,
    orthographyFor,
    applyInsert
  };
})(typeof window !== "undefined" ? window : globalThis);
