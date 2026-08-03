/**
 * VoicePredict — conversation next-word chips (offline).
 *
 * Pipeline:
 *   parseContext → collectCandidates → logRank → assemble chips
 *   applyInsert → type boundary (ortho then optional LM soft-correct)
 *
 * Log scores: mobile LM primary, seed/personal as log-space additives.
 * Chips: { text, action: "append"|"replacePrev" }.
 * Depends on VoicePredictData, VoicePredictType, VoiceMobileLm.
 */
(function (global) {
  "use strict";

  const D = global.VoicePredictData;
  const T = global.VoicePredictType;
  const Mobile = global.VoiceMobileLm;
  if (!D || !T) {
    throw new Error("[VoicePredict] load predict-data.js and predict-type.js first");
  }

  const wordClassIndex = (() => {
    const m = new Map();
    for (const [cls, list] of Object.entries(D.WORD_CLASS || {})) {
      for (const w of list) {
        const k = w.toLowerCase();
        if (!m.has(k)) m.set(k, new Set());
        m.get(k).add(cls);
      }
    }
    return m;
  })();

  // --- seed / personal count LM ---
  const bigramCounts = new Map();
  const trigramCounts = new Map();
  const fourgramCounts = new Map();
  const unigramCounts = new Map();
  let unigramTotal = 0;
  const acceptCounts = new Map();
  let frequencyWords = [];
  const freqRank = new Map();
  let ready = false;
  /** True after mobile vocab has seeded unigramCounts (avoid double-bump on re-load). */
  let mobileSeedApplied = false;

  function tokenizeWords(text) {
    return (String(text).toLowerCase().match(/[a-z']+/g) || []).filter(Boolean);
  }

  function wordHasClass(word, cls) {
    const set = wordClassIndex.get(String(word || "").toLowerCase());
    return !!(set && set.has(cls));
  }

  function bumpNested(root, key, next, weight) {
    if (!key || !next) return;
    let m = root.get(key);
    if (!m) {
      m = new Map();
      root.set(key, m);
    }
    m.set(next, (m.get(next) || 0) + weight);
  }

  function bumpUnigram(word, weight) {
    const w = String(word || "").toLowerCase();
    if (!w) return;
    unigramCounts.set(w, (unigramCounts.get(w) || 0) + weight);
    unigramTotal += weight;
  }

  function learnWordNgrams(text, weight) {
    const words = tokenizeWords(text);
    const w = weight || 1;
    for (let i = 0; i < words.length; i++) bumpUnigram(words[i], w);
    for (let i = 0; i < words.length - 1; i++) {
      bumpNested(bigramCounts, words[i], words[i + 1], w);
    }
    for (let i = 0; i < words.length - 2; i++) {
      bumpNested(trigramCounts, words[i] + " " + words[i + 1], words[i + 2], w);
    }
    for (let i = 0; i < words.length - 3; i++) {
      bumpNested(
        fourgramCounts,
        words[i] + " " + words[i + 1] + " " + words[i + 2],
        words[i + 3],
        w
      );
    }
  }

  function learnSeedTrigrams(triples, weight) {
    const w = weight || 2;
    for (const t of triples) {
      if (!t || t.length < 3) continue;
      const [a, b, c] = t.map((x) => String(x).toLowerCase());
      bumpUnigram(a, w * 0.5);
      bumpUnigram(b, w * 0.5);
      bumpUnigram(c, w);
      bumpNested(bigramCounts, a, b, w);
      bumpNested(bigramCounts, b, c, w);
      bumpNested(trigramCounts, a + " " + b, c, w);
    }
  }

  function mleFromCounts(countMap, word) {
    if (!countMap || !countMap.size) return 0;
    const c = countMap.get(word);
    if (!(c > 0)) return 0;
    let tot = 0;
    for (const n of countMap.values()) tot += n;
    return tot > 0 ? c / tot : 0;
  }

  /** Seed/personal log10 score via stupid backoff. */
  function seedLogScore(p3, p2, p1, word) {
    const w = String(word || "").toLowerCase();
    if (!w) return null;
    const a = D.STUPID_BACKOFF_ALPHA != null ? D.STUPID_BACKOFF_ALPHA : 0.4;
    let p = 0;
    if (p3 && p2 && p1) p = mleFromCounts(fourgramCounts.get(p3 + " " + p2 + " " + p1), w);
    if (!(p > 0) && p2 && p1) p = a * mleFromCounts(trigramCounts.get(p2 + " " + p1), w);
    if (!(p > 0) && p1) p = a * a * mleFromCounts(bigramCounts.get(p1), w);
    if (!(p > 0)) {
      const u = unigramCounts.get(w) || 0;
      if (u > 0 && unigramTotal > 0) p = a * a * a * (u / unigramTotal);
    }
    if (!(p > 0) && freqRank.has(w)) {
      const n = Math.max(frequencyWords.length, 1);
      p = a * a * a * a * (1 - freqRank.get(w) / n) * 0.08;
    }
    if (!(p > 0)) return null;
    return Math.log10(Math.max(p, 1e-12));
  }

  function addCountKeys(out, m, pfx, pfxBare) {
    if (!m) return;
    for (const w of m.keys()) {
      if (pfx && !prefixOk(w, pfx, pfxBare, false)) continue;
      out.add(w);
    }
  }

  function seedCandidates(p3, p2, p1, pfx, pfxBare) {
    const out = new Set();
    if (p3 && p2 && p1) addCountKeys(out, fourgramCounts.get(p3 + " " + p2 + " " + p1), pfx, pfxBare);
    if (p2 && p1) addCountKeys(out, trigramCounts.get(p2 + " " + p1), pfx, pfxBare);
    if (p1) addCountKeys(out, bigramCounts.get(p1), pfx, pfxBare);
    return out;
  }

  /** Prefix scan over frequencyWords / Google list (fallback lexicon when mobile LM is down). */
  function frequencyPrefixMatches(pfx, pfxBare, limit) {
    if (!pfx || !frequencyWords.length) return [];
    const lim = limit || 48;
    const out = [];
    for (let i = 0; i < frequencyWords.length; i++) {
      const w = frequencyWords[i];
      if (!prefixOk(w, pfx, pfxBare, false)) continue;
      out.push(w);
      if (out.length >= lim) break;
    }
    return out;
  }

  // --- slots / personal (log additives only) ---

  function slotWhenMatches(when, p3, p2, p1) {
    if (!when) return true;
    if (when.prev1Empty) return !p1;
    if (when.prev1 != null && p1 !== when.prev1) return false;
    if (when.prev2 != null && p2 !== when.prev2) return false;
    if (when.prev3 != null && p3 !== when.prev3) return false;
    if (when.prev1In && !when.prev1In.includes(p1)) return false;
    if (when.prev2In && !when.prev2In.includes(p2)) return false;
    if (when.prev1Class && !wordHasClass(p1, when.prev1Class)) return false;
    if (when.prev2Class && !wordHasClass(p2, when.prev2Class)) return false;
    return true;
  }

  function expectedNextClasses(p3, p2, p1) {
    for (const rule of D.SLOT_RULES || []) {
      if (slotWhenMatches(rule.when, p3, p2, p1)) return rule.prefer.slice();
    }
    return [];
  }

  /** Small log10 additive when word matches expected POS/literal. */
  function slotLogBoost(word, p3, p2, p1) {
    const expected = expectedNextClasses(p3, p2, p1);
    if (!expected.length) return 0;
    const w = String(word || "").toLowerCase();
    const litIdx = expected.indexOf(w);
    if (litIdx >= 0) return 0.12 - litIdx * 0.015;
    const classes = wordClassIndex.get(w);
    if (!classes) return 0;
    for (let i = 0; i < expected.length; i++) {
      if (classes.has(expected[i])) return 0.1 - i * 0.015;
    }
    return 0;
  }

  function classSlotCandidates(p3, p2, p1, prefix, limit) {
    const expected = expectedNextClasses(p3, p2, p1);
    if (!expected.length) return [];
    const p = (prefix || "").toLowerCase();
    const out = [];
    const seen = new Set();
    for (const exp of expected) {
      const list = D.WORD_CLASS[exp] || (exp.length <= 6 ? [exp] : []);
      for (const w of list) {
        if (p && !w.startsWith(p)) continue;
        if (seen.has(w)) continue;
        seen.add(w);
        out.push(w);
        if (out.length >= (limit || 12)) return out;
      }
    }
    return out;
  }

  function contextKeyFromWords(ctxWords) {
    const w = (ctxWords || []).map((x) => String(x).toLowerCase()).filter(Boolean);
    if (w.length >= 3) return w.slice(-3).join(" ");
    if (w.length === 2) return w.join(" ");
    if (w.length === 1) return w[0];
    return "";
  }

  /** log10 additive from personal accepts (capped). */
  function personalLogBoost(ctxWords, word) {
    const w = String(word || "").toLowerCase();
    if (!w) return 0;
    let n = 0;
    const keys = [];
    if (ctxWords && ctxWords.length) {
      keys.push(contextKeyFromWords(ctxWords));
      if (ctxWords.length >= 2) keys.push(contextKeyFromWords(ctxWords.slice(-2)));
      keys.push(contextKeyFromWords(ctxWords.slice(-1)));
    } else keys.push("");
    for (const key of keys) {
      const acc = acceptCounts.get(key);
      if (acc && acc.has(w)) n += acc.get(w) || 0;
    }
    if (n <= 0) return 0;
    return Math.min(0.35, 0.04 * Math.log10(1 + n));
  }

  function personalCandidates(ctxWords, pfx) {
    const out = [];
    const key = contextKeyFromWords(ctxWords);
    const acc = acceptCounts.get(key);
    if (!acc) return out;
    [...acc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .forEach(([w]) => {
        if (pfx && !w.startsWith(pfx)) return;
        out.push(w);
      });
    return out;
  }

  // --- single log score ---

  /**
   * Primary log10 rank score for a candidate.
   * mobile primary; seed can win when clearly stronger; personal/slot as additives.
   */
  function logRankScore(p3, p2, p1, word, ctxWords) {
    const w = String(word || "").toLowerCase();
    if (!w) return -Infinity;

    let mobile = null;
    if (Mobile && Mobile.ready) {
      mobile =
        typeof Mobile.logScoreFlex === "function"
          ? Mobile.logScoreFlex(p3, p2, p1, w)
          : Mobile.logScore(p3, p2, p1, w);
    }
    const seed = seedLogScore(p3, p2, p1, w);

    let base;
    if (mobile != null && Number.isFinite(mobile) && seed != null) {
      // Prefer the stronger model; seed only needs to beat mobile by a margin to win.
      base = Math.max(mobile, seed - 0.35);
      if (seed > -3.5 && mobile > seed - 0.5) {
        const boost = D.SEED_LOG_BOOST != null ? D.SEED_LOG_BOOST : 0.08;
        base += boost;
      }
    } else if (mobile != null && Number.isFinite(mobile)) {
      base = mobile;
    } else if (seed != null) {
      base = seed;
    } else {
      base = -8;
    }

    base += personalLogBoost(ctxWords, w);
    base += slotLogBoost(w, p3, p2, p1);

    // Light boost: open-class words already used in this sentence (topic continuity).
    if (ctxWords && ctxWords.length && w.length >= 4) {
      for (let i = 0; i < ctxWords.length; i++) {
        if (String(ctxWords[i]).toLowerCase() === w) {
          base += 0.06;
          break;
        }
      }
    }
    return base;
  }

  // --- pipeline ---

  function parseContext(text, caretPos) {
    const raw = String(text || "");
    const pos = Math.max(0, Math.min(caretPos == null ? raw.length : caretPos, raw.length));
    const upTo = raw.slice(0, pos);
    const sentenceFrag = (upTo.split(/[.!?]/).pop() || "");
    const words = sentenceFrag
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => w.replace(/[^a-zA-Z']/g, ""))
      .filter(Boolean);
    const endsWithSpace = /\s$/.test(upTo);
    let activePrefix = "";
    let ctxWords = [];
    if (endsWithSpace || /[\s]$/.test(sentenceFrag)) {
      ctxWords = words.slice(-3);
    } else if (words.length > 0) {
      activePrefix = words[words.length - 1];
      ctxWords = words.slice(0, -1).slice(-3);
    }
    const completedBefore = activePrefix ? words.slice(0, -1) : words;
    const isSentenceStart = completedBefore.length === 0;
    if (isSentenceStart && !activePrefix) ctxWords = [];
    return {
      prev1: (ctxWords[ctxWords.length - 1] || "").toLowerCase(),
      prev2: (ctxWords[ctxWords.length - 2] || "").toLowerCase(),
      prev3: (ctxWords[ctxWords.length - 3] || "").toLowerCase(),
      activePrefix,
      midWord: !!(activePrefix && activePrefix.length),
      isSentenceStart,
      ctxWords
    };
  }

  function prefixOk(word, pfx, pfxBare, allowFuzzy) {
    if (!pfx) return true;
    const first = String(word).split(/\s+/)[0].toLowerCase();
    if (Mobile && typeof Mobile.matchesPrefix === "function") {
      if (Mobile.matchesPrefix(first, pfx)) return true;
    } else if (first.startsWith(pfx)) {
      return true;
    }
    const firstBare = T.stripApostrophes(first);
    if (pfxBare && firstBare.startsWith(pfxBare)) return true;
    return !!allowFuzzy;
  }

  /**
   * Union candidate strings + optional fuzzy edit costs (no scoring).
   * @returns {{ list: string[], fuzzyCosts: Map<string, number> }}
   */
  function collectCandidates(sctx, ortho) {
    const { prev3, prev2, prev1, activePrefix, midWord, ctxWords } = sctx;
    const pfx = midWord ? (activePrefix || "").toLowerCase() : "";
    const pfxBare = T.stripApostrophes(pfx);
    const set = new Set();
    const fuzzyCosts = new Map();
    const THIN_POOL = 16;
    const dym = D.DID_YOU_MEAN || {};

    const add = (w, allowFuzzy) => {
      const key = String(w || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      if (!key) return;
      if (midWord && !prefixOk(key, pfx, pfxBare, allowFuzzy)) return;
      set.add(key);
    };

    const mobileReady = !!(Mobile && Mobile.ready);

    if (mobileReady) {
      Mobile.candidates(prev3, prev2, prev1, pfx).forEach((w) => add(w, false));
      if (pfx) Mobile.prefixMatches(pfx, 56).forEach((w) => add(w, false));
    }

    if (pfx && (!mobileReady || set.size < 24)) {
      frequencyPrefixMatches(pfx, pfxBare, mobileReady ? 32 : 56).forEach((w) => add(w, false));
    }

    seedCandidates(prev3, prev2, prev1, pfx, pfxBare).forEach((w) => add(w, false));
    (ortho.candidates || []).forEach((c) => add(c, true));
    classSlotCandidates(prev3, prev2, prev1, pfx, 12).forEach((w) => {
      if (!pfx || prefixOk(w, pfx, pfxBare, false)) add(w, false);
    });
    personalCandidates(ctxWords, pfx).forEach((w) => add(w, false));

    // Single fuzzy scan: always keyboard-cheap; widen to maxCost when pool is thin.
    if (pfx && pfx.length >= 3 && mobileReady && typeof Mobile.fuzzyNeighbors === "function") {
      const kbMax = dym.fuzzyKeyboardMax != null ? dym.fuzzyKeyboardMax : 0.4;
      const maxCost = dym.fuzzyMaxCost != null ? dym.fuzzyMaxCost : 0.95;
      const lim = dym.fuzzyLimit || 12;
      const neighbors = Mobile.fuzzyNeighbors(pfx, {
        mode: "prefix",
        limit: lim,
        maxCost
      });
      const thin = set.size < THIN_POOL;
      for (let i = 0; i < neighbors.length; i++) {
        const { word, cost } = neighbors[i];
        if (cost > kbMax && !thin) continue;
        add(word, true);
        if (!fuzzyCosts.has(word) || cost < fuzzyCosts.get(word)) {
          fuzzyCosts.set(word, cost);
        }
      }
    }

    if (!midWord && ctxWords && ctxWords.length) {
      ctxWords.forEach((cw) => {
        const t = String(cw).toLowerCase();
        if (t.length >= 4) add(t, false);
      });
    }

    if (!prev1 && !midWord) {
      (D.DEFAULT_STARTERS || []).slice(0, 16).forEach((s) => add(s.toLowerCase(), false));
    }

    if (pfx && set.size < THIN_POOL) {
      for (const list of Object.values(D.WORD_CLASS || {})) {
        for (const w of list) {
          if (prefixOk(w, pfx, pfxBare, false)) add(w, false);
          if (set.size >= 48) break;
        }
        if (set.size >= 48) break;
      }
    }

    return { list: Array.from(set), fuzzyCosts };
  }

  function rankCandidates(cands, sctx, ortho, fuzzyCosts) {
    const { prev3, prev2, prev1, activePrefix, midWord, ctxWords } = sctx;
    const pfx = (activePrefix || "").toLowerCase();
    const pfxBare = T.stripApostrophes(pfx);
    const W = D.SCORE_WEIGHTS || {};
    const boosts = ortho.boosts || new Map();
    const lim = D.CANDIDATE_LIMIT || 64;
    const costs = fuzzyCosts || new Map();
    const kbMax = (D.DID_YOU_MEAN && D.DID_YOU_MEAN.fuzzyKeyboardMax) || 0.4;

    const scored = cands.map((w) => {
      const first = w.split(/\s+/)[0];
      const firstLower = first.toLowerCase();
      const firstBare = T.stripApostrophes(first);
      let sc = logRankScore(prev3, prev2, prev1, firstLower, ctxWords);

      if (midWord) {
        const exact = firstLower === pfx;
        const bareExact =
          !exact && pfxBare && firstBare === pfxBare && firstLower.length === pfx.length;
        if (exact) sc += W.exactMatchLog != null ? W.exactMatchLog : 0.35;
        else if (bareExact) sc += 0.12;

        const starts =
          firstLower.startsWith(pfx) ||
          (pfxBare && firstBare.startsWith(pfxBare));
        if (starts && firstLower.length > pfx.length) {
          const extra = firstLower.length - pfx.length;
          const grow = W.prefixGrowLog != null ? W.prefixGrowLog : 0.08;
          if (pfx.length <= 2) sc += grow * Math.min(1, extra / 5);
          else if (pfx.length <= 4) sc += grow * Math.min(1, 0.5 + (3 - Math.min(extra, 3)) * 0.1);
          else sc += grow * (extra <= 2 ? 0.15 : 0.05);
        } else if (pfx.length >= 3 && !starts) {
          const cost = costs.has(firstLower) ? costs.get(firstLower) : 0.85;
          const kb = W.fuzzyKeyboardLog != null ? W.fuzzyKeyboardLog : 0.22;
          const other = W.fuzzyOtherLog != null ? W.fuzzyOtherLog : 0.45;
          sc -= cost <= kbMax ? kb : other;
        }
      }

      if (prev1 && firstLower === prev1) {
        sc -= W.repeatPrevLog != null ? W.repeatPrevLog : 0.25;
      }

      if (firstLower.indexOf("'") >= 0 && firstLower.length <= 5) sc += 0.03;

      const orthoB = boosts.get(firstLower) || boosts.get(w.toLowerCase()) || 0;
      sc += orthoB * 0.4;

      return { text: w, score: sc };
    });

    scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
    return scored.slice(0, lim);
  }

  /**
   * @param {{ text: string, action?: string }[]} pins structured pins first
   * @returns {{ text: string, action: string }[]}
   */
  function assemble(ranked, sctx, ortho, pins) {
    const { midWord, isSentenceStart, activePrefix } = sctx;
    const limit = D.CHIP_LIMIT || 9;
    const out = [];
    const seen = new Set();
    const initialCounts = new Map();

    const pushChip = (raw, action, diversify) => {
      if (out.length >= limit) return false;
      const label = T.formatSuggestion(raw, isSentenceStart);
      const k = label.toLowerCase();
      if (seen.has(k)) return true;
      if (diversify && out.length >= 2 && !midWord) {
        const ch = k.charAt(0);
        if (ch && (initialCounts.get(ch) || 0) >= 3) return true;
      }
      seen.add(k);
      if (k.charAt(0)) {
        initialCounts.set(k.charAt(0), (initialCounts.get(k.charAt(0)) || 0) + 1);
      }
      out.push({ text: label, action: action || "append" });
      return true;
    };

    (pins || []).forEach((p) => pushChip(p.text, p.action || "append", false));
    (ortho.pinChips || []).forEach((f) => pushChip(f, "append", false));
    for (const r of ranked) {
      if (out.length >= limit) break;
      pushChip(r.text, "append", true);
    }
    if (out.length < Math.min(5, limit)) {
      for (const r of ranked) {
        if (out.length >= limit) break;
        pushChip(r.text, "append", false);
      }
    }
    if (out.length < 3) {
      for (const s of D.DEFAULT_STARTERS || []) {
        if (out.length >= limit) break;
        if (midWord && activePrefix && !s.toLowerCase().startsWith(activePrefix.toLowerCase())) {
          continue;
        }
        pushChip(s, "append", false);
      }
    }
    return out;
  }

  function applyFreqList(list) {
    frequencyWords = list.slice();
    freqRank.clear();
    frequencyWords.forEach((w, i) => freqRank.set(w, i));
  }

  function init() {
    if (ready) return;
    learnWordNgrams(D.CONVERSATION_SEED, 0.85);
    learnSeedTrigrams(D.SEED_TRIGRAMS, 2.2);
    Object.values(D.WORD_CLASS || {}).forEach((list) =>
      list.forEach((w) => bumpUnigram(w, 0.06))
    );
    loadPersonal();
    ready = true;
  }

  function loadPersonal() {
    try {
      const raw = localStorage.getItem(D.LS_PERSONAL_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.accept) {
          for (const [k, row] of Object.entries(data.accept)) {
            if (!row || typeof row !== "object") continue;
            for (const [w, n] of Object.entries(row)) {
              if (!acceptCounts.has(k)) acceptCounts.set(k, new Map());
              acceptCounts.get(k).set(w, Number(n) || 0);
            }
          }
        }
      }
      const text = localStorage.getItem(D.LS_PERSONAL_TEXT_KEY) || "";
      if (text.trim()) learnWordNgrams(text, 1.4);
    } catch (_) {
      /* ignore */
    }
  }

  function savePersonal() {
    try {
      const accept = {};
      for (const [k, m] of acceptCounts.entries()) {
        const row = {};
        for (const [w, n] of m.entries()) if (n > 0) row[w] = n;
        if (Object.keys(row).length) accept[k] = row;
      }
      localStorage.setItem(D.LS_PERSONAL_KEY, JSON.stringify({ v: 1, accept }));
    } catch (_) {
      /* ignore */
    }
  }

  function recordAccept(ctxWords, word) {
    const w = String(word || "")
      .toLowerCase()
      .split(/\s+/)[0];
    if (!w) return;
    const key = contextKeyFromWords(ctxWords);
    if (!acceptCounts.has(key)) acceptCounts.set(key, new Map());
    acceptCounts.get(key).set(w, (acceptCounts.get(key).get(w) || 0) + 3);
    const phrase = [
      ...(ctxWords || []).slice(-3).map((x) => String(x).toLowerCase()),
      w
    ].join(" ");
    learnWordNgrams(phrase, 2.5);
    try {
      const prev = localStorage.getItem(D.LS_PERSONAL_TEXT_KEY) || "";
      localStorage.setItem(D.LS_PERSONAL_TEXT_KEY, (prev + "\n" + phrase).slice(-12000));
    } catch (_) {
      /* ignore */
    }
    savePersonal();
  }

  function learnText(text) {
    if (!text || !String(text).trim()) return;
    learnWordNgrams(String(text), 2);
    try {
      const prev = localStorage.getItem(D.LS_PERSONAL_TEXT_KEY) || "";
      localStorage.setItem(D.LS_PERSONAL_TEXT_KEY, (prev + "\n" + text).slice(-12000));
    } catch (_) {
      /* ignore */
    }
  }

  /** LM vocab / frequency list membership (not orthography tables). */
  function inLmVocab(token) {
    const w = String(token || "").toLowerCase();
    if (!w) return false;
    if (Mobile && typeof Mobile.hasWord === "function" && Mobile.hasWord(w)) return true;
    if (freqRank.has(w)) return true;
    const bare = T.stripApostrophes(w);
    if (bare !== w && (freqRank.has(bare) || (Mobile && Mobile.hasWord && Mobile.hasWord(bare)))) {
      return true;
    }
    return false;
  }

  /**
   * Rank full-word corrections for an OOV token under LM context.
   * Margin is always vs oovFloor (callers only invoke for OOV).
   * @returns {{ word: string, cost: number, score: number, margin: number }[]}
   */
  function bestCorrections(token, hist, limit) {
    const cfg = D.DID_YOU_MEAN || {};
    const bare = T.stripApostrophes(String(token || "").toLowerCase());
    if (!bare || bare.length < 3) return [];
    if (!Mobile || !Mobile.ready || typeof Mobile.fuzzyNeighbors !== "function") return [];

    const h = hist || [];
    const p1 = h[h.length - 1] || "";
    const p2 = h[h.length - 2] || "";
    const p3 = h[h.length - 3] || "";
    const oovFloor = cfg.oovFloor != null ? cfg.oovFloor : -8;
    const maxCost = cfg.chipMaxCost != null ? cfg.chipMaxCost : 0.95;
    const neighbors = Mobile.fuzzyNeighbors(bare, {
      mode: "word",
      limit: 16,
      maxCost
    });
    const out = [];
    for (let i = 0; i < neighbors.length; i++) {
      const { word, cost } = neighbors[i];
      const score = logRankScore(p3, p2, p1, word, h);
      if (!Number.isFinite(score)) continue;
      out.push({ word, cost, score, margin: score - oovFloor });
    }
    out.sort((a, b) => b.margin - a.margin || a.cost - b.cost || b.score - a.score);
    return out.slice(0, limit || 4);
  }

  /**
   * LM soft-correct for type.applyInsert afterToken hook.
   * @param {object} span from VoicePredictType.tokenBeforeBoundary
   * @returns {string|null} display form
   */
  function softCorrectAfterToken(span) {
    const cfg = D.DID_YOU_MEAN || {};
    const softMargin = cfg.softMargin != null ? cfg.softMargin : 1.1;
    const softMaxCost = cfg.softMaxCost != null ? cfg.softMaxCost : 0.9;
    const winnerGap = cfg.softWinnerGap != null ? cfg.softWinnerGap : 0.25;
    const token = span && span.token;
    if (!token || token.length < 3) return null;
    if (inLmVocab(token)) return null;

    const ranked = bestCorrections(token, span.hist || [], 3);
    if (!ranked.length) return null;
    const best = ranked[0];
    if (best.cost > softMaxCost || best.margin < softMargin) return null;
    if (
      ranked[1] &&
      best.margin - ranked[1].margin < winnerGap &&
      ranked[1].cost <= best.cost + 0.1
    ) {
      return null;
    }
    const fixed = T.formatSuggestion(best.word, span.isSentenceStart);
    if (!fixed || fixed.toLowerCase() === token.toLowerCase()) return null;
    return fixed;
  }

  /** Did-you-mean chip pins when last completed token is OOV (soft did not rewrite). */
  function didYouMeanPins(sctx) {
    const cfg = D.DID_YOU_MEAN || {};
    if (sctx.midWord) return [];
    const token = sctx.prev1;
    if (!token || token.length < 3) return [];
    if (inLmVocab(token)) return [];

    const hist = (sctx.ctxWords || []).slice(0, -1);
    const ranked = bestCorrections(token, hist, cfg.chipLimit || 2);
    const chipMargin = cfg.chipMargin != null ? cfg.chipMargin : 0.5;
    const chipMaxCost = cfg.chipMaxCost != null ? cfg.chipMaxCost : 0.95;
    return ranked
      .filter((r) => r.margin >= chipMargin && r.cost <= chipMaxCost)
      .slice(0, cfg.chipLimit || 2)
      .map((r) => ({
        text: r.word,
        action: "replacePrev",
        cost: r.cost,
        margin: r.margin
      }));
  }

  function applyInsert(text, start, end, chunk) {
    if (!ready) init();
    return T.applyInsert(text, start, end, chunk, {
      afterToken: softCorrectAfterToken
    });
  }

  function suggest(text, caretPos) {
    if (!ready) init();
    const sctx = parseContext(text, caretPos);
    const ortho = T.orthographyFor(sctx.activePrefix, {
      prev1: sctx.prev1,
      isSentenceStart: sctx.isSentenceStart,
      midWord: sctx.midWord
    });
    const dymPins = didYouMeanPins(sctx);
    // Feed correction words into the candidate pool without mutating ortho.
    const orthoForCollect = {
      pinChips: ortho.pinChips,
      boosts: ortho.boosts,
      candidates: (ortho.candidates || []).concat(dymPins.map((p) => p.text))
    };
    const { list, fuzzyCosts } = collectCandidates(sctx, orthoForCollect);
    const ranked = rankCandidates(list, sctx, orthoForCollect, fuzzyCosts);
    const chips = assemble(ranked, sctx, ortho, dymPins);
    return {
      chips,
      ctxWords: sctx.ctxWords.slice(),
      activePrefix: sctx.activePrefix,
      midWord: sctx.midWord,
      isSentenceStart: sctx.isSentenceStart
    };
  }

  function applyMobileUnigramSeed() {
    if (mobileSeedApplied || !Mobile || !Mobile.words || !Mobile.words.length) return;
    applyFreqList(Mobile.words);
    // Light unigram prior from mobile ranks (does not dominate log scores).
    Mobile.words.slice(0, 3000).forEach((w, i) => {
      bumpUnigram(w, 0.03 + 0.08 * (1 - i / Math.max(Mobile.words.length, 1)));
    });
    mobileSeedApplied = true;
  }

  async function loadMobileLm() {
    if (!Mobile) {
      console.warn("[VoicePredict] VoiceMobileLm missing");
      return 0;
    }
    try {
      const n = await Mobile.load(D.MOBILE_LM_URL);
      if (n > 0) applyMobileUnigramSeed();
      return n;
    } catch (e) {
      console.warn("[VoicePredict] mobile LM failed", e);
      return 0;
    }
  }

  async function loadGoogleFrequencyFallback() {
    try {
      const cached = localStorage.getItem(D.LS_FREQ_KEY);
      let list;
      if (cached && cached.split("\n").length > 500) {
        list = cached.split("\n").map((w) => w.trim()).filter(Boolean);
      } else {
        const res = await fetch(D.FREQ_LIST_URL, { mode: "cors" });
        if (!res.ok) throw new Error("freq fetch " + res.status);
        const text = await res.text();
        list = text
          .split(/\r?\n/)
          .map((l) => l.trim().toLowerCase())
          .filter((w) => w && /^[a-z']+$/.test(w))
          .slice(0, 12000);
        try {
          localStorage.setItem(D.LS_FREQ_KEY, list.join("\n"));
        } catch (_) {
          /* ignore */
        }
      }
      applyFreqList(list);
      list.slice(0, 2000).forEach((w, i) => {
        bumpUnigram(w, 0.02 + 0.08 * (1 - i / Math.max(list.length, 1)));
      });
      return list.length;
    } catch (e) {
      console.warn("[VoicePredict] frequency list failed", e);
      return 0;
    }
  }

  /** Warm mobile LM (preferred) or Google frequency fallback. */
  async function loadModels() {
    const n = await loadMobileLm();
    if (n > 0) return n;
    return loadGoogleFrequencyFallback();
  }

  // Back-compat name used by VoiceOsk
  const loadFrequencyList = loadModels;

  global.VoicePredict = {
    init,
    suggest,
    applyInsert,
    formatSuggestion: T.formatSuggestion.bind(T),
    recordAccept,
    learnText,
    loadModels,
    loadFrequencyList,
    loadMobileLm,
    /** @internal test hook */
    _loadMobileFromObject(data) {
      if (!Mobile) return 0;
      const n = Mobile.loadFromObject(data);
      if (n > 0) applyFreqList(Mobile.words);
      return n;
    },
    /** @internal test hooks */
    _bestCorrections: bestCorrections,
    _softCorrectAfterToken: softCorrectAfterToken,
    _inLmVocab: inLmVocab,
    get ready() {
      return ready;
    },
    get mobileReady() {
      return !!(Mobile && Mobile.ready);
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
