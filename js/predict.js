/**
 * VoicePredict — conversation next-word chips (offline-first).
 *
 * Pipeline: parseContext → collect → rank → assemble
 * Scores: seed/personal n-grams (2–5) + slot class boosts
 * Lexicon: one asset (word-class-10k) = flat words[] + classes{}
 *
 * Depends on VoicePredictData, VoicePredictType.
 */
(function (global) {
  "use strict";

  const D = global.VoicePredictData;
  const T = global.VoicePredictType;
  if (!D || !T) {
    throw new Error("[VoicePredict] load predict-data.js and predict-type.js first");
  }

  const CTX_N = 4; // left tokens for 5-gram + slots (prev[0]=oldest … prev[3]=newest)
  const NGRAM_MAX = 5;
  /** Max open-class entries scanned for slot expansion. */
  const CLASS_EXPAND_CAP = 64;

  // Runtime lexicon (never mutates VoicePredictData.WORD_CLASS seed).
  let wordClasses = cloneClasses(D.WORD_CLASS);
  const wordClassIndex = new Map(); // word → Set(class)
  const classWordRank = new Map(); // class → Map(word → rank)
  let frequencyWords = []; // freq-ordered flat vocab for mid-word prefixes
  const freqRank = new Map();

  function cloneClasses(src) {
    const out = {};
    for (const [cls, list] of Object.entries(src || {})) {
      out[cls] = (list || []).map((w) => String(w).toLowerCase());
    }
    return out;
  }

  function rebuildWordClassIndex() {
    wordClassIndex.clear();
    classWordRank.clear();
    for (const [cls, list] of Object.entries(wordClasses)) {
      const ranks = new Map();
      for (let i = 0; i < list.length; i++) {
        const w = list[i];
        if (!wordClassIndex.has(w)) wordClassIndex.set(w, new Set());
        wordClassIndex.get(w).add(cls);
        if (!ranks.has(w)) ranks.set(w, i);
      }
      classWordRank.set(cls, ranks);
    }
  }
  rebuildWordClassIndex();

  function wordHasClass(word, cls) {
    const set = wordClassIndex.get(String(word || "").toLowerCase());
    return !!(set && set.has(cls));
  }

  // n-gram: order → Map(leftKey → Map(next → count))
  const ngramByOrder = { 2: new Map(), 3: new Map(), 4: new Map(), 5: new Map() };
  const unigramCounts = new Map();
  let unigramTotal = 0;
  const acceptCounts = new Map();
  let ready = false;
  let lexiconLoaded = false;

  function tokenizeWords(text) {
    return (String(text).toLowerCase().match(/[a-z']+/g) || []).filter(Boolean);
  }

  function leftKey(words, start, order) {
    if (order === 2) return words[start];
    let s = words[start];
    for (let i = 1; i < order - 1; i++) s += " " + words[start + i];
    return s;
  }

  function bumpNested(map, key, next, weight) {
    if (!key || !next) return;
    let m = map.get(key);
    if (!m) {
      m = new Map();
      map.set(key, m);
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
    for (let order = 2; order <= NGRAM_MAX; order++) {
      const map = ngramByOrder[order];
      for (let i = 0; i <= words.length - order; i++) {
        bumpNested(map, leftKey(words, i, order), words[i + order - 1], w);
      }
    }
  }

  function learnSeedPhrase(tuple, weight) {
    const w = weight || 2;
    const t = (tuple || []).map((x) => String(x).toLowerCase()).filter(Boolean);
    if (t.length < 2) return;
    for (let i = 0; i < t.length; i++) {
      bumpUnigram(t[i], w * (i === t.length - 1 ? 1 : 0.5));
    }
    for (let order = 2; order <= Math.min(NGRAM_MAX, t.length); order++) {
      const map = ngramByOrder[order];
      for (let i = 0; i <= t.length - order; i++) {
        bumpNested(map, leftKey(t, i, order), t[i + order - 1], w);
      }
    }
  }

  function learnSeedPhrases(phrases, weight) {
    for (const t of phrases || []) learnSeedPhrase(t, weight);
  }

  function mleFromCounts(countMap, word) {
    if (!countMap || !countMap.size) return 0;
    const c = countMap.get(word);
    if (!(c > 0)) return 0;
    let tot = 0;
    for (const n of countMap.values()) tot += n;
    return tot > 0 ? c / tot : 0;
  }

  /** Last (order-1) tokens of prev[]; "" if history shorter than needed. */
  function contextKeyForOrder(prev, order) {
    const need = order - 1;
    if (need <= 0) return "";
    const slice = prev.slice(CTX_N - need);
    if (slice.some((t) => !t)) return "";
    return need === 1 ? slice[0] : slice.join(" ");
  }

  /**
   * Stupid backoff 5→1. Short history skips higher orders without discount
   * (only real misses increment backoff).
   */
  function seedLogScore(prev, word) {
    const w = String(word || "").toLowerCase();
    if (!w) return null;
    const a = D.STUPID_BACKOFF_ALPHA != null ? D.STUPID_BACKOFF_ALPHA : 0.4;
    let p = 0;
    let backed = 0;
    for (let order = NGRAM_MAX; order >= 2; order--) {
      const key = contextKeyForOrder(prev, order);
      if (!key) continue; // history too short — not a miss
      const hit = mleFromCounts(ngramByOrder[order].get(key), w);
      if (hit > 0) {
        p = hit * Math.pow(a, backed);
        break;
      }
      backed++;
    }
    if (!(p > 0)) {
      const u = unigramCounts.get(w) || 0;
      if (u > 0 && unigramTotal > 0) p = Math.pow(a, backed) * (u / unigramTotal);
      else backed++;
    }
    if (!(p > 0) && freqRank.has(w)) {
      const n = Math.max(frequencyWords.length, 1);
      p = Math.pow(a, backed + 1) * (1 - freqRank.get(w) / n) * 0.08;
    }
    if (!(p > 0)) return null;
    return Math.log10(Math.max(p, 1e-12));
  }

  function prefixOk(word, pfx, pfxBare) {
    if (!pfx) return true;
    const first = String(word).split(/\s+/)[0].toLowerCase();
    if (first.startsWith(pfx)) return true;
    const firstBare = T.stripApostrophes(first);
    return !!(pfxBare && firstBare.startsWith(pfxBare));
  }

  function addCountKeys(out, m, pfx, pfxBare) {
    if (!m) return;
    for (const w of m.keys()) {
      if (pfx && !prefixOk(w, pfx, pfxBare)) continue;
      out.add(w);
    }
  }

  function seedCandidates(prev, pfx, pfxBare) {
    const out = new Set();
    for (let order = NGRAM_MAX; order >= 2; order--) {
      const key = contextKeyForOrder(prev, order);
      if (!key) continue;
      addCountKeys(out, ngramByOrder[order].get(key), pfx, pfxBare);
    }
    return out;
  }

  function frequencyPrefixMatches(pfx, pfxBare, limit) {
    if (!pfx || !frequencyWords.length) return [];
    const lim = limit || 48;
    const out = [];
    for (let i = 0; i < frequencyWords.length && out.length < lim; i++) {
      const w = frequencyWords[i];
      if (prefixOk(w, pfx, pfxBare)) out.push(w);
    }
    return out;
  }

  // --- slots ---

  function slotWhenMatches(when, prev) {
    if (!when) return true;
    const toks = {
      1: prev[3] || "",
      2: prev[2] || "",
      3: prev[1] || "",
      4: prev[0] || ""
    };
    if (when.prev1Empty) return !toks[1];
    for (let n = 1; n <= 4; n++) {
      const exact = when["prev" + n];
      if (exact != null && toks[n] !== exact) return false;
      const set = when["prev" + n + "In"];
      if (set && !set.includes(toks[n])) return false;
      const cls = when["prev" + n + "Class"];
      if (cls && !wordHasClass(toks[n], cls)) return false;
    }
    return true;
  }

  function expectedNextClasses(prev) {
    for (const rule of D.SLOT_RULES || []) {
      if (slotWhenMatches(rule.when, prev)) return rule.prefer.slice();
    }
    return [];
  }

  function withinClassFreqBoost(word, cls) {
    const ranks = classWordRank.get(cls);
    if (!ranks || !ranks.has(word)) return 0;
    const n = Math.max((wordClasses[cls] || []).length, 1);
    const scale = D.CLASS_FREQ_LOG_BOOST != null ? D.CLASS_FREQ_LOG_BOOST : 0.07;
    return scale * (1 - ranks.get(word) / n);
  }

  function slotLogBoost(word, expected) {
    if (!expected || !expected.length) return 0;
    const w = String(word || "").toLowerCase();
    const litIdx = expected.indexOf(w);
    if (litIdx >= 0) return 0.12 - litIdx * 0.015;
    const classes = wordClassIndex.get(w);
    if (!classes) return 0;
    for (let i = 0; i < expected.length; i++) {
      const cls = expected[i];
      if (classes.has(cls)) return 0.1 - i * 0.015 + withinClassFreqBoost(w, cls);
    }
    return 0;
  }

  function classSlotCandidates(prefix, limit, expected) {
    if (!expected || !expected.length) return [];
    const p = (prefix || "").toLowerCase();
    const lim = limit || 16;
    const out = [];
    const seen = new Set();
    for (let ei = 0; ei < expected.length; ei++) {
      const key = expected[ei];
      const list = wordClasses[key] || (key.length <= 6 ? [key] : []);
      const perClass = ei === 0 ? lim : Math.max(4, Math.floor(lim / 2));
      let taken = 0;
      const maxScan = Math.min(list.length, CLASS_EXPAND_CAP);
      for (let i = 0; i < maxScan; i++) {
        const w = list[i];
        if (p && !w.startsWith(p)) continue;
        if (seen.has(w)) continue;
        seen.add(w);
        out.push(w);
        taken++;
        if (out.length >= lim || taken >= perClass) break;
      }
      if (out.length >= lim) break;
    }
    return out;
  }

  function contextKeyFromWords(ctxWords) {
    const w = (ctxWords || []).map((x) => String(x).toLowerCase()).filter(Boolean);
    if (!w.length) return "";
    return w.slice(-CTX_N).join(" ");
  }

  function personalLogBoost(ctxWords, word) {
    const w = String(word || "").toLowerCase();
    if (!w) return 0;
    let n = 0;
    const keys =
      ctxWords && ctxWords.length
        ? [
            contextKeyFromWords(ctxWords),
            contextKeyFromWords(ctxWords.slice(-2)),
            contextKeyFromWords(ctxWords.slice(-1))
          ]
        : [""];
    for (const key of keys) {
      const acc = acceptCounts.get(key);
      if (acc && acc.has(w)) n += acc.get(w) || 0;
    }
    if (n <= 0) return 0;
    return Math.min(0.35, 0.04 * Math.log10(1 + n));
  }

  function personalCandidates(ctxWords, pfx) {
    const acc = acceptCounts.get(contextKeyFromWords(ctxWords));
    if (!acc) return [];
    const out = [];
    [...acc.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .forEach(([w]) => {
        if (!pfx || w.startsWith(pfx)) out.push(w);
      });
    return out;
  }

  function logRankScore(prev, word, ctxWords, expected) {
    const w = String(word || "").toLowerCase();
    if (!w) return -Infinity;
    const seed = seedLogScore(prev, w);
    let base = seed != null ? seed : -8;
    base += personalLogBoost(ctxWords, w);
    base += slotLogBoost(w, expected);
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
      ctxWords = words.slice(-CTX_N);
    } else if (words.length > 0) {
      activePrefix = words[words.length - 1];
      ctxWords = words.slice(0, -1).slice(-CTX_N);
    }
    const completedBefore = activePrefix ? words.slice(0, -1) : words;
    const isSentenceStart = completedBefore.length === 0;
    if (isSentenceStart && !activePrefix) ctxWords = [];

    const prev = ["", "", "", ""];
    for (let i = 0; i < ctxWords.length; i++) {
      prev[CTX_N - ctxWords.length + i] = String(ctxWords[i]).toLowerCase();
    }

    return {
      prev,
      prev1: prev[3],
      activePrefix,
      midWord: !!(activePrefix && activePrefix.length),
      isSentenceStart,
      ctxWords
    };
  }

  function collectCandidates(sctx, ortho, expected) {
    const { prev, activePrefix, midWord, ctxWords } = sctx;
    const pfx = midWord ? (activePrefix || "").toLowerCase() : "";
    const pfxBare = T.stripApostrophes(pfx);
    const set = new Set();
    const THIN_POOL = 16;

    const add = (w) => {
      const key = String(w || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      if (!key) return;
      if (midWord && !prefixOk(key, pfx, pfxBare)) return;
      set.add(key);
    };

    seedCandidates(prev, pfx, pfxBare).forEach(add);
    if (pfx) frequencyPrefixMatches(pfx, pfxBare, 56).forEach(add);
    (ortho.candidates || []).forEach(add);
    classSlotCandidates(pfx, 16, expected).forEach(add);
    personalCandidates(ctxWords, pfx).forEach(add);

    if (!midWord && ctxWords && ctxWords.length) {
      ctxWords.forEach((cw) => {
        if (String(cw).length >= 4) add(cw);
      });
    }
    if (!prev[3] && !midWord) {
      (D.DEFAULT_STARTERS || []).slice(0, 16).forEach(add);
    }
    if (pfx && set.size < THIN_POOL) {
      for (const list of Object.values(wordClasses)) {
        const maxScan = Math.min(list.length, CLASS_EXPAND_CAP);
        for (let i = 0; i < maxScan; i++) {
          if (prefixOk(list[i], pfx, pfxBare)) add(list[i]);
          if (set.size >= 48) break;
        }
        if (set.size >= 48) break;
      }
    }
    return Array.from(set);
  }

  function rankCandidates(cands, sctx, ortho, expected) {
    const { prev, activePrefix, midWord, ctxWords } = sctx;
    const pfx = (activePrefix || "").toLowerCase();
    const pfxBare = T.stripApostrophes(pfx);
    const W = D.SCORE_WEIGHTS || {};
    const boosts = ortho.boosts || new Map();
    const lim = D.CANDIDATE_LIMIT || 64;

    const scored = cands.map((w) => {
      const first = w.split(/\s+/)[0];
      const firstLower = first.toLowerCase();
      const firstBare = T.stripApostrophes(first);
      let sc = logRankScore(prev, firstLower, ctxWords, expected);

      if (midWord) {
        const exact = firstLower === pfx;
        const bareExact =
          !exact && pfxBare && firstBare === pfxBare && firstLower.length === pfx.length;
        if (exact) sc += W.exactMatchLog != null ? W.exactMatchLog : 0.35;
        else if (bareExact) sc += 0.12;
        else if (
          firstLower.startsWith(pfx) ||
          (pfxBare && firstBare.startsWith(pfxBare))
        ) {
          const extra = firstLower.length - pfx.length;
          const grow = W.prefixGrowLog != null ? W.prefixGrowLog : 0.08;
          if (pfx.length <= 2) sc += grow * Math.min(1, extra / 5);
          else if (pfx.length <= 4) sc += grow * Math.min(1, 0.5 + (3 - Math.min(extra, 3)) * 0.1);
          else sc += grow * (extra <= 2 ? 0.15 : 0.05);
        }
      }

      if (prev[3] && firstLower === prev[3]) {
        sc -= W.repeatPrevLog != null ? W.repeatPrevLog : 0.25;
      }
      if (firstLower.indexOf("'") >= 0 && firstLower.length <= 5) sc += 0.03;
      sc += (boosts.get(firstLower) || boosts.get(w.toLowerCase()) || 0) * 0.4;
      return { text: w, score: sc };
    });

    scored.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
    return scored.slice(0, lim);
  }

  function assemble(ranked, sctx, ortho) {
    const { midWord, isSentenceStart, activePrefix } = sctx;
    const limit = D.CHIP_LIMIT || 9;
    const out = [];
    const seen = new Set();
    const initialCounts = new Map();

    const pushChip = (raw, diversify) => {
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
      out.push({ text: label, action: "append" });
      return true;
    };

    (ortho.pinChips || []).forEach((f) => pushChip(f, false));
    for (const r of ranked) {
      if (out.length >= limit) break;
      pushChip(r.text, true);
    }
    if (out.length < Math.min(5, limit)) {
      for (const r of ranked) {
        if (out.length >= limit) break;
        pushChip(r.text, false);
      }
    }
    if (out.length < 3) {
      for (const s of D.DEFAULT_STARTERS || []) {
        if (out.length >= limit) break;
        if (midWord && activePrefix && !s.toLowerCase().startsWith(activePrefix.toLowerCase())) {
          continue;
        }
        pushChip(s, false);
      }
    }
    return out;
  }

  // --- single lexicon load ---

  function applyFreqWords(list) {
    frequencyWords = (list || []).map((w) => String(w).toLowerCase()).filter(Boolean);
    freqRank.clear();
    frequencyWords.forEach((w, i) => freqRank.set(w, i));
  }

  /**
   * Apply word-class-10k payload. Does not mutate VoicePredictData.
   * Prefer data.words for flat freq order; merge seed class extras after file lists.
   */
  function applyLexiconData(data) {
    if (!data || typeof data !== "object") return 0;
    const seedSnap = cloneClasses(D.WORD_CLASS);
    const next = {};
    const classSrc = data.classes && typeof data.classes === "object" ? data.classes : {};
    const names = new Set([...Object.keys(classSrc), ...Object.keys(seedSnap)]);
    const all = new Set();

    for (const cls of names) {
      const local = new Set();
      const list = [];
      const raw = classSrc[cls];
      if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
          const w = String(raw[i] || "").toLowerCase();
          if (!w || local.has(w)) continue;
          local.add(w);
          list.push(w);
          all.add(w);
        }
      }
      for (const w of seedSnap[cls] || []) {
        if (local.has(w)) continue;
        local.add(w);
        list.push(w);
        all.add(w);
      }
      next[cls] = list;
    }
    wordClasses = next;
    rebuildWordClassIndex();

    if (Array.isArray(data.words) && data.words.length) {
      applyFreqWords(data.words);
    } else {
      // Fallback: union class lists (not ideal order).
      applyFreqWords(Array.from(all));
    }

    // Light unigram prior from top of freq list (once).
    if (!lexiconLoaded && frequencyWords.length) {
      frequencyWords.slice(0, 2000).forEach((w, i) => {
        bumpUnigram(w, 0.02 + 0.08 * (1 - i / Math.max(frequencyWords.length, 1)));
      });
    }
    lexiconLoaded = true;
    return all.size || frequencyWords.length;
  }

  async function fetchTextMaybeGzip(url) {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error("fetch " + url + " " + res.status);
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error("empty " + url);
    const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
    if (head[0] === 0x7b) return new TextDecoder("utf-8").decode(buf);
    if (head[0] === 0x1f && head[1] === 0x8b) {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("gzip requires DecompressionStream");
      }
      const ds = new DecompressionStream("gzip");
      return await new Response(new Blob([buf]).stream().pipeThrough(ds)).text();
    }
    return new TextDecoder("utf-8").decode(buf);
  }

  async function loadModels() {
    if (lexiconLoaded) return frequencyWords.length || wordClassIndex.size;
    const href = D.WORD_CLASS_URL || "data/word-class-10k.json.gz";
    try {
      const data = JSON.parse(await fetchTextMaybeGzip(href));
      const n = applyLexiconData(data);
      if (data.meta && data.meta.name) {
        console.info("[VoicePredict] lexicon", data.meta.name, n, "classified,", frequencyWords.length, "words");
      }
      return n;
    } catch (e) {
      console.warn("[VoicePredict] lexicon failed", e);
      return 0;
    }
  }

  // --- personal / init / public ---

  function init() {
    if (ready) return;
    learnWordNgrams(D.CONVERSATION_SEED, 0.85);
    learnSeedPhrases(D.SEED_PHRASES, 2.2);
    Object.values(wordClasses).forEach((list) => list.forEach((w) => bumpUnigram(w, 0.06)));
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
      ...(ctxWords || []).slice(-CTX_N).map((x) => String(x).toLowerCase()),
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

  function applyInsert(text, start, end, chunk) {
    if (!ready) init();
    return T.applyInsert(text, start, end, chunk);
  }

  function suggest(text, caretPos) {
    if (!ready) init();
    const sctx = parseContext(text, caretPos);
    const expected = expectedNextClasses(sctx.prev);
    const ortho = T.orthographyFor(sctx.activePrefix, {
      prev1: sctx.prev1,
      isSentenceStart: sctx.isSentenceStart,
      midWord: sctx.midWord
    });
    const list = collectCandidates(sctx, ortho, expected);
    const ranked = rankCandidates(list, sctx, ortho, expected);
    const chips = assemble(ranked, sctx, ortho);
    return {
      chips,
      ctxWords: sctx.ctxWords.slice(),
      activePrefix: sctx.activePrefix,
      midWord: sctx.midWord,
      isSentenceStart: sctx.isSentenceStart
    };
  }

  global.VoicePredict = {
    init,
    suggest,
    applyInsert,
    formatSuggestion: T.formatSuggestion.bind(T),
    recordAccept,
    learnText,
    loadModels,
    /** @deprecated alias of loadModels */
    loadFrequencyList: loadModels,
    /** @internal */
    _applyLexiconData(data) {
      return applyLexiconData(data || {});
    },
    /** @internal */
    _applyFreqList(list) {
      applyFreqWords(list || []);
      return frequencyWords.length;
    },
    get ready() {
      return ready;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
