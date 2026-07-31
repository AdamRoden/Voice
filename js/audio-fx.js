/**
 * Pitch / speed buffer processing and playback helpers for the AAC SPA.
 * Single place for offline FX so bake and live play share one pipeline.
 */
(function (global) {
  "use strict";

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  function normalizeFx(fx) {
    if (!fx || typeof fx !== "object") return { speed: 1, pitch: 1 };
    return {
      speed: clamp(parseFloat(fx.speed) || 1, 0.25, 4),
      pitch: clamp(parseFloat(fx.pitch) || 1, 0.5, 2)
    };
  }

  function isIdentityFx(fx) {
    const n = normalizeFx(fx);
    return Math.abs(n.speed - 1) < 1e-6 && Math.abs(n.pitch - 1) < 1e-6;
  }

  function interpolateSample(data, pos) {
    if (!data || data.length === 0) return 0;
    if (pos <= 0) return data[0] || 0;
    if (pos >= data.length - 1) return data[data.length - 1] || 0;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    return data[i0] * (1 - frac) + data[i0 + 1] * frac;
  }

  function linearResampleChannel(input, newLen) {
    const target = Math.max(1, Math.round(newLen));
    if (!input || input.length === 0) return new Float32Array(target);
    if (input.length === target) {
      return input.slice ? input.slice() : new Float32Array(input);
    }
    const out = new Float32Array(target);
    if (target === 1) {
      out[0] = input[0] || 0;
      return out;
    }
    const ratio = (input.length - 1) / (target - 1);
    for (let i = 0; i < target; i++) out[i] = interpolateSample(input, i * ratio);
    return out;
  }

  function applySpeedToBuffer(ctx, audioBuffer, speed) {
    if (!audioBuffer) return audioBuffer;
    const rate = clamp(parseFloat(speed) || 1, 0.25, 4);
    if (Math.abs(rate - 1) < 1e-6) return audioBuffer;
    const targetLength = Math.max(1, Math.round(audioBuffer.length / rate));
    const out = ctx.createBuffer(audioBuffer.numberOfChannels, targetLength, audioBuffer.sampleRate);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      out.copyToChannel(linearResampleChannel(audioBuffer.getChannelData(ch), targetLength), ch);
    }
    return out;
  }

  function makeHannWindow(n) {
    const w = new Float32Array(n);
    if (n <= 1) {
      if (n === 1) w[0] = 1;
      return w;
    }
    for (let i = 0; i < n; i++) {
      w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    }
    return w;
  }

  /**
   * Waveform-similarity overlap-add time stretch (pitch-preserving).
   * Used after a resample pitch step so formants stay natural without delay-line echo.
   */
  function wsolaStretchChannel(input, stretchRatio, sampleRate) {
    if (!input || input.length < 2) {
      return input ? (input.slice ? input.slice() : new Float32Array(input)) : new Float32Array(1);
    }
    const ratio = clamp(stretchRatio, 0.25, 4);
    if (Math.abs(ratio - 1) < 1e-4) {
      return input.slice ? input.slice() : new Float32Array(input);
    }

    const sr = sampleRate > 0 ? sampleRate : 44100;
    let winSize = Math.round(sr * 0.028);
    if (winSize < 64) winSize = 64;
    if (winSize % 2) winSize += 1;
    const analysisHop = Math.max(1, Math.round(winSize * 0.25));
    const synthesisHop = Math.max(1, Math.round(analysisHop * ratio));
    const searchRadius = Math.max(0, Math.round(winSize * 0.35));
    const window = makeHannWindow(winSize);

    const outLen = Math.max(1, Math.round(input.length * ratio));
    const output = new Float32Array(outLen);
    const norm = new Float32Array(outLen);

    let inPos = 0;
    let outPos = 0;
    const writeFrame = (srcStart, dstStart) => {
      for (let i = 0; i < winSize; i++) {
        const si = srcStart + i;
        const di = dstStart + i;
        if (di < 0 || di >= outLen) continue;
        const s = (si >= 0 && si < input.length) ? input[si] : 0;
        const w = window[i];
        output[di] += s * w;
        norm[di] += w;
      }
    };

    writeFrame(0, 0);
    inPos = analysisHop;
    outPos = synthesisHop;

    while (outPos < outLen + winSize && inPos < input.length + searchRadius) {
      let bestDelta = 0;
      let bestScore = -Infinity;
      const overlap = Math.min(winSize, synthesisHop * 2);
      for (let delta = -searchRadius; delta <= searchRadius; delta++) {
        const candidate = inPos + delta;
        if (candidate < 0 || candidate + winSize > input.length + winSize) continue;
        let score = 0;
        const n = Math.min(overlap, winSize);
        for (let i = 0; i < n; i++) {
          const di = outPos + i;
          const si = candidate + i;
          if (di < 0 || di >= outLen) continue;
          const existing = norm[di] > 1e-8 ? output[di] / norm[di] : 0;
          const incoming = (si >= 0 && si < input.length) ? input[si] : 0;
          score += existing * incoming;
        }
        if (score > bestScore) {
          bestScore = score;
          bestDelta = delta;
        }
      }
      writeFrame(inPos + bestDelta, outPos);
      inPos += analysisHop;
      outPos += synthesisHop;
      if (inPos > input.length + searchRadius && outPos > outLen) break;
    }

    for (let i = 0; i < outLen; i++) {
      if (norm[i] > 1e-8) output[i] /= norm[i];
    }
    return output;
  }

  function applyWsolaToBuffer(ctx, audioBuffer, stretchRatio) {
    if (!audioBuffer) return audioBuffer;
    const ratio = clamp(stretchRatio, 0.25, 4);
    if (Math.abs(ratio - 1) < 1e-4) return audioBuffer;
    const targetLength = Math.max(1, Math.round(audioBuffer.length * ratio));
    const out = ctx.createBuffer(audioBuffer.numberOfChannels, targetLength, audioBuffer.sampleRate);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const stretched = wsolaStretchChannel(
        audioBuffer.getChannelData(ch),
        targetLength / audioBuffer.length,
        audioBuffer.sampleRate
      );
      const chData = out.getChannelData(ch);
      const n = Math.min(chData.length, stretched.length);
      chData.set(stretched.subarray(0, n));
    }
    return out;
  }

  /**
   * Independent pitch + speed:
   * 1) Resample by pitch
   * 2) Time-stretch to final duration (WSOLA when pitch changed; linear for speed-only)
   */
  function applyFxToBuffer(ctx, audioBuffer, fx) {
    if (!audioBuffer) return audioBuffer;
    const { pitch: p, speed: s } = normalizeFx(fx);
    if (Math.abs(p - 1) < 1e-6 && Math.abs(s - 1) < 1e-6) return audioBuffer;

    let buf = audioBuffer;
    if (Math.abs(p - 1) >= 1e-6) {
      const pitchedLen = Math.max(1, Math.round(audioBuffer.length / p));
      const pitched = ctx.createBuffer(audioBuffer.numberOfChannels, pitchedLen, audioBuffer.sampleRate);
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        pitched.copyToChannel(linearResampleChannel(audioBuffer.getChannelData(ch), pitchedLen), ch);
      }
      buf = pitched;
    }

    const targetLen = Math.max(1, Math.round(audioBuffer.length / s));
    if (buf.length === targetLen) return buf;
    if (Math.abs(p - 1) < 1e-6) return applySpeedToBuffer(ctx, buf, s);
    return applyWsolaToBuffer(ctx, buf, targetLen / buf.length);
  }

  /** Stored clips always use CBR MP3 at this rate (kbps). */
  const STORE_MP3_KBPS = 192;
  const MP3_BLOCK = 1152;

  function getLame() {
    const L = global.lamejs;
    if (!L || typeof L.Mp3Encoder !== "function") {
      throw new Error("lamejs Mp3Encoder not loaded");
    }
    return L;
  }

  function isMpegDataUrl(url) {
    if (!url || typeof url !== "string") return false;
    const head = url.slice(0, 32).toLowerCase();
    return head.startsWith("data:audio/mpeg") || head.startsWith("data:audio/mp3");
  }

  function isWavDataUrl(url) {
    if (!url || typeof url !== "string") return false;
    return url.slice(0, 24).toLowerCase().startsWith("data:audio/wav");
  }

  function isMpegBlob(blob) {
    if (!blob || typeof blob.type !== "string") return false;
    const t = blob.type.toLowerCase();
    return t.includes("mpeg") || t === "audio/mp3";
  }

  function floatTo16BitPCM(float32) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      let s = float32[i];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      out[i] = s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0;
    }
    return out;
  }

  /** MPEG-1 sample rates that support CBR 192 kbps in LAME. */
  function mp3EncodeSampleRate(nativeRate) {
    const sr = nativeRate || 22050;
    if (sr === 44100 || sr === 48000 || sr === 32000) return sr;
    return 44100;
  }

  /**
   * Encode AudioBuffer to CBR MP3 (default 192 kbps).
   * Low sample rates (e.g. Piper 22050) are resampled to 44.1 kHz so 192 kbps is valid.
   * @returns {Blob} type audio/mpeg
   */
  function audioBufferToMp3Blob(audioBuffer, kbps) {
    if (!audioBuffer) throw new Error("no audio buffer");
    const L = getLame();
    const rate = kbps != null ? kbps : STORE_MP3_KBPS;
    const numCh = Math.min(2, Math.max(1, audioBuffer.numberOfChannels || 1));
    const nativeRate = audioBuffer.sampleRate || 22050;
    const sampleRate = mp3EncodeSampleRate(nativeRate);

    let leftF = audioBuffer.getChannelData(0);
    let rightF = numCh > 1 ? audioBuffer.getChannelData(1) : null;
    if (sampleRate !== nativeRate) {
      const newLen = Math.max(1, Math.round(audioBuffer.length * (sampleRate / nativeRate)));
      leftF = linearResampleChannel(leftF, newLen);
      if (rightF) rightF = linearResampleChannel(rightF, newLen);
    }

    const left = floatTo16BitPCM(leftF);
    const right = rightF ? floatTo16BitPCM(rightF) : null;
    const encoder = new L.Mp3Encoder(numCh, sampleRate, rate);

    const parts = [];
    for (let i = 0; i < left.length; i += MP3_BLOCK) {
      const leftChunk = left.subarray(i, i + MP3_BLOCK);
      let mp3buf;
      if (numCh === 1) {
        mp3buf = encoder.encodeBuffer(leftChunk);
      } else {
        const rightChunk = right.subarray(i, i + MP3_BLOCK);
        mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
      }
      if (mp3buf && mp3buf.length > 0) parts.push(new Uint8Array(mp3buf));
    }
    const end = encoder.flush();
    if (end && end.length > 0) parts.push(new Uint8Array(end));
    if (!parts.length) throw new Error("mp3 encode empty");
    return new Blob(parts, { type: "audio/mpeg" });
  }

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  async function audioBufferToMp3DataUrl(audioBuffer, kbps) {
    return blobToDataUrl(audioBufferToMp3Blob(audioBuffer, kbps));
  }

  async function sourceToArrayBuffer(audioSource) {
    if (typeof audioSource === "string") {
      const res = await fetch(audioSource);
      if (!res.ok) throw new Error("fetch failed");
      return res.arrayBuffer();
    }
    if (typeof Blob !== "undefined" && audioSource instanceof Blob) {
      return audioSource.arrayBuffer();
    }
    if (audioSource instanceof ArrayBuffer) return audioSource;
    throw new Error("unsupported audio source");
  }

  /**
   * Decode + apply FX (if any) + encode stored clip as 192 kbps MP3.
   * Already-MP3 sources with identity FX pass through without re-encode.
   * Single door for storable audio (history, buttons, migration).
   * @param {Blob|string|ArrayBuffer} audioSource
   * @param {{ speed?: number, pitch?: number }} fx
   * @param {{ getContext: () => AudioContext|Promise<AudioContext> }} deps
   * @returns {Promise<{ dataUrl: string, effectsBaked: boolean }>}
   */
  async function bakeEffects(audioSource, fx, deps) {
    const nfx = normalizeFx(fx);
    const identity = isIdentityFx(nfx);
    const getContext = deps && deps.getContext;
    if (typeof getContext !== "function") throw new Error("bakeEffects requires deps.getContext");

    // Pass through MPEG only when no FX bake is needed
    if (identity) {
      if (typeof audioSource === "string" && isMpegDataUrl(audioSource)) {
        return { dataUrl: audioSource, effectsBaked: false };
      }
      if (typeof Blob !== "undefined" && audioSource instanceof Blob && isMpegBlob(audioSource)) {
        return { dataUrl: await blobToDataUrl(audioSource), effectsBaked: false };
      }
    }

    const ctx = await getContext();
    if (!ctx) throw new Error("no audio context");
    if (ctx.state === "suspended") await ctx.resume();

    const arrayBuffer = await sourceToArrayBuffer(audioSource);
    let audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (!identity) {
      audioBuffer = applyFxToBuffer(ctx, audioBuffer, nfx);
    }
    const dataUrl = await audioBufferToMp3DataUrl(audioBuffer, STORE_MP3_KBPS);
    // effectsBaked when pitch/speed are baked into the clip (format convert alone is not bake)
    return { dataUrl, effectsBaked: !identity };
  }

  /** Identity bake → 192 kbps MP3 data URL (or pass-through if already MPEG). */
  async function toMp3DataUrl(audioSource, deps) {
    const baked = await bakeEffects(audioSource, { speed: 1, pitch: 1 }, deps);
    return baked.dataUrl;
  }

  /**
   * Convert legacy data:audio/wav on history items and topic buttons to 192 kbps MP3.
   * Encodes first, then applies mutations and save callbacks (best-effort atomic per bucket).
   * @param {{
   *   getContext: () => AudioContext|null|Promise<AudioContext|null>,
   *   historyItems?: object[],
   *   topicList?: object[],
   *   onHistoryMigrated?: () => void,
   *   onTopicsMigrated?: () => void
   * }} opts
   * @returns {Promise<{ converted: number }>}
   */
  async function migrateStoredWavAudio(opts) {
    const o = opts || {};
    if (typeof o.getContext !== "function") return { converted: 0 };
    const ctx = await o.getContext();
    if (!ctx) return { converted: 0 };

    const deps = { getContext: o.getContext };
    const jobs = [];
    const history = Array.isArray(o.historyItems) ? o.historyItems : [];
    for (const item of history) {
      if (item && isWavDataUrl(item.audioData)) {
        jobs.push({ target: item, source: item.audioData, bucket: "history" });
      }
    }
    const topics = Array.isArray(o.topicList) ? o.topicList : [];
    for (const topic of topics) {
      const buttons = topic && topic.buttons;
      if (!Array.isArray(buttons)) continue;
      for (const btn of buttons) {
        if (btn && isWavDataUrl(btn.audioData)) {
          jobs.push({ target: btn, source: btn.audioData, bucket: "topics" });
        }
      }
    }
    if (!jobs.length) return { converted: 0 };

    const ready = [];
    for (const job of jobs) {
      try {
        const dataUrl = await toMp3DataUrl(job.source, deps);
        ready.push({ target: job.target, dataUrl, bucket: job.bucket });
      } catch (_) {}
    }
    if (!ready.length) return { converted: 0 };

    let historyChanged = false;
    let topicsChanged = false;
    for (const row of ready) {
      row.target.audioData = row.dataUrl;
      if (row.bucket === "history") historyChanged = true;
      else topicsChanged = true;
    }
    if (historyChanged && typeof o.onHistoryMigrated === "function") o.onHistoryMigrated();
    if (topicsChanged && typeof o.onTopicsMigrated === "function") o.onTopicsMigrated();
    return { converted: ready.length };
  }

  /** Idle schedule for migrateStoredWavAudio (keeps app shell thin). */
  function scheduleMigrateStoredWavAudio(opts, delayMs) {
    const ms = delayMs != null ? delayMs : 800;
    setTimeout(() => {
      migrateStoredWavAudio(opts).catch(() => {});
    }, ms);
  }

  /**
   * Play a URL through Web Audio with gain; apply FX once if provided (non-identity).
   * @param {object} opts
   * @param {string} opts.url
   * @param {number} opts.gain
   * @param {{ speed?: number, pitch?: number }|null} [opts.fx] null/identity = already baked
   * @param {() => AudioContext|null} opts.getContext
   * @param {() => void} [opts.stopPrevious]
   * @param {(source: AudioBufferSourceNode) => void} [opts.trackSource]
   * @param {(source: AudioBufferSourceNode) => void} [opts.untrackSource]
   * @param {(el: HTMLAudioElement) => Promise<void>} [opts.applySink]
   * @param {() => void} [opts.onStarted]
   * @param {() => void} [opts.onEnded]
   * @param {number} [opts.gainMax]
   * @param {HTMLAudioElement} [opts.fallbackElement] optional element for HTML path
   */
  async function playUrl(opts) {
    const url = opts.url || "";
    const gainMax = opts.gainMax != null ? opts.gainMax : 10;
    const safeGain = clamp(parseFloat(opts.gain) || 1, 0.05, gainMax);
    const fx = opts.fx != null ? normalizeFx(opts.fx) : { speed: 1, pitch: 1 };
    const needFx = !isIdentityFx(fx);
    const onEnded = typeof opts.onEnded === "function" ? opts.onEnded : null;
    const onStarted = typeof opts.onStarted === "function" ? opts.onStarted : null;

    let endedFired = false;
    const fireEnded = () => {
      if (endedFired) return;
      endedFired = true;
      if (onEnded) {
        try { onEnded(); } catch (_) {}
      }
    };

    const playHtmlFallback = async () => {
      const audioElement = opts.fallbackElement || (url ? new Audio(url) : null);
      if (!audioElement) {
        fireEnded();
        return;
      }
      try {
        if (typeof opts.stopPrevious === "function") opts.stopPrevious();
        audioElement.volume = 1;
        try {
          const preserve = !needFx || Math.abs(fx.pitch - 1) < 1e-3;
          audioElement.preservesPitch = preserve;
          audioElement.mozPreservesPitch = preserve;
          audioElement.webkitPreservesPitch = preserve;
        } catch (_) {}
        // Best-effort HTML path only (no clean independent pitch)
        audioElement.playbackRate = needFx
          ? clamp(fx.speed * (Math.abs(fx.pitch - 1) < 1e-3 ? 1 : fx.pitch), 0.25, 4)
          : 1;
        if (!audioElement.src && url) audioElement.src = url;
        audioElement.onended = fireEnded;
        audioElement.onerror = fireEnded;
        if (typeof opts.applySink === "function") await opts.applySink(audioElement);
        await audioElement.play();
        try { if (onStarted) onStarted(); } catch (_) {}
      } catch (_) {
        fireEnded();
      }
    };

    const ctx = typeof opts.getContext === "function" ? opts.getContext() : null;
    if (!ctx || !url) {
      await playHtmlFallback();
      return;
    }

    try {
      if (ctx.state === "suspended") await ctx.resume();
      if (typeof opts.stopPrevious === "function") opts.stopPrevious();

      const response = await fetch(url);
      if (!response.ok) throw new Error("fetch failed");
      const arrayBuffer = await response.arrayBuffer();
      let audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      if (needFx) audioBuffer = applyFxToBuffer(ctx, audioBuffer, fx);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = 1;

      const gainNode = ctx.createGain();
      gainNode.gain.value = safeGain;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.onended = () => {
        if (typeof opts.untrackSource === "function") opts.untrackSource(source);
        try { source.disconnect(); } catch (_) {}
        try { gainNode.disconnect(); } catch (_) {}
        fireEnded();
      };
      if (typeof opts.trackSource === "function") opts.trackSource(source);
      source.start(0);
      try { if (onStarted) onStarted(); } catch (_) {}
    } catch (_) {
      await playHtmlFallback();
    }
  }

  global.AacAudioFx = {
    STORE_MP3_KBPS,
    normalizeFx,
    isIdentityFx,
    applyFxToBuffer,
    audioBufferToMp3Blob,
    audioBufferToMp3DataUrl,
    isMpegDataUrl,
    isWavDataUrl,
    toMp3DataUrl,
    bakeEffects,
    migrateStoredWavAudio,
    scheduleMigrateStoredWavAudio,
    playUrl,
    blobToDataUrl
  };
})(typeof window !== "undefined" ? window : globalThis);
