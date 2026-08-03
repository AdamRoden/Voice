/**
 * VoiceMobileLm — compact mobile n-gram LM (Vertanen forum top-K JSON).
 *
 * API:
 *   VoiceMobileLm.load(url) → Promise<number>   // vocab size
 *   VoiceMobileLm.loadFromObject(data) → number // tests / fixtures
 *   VoiceMobileLm.logScore(p3, p2, p1, word) → number|null  // log10
 *   VoiceMobileLm.candidates(p3, p2, p1, prefix) → string[]
 *   VoiceMobileLm.prefixMatches(prefix, limit) → string[]
 *   VoiceMobileLm.fuzzyNeighbors(query, { mode, limit, maxCost }) → {word,cost}[]
 *   VoiceMobileLm.ready, .words
 */
(function (global) {
  "use strict";

  const D = global.VoicePredictData;
  const BACKOFF = () => (D && D.MOBILE_BACKOFF_LOG10 != null ? D.MOBILE_BACKOFF_LOG10 : 0.45);

  let ready = false;
  let words = [];
  /** @type {Map<string, number>} */
  const uniLogP = new Map();
  /** @type {Map<string, number>} */
  const uniBow = new Map();
  /** context → Map(next → log10p) */
  const bi = new Map();
  const tri = new Map();
  const four = new Map();

  function reset() {
    ready = false;
    words = [];
    uniLogP.clear();
    uniBow.clear();
    bi.clear();
    tri.clear();
    four.clear();
  }

  function parseContString(raw) {
    const m = new Map();
    if (!raw) return m;
    const parts = String(raw).split(",");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const colon = part.lastIndexOf(":");
      if (colon <= 0) continue;
      const w = part.slice(0, colon);
      const lp = Number(part.slice(colon + 1));
      if (!w || !Number.isFinite(lp)) continue;
      m.set(w, lp / 1000);
    }
    return m;
  }

  function fillOrder(target, rawObj) {
    target.clear();
    if (!rawObj || typeof rawObj !== "object") return;
    for (const key of Object.keys(rawObj)) {
      target.set(key, parseContString(rawObj[key]));
    }
  }

  /**
   * @param {object} data compact LM JSON
   * @returns {number} vocab size
   */
  function loadFromObject(data) {
    reset();
    if (!data || !Array.isArray(data.words)) {
      throw new Error("[VoiceMobileLm] invalid payload: missing words[]");
    }
    words = data.words.map((w) => String(w).toLowerCase());
    const uni = data.uni || [];
    for (let i = 0; i < words.length; i++) {
      const row = uni[i];
      if (!row) continue;
      const lp = Number(row[0]) / 1000;
      const bw = Number(row[1]) / 1000;
      if (Number.isFinite(lp)) uniLogP.set(words[i], lp);
      if (Number.isFinite(bw)) uniBow.set(words[i], bw);
    }
    fillOrder(bi, data.bi);
    fillOrder(tri, data.tri);
    fillOrder(four, data.four);
    ready = true;
    return words.length;
  }

  async function fetchTextMaybeGzip(url) {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error("fetch " + url + " " + res.status);
    const buf = await res.arrayBuffer();
    if (!buf.byteLength) throw new Error("empty response " + url);
    const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
    // Already JSON
    if (head[0] === 0x7b /* { */) {
      return new TextDecoder("utf-8").decode(buf);
    }
    // Gzip magic 1f 8b
    const isGz = head[0] === 0x1f && head[1] === 0x8b;
    if (isGz) {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("gzip LM requires DecompressionStream");
      }
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([buf]).stream().pipeThrough(ds);
      return await new Response(stream).text();
    }
    return new TextDecoder("utf-8").decode(buf);
  }

  async function load(url) {
    if (ready && words.length) return words.length;
    const href = url || (D && D.MOBILE_LM_URL) || "data/mobile-lm.json.gz";
    const text = await fetchTextMaybeGzip(href);
    const data = JSON.parse(text);
    const n = loadFromObject(data);
    if (data.meta && data.meta.name) {
      console.info("[VoiceMobileLm] loaded", data.meta.name, n, "words");
    }
    return n;
  }

  function cont(map, key) {
    if (!key) return null;
    return map.get(key) || null;
  }

  /**
   * log10 P(word | context) with step backoff over top-K tables.
   * @returns {number|null}
   */
  function logScore(p3, p2, p1, word) {
    if (!ready || !word) return null;
    const w = String(word).toLowerCase();
    const pen = BACKOFF();
    let backed = 0;

    if (p3 && p2 && p1) {
      const m = cont(four, p3 + " " + p2 + " " + p1);
      if (m && m.has(w)) return m.get(w);
      backed++;
    }
    if (p2 && p1) {
      const m = cont(tri, p2 + " " + p1);
      if (m && m.has(w)) return m.get(w) - pen * backed;
      backed++;
    }
    if (p1) {
      const m = cont(bi, p1);
      if (m && m.has(w)) return m.get(w) - pen * backed;
      backed++;
    } else {
      const m = cont(bi, "<s>");
      if (m && m.has(w)) return m.get(w);
      backed++;
    }
    if (uniLogP.has(w)) {
      const bow = p1 && uniBow.has(p1) ? uniBow.get(p1) : 0;
      return uniLogP.get(w) + (bow || 0) - pen * backed;
    }
    return null;
  }

  function stripApos(s) {
    return String(s || "").toLowerCase().replace(/['’]/g, "");
  }

  /** True if word matches typed prefix (with or without apostrophes). */
  function matchesPrefix(word, pfx) {
    if (!pfx) return true;
    if (word.startsWith(pfx)) return true;
    const bareP = stripApos(pfx);
    const bareW = stripApos(word);
    return !!(bareP && bareW.startsWith(bareP));
  }

  function addKeys(out, m, pfx) {
    if (!m) return;
    for (const w of m.keys()) {
      if (pfx && !matchesPrefix(w, pfx)) continue;
      out.add(w);
    }
  }

  /** Context-table candidates (no unigram flood). */
  function candidates(p3, p2, p1, prefix) {
    const pfx = (prefix || "").toLowerCase();
    const out = new Set();
    if (!ready) return [];
    if (p3 && p2 && p1) addKeys(out, cont(four, p3 + " " + p2 + " " + p1), pfx);
    if (p2 && p1) addKeys(out, cont(tri, p2 + " " + p1), pfx);
    if (p1) addKeys(out, cont(bi, p1), pfx);
    else addKeys(out, cont(bi, "<s>"), pfx);
    return Array.from(out);
  }

  /** Frequency-ordered vocab prefixes (apostrophe-insensitive). */
  function prefixMatches(prefix, limit) {
    const pfx = (prefix || "").toLowerCase();
    if (!pfx || !ready) return [];
    const lim = limit || 40;
    const out = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!matchesPrefix(w, pfx)) continue;
      out.push(w);
      if (out.length >= lim) break;
    }
    return out;
  }

  /**
   * QWERTY / mobile-ish letter neighbors for cheap typo costs.
   * Digits/punct omitted — we only correct a–z prefixes.
   */
  const KEY_NEIGHBORS = {
    q: "wa",
    w: "qeas",
    e: "wrsd",
    r: "etdf",
    t: "ryfg",
    y: "tugh",
    u: "yihj",
    i: "uojk",
    o: "ipkl",
    p: "ol",
    a: "qwsz",
    s: "awedxz",
    d: "serfcx",
    f: "drtgvc",
    g: "ftyhbv",
    h: "gyujnb",
    j: "huiknm",
    k: "jiolm",
    l: "kop",
    z: "asx",
    x: "zsdc",
    c: "xdfv",
    v: "cfgb",
    b: "vghn",
    n: "bhjm",
    m: "njk"
  };

  function isKeyAdjacent(a, b) {
    if (!a || !b || a === b) return a === b;
    const ca = a.charAt(0);
    const cb = b.charAt(0);
    const n = KEY_NEIGHBORS[ca];
    return !!(n && n.indexOf(cb) >= 0);
  }

  /**
   * Cost of transforming a → b with at most one edit (incl. adjacent transposition).
   * @returns {number} 0 exact; ~0.3 keyboard sub; ~0.55 transpose; ~0.7–0.85 other; Infinity if harder
   */
  function editCostAtMost1(a, b) {
    if (a === b) return 0;
    const na = a.length;
    const nb = b.length;
    if (Math.abs(na - nb) > 1) return Infinity;

    // Same length: single substitute or adjacent transposition (teh → the)
    if (na === nb) {
      const diffs = [];
      for (let i = 0; i < na; i++) {
        if (a.charCodeAt(i) !== b.charCodeAt(i)) diffs.push(i);
      }
      if (diffs.length === 0) return 0;
      if (diffs.length === 1) {
        const i = diffs[0];
        return isKeyAdjacent(a.charAt(i), b.charAt(i)) ? 0.32 : 0.85;
      }
      if (
        diffs.length === 2 &&
        diffs[1] === diffs[0] + 1 &&
        a.charAt(diffs[0]) === b.charAt(diffs[1]) &&
        a.charAt(diffs[1]) === b.charAt(diffs[0])
      ) {
        return 0.55;
      }
      return Infinity;
    }

    // Insertion into a (b longer by 1) or deletion from a (a longer by 1)
    const shorter = na < nb ? a : b;
    const longer = na < nb ? b : a;
    let i = 0;
    let j = 0;
    let skipped = false;
    while (i < shorter.length && j < longer.length) {
      if (shorter.charCodeAt(i) === longer.charCodeAt(j)) {
        i++;
        j++;
        continue;
      }
      if (skipped) return Infinity;
      skipped = true;
      j++; // skip the extra char in longer
    }
    // trailing extra in longer is fine (one skip)
    return 0.72;
  }

  /** True if a and b differ by at most one insert/delete/substitute. */
  function editDistanceAtMost1(a, b) {
    return editCostAtMost1(a, b) < Infinity;
  }

  function hasWord(word) {
    if (!ready || !word) return false;
    const w = String(word).toLowerCase();
    if (uniLogP.has(w)) return true;
    const bare = stripApos(w);
    if (bare !== w && uniLogP.has(bare)) return true;
    const contracted = bareToContracted(bare || w);
    if (contracted && uniLogP.has(contracted)) return true;
    return false;
  }

  /**
   * Single fuzzy neighbor search (keyboard / transpose aware).
   * @param {string} query typed prefix or full token
   * @param {{ mode?: "prefix"|"word", limit?: number, maxCost?: number }} [opts]
   * @returns {{ word: string, cost: number }[]}
   */
  function fuzzyNeighbors(query, opts) {
    const mode = (opts && opts.mode) || "prefix";
    const lim = (opts && opts.limit) || 12;
    const maxCost = opts && opts.maxCost != null ? opts.maxCost : 0.95;
    const raw = (query || "").toLowerCase();
    const bareQ = stripApos(raw);
    if (!ready || bareQ.length < 3) return [];

    const scored = [];
    const seen = new Set();
    const scanCap = Math.min(words.length, mode === "word" ? 8000 : 6000);

    for (let i = 0; i < scanCap && scored.length < lim * 3; i++) {
      const w = words[i];
      const bareW = stripApos(w);
      let cost;
      if (mode === "word") {
        if (Math.abs(bareW.length - bareQ.length) > 1) continue;
        if (bareW === bareQ) continue;
        cost = editCostAtMost1(bareQ, bareW);
      } else {
        if (bareW.length < bareQ.length - 1 || bareW.length > bareQ.length + 3) continue;
        if (matchesPrefix(w, raw)) continue; // exact prefixes handled elsewhere
        const target = bareW.slice(0, Math.min(bareW.length, bareQ.length + 1));
        cost = editCostAtMost1(bareQ, target);
      }
      if (cost > maxCost) continue;
      if (seen.has(w)) continue;
      seen.add(w);
      scored.push({ word: w, cost, rank: i });
    }

    scored.sort((a, b) => a.cost - b.cost || a.rank - b.rank);
    return scored.slice(0, lim).map((x) => ({ word: x.word, cost: x.cost }));
  }

  /** @deprecated prefer fuzzyNeighbors; kept for tests */
  function fuzzyPrefixMatches(prefix, limit, opts) {
    return fuzzyNeighbors(prefix, {
      mode: "prefix",
      limit: limit || 12,
      maxCost: opts && opts.maxCost
    }).map((x) => x.word);
  }

  /** @deprecated prefer fuzzyNeighbors */
  function fuzzyWordMatches(token, limit, opts) {
    return fuzzyNeighbors(token, {
      mode: "word",
      limit: limit || 12,
      maxCost: opts && opts.maxCost
    });
  }

  /** Edit cost between two bare strings (Infinity if not ≤1 edit). */
  function editCost(a, b) {
    return editCostAtMost1(stripApos(a), stripApos(b));
  }

  /** Bare typing → contracted form from predict-data tables (dont → don't). */
  function bareToContracted(bare) {
    if (!bare || !D) return null;
    const table = D.CONTRACTION_SHORTCUTS;
    if (!table || !table[bare]) return null;
    return String(table[bare]).toLowerCase();
  }

  /**
   * Token variants for LM lookup: surface, apostrophe-stripped, contracted.
   * e.g. dont → [dont, don't]; I'm → [i'm, im]; want → [want]
   */
  function tokenVariants(tok) {
    if (!tok) return [""];
    const t = String(tok).toLowerCase();
    const out = [];
    const seen = new Set();
    const push = (x) => {
      if (!x && x !== "") return;
      const k = x || "";
      if (seen.has(k)) return;
      seen.add(k);
      out.push(k);
    };
    push(t);
    const bare = stripApos(t);
    if (bare && bare !== t) push(bare);
    const contracted = bareToContracted(bare || t);
    if (contracted) push(contracted);
    return out;
  }

  /**
   * Best log10 over history/word apostrophe normalizations.
   * Expands bare forms (dont/im) to contracted LM keys and vice versa.
   */
  function logScoreFlex(p3, p2, p1, word) {
    if (!ready || !word) return null;
    const p1vars = tokenVariants(p1);
    const wvars = tokenVariants(word);
    // p2/p3: surface only + one bare form (keep combinations small)
    const p2vars = p2 ? [p2, stripApos(p2)].filter((v, i, a) => v && a.indexOf(v) === i) : [""];
    const p3vars = p3 ? [p3, stripApos(p3)].filter((v, i, a) => v && a.indexOf(v) === i) : [""];

    let best = null;
    for (let i3 = 0; i3 < p3vars.length; i3++) {
      for (let i2 = 0; i2 < p2vars.length; i2++) {
        for (let i1 = 0; i1 < p1vars.length; i1++) {
          for (let iw = 0; iw < wvars.length; iw++) {
            const s = logScore(p3vars[i3], p2vars[i2], p1vars[i1], wvars[iw]);
            if (s != null && (best == null || s > best)) best = s;
          }
        }
      }
    }
    return best;
  }

  global.VoiceMobileLm = {
    load,
    loadFromObject,
    logScore,
    logScoreFlex,
    candidates,
    prefixMatches,
    fuzzyNeighbors,
    fuzzyPrefixMatches,
    fuzzyWordMatches,
    editCost,
    editDistanceAtMost1,
    isKeyAdjacent,
    hasWord,
    matchesPrefix,
    stripApos,
    reset,
    get ready() {
      return ready;
    },
    get words() {
      return words;
    },
    get uniLogP() {
      return uniLogP;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
