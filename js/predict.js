/**
 * VoicePredict — offline Word LM + slot-aware chips.
 * Depends on VoicePredictData + VoicePredictType (no Smol / Tiny).
 *
 * API:
 *   VoicePredict.init()
 *   VoicePredict.suggest(text, caretPos) → { chips, ctxWords, activePrefix, midWord, isSentenceStart }
 *   VoicePredict.applyInsert(...)  — re-export from VoicePredictType
 *   VoicePredict.formatSuggestion(...)
 *   VoicePredict.recordAccept(ctxWords, word)
 *   VoicePredict.learnText(text)
 *   VoicePredict.loadFrequencyList() → Promise
 */
(function (global) {
  "use strict";

  const D = global.VoicePredictData;
  const T = global.VoicePredictType;
  if (!D || !T) {
    throw new Error("[VoicePredict] load predict-data.js and predict-type.js first");
  }

  const wordClassIndex = (() => {
    const m = new Map();
    if (!D) return m;
    for (const [cls, list] of Object.entries(D.WORD_CLASS)) {
      for (const w of list) {
        const k = w.toLowerCase();
        if (!m.has(k)) m.set(k, new Set());
        m.get(k).add(cls);
      }
    }
    return m;
  })();

  const bigramCounts = new Map();
  const trigramCounts = new Map();
  const fourgramCounts = new Map();
  const unigramCounts = new Map();
  const continuationCounts = new Map();
  const continuationSeen = new Map();
  let unigramTotal = 0;
  let continuationTotal = 0;
  const acceptCounts = new Map();
  let frequencyWords = [];
  const freqRank = new Map();
  let ready = false;

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

  function noteContinuation(prev, next) {
    const p = String(prev || "").toLowerCase();
    const n = String(next || "").toLowerCase();
    if (!p || !n) return;
    let set = continuationSeen.get(n);
    if (!set) {
      set = new Set();
      continuationSeen.set(n, set);
    }
    if (!set.has(p)) {
      set.add(p);
      continuationCounts.set(n, (continuationCounts.get(n) || 0) + 1);
      continuationTotal += 1;
    }
  }

  function learnWordNgrams(text, weight) {
    const words = tokenizeWords(text);
    const w = weight || 1;
    for (let i = 0; i < words.length; i++) bumpUnigram(words[i], w);
    for (let i = 0; i < words.length - 1; i++) {
      bumpNested(bigramCounts, words[i], words[i + 1], w);
      noteContinuation(words[i], words[i + 1]);
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
    const w = weight || 4;
    for (const t of triples) {
      if (!t || t.length < 3) continue;
      const [a, b, c] = t.map((x) => String(x).toLowerCase());
      bumpUnigram(a, w * 0.5);
      bumpUnigram(b, w * 0.5);
      bumpUnigram(c, w);
      bumpNested(bigramCounts, a, b, w);
      bumpNested(bigramCounts, b, c, w);
      noteContinuation(a, b);
      noteContinuation(b, c);
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

  function stupidBackoffScore(p3, p2, p1, word) {
    const w = String(word || "").toLowerCase();
    if (!w) return 0;
    const a = D.STUPID_BACKOFF_ALPHA;
    if (p3 && p2 && p1) {
      const p = mleFromCounts(fourgramCounts.get(p3 + " " + p2 + " " + p1), w);
      if (p > 0) return p;
    }
    if (p2 && p1) {
      const p = mleFromCounts(trigramCounts.get(p2 + " " + p1), w);
      if (p > 0) return a * p;
    }
    if (p1) {
      const p = mleFromCounts(bigramCounts.get(p1), w);
      if (p > 0) return a * a * p;
    }
    const cont = continuationCounts.get(w) || 0;
    if (cont > 0 && continuationTotal > 0) return a * a * a * (cont / continuationTotal);
    const u = unigramCounts.get(w) || 0;
    if (u > 0 && unigramTotal > 0) return a * a * a * (u / unigramTotal);
    if (freqRank.has(w)) {
      const n = Math.max(frequencyWords.length, 1);
      return a * a * a * a * (1 - freqRank.get(w) / n) * 0.08;
    }
    return 0;
  }

  function predictNextWithBackoff(p3, p2, p1, prefix, limit) {
    const pfx = (prefix || "").toLowerCase();
    const cand = new Set();
    const addFrom = (m) => {
      if (!m) return;
      for (const w of m.keys()) {
        if (pfx && !w.startsWith(pfx)) continue;
        cand.add(w);
      }
    };
    if (p3 && p2 && p1) addFrom(fourgramCounts.get(p3 + " " + p2 + " " + p1));
    if (p2 && p1) addFrom(trigramCounts.get(p2 + " " + p1));
    if (p1) addFrom(bigramCounts.get(p1));
    if (cand.size < (limit || 8) * 2) {
      for (const w of frequencyWords.slice(0, 80)) {
        if (pfx && !w.startsWith(pfx)) continue;
        cand.add(w);
        if (cand.size >= (limit || 8) * 3) break;
      }
    }
    const scored = [];
    for (const w of cand) {
      const probability = stupidBackoffScore(p3, p2, p1, w);
      if (probability > 0) scored.push({ text: w, probability });
    }
    scored.sort((a, b) => b.probability - a.probability || a.text.localeCompare(b.text));
    return scored.slice(0, limit || 8);
  }

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
    for (const rule of D.SLOT_RULES) {
      if (slotWhenMatches(rule.when, p3, p2, p1)) return rule.prefer.slice();
    }
    return [];
  }

  function classSlotBoost(word, p3, p2, p1) {
    const expected = expectedNextClasses(p3, p2, p1);
    if (!expected.length) return 0;
    const w = String(word || "").toLowerCase();
    const litIdx = expected.indexOf(w);
    if (litIdx >= 0) return 0.42 - litIdx * 0.04;
    const classes = wordClassIndex.get(w);
    if (!classes) return 0;
    for (let i = 0; i < expected.length; i++) {
      if (classes.has(expected[i])) return 0.38 - i * 0.05;
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
        if (out.length >= (limit || 16)) return out;
      }
    }
    return out;
  }

  function frequencyBoost(word) {
    const w = String(word || "").toLowerCase();
    if (!w || !freqRank.has(w)) return 0;
    const n = Math.max(frequencyWords.length || 10000, 1);
    return 0.2 * (1 - freqRank.get(w) / n);
  }

  function contextKeyFromWords(ctxWords) {
    const w = (ctxWords || []).map((x) => String(x).toLowerCase()).filter(Boolean);
    if (w.length >= 3) return w.slice(-3).join(" ");
    if (w.length === 2) return w.join(" ");
    if (w.length === 1) return w[0];
    return "";
  }

  function acceptBoost(ctxWords, word) {
    const w = String(word || "").toLowerCase();
    let boost = 0;
    const keys = [];
    if (ctxWords && ctxWords.length) {
      keys.push(contextKeyFromWords(ctxWords));
      if (ctxWords.length >= 2) keys.push(contextKeyFromWords(ctxWords.slice(-2)));
      keys.push(contextKeyFromWords(ctxWords.slice(-1)));
    } else keys.push("");
    for (const key of keys) {
      const acc = acceptCounts.get(key);
      if (acc && acc.has(w)) boost += Math.min(0.8, (acc.get(w) || 0) * 0.08);
    }
    return boost;
  }

  function lexiconPrefixMatches(prefix, limit) {
    const p = (prefix || "").toLowerCase();
    if (!p) return [];
    const out = [];
    const seen = new Set();
    const take = (list) => {
      if (!list) return;
      for (const w of list) {
        if (!w || !w.startsWith(p) || seen.has(w)) continue;
        seen.add(w);
        out.push(w);
        if (out.length >= limit) return true;
      }
      return false;
    };
    if (take(frequencyWords)) return out;
    for (const list of Object.values(D.WORD_CLASS)) {
      if (take(list)) return out;
    }
    return out;
  }

  function blendWeights(prefix) {
    const len = (prefix || "").length;
    const W = D.SCORE_WEIGHTS;
    if (!len) return W.nextWord;
    if (len <= 1) return W.p1;
    if (len === 2) return W.p2;
    if (len === 3) return W.p3;
    return W.p4;
  }

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

  function gather(sctx, ortho) {
    const { prev3, prev2, prev1, activePrefix, midWord, ctxWords } = sctx;
    const pfx = (activePrefix || "").toLowerCase();
    const pfxBare = T.stripApostrophes(pfx);
    const map = new Map();
    const push = (w, ngramP, allowFuzzy) => {
      const key = (w || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!key) return;
      if (midWord) {
        const first = key.split(/\s+/)[0];
        const firstBare = T.stripApostrophes(first);
        if (
          !allowFuzzy &&
          !first.startsWith(pfx) &&
          !(pfxBare && firstBare.startsWith(pfxBare))
        ) {
          return;
        }
      }
      const prev = map.get(key);
      if (prev) prev.ngramP = Math.max(prev.ngramP, ngramP || 0);
      else map.set(key, { text: key, ngramP: ngramP || 0 });
    };

    if (prev1 || midWord) {
      predictNextWithBackoff(prev3, prev2, prev1, midWord ? pfx : "", 40).forEach((item, i) => {
        const p = (item.probability || 0) + 0.02 * (1 - i / Math.max(40, 1));
        push(item.text, p, false);
      });
    }

    // Orthography candidates (I-family, contractions) — single policy
    (ortho.candidates || []).forEach((c) => push(c, 0.4, true));

    if (midWord) {
      lexiconPrefixMatches(activePrefix, 40).forEach((w) => push(w, 0, false));
      classSlotCandidates(prev3, prev2, prev1, activePrefix, 12).forEach((w) => push(w, 0, false));
    } else if (prev1) {
      classSlotCandidates(prev3, prev2, prev1, "", 18).forEach((w) => push(w, 0, false));
      const acc = acceptCounts.get(contextKeyFromWords(ctxWords));
      if (acc) {
        [...acc.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .forEach(([w]) => push(w, 0, false));
      }
    } else {
      D.DEFAULT_STARTERS.forEach((s) => push(s.toLowerCase(), 0.2, false));
    }
    return Array.from(map.values());
  }

  function score(items, sctx, ortho) {
    const { prev3, prev2, prev1, activePrefix, midWord, ctxWords } = sctx;
    const weights = blendWeights(activePrefix || "");
    const pfx = (activePrefix || "").toLowerCase();
    const pfxBare = T.stripApostrophes(pfx);
    const pool = items
      .slice()
      .sort((a, b) => (b.ngramP || 0) - (a.ngramP || 0))
      .slice(0, 48);
    const ngVals = pool.map((c) => c.ngramP || 0);
    const ngMin = ngVals.length ? Math.min(...ngVals) : 0;
    const ngMax = ngVals.length ? Math.max(...ngVals) : 1;
    const ngSpan = Math.max(ngMax - ngMin, 1e-6);
    const boosts = ortho.boosts || new Map();
    const W = D.SCORE_WEIGHTS;

    const ranked = pool.map((c) => {
      const w = c.text;
      const first = w.split(/\s+/)[0];
      const firstBare = T.stripApostrophes(first);
      const ctxN = ((c.ngramP || 0) - ngMin) / ngSpan;
      const freqN = Math.min(1, frequencyBoost(first) / 0.2);
      const personalN = Math.max(0, Math.min(1, acceptBoost(ctxWords, first) + acceptBoost(ctxWords, w)));
      const slot = Math.max(0, classSlotBoost(first, prev3, prev2, prev1));
      const slotN = Math.min(1, slot / 0.42);
      let sc =
        weights.freq * freqN +
        weights.context * ctxN +
        weights.personal * personalN +
        weights.slot * slotN;
      if (midWord && (first === pfx || firstBare === pfxBare)) sc += W.exactMatch;
      if (midWord && first.startsWith(pfx) && first.length > pfx.length) {
        sc += W.prefixGrow * Math.min(1, (first.length - pfx.length) / 6);
      }
      // One orthography boost map (computed once)
      const orthoBoost = boosts.get(first.toLowerCase()) || boosts.get(w.toLowerCase()) || 0;
      sc += orthoBoost;
      return { text: w, score: sc, ngramP: c.ngramP || 0 };
    });
    ranked.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
    return ranked;
  }

  function assemble(ranked, sctx, ortho) {
    const { midWord, isSentenceStart, activePrefix } = sctx;
    const out = [];
    const seen = new Set();
    const pushLabel = (raw) => {
      if (out.length >= 9) return false;
      const label = T.formatSuggestion(raw, isSentenceStart);
      const k = label.toLowerCase();
      if (seen.has(k)) return true;
      seen.add(k);
      out.push(label);
      return true;
    };

    (ortho.pinChips || []).forEach((f) => pushLabel(f));

    for (const r of ranked) {
      if (out.length >= 9) break;
      pushLabel(r.text);
    }
    if (out.length < 3) {
      for (const s of D.DEFAULT_STARTERS) {
        if (out.length >= 9) break;
        if (midWord && activePrefix && !s.toLowerCase().startsWith(activePrefix.toLowerCase())) {
          continue;
        }
        pushLabel(s);
      }
    }
    return out;
  }

  function init() {
    if (ready) return;
    learnWordNgrams(D.CONVERSATION_SEED, 1);
    learnSeedTrigrams(D.SEED_TRIGRAMS, 5);
    Object.values(D.WORD_CLASS).forEach((list) => list.forEach((w) => bumpUnigram(w, 0.12)));
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
      if (text.trim()) learnWordNgrams(text, 2);
    } catch (_) { /* ignore */ }
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
    } catch (_) { /* ignore */ }
  }

  function recordAccept(ctxWords, word) {
    const w = String(word || "").toLowerCase().split(/\s+/)[0];
    if (!w) return;
    const key = contextKeyFromWords(ctxWords);
    if (!acceptCounts.has(key)) acceptCounts.set(key, new Map());
    acceptCounts.get(key).set(w, (acceptCounts.get(key).get(w) || 0) + 5);
    const phrase = [...(ctxWords || []).slice(-3).map((x) => String(x).toLowerCase()), w].join(" ");
    learnWordNgrams(phrase, 5);
    try {
      const prev = localStorage.getItem(D.LS_PERSONAL_TEXT_KEY) || "";
      localStorage.setItem(D.LS_PERSONAL_TEXT_KEY, (prev + "\n" + phrase).slice(-12000));
    } catch (_) { /* ignore */ }
    savePersonal();
  }

  function learnText(text) {
    if (!text || !String(text).trim()) return;
    learnWordNgrams(String(text), 2);
    try {
      const prev = localStorage.getItem(D.LS_PERSONAL_TEXT_KEY) || "";
      localStorage.setItem(D.LS_PERSONAL_TEXT_KEY, (prev + "\n" + text).slice(-12000));
    } catch (_) { /* ignore */ }
  }

  function suggest(text, caretPos) {
    if (!ready) init();
    const sctx = parseContext(text, caretPos);
    const ortho = T.orthographyFor(sctx.activePrefix, {
      prev1: sctx.prev1,
      isSentenceStart: sctx.isSentenceStart,
      midWord: sctx.midWord
    });
    const items = gather(sctx, ortho);
    const ranked = score(items, sctx, ortho);
    const chips = assemble(ranked, sctx, ortho);
    return {
      chips,
      ctxWords: sctx.ctxWords.slice(),
      activePrefix: sctx.activePrefix,
      midWord: sctx.midWord,
      isSentenceStart: sctx.isSentenceStart
    };
  }

  async function loadFrequencyList() {
    try {
      const cached = localStorage.getItem(D.LS_FREQ_KEY);
      if (cached && cached.split("\n").length > 500) {
        frequencyWords = cached.split("\n").map((w) => w.trim()).filter(Boolean);
      } else {
        const res = await fetch(D.FREQ_LIST_URL, { mode: "cors" });
        if (!res.ok) throw new Error("freq fetch " + res.status);
        const text = await res.text();
        frequencyWords = text
          .split(/\r?\n/)
          .map((l) => l.trim().toLowerCase())
          .filter((w) => w && /^[a-z']+$/.test(w))
          .slice(0, 12000);
        try {
          localStorage.setItem(D.LS_FREQ_KEY, frequencyWords.join("\n"));
        } catch (_) { /* ignore */ }
      }
      freqRank.clear();
      frequencyWords.forEach((w, i) => freqRank.set(w, i));
      frequencyWords.slice(0, 2000).forEach((w, i) => {
        const weight = 0.02 + 0.08 * (1 - i / Math.max(frequencyWords.length, 1));
        bumpUnigram(w, weight);
      });
      return frequencyWords.length;
    } catch (e) {
      console.warn("[VoicePredict] frequency list failed", e);
      return 0;
    }
  }

  global.VoicePredict = {
    init,
    suggest,
    applyInsert: T.applyInsert.bind(T),
    formatSuggestion: T.formatSuggestion.bind(T),
    recordAccept,
    learnText,
    loadFrequencyList,
    get ready() {
      return ready;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
