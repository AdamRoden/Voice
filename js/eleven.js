/**
 * ElevenLabs: v4 Turbo only, streamed as 24 kHz PCM.
 * Bracket tags are kept. A tag lasts one breath, so tagged lines are split
 * on punctuation and each piece is its own stream. Speed and pitch are not
 * sent to the API.
 */
(function (global) {
  "use strict";

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  /** Model ids: always AacSpeechEngines (loads before this module). */
  function normalizeModelId(id) {
    if (!global.AacSpeechEngines || typeof global.AacSpeechEngines.normalizeModelId !== "function") {
      throw new Error("AacSpeechEngines required for model id normalization");
    }
    return global.AacSpeechEngines.normalizeModelId(id);
  }

  function isElevenModelId(id) {
    return global.AacSpeechEngines.isElevenModel(id);
  }

  /** True if text contains Eleven-style [tag] directives. */
  function phraseHasInlineTags(text) {
    return /\[[^\]]*\]/.test(String(text || ""));
  }

  /**
   * Replace [bracket] segments with a space, collapse whitespace, trim.
   * Used to tell tags apart from words that can be spoken.
   */
  function stripInlineTags(text) {
    return String(text || "")
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasNonTagSpeechContent(text) {
    return stripInlineTags(text).length > 0;
  }

  /**
   * Standing voice tag: trim, drop one wrapping [pair], then drop any leftover brackets.
   * Empty means no standing tag.
   */
  function normalizeStandingTag(raw) {
    let t = String(raw == null ? "" : raw).trim();
    if (t.length >= 2 && t.charAt(0) === "[" && t.charAt(t.length - 1) === "]") {
      t = t.slice(1, -1).trim();
    }
    return t.replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
  }

  /**
   * Put [tag] at the start of text sent to ElevenLabs.
   * Leave the phrase alone when it already starts with that tag.
   */
  function applyStandingTag(phrase, tag) {
    const clean = normalizeStandingTag(tag);
    const text = String(phrase == null ? "" : phrase);
    if (!clean) return text;
    const wrapped = `[${clean}]`;
    const lead = text.trimStart();
    if (lead.length >= wrapped.length
      && lead.slice(0, wrapped.length).toLowerCase() === wrapped.toLowerCase()) {
      return text;
    }
    return `${wrapped} ${text}`;
  }

  function isDigitChar(ch) {
    return !!ch && ch >= "0" && ch <= "9";
  }

  function isLetterChar(ch) {
    return !!ch && /[A-Za-z]/.test(ch);
  }

  function isClosingMark(ch) {
    return ch === "\"" || ch === "'" || ch === ")" || ch === "]"
      || ch === "”" || ch === "’";
  }

  /**
   * Punctuation that ends a breath.
   * 3.14, 1,000, 3:30, and example.com stay in one piece.
   */
  function isBreathPunct(text, index) {
    const ch = text.charAt(index);
    if (ch === "!" || ch === "?" || ch === "…") return true;
    if (ch !== "." && ch !== "," && ch !== ";" && ch !== ":") return false;
    const prev = text.charAt(index - 1);
    const next = text.charAt(index + 1);
    if (isDigitChar(prev) && isDigitChar(next)) return false;
    if (ch === "." && isLetterChar(prev) && isLetterChar(next)) return false;
    return true;
  }

  /**
   * Split on breaths. Punctuation stays with the words before it.
   * Brackets are opaque, so a comma inside [low, slow] is not a split.
   */
  function splitAtPunctuation(text) {
    const src = String(text || "");
    const parts = [];
    let buf = "";
    let depth = 0;
    const push = () => {
      const piece = buf.trim();
      buf = "";
      if (piece) parts.push(piece);
    };
    for (let i = 0; i < src.length; i++) {
      const ch = src.charAt(i);
      if (ch === "[") depth += 1;
      if (depth > 0) {
        buf += ch;
        if (ch === "]") depth -= 1;
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        push();
        if (ch === "\r" && src.charAt(i + 1) === "\n") i += 1;
        continue;
      }
      if (ch === "—" || ch === "–" || (ch === "-" && src.charAt(i + 1) === "-")) {
        buf += ch === "-" ? "--" : ch;
        if (ch === "-") i += 1;
        push();
        continue;
      }
      if (isBreathPunct(src, i)) {
        buf += ch;
        while (src.charAt(i + 1) && "!?.…,;:".indexOf(src.charAt(i + 1)) !== -1) {
          i += 1;
          buf += src.charAt(i);
        }
        while (isClosingMark(src.charAt(i + 1))) {
          i += 1;
          buf += src.charAt(i);
        }
        push();
        continue;
      }
      buf += ch;
    }
    push();
    return parts;
  }

  function gluePieces(left, right) {
    if (left && right) return (left + " " + right).trim();
    return (left || right || "").trim();
  }

  /**
   * Breath pieces that can be spoken. A tag or pause with no words
   * rides on the next piece, or the previous one when nothing follows.
   */
  function breathParts(text) {
    const raw = splitAtPunctuation(text);
    const parts = [];
    let held = "";
    for (let i = 0; i < raw.length; i++) {
      const combined = gluePieces(held, raw[i]);
      held = "";
      if (!hasNonTagSpeechContent(combined)) {
        held = combined;
        continue;
      }
      parts.push(combined);
    }
    if (held) {
      if (parts.length) parts[parts.length - 1] = gluePieces(parts[parts.length - 1], held);
      else parts.push(held);
    }
    return parts;
  }

  /** Bracket tags at the start of a piece. A tag later in the piece stays local. */
  function leadingTagRun(text) {
    const match = String(text || "").match(/^\s*((?:\[[^\]]*\]\s*)+)/);
    return match ? match[1].replace(/\s+/g, " ").trim() : "";
  }

  /**
   * One request body per breath.
   * The standing style, plus any tags at the start of the line, is repeated
   * on every breath. A tag written later stays on that breath.
   * With no tag at all, the line stays one request.
   */
  function taggedSends(phrase, tag) {
    const text = String(phrase == null ? "" : phrase);
    const clean = normalizeStandingTag(tag);
    if (!clean && !phraseHasInlineTags(text)) return [text];
    const parts = breathParts(text);
    if (parts.length <= 1) return [applyStandingTag(text, clean)];
    const lead = leadingTagRun(text);
    const sends = [];
    for (let i = 0; i < parts.length; i++) {
      let body = parts[i].trim();
      if (lead && body.charAt(0) !== "[") body = (lead + " " + body).trim();
      if (!hasNonTagSpeechContent(body)) continue;
      sends.push(applyStandingTag(body, clean));
    }
    return sends.length ? sends : [applyStandingTag(text, clean)];
  }

  function requestPhrases(opts) {
    const source = opts && Array.isArray(opts.phrases) && opts.phrases.length
      ? opts.phrases
      : [opts && opts.phrase];
    const out = [];
    for (let i = 0; i < source.length; i++) {
      const text = String(source[i] == null ? "" : source[i]).trim();
      if (text) out.push(text);
    }
    return out.length ? out : [""];
  }

  function elevenModelId() {
    const id = global.AacSpeechEngines && global.AacSpeechEngines.ELEVEN_MODEL_ID;
    if (!id) throw new Error("AacSpeechEngines required");
    return id;
  }

  /**
   * Always eleven_v4_turbo. Bracket tags stay in the text.
   * Speed and pitch stay in fx. The API body is unprocessed text.
   */
  function prepareSpeakRequest(input) {
    const phrase = String(input.phrase || "");
    const speed = clamp(parseFloat(input.speed) || 1, 0.25, 4);
    const pitch = clamp(parseFloat(input.pitch) || 1, 0.5, 2);
    const modelId = elevenModelId();
    return {
      modelId,
      text: phrase,
      body: { text: phrase, model_id: modelId },
      fx: { speed, pitch }
    };
  }

  /** Raw signed-16 PCM, mono. Available without a higher ElevenLabs tier. */
  const PCM_STREAM_FORMAT = "pcm_24000";
  const PCM_STREAM_SAMPLE_RATE = 24000;

  function concatBytes(a, b) {
    const left = a && a.length ? a : null;
    const right = b && b.length ? b : null;
    if (!left && !right) return new Uint8Array(0);
    if (!left) return right.slice();
    if (!right) return left.slice();
    const out = new Uint8Array(left.length + right.length);
    out.set(left, 0);
    out.set(right, left.length);
    return out;
  }

  /**
   * Pull complete int16 samples out of a byte stream.
   * Holds back a trailing odd byte, and holds back short audio until minBytes
   * unless flush is set (end of stream).
   * @returns {{ samples: Int16Array|null, rest: Uint8Array }}
   */
  function takePcm16(rest, incoming, minBytes, flush) {
    const merged = concatBytes(rest, incoming);
    const even = merged.length - (merged.length & 1);
    const min = Math.max(2, minBytes | 0);
    const take = flush ? even : (even >= min ? even : 0);
    let samples = null;
    if (take > 0) {
      const copy = merged.slice(0, take);
      samples = new Int16Array(copy.buffer, copy.byteOffset, take >> 1);
    }
    return { samples, rest: merged.slice(take) };
  }

  /** Wrap raw PCM-16 mono bytes in a WAV blob decodeAudioData can read. */
  function pcm16ToWavBlob(pcmBytes, sampleRate) {
    const src = pcmBytes instanceof Uint8Array ? pcmBytes : new Uint8Array(0);
    const dataSize = src.length - (src.length & 1);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (offset, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);
    new Uint8Array(buffer, 44).set(src.subarray(0, dataSize));
    return new Blob([buffer], { type: "audio/wav" });
  }

  function concatList(parts) {
    let len = 0;
    for (let i = 0; i < parts.length; i++) len += parts[i].length;
    const out = new Uint8Array(len);
    let offset = 0;
    for (let i = 0; i < parts.length; i++) {
      out.set(parts[i], offset);
      offset += parts[i].length;
    }
    return out;
  }

  function httpError(res) {
    const err = new Error("ElevenLabs API error (" + res.status + ")");
    err.status = res.status;
    if (res.status === 401 || res.status === 403) err.code = "eleven_auth";
    return err;
  }

  /**
   * POST /stream and return a read() of raw PCM bytes. null means the body ended.
   * One shape: a byte reader. A body without getReader is a single read.
   */
  async function openPcmStream(opts) {
    const prepared = prepareSpeakRequest(opts);
    const voiceId = encodeURIComponent(String(opts.voiceId || ""));
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${PCM_STREAM_FORMAT}`,
      {
        method: "POST",
        headers: {
          Accept: "application/octet-stream",
          "Content-Type": "application/json",
          "xi-api-key": opts.apiKey
        },
        body: JSON.stringify(prepared.body),
        signal: opts.signal || undefined
      }
    );
    if (!res.ok) {
      try { await res.body?.cancel(); } catch (_) {}
      throw httpError(res);
    }
    const ctype = String(res.headers && res.headers.get ? (res.headers.get("content-type") || "") : "").toLowerCase();
    if (ctype.includes("json") || ctype.includes("mpeg") || ctype.includes("mp3")) {
      try { await res.body?.cancel(); } catch (_) {}
      throw new Error("ElevenLabs stream failed");
    }
    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      return {
        prepared,
        sampleRate: PCM_STREAM_SAMPLE_RATE,
        read: async () => {
          const { done, value } = await reader.read();
          if (done) return null;
          if (!value || !value.byteLength) return new Uint8Array(0);
          return value instanceof Uint8Array ? value : new Uint8Array(value);
        }
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let sent = false;
    return {
      prepared,
      sampleRate: PCM_STREAM_SAMPLE_RATE,
      read: async () => {
        if (sent) return null;
        sent = true;
        return buf;
      }
    };
  }

  /** Stall timer and abort/timeout mapping shared by collect and live play. */
  function createPcmStall(opts) {
    const STALL_MS = 20000;
    let timedOut = false;
    let stallTimer = null;
    const arm = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        timedOut = true;
        try { if (typeof opts.abort === "function") opts.abort(); } catch (_) {}
      }, STALL_MS);
    };
    const stop = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const aborted = () => !!(opts.signal && opts.signal.aborted);
    const mapError = (err) => {
      if (timedOut) {
        const timeoutErr = new Error("ElevenLabs timed out");
        timeoutErr.code = "timeout";
        return timeoutErr;
      }
      if (aborted() || (err && (err.name === "AbortError" || err.code === "aborted"))) {
        const out = err instanceof Error ? err : new Error("aborted");
        out.code = "aborted";
        return out;
      }
      return err;
    };
    return { arm, stop, aborted, mapError };
  }

  async function openPcmWithStall(opts) {
    const stall = createPcmStall(opts);
    stall.arm();
    try {
      const opened = await openPcmStream(opts);
      return { opened, stall };
    } catch (err) {
      stall.stop();
      throw stall.mapError(err);
    }
  }

  /**
   * Read the open PCM body to the end.
   * onChunk(null) means the body ended and the caller should flush.
   */
  async function consumePcm(opened, stall, onChunk) {
    try {
      while (!stall.aborted()) {
        const bytes = await opened.read();
        if (stall.aborted()) break;
        if (bytes === null) {
          if (onChunk) onChunk(null);
          break;
        }
        stall.arm();
        if (bytes.byteLength && onChunk) onChunk(bytes);
      }
    } catch (err) {
      stall.stop();
      throw stall.mapError(err);
    }
    stall.stop();
    if (stall.aborted()) throw stall.mapError(new Error("aborted"));
  }

  function phraseFields(opts, phrase) {
    return {
      phrase: String(phrase || ""),
      voiceId: opts.voiceId,
      apiKey: opts.apiKey,
      speed: opts.speed,
      pitch: opts.pitch
    };
  }

  /**
   * One phrase request. A stall aborts only this request, so the error
   * stays a timeout instead of looking like the user stopped the turn.
   */
  function openTracked(opts, phrase) {
    const local = typeof AbortController !== "undefined" ? new AbortController() : null;
    const cancelFetch = () => { try { if (local) local.abort(); } catch (_) {} };
    let stopStall = () => {};
    const cancel = () => {
      cancelFetch();
      try { stopStall(); } catch (_) {}
    };
    let onParent = null;
    if (opts.signal) {
      onParent = () => cancel();
      if (opts.signal.aborted) cancel();
      else opts.signal.addEventListener("abort", onParent);
    }
    const detach = () => {
      if (onParent && opts.signal) opts.signal.removeEventListener("abort", onParent);
      onParent = null;
    };
    const child = phraseFields(opts, phrase);
    child.signal = local ? local.signal : opts.signal;
    child.abort = local ? cancelFetch : opts.abort;
    const job = openPcmWithStall(child).then(
      (pair) => {
        stopStall = () => pair.stall.stop();
        return { opened: pair.opened, stall: pair.stall, detach };
      },
      (err) => {
        detach();
        throw err;
      }
    );
    return { job, cancel };
  }

  /** Download one later breath while an earlier one is still being read. */
  function bufferTracked(opts, phrase) {
    const tracked = openTracked(opts, phrase);
    const job = tracked.job.then(async (opened) => {
      const parts = [];
      try {
        await consumePcm(opened.opened, opened.stall, (bytes) => {
          if (bytes && bytes.byteLength) parts.push(bytes);
        });
      } finally {
        opened.detach();
      }
      const pcm = concatList(parts);
      if (pcm.length < 2) throw new Error("Empty audio");
      return pcm;
    });
    return { job, cancel: tracked.cancel };
  }

  function quiet(job) {
    if (job && typeof job.catch === "function") job.catch(() => {});
  }

  /**
   * Open the first breath, then read every breath in order.
   * The next request starts while the current body is still downloading.
   * onChunk(bytes, flush) sees live bytes from the first breath and one
   * full buffer from each later breath. Return false to stop.
   */
  async function beginPhrasePump(opts) {
    const phrases = requestPhrases(opts);
    const cancels = [];
    const track = (row) => {
      cancels.push(row.cancel);
      return row;
    };
    const cancel = () => {
      for (let i = 0; i < cancels.length; i++) {
        try { cancels[i](); } catch (_) {}
      }
    };
    const first = await track(openTracked(opts, phrases[0])).job;
    return {
      sampleRate: first.opened.sampleRate,
      prepared: first.opened.prepared,
      cancel,
      async read(onChunk) {
        let next = phrases.length > 1 ? track(bufferTracked(opts, phrases[1])) : null;
        const stop = (err) => {
          try { first.detach(); } catch (_) {}
          cancel();
          quiet(next && next.job);
          if (err) throw err;
        };
        try {
          await consumePcm(first.opened, first.stall, (bytes) => {
            if (bytes && bytes.byteLength) onChunk(bytes, false);
          });
          first.detach();
          if (onChunk(null, true) === false) return stop();
          for (let i = 1; i < phrases.length; i++) {
            const pcm = await next.job;
            next = i + 1 < phrases.length ? track(bufferTracked(opts, phrases[i + 1])) : null;
            if (onChunk(pcm, true) === false) return stop();
          }
        } catch (err) {
          stop(err);
        }
      }
    };
  }

  /**
   * Read one phrase, or each breath in order, and stitch the PCM.
   * @returns {Promise<{ pcm: Uint8Array, sampleRate: number, modelId: string, fx: { speed: number, pitch: number } }>}
   */
  async function collectPcm(opts) {
    const pump = await beginPhrasePump(opts);
    const parts = [];
    try {
      await pump.read((bytes) => {
        if (bytes && bytes.byteLength) parts.push(bytes);
      });
    } catch (err) {
      pump.cancel();
      throw err;
    }
    const pcm = concatList(parts);
    if (pcm.length < 2) throw new Error("Empty audio");
    return {
      pcm,
      sampleRate: pump.sampleRate,
      modelId: pump.prepared.modelId,
      fx: pump.prepared.fx
    };
  }

  /**
   * Play one PCM stream, or each breath's stream in order, on an AudioContext.
   * Resolves when the last piece finishes playing.
   * The next request starts while the current piece is still playing.
   * onPcm receives the stitched PCM after every piece has arrived.
   * Does not time-stretch chunks. Caller stores the clip via onPcm.
   */
  async function playStream(opts) {
    const pump = await beginPhrasePump(opts);

    let ctx;
    try {
      ctx = await opts.getContext();
      if (!ctx) throw new Error("no audio context");
      if (ctx.state === "suspended") await ctx.resume();
    } catch (err) {
      pump.cancel();
      if (opts.signal && opts.signal.aborted) {
        const aborted = new Error("aborted");
        aborted.code = "aborted";
        throw aborted;
      }
      throw err;
    }

    const gainNode = ctx.createGain();
    const gainMax = opts.gainMax != null ? opts.gainMax : 10;
    gainNode.gain.value = clamp(parseFloat(opts.gain) || 1, 0.05, gainMax);
    gainNode.connect(opts.outputNode);

    let rest = new Uint8Array(0);
    let nextTime = 0;
    let started = false;
    let streamDone = false;
    let playing = 0;
    let settled = false;
    const collected = [];
    const sampleRate = pump.sampleRate;
    const firstMinBytes = Math.floor(sampleRate * 0.05) * 2;
    let resolveEnd;
    let rejectEnd;
    const endedPromise = new Promise((resolve, reject) => {
      resolveEnd = resolve;
      rejectEnd = reject;
    });

    const fail = (err) => {
      if (settled) return;
      settled = true;
      pump.cancel();
      try { gainNode.disconnect(); } catch (_) {}
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      rejectEnd(err);
    };
    const finish = () => {
      if (settled || !streamDone || playing > 0) return;
      settled = true;
      try { gainNode.disconnect(); } catch (_) {}
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      try { if (typeof opts.onEnded === "function") opts.onEnded(); } catch (_) {}
      resolveEnd();
    };
    function onAbort() {
      const aborted = new Error("aborted");
      aborted.code = "aborted";
      fail(aborted);
    }
    if (opts.signal) opts.signal.addEventListener("abort", onAbort);

    const schedule = (samples) => {
      if (!samples || !samples.length || (opts.signal && opts.signal.aborted)) return;
      const floats = new Float32Array(samples.length);
      for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;
      const buffer = ctx.createBuffer(1, floats.length, sampleRate);
      buffer.copyToChannel(floats, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gainNode);
      const now = ctx.currentTime;
      if (!started) {
        nextTime = now + 0.02;
        started = true;
        try { if (typeof opts.onStarted === "function") opts.onStarted(); } catch (_) {}
      } else if (nextTime < now + 0.005) {
        nextTime = now + 0.005;
      }
      src.start(nextTime);
      nextTime += buffer.duration;
      playing += 1;
      if (typeof opts.trackSource === "function") opts.trackSource(src);
      src.onended = () => {
        playing -= 1;
        if (typeof opts.untrackSource === "function") opts.untrackSource(src);
        try { src.disconnect(); } catch (_) {}
        finish();
      };
    };

    const drain = (incoming, flush) => {
      const taken = takePcm16(rest, incoming, started ? 2 : firstMinBytes, !!flush);
      rest = taken.rest;
      if (taken.samples) schedule(taken.samples);
    };

    try {
      await pump.read((bytes, flush) => {
        if (bytes && bytes.byteLength) {
          collected.push(bytes);
          drain(bytes, !!flush);
        } else if (flush) {
          drain(null, true);
        }
        if (flush) rest = new Uint8Array(0);
        if (flush && !started) return false;
      });
    } catch (err) {
      fail(err);
      return endedPromise;
    }

    if (!started) {
      fail(new Error("Empty audio"));
      return endedPromise;
    }

    streamDone = true;
    if (typeof opts.onPcm === "function") {
      try { opts.onPcm(concatList(collected), sampleRate, pump.prepared); } catch (_) {}
    }
    if (playing === 0) finish();
    return endedPromise;
  }

  const VOICE_PAGE_SIZE = 100;
  const VOICE_PAGE_CAP = 20;

  function mergeVoices(primary, extra) {
    const seen = new Set();
    const out = [];
    const add = (list) => {
      for (let i = 0; i < list.length; i++) {
        const voice = list[i];
        const id = voice && voice.voice_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(voice);
      }
    };
    add(primary || []);
    add(extra || []);
    return out;
  }

  /**
   * One pass of GET /v2/voices. The legacy /v1/voices list omits the current
   * default voices, which is the v4 catalog.
   */
  async function fetchVoicePages(apiKey, voiceType) {
    const voices = [];
    const seen = new Set();
    const seenTokens = new Set();
    let token = "";
    for (let page = 0; page < VOICE_PAGE_CAP; page++) {
      const params = new URLSearchParams();
      params.set("page_size", String(VOICE_PAGE_SIZE));
      params.set("include_total_count", "false");
      if (voiceType) params.set("voice_type", voiceType);
      if (token) params.set("next_page_token", token);
      const res = await fetch("https://api.elevenlabs.io/v2/voices?" + params.toString(), {
        headers: { Accept: "application/json", "xi-api-key": apiKey }
      });
      if (res.status === 401 || res.status === 403) {
        if (voices.length) return { ok: true, voices };
        return { ok: false, reason: "invalid", status: res.status };
      }
      if (!res.ok) {
        if (voices.length) return { ok: true, voices };
        return { ok: false, reason: "error", status: res.status };
      }
      const data = await res.json();
      const batch = data && Array.isArray(data.voices) ? data.voices : [];
      for (let i = 0; i < batch.length; i++) {
        const voice = batch[i];
        const id = voice && voice.voice_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        voices.push(voice);
      }
      const next = data && data.next_page_token;
      if (!data || !data.has_more || !next || seenTokens.has(next)) break;
      seenTokens.add(next);
      token = next;
    }
    return { ok: true, voices };
  }

  /**
   * Probe whether an API key can list voices, and return the account list
   * plus the current default voices.
   * @param {string} apiKey
   * @returns {Promise<{ ok: true, voices: any[] } | { ok: false, reason: string, status?: number }>}
   */
  async function validateApiKey(apiKey) {
    const key = String(apiKey || "").trim();
    if (!key) return { ok: false, reason: "empty" };
    try {
      const account = await fetchVoicePages(key, "");
      if (!account.ok) return account;
      const defaults = await fetchVoicePages(key, "default");
      if (!defaults.ok) {
        if (defaults.reason === "invalid") return defaults;
        return account;
      }
      return { ok: true, voices: mergeVoices(defaults.voices, account.voices) };
    } catch (_) {
      return { ok: false, reason: "network" };
    }
  }

  global.AacEleven = {
    normalizeModelId,
    isElevenModelId,
    phraseHasInlineTags,
    stripInlineTags,
    hasNonTagSpeechContent,
    normalizeStandingTag,
    applyStandingTag,
    taggedSends,
    PCM_STREAM_FORMAT,
    PCM_STREAM_SAMPLE_RATE,
    takePcm16,
    pcm16ToWavBlob,
    prepareSpeakRequest,
    openPcmStream,
    collectPcm,
    playStream,
    validateApiKey
  };
})(typeof window !== "undefined" ? window : globalThis);
