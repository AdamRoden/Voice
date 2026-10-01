/**
 * ElevenLabs: v4 Turbo only, streamed as 24 kHz PCM.
 * Bracket tags are kept. Speed and pitch are not sent to the API.
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

  function elevenModelId() {
    const id = global.AacSpeechEngines && global.AacSpeechEngines.ELEVEN_MODEL_ID;
    if (!id) throw new Error("AacSpeechEngines required");
    return id;
  }

  /**
   * Always eleven_v4_turbo. Bracket tags stay in the text.
   * fx is for the stored clip; the live stream is unprocessed PCM.
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

  /**
   * Play the PCM stream on an AudioContext. Resolves when playback ends.
   * Does not time-stretch chunks. Caller bakes fx into the stored clip via onPcm.
   */
  async function playStream(opts) {
    const STALL_MS = 20000;
    let timedOut = false;
    let stallTimer = null;
    const armStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        timedOut = true;
        try { if (typeof opts.abort === "function") opts.abort(); } catch (_) {}
      }, STALL_MS);
    };
    const timeoutError = () => {
      const err = new Error("ElevenLabs timed out");
      err.code = "timeout";
      return err;
    };
    const abortError = (err) => {
      const out = err instanceof Error ? err : new Error("aborted");
      out.code = "aborted";
      return out;
    };
    const mapError = (err) => (timedOut ? timeoutError() : (
      (opts.signal && opts.signal.aborted) || (err && (err.name === "AbortError" || err.code === "aborted"))
        ? abortError(err)
        : err
    ));

    armStall();
    let opened;
    try {
      opened = await openPcmStream(opts);
    } catch (err) {
      if (stallTimer) clearTimeout(stallTimer);
      throw mapError(err);
    }

    let ctx;
    try {
      ctx = await opts.getContext();
      if (!ctx) throw new Error("no audio context");
      if (ctx.state === "suspended") await ctx.resume();
    } catch (err) {
      if (stallTimer) clearTimeout(stallTimer);
      const mapped = mapError(err);
      try { if (typeof opts.abort === "function") opts.abort(); } catch (_) {}
      throw mapped;
    }

    const gainNode = ctx.createGain();
    const gainMax = opts.gainMax != null ? opts.gainMax : 10;
    gainNode.gain.value = clamp(parseFloat(opts.gain) || 1, 0.05, gainMax);
    gainNode.connect(ctx.destination);

    let rest = new Uint8Array(0);
    let nextTime = 0;
    let started = false;
    let streamDone = false;
    let playing = 0;
    let settled = false;
    const collected = [];
    const sampleRate = opened.sampleRate;
    const firstMinBytes = Math.floor(sampleRate * 0.05) * 2;
    let resolveEnd;
    let rejectEnd;
    const endedPromise = new Promise((resolve, reject) => {
      resolveEnd = resolve;
      rejectEnd = reject;
    });

    const stopStall = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = null;
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      stopStall();
      try { gainNode.disconnect(); } catch (_) {}
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      rejectEnd(err);
    };
    const finish = () => {
      if (settled || !streamDone || playing > 0) return;
      settled = true;
      stopStall();
      try { gainNode.disconnect(); } catch (_) {}
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
      try { if (typeof opts.onEnded === "function") opts.onEnded(); } catch (_) {}
      resolveEnd();
    };
    function onAbort() {
      fail(mapError(new Error("aborted")));
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
      while (!(opts.signal && opts.signal.aborted)) {
        const bytes = await opened.read();
        if (opts.signal && opts.signal.aborted) break;
        if (bytes === null) {
          drain(null, true);
          streamDone = true;
          stopStall();
          break;
        }
        armStall();
        if (bytes.byteLength) {
          collected.push(bytes);
          drain(bytes, false);
        }
      }
    } catch (err) {
      fail(mapError(err));
      return endedPromise;
    }

    if (opts.signal && opts.signal.aborted) {
      fail(mapError(new Error("aborted")));
      return endedPromise;
    }
    if (!started) {
      fail(new Error("Empty audio"));
      return endedPromise;
    }
    if (typeof opts.onPcm === "function") {
      try { opts.onPcm(concatList(collected), sampleRate, opened.prepared); } catch (_) {}
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
    PCM_STREAM_FORMAT,
    PCM_STREAM_SAMPLE_RATE,
    takePcm16,
    pcm16ToWavBlob,
    prepareSpeakRequest,
    openPcmStream,
    playStream,
    validateApiKey
  };
})(typeof window !== "undefined" ? window : globalThis);
