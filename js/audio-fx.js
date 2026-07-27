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

  function audioBufferToWavDataUrl(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numFrames = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let ch = 0; ch < numChannels; ch++) channels.push(audioBuffer.getChannelData(ch));
    let offset = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let s = channels[ch][i];
        s = Math.max(-1, Math.min(1, s));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }

    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  }

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  /**
   * Decode + apply FX once + encode WAV.
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

    let arrayBuffer;
    if (typeof audioSource === "string") {
      if (identity) return { dataUrl: audioSource, effectsBaked: false };
      const res = await fetch(audioSource);
      if (!res.ok) throw new Error("fetch failed");
      arrayBuffer = await res.arrayBuffer();
    } else if (typeof Blob !== "undefined" && audioSource instanceof Blob) {
      if (identity) return { dataUrl: await blobToDataUrl(audioSource), effectsBaked: false };
      arrayBuffer = await audioSource.arrayBuffer();
    } else if (audioSource instanceof ArrayBuffer) {
      arrayBuffer = audioSource;
    } else {
      throw new Error("unsupported audio source");
    }

    const ctx = await getContext();
    if (!ctx) throw new Error("no audio context");
    if (ctx.state === "suspended") await ctx.resume();

    let audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (!identity) {
      audioBuffer = applyFxToBuffer(ctx, audioBuffer, nfx);
    }
    // effectsBaked true when the clip is ready to play with identity FX
    return { dataUrl: audioBufferToWavDataUrl(audioBuffer), effectsBaked: true };
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
    normalizeFx,
    isIdentityFx,
    applyFxToBuffer,
    audioBufferToWavDataUrl,
    bakeEffects,
    playUrl,
    blobToDataUrl
  };
})(typeof window !== "undefined" ? window : globalThis);
