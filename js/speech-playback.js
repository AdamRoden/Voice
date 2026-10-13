/**
 * Speech playback: bake/play and speakPhrase (browser | piper | eleven).
 * Speaker choice lives in AacOutputDevice.
 */
(function (global) {
  "use strict";

  /**
   * @param {{
   *   AudioFx: object,
   *   Eleven: object,
   *   Piper: object,
   *   SpeechEngines: object,
   *   Output: { apply: Function, openContext: Function, applyElement: Function, watch: Function },
   *   speakBtn?: HTMLElement|null,
   *   modelSelect?: HTMLSelectElement|null,
   *   volumeGainMax: number,
   *   getVolumeGain: () => number,
   *   getSpeechSpeed: () => number,
   *   getSpeechPitch: () => number,
   *   getSpeechFx: () => { speed: number, pitch: number },
   *   modelId: (id: string) => string,
   *   lsGet: (k: string, fb?: any) => any,
   *   trim: (v: any) => string,
   *   withTimeout: (p: Promise<any>, ms: number, label?: string) => Promise<any>,
   *   blobToDataUrl: (blob: Blob) => Promise<string>,
   *   getSpeakText: () => string,
   *   getVoiceSelection: () => {
   *     piperVoiceId: string,
   *     elevenVoiceId: string,
   *     browserVoiceIndex: number|string
   *   },
   *   addToHistory: (text: string, model: string, voiceId: string, dataUrl: string|null, extra?: object) => void,
   *   isUtteranceSource: (src: any) => boolean,
   *   getUtteranceText: (src: any) => string,
   *   focusDisplayInput: () => void,
   *   announceLive: (msg: string) => void,
   *   onAfterSpeakLearn?: (text: string) => void,
   *   onElevenUnavailable?: (opts?: {
   *     clearKey?: boolean,
   *     loadError?: boolean,
   *     silent?: boolean,
   *     message?: string
   *   }) => void,
   *   onSpeakClick?: () => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    const AudioFx = d.AudioFx;
    const Eleven = d.Eleven;
    const Piper = d.Piper;
    const SpeechEngines = d.SpeechEngines;
    const Output = d.Output;
    const speakBtn = d.speakBtn;
    const modelSelect = d.modelSelect;
    const VOLUME_GAIN_MAX = d.volumeGainMax;

    if (!AudioFx || !Eleven || !Piper || !SpeechEngines || !Output
      || typeof Output.apply !== "function"
      || typeof Output.openContext !== "function") {
      throw new Error("AacSpeechPlayback requires AudioFx, Eleven, Piper, SpeechEngines, and Output");
    }

    const lsGet = typeof d.lsGet === "function"
      ? d.lsGet
      : (k, fb = null) => {
        try {
          const v = localStorage.getItem(k);
          return v == null ? fb : v;
        } catch (_) {
          return fb;
        }
      };

    let activeBufferSources = [];
    let activeObjectUrls = [];
    let activeHtmlAudio = null;
    /** Aborts the in-flight ElevenLabs PCM stream. */
    let activeStreamAbort = null;
    let speakUiState = "idle";
    let speakGeneration = 0;

    function getSharedAudioContext() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!window.sharedAudioContext || window.sharedAudioContext.state === "closed") {
        try {
          window.sharedAudioContext = Output.openContext(Ctx);
        } catch (_) {
          return null;
        }
      }
      return window.sharedAudioContext;
    }

    function stopActiveHtmlAudio() {
      if (!activeHtmlAudio) return;
      try {
        activeHtmlAudio.onended = null;
        activeHtmlAudio.onerror = null;
        activeHtmlAudio.pause();
        activeHtmlAudio.removeAttribute("src");
        activeHtmlAudio.load();
      } catch (_) {}
      activeHtmlAudio = null;
      Output.watch(null);
    }

    function trackObjectUrl(url) {
      if (url) activeObjectUrls.push(url);
    }

    function revokeActiveObjectUrls() {
      const urls = activeObjectUrls;
      activeObjectUrls = [];
      urls.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) {}
      });
    }

    function stopActiveBufferSources() {
      const abort = activeStreamAbort;
      activeStreamAbort = null;
      try { if (abort) abort(); } catch (_) {}
      activeBufferSources.forEach((source) => {
        try { source.onended = null; } catch (_) {}
        try { source.stop(0); } catch (_) {}
        try { source.disconnect(); } catch (_) {}
      });
      activeBufferSources = [];
      stopActiveHtmlAudio();
    }

    /** Bump the speak generation and stop every in-flight voice. */
    function claimSpeakTurn() {
      speakGeneration += 1;
      try { window.speechSynthesis.cancel(); } catch (_) {}
      stopActiveBufferSources();
      revokeActiveObjectUrls();
      if (typeof d.stopPiperPreview === "function") {
        try { d.stopPiperPreview(); } catch (_) {}
      }
      return speakGeneration;
    }

    function haltSpeechForNewSound() {
      const generation = claimSpeakTurn();
      setSpeakBtnIdle();
      return generation;
    }

    /** True when local speed or pitch would change the spoken clip. */
    function fxChangesSound(speed, pitch) {
      return !AudioFx.isIdentityFx(AudioFx.normalizeFx({ speed, pitch }));
    }

    /**
     * Run one ElevenLabs request on the active abort slot.
     * Returns null when this turn was aborted. Other errors propagate.
     */
    async function withElevenAbort(run) {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const abort = () => { try { controller?.abort(); } catch (_) {} };
      activeStreamAbort = abort;
      try {
        return await run(controller ? controller.signal : undefined, abort);
      } catch (err) {
        if (err && (err.code === "aborted" || err.name === "AbortError")) return null;
        throw err;
      } finally {
        if (activeStreamAbort === abort) activeStreamAbort = null;
      }
    }

    /** Full ElevenLabs clip. Null when the turn was aborted. */
    function produceElevenClip(req) {
      return withElevenAbort((signal, abort) => SpeechEngines.produce(
        { id: "eleven", voiceId: req.voiceId },
        {
          phrase: req.phrase,
          voiceId: req.voiceId,
          apiKey: req.apiKey,
          speed: req.speed,
          pitch: req.pitch,
          signal,
          abort
        },
        { Eleven }
      ));
    }

    function playAudioData(audioData, opts) {
      const o = opts || {};
      haltSpeechForNewSound();
      if (audioData) {
        const fx = o.fx != null ? o.fx : null;
        playAudioWithGain(new Audio(audioData), d.getVolumeGain(), {
          fx,
          onEnded: typeof o.onEnded === "function" ? o.onEnded : null
        });
      }
      d.focusDisplayInput();
    }

    function playSpeechSource(src) {
      if (!src) {
        d.focusDisplayInput();
        return;
      }
      const utt = d.trim(src.utteranceText)
        || (d.isUtteranceSource(src) ? d.getUtteranceText(src) : "");
      if (utt) {
        speakPhrase(utt, { recordHistory: false, showLoading: false, alertOnError: false });
        return;
      }
      if (src.audioData) {
        playAudioData(src.audioData, {
          fx: src.effectsBaked ? null : d.getSpeechFx()
        });
        return;
      }
      const phrase = d.trim(src.sourceText || src.text || src.label);
      if (phrase) {
        speakPhrase(phrase, { recordHistory: false, showLoading: false, alertOnError: false });
        return;
      }
      d.focusDisplayInput();
    }

    async function ensureAudioCtx() {
      const ctx = getSharedAudioContext();
      if (!ctx) throw new Error("no audio context");
      if (ctx.state === "suspended") await ctx.resume();
      await Output.apply();
      return ctx;
    }

    async function bakeEffectsIntoAudioData(audioSource, fx) {
      const nfx = AudioFx.normalizeFx(fx != null ? fx : d.getSpeechFx());
      return AudioFx.bakeEffects(audioSource, nfx, { getContext: ensureAudioCtx });
    }

    async function playAudioWithGain(audioElement, gainValue, opts) {
      const o = opts || {};
      await Output.apply();
      if (!AudioFx) {
        try {
          audioElement.volume = 1;
          await Output.applyElement(audioElement);
          await audioElement.play();
          return true;
        } catch (_) {
          return false;
        }
      }
      const onEndedEl = typeof audioElement.onended === "function"
        ? audioElement.onended.bind(audioElement)
        : null;
      const onEnded = typeof o.onEnded === "function" ? o.onEnded : onEndedEl;
      const onStarted = typeof o.onStarted === "function" ? o.onStarted : null;
      const fx = o.fx != null ? AudioFx.normalizeFx(o.fx) : { speed: 1, pitch: 1 };

      return AudioFx.playUrl({
        url: audioElement?.src || "",
        gain: gainValue,
        gainMax: VOLUME_GAIN_MAX,
        fx,
        getContext: getSharedAudioContext,
        stopPrevious: stopActiveBufferSources,
        trackSource: (source) => { activeBufferSources.push(source); },
        untrackSource: (source) => {
          activeBufferSources = activeBufferSources.filter((s) => s !== source);
        },
        applySink: async (el) => {
          activeHtmlAudio = el;
          Output.watch(el);
          await Output.applyElement(el);
        },
        fallbackElement: audioElement,
        onStarted,
        onEnded: () => {
          if (activeHtmlAudio === audioElement) {
            activeHtmlAudio = null;
            Output.watch(null);
          }
          if (onEnded) {
            try { onEnded(); } catch (_) {}
          }
        }
      });
    }

    async function runEleven(req, hooks) {
      const h = hooks || {};
      await withElevenAbort(async (signal, abort) => {
        await ensureAudioCtx();
        await Eleven.playStream({
          phrase: req.phrase,
          voiceId: req.voiceId,
          apiKey: req.apiKey,
          speed: req.speed,
          pitch: req.pitch,
          signal,
          abort,
          getContext: getSharedAudioContext,
          gain: h.gain,
          gainMax: VOLUME_GAIN_MAX,
          trackSource: (src) => { activeBufferSources.push(src); },
          untrackSource: (src) => {
            activeBufferSources = activeBufferSources.filter((s) => s !== src);
          },
          onStarted: h.onStarted,
          onEnded: h.onEnded,
          onPcm: h.onPcm
        });
      });
    }

    async function playElevenPreview(req) {
      const myGen = haltSpeechForNewSound();
      const still = () => myGen === speakGeneration;
      if (!fxChangesSound(req && req.speed, req && req.pitch)) {
        return runEleven(req, { gain: d.getVolumeGain() });
      }
      const out = await produceElevenClip(req);
      if (!out) {
        if (still()) setSpeakBtnIdle();
        return;
      }
      if (!still()) return;
      await playBakedClip(out.blob, out.fx, {
        stillCurrent: still,
        gain: d.getVolumeGain()
      });
    }

    function setSpeakBtnIdle() {
      speakUiState = "idle";
      if (!speakBtn) return;
      speakBtn.classList.remove("speaking");
      speakBtn.innerHTML = '<span class="material-symbols-outlined icon-medium">volume_up</span>';
      speakBtn.disabled = false;
      speakBtn.setAttribute("aria-label", "Speak");
      speakBtn.title = "Speak text (or selection). Enter or click again while speaking to stop.";
    }

    function setSpeakBtnLoading() {
      speakUiState = "loading";
      if (!speakBtn) return;
      speakBtn.classList.remove("speaking");
      speakBtn.innerHTML = '<span class="material-symbols-outlined icon-medium">hourglass_empty</span>';
      speakBtn.disabled = false;
      speakBtn.setAttribute("aria-label", "Stop speaking");
      speakBtn.title = "Generating speech… click to stop";
      d.announceLive("Generating speech");
    }

    function setSpeakBtnSpeaking() {
      speakUiState = "speaking";
      if (!speakBtn) return;
      speakBtn.classList.add("speaking");
      speakBtn.innerHTML = '<span class="material-symbols-outlined icon-medium">stop_circle</span>';
      speakBtn.disabled = false;
      speakBtn.setAttribute("aria-label", "Stop speaking");
      speakBtn.title = "Speaking… click to stop";
      d.announceLive("Speaking");
    }

    function stopAllSpeech() {
      haltSpeechForNewSound();
      d.announceLive("Speech stopped");
    }

    /**
     * Bake fx into the clip, then play. A failed bake plays through playUrl,
     * which converts the whole buffer before source.start.
     * @returns {Promise<{ played: boolean, dataUrl: string|null, effectsBaked: boolean }>}
     */
    async function playBakedClip(blob, fx, opts) {
      const o = opts || {};
      const still = typeof o.stillCurrent === "function" ? o.stillCurrent : (() => true);
      if (!blob || blob.size < 16) throw new Error("Empty audio");
      let playSrc;
      let saveDataUrl = null;
      let effectsBaked = false;
      const objectUrl = URL.createObjectURL(blob);
      trackObjectUrl(objectUrl);
      let playFx = fx;
      try {
        const baked = await d.withTimeout(
          bakeEffectsIntoAudioData(blob, fx),
          8000,
          "bake timeout"
        );
        if (!still()) {
          try { URL.revokeObjectURL(objectUrl); } catch (_) {}
          return { played: false, dataUrl: null, effectsBaked: false };
        }
        saveDataUrl = baked.dataUrl;
        effectsBaked = !!baked.effectsBaked;
        playSrc = saveDataUrl || objectUrl;
        if (effectsBaked) playFx = null;
      } catch (_) {
        playSrc = objectUrl;
        effectsBaked = false;
        playFx = fx;
        // Store as MP3 even if FX bake timed out / failed
        try {
          saveDataUrl = await AudioFx.toMp3DataUrl(blob, { getContext: ensureAudioCtx });
        } catch (__) {
          saveDataUrl = null;
        }
      }

      const audio = new Audio(playSrc);
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        if (typeof o.onEnded === "function") {
          try { o.onEnded(); } catch (_) {}
        }
      };

      audio.onended = cleanup;
      const started = await playAudioWithGain(audio, o.gain, {
        fx: playFx,
        onStarted: o.onStarted
      });
      if (!still()) {
        try { audio.pause(); } catch (_) {}
        cleanup();
        return { played: false, dataUrl: saveDataUrl, effectsBaked };
      }
      if (!started || cleaned) {
        cleanup();
        return { played: false, dataUrl: saveDataUrl, effectsBaked };
      }
      return { played: true, dataUrl: saveDataUrl, effectsBaked };
    }

    async function playGeneratedBlob(blob, modelId, voiceId, fx, ctx) {
      const {
        stillCurrent,
        finishUi,
        gainSetting,
        phrase,
        recordHistory,
        setPlaybackStarted
      } = ctx;
      const result = await playBakedClip(blob, fx, {
        stillCurrent,
        gain: gainSetting,
        onStarted: () => {
          setPlaybackStarted();
          if (stillCurrent()) setSpeakBtnSpeaking();
        },
        onEnded: () => {
          if (stillCurrent()) {
            finishUi();
            d.announceLive("Speech finished");
          }
          d.focusDisplayInput();
        }
      });
      if (!result.played || !stillCurrent()) return;
      setPlaybackStarted();
      if (stillCurrent()) setSpeakBtnSpeaking();
      d.focusDisplayInput();
      if (recordHistory && result.dataUrl) {
        d.addToHistory(phrase, modelId, voiceId, result.dataUrl, {
          effectsBaked: result.effectsBaked
        });
      }
    }

    function notifyElevenUnavailable(opts) {
      if (typeof d.onElevenUnavailable === "function") {
        try { d.onElevenUnavailable(opts || {}); } catch (_) {}
      }
    }

    function speakWithBrowser(phrase, ctx) {
      const {
        stillCurrent, finishUi, gainSetting, speed, pitch,
        browserVoiceIndex, recordHistory, setPlaybackStarted
      } = ctx;
      const browserText = Eleven.stripInlineTags(phrase) || phrase;
      const utterance = new SpeechSynthesisUtterance(browserText);
      utterance.volume = gainSetting;
      utterance.rate = speed;
      utterance.pitch = pitch;
      const voices = window.speechSynthesis.getVoices();
      const voiceIdx = (browserVoiceIndex !== "" && voices[browserVoiceIndex])
        ? browserVoiceIndex
        : 0;
      utterance.voice = voices[voiceIdx] || null;
      utterance.onend = () => {
        if (!stillCurrent()) return;
        finishUi();
        d.announceLive("Speech finished");
        if (recordHistory) d.addToHistory(phrase, "browser_tts", `voice_${voiceIdx}`, null);
        d.focusDisplayInput();
      };
      utterance.onerror = () => {
        if (!stillCurrent()) return;
        finishUi();
      };
      window.speechSynthesis.speak(utterance);
      setPlaybackStarted();
      if (stillCurrent()) setSpeakBtnSpeaking();
      d.focusDisplayInput();
    }

    async function speakPhrase(text, opts) {
      const o = opts || {};
      const recordHistory = o.recordHistory !== false;
      const showLoading = !!o.showLoading;
      const alertOnError = !!o.alertOnError;
      const phrase = d.trim(text);
      if (!phrase) return;

      const gainSetting = d.getVolumeGain();
      const speed = d.getSpeechSpeed();
      const pitch = d.getSpeechPitch();
      const hasTags = Eleven.phraseHasInlineTags(phrase);
      const hasSpeechBody = Eleven.hasNonTagSpeechContent(phrase);
      const apiKey = lsGet("elevenlabs_key", "");
      const sel = d.getVoiceSelection() || {};
      const piperVoiceId = sel.piperVoiceId;
      const elevenVoiceId = sel.elevenVoiceId;
      const browserVoiceIndex = sel.browserVoiceIndex;
      const hasElevenApiKey = !!(apiKey && String(apiKey).trim());
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const selectedModel = d.modelId(modelSelect?.value);

      const myGen = claimSpeakTurn();
      const stillCurrent = () => myGen === speakGeneration;
      if (showLoading) setSpeakBtnLoading();
      else setSpeakBtnIdle();
      const finishUi = () => {
        if (!stillCurrent()) return;
        setSpeakBtnIdle();
      };

      let engine;
      try {
        engine = await SpeechEngines.resolveEngine({
          selectedModel,
          offline,
          piperVoiceId,
          elevenVoiceId,
          hasElevenApiKey,
          Piper,
          Eleven
        });
      } catch (_) {
        if (alertOnError && stillCurrent()) alert("Failed to generate speech.");
        finishUi();
        return;
      }
      if (!stillCurrent()) return;

      if (engine.reason === "offline_piper_uncached") {
        d.announceLive("Offline — Piper voice not cached; using browser voice");
      } else if (engine.reason === "offline_eleven" || engine.reason === "offline_piper_error") {
        d.announceLive("Offline — using browser voice");
      } else if (engine.reason === "piper_unsupported") {
        d.announceLive("Piper is not available in this browser; using browser voice");
      } else if (engine.missingDownload || engine.reason === "piper_not_downloaded") {
        const msg = "Download this Piper voice in Settings before speaking.";
        d.announceLive(msg);
        if (alertOnError) alert(msg);
        finishUi();
        return;
      }

      // Missing key → fall back and continue this speak with browser.
      if (engine.id === "eleven" && engine.missingConfig && engine.reason === "eleven_no_key") {
        notifyElevenUnavailable({
          clearKey: false,
          loadError: false,
          silent: true
        });
        const msg = "ElevenLabs API key is missing. Using browser voice.";
        d.announceLive(msg);
        engine = { id: "browser", reason: "eleven_fallback_no_key" };
      } else if (engine.id === "eleven" && engine.missingConfig && engine.reason === "eleven_no_voice") {
        const msg = "Select an ElevenLabs voice in Settings before speaking.";
        d.announceLive(msg);
        if (alertOnError) alert(msg);
        finishUi();
        return;
      } else if (engine.id === "eleven" && engine.missingConfig) {
        const msg = "Please configure your API key and select a voice in Settings.";
        d.announceLive(msg);
        if (alertOnError) alert(msg);
        finishUi();
        return;
      }

      if (engine.id !== "browser" && !hasSpeechBody) {
        if (alertOnError) {
          alert(hasTags
            ? "Add some words to speak. Tags alone cannot be sent to this voice model."
            : "Type something to speak first.");
        }
        finishUi();
        return;
      }

      let playbackStarted = false;
      const setPlaybackStarted = () => { playbackStarted = true; };
      const playCtx = {
        stillCurrent,
        finishUi,
        gainSetting,
        phrase,
        recordHistory,
        setPlaybackStarted
      };
      const browserCtx = {
        stillCurrent,
        finishUi,
        gainSetting,
        speed,
        pitch,
        browserVoiceIndex,
        recordHistory,
        setPlaybackStarted
      };

      try {
        if (engine.id === "browser") {
          speakWithBrowser(phrase, browserCtx);
          return;
        }

        if (engine.id === "piper" || engine.id === "eleven") {
          if (engine.missingDownload) {
            const msg = "Download this Piper voice in Settings before speaking.";
            d.announceLive(msg);
            if (alertOnError) alert(msg);
            finishUi();
            d.focusDisplayInput();
            return;
          }
          try {
            if (engine.id === "eleven" && !fxChangesSound(speed, pitch)) {
              await runEleven({
                phrase,
                voiceId: engine.voiceId || elevenVoiceId,
                apiKey,
                speed,
                pitch
              }, {
                gain: gainSetting,
                onStarted: () => {
                  setPlaybackStarted();
                  if (stillCurrent()) setSpeakBtnSpeaking();
                  d.focusDisplayInput();
                },
                onEnded: () => {
                  if (!stillCurrent()) return;
                  finishUi();
                  d.announceLive("Speech finished");
                  d.focusDisplayInput();
                },
                onPcm: (pcm, sampleRate, prepared) => {
                  if (!recordHistory || !stillCurrent() || !pcm || pcm.length < 2) return;
                  const wav = Eleven.pcm16ToWavBlob(pcm, sampleRate);
                  bakeEffectsIntoAudioData(wav, prepared.fx).then((baked) => {
                    if (!stillCurrent() || !baked || !baked.dataUrl) return;
                    d.addToHistory(phrase, prepared.modelId, engine.voiceId || elevenVoiceId, baked.dataUrl, {
                      effectsBaked: !!baked.effectsBaked
                    });
                  }).catch(() => {});
                }
              });
              return;
            }
            const voiceId = engine.id === "eleven"
              ? (engine.voiceId || elevenVoiceId)
              : (engine.voiceId || piperVoiceId);
            const out = engine.id === "eleven"
              ? await produceElevenClip({ phrase, voiceId, apiKey, speed, pitch })
              : await SpeechEngines.produce(engine, {
                phrase,
                text: Eleven.stripInlineTags(phrase) || phrase,
                voiceId,
                speed,
                pitch
              }, { Piper });
            if (!out) {
              if (stillCurrent()) finishUi();
              return;
            }
            if (!stillCurrent()) return;
            await playGeneratedBlob(out.blob, out.modelId, out.voiceId, out.fx, playCtx);
          } catch (err) {
            if (err && err.code === "piper_not_downloaded") {
              const msg = "Download this Piper voice in Settings before speaking.";
              d.announceLive(msg);
              if (alertOnError) alert(msg);
              finishUi();
              d.focusDisplayInput();
              return;
            }
            if (err && err.code === "eleven_auth") {
              notifyElevenUnavailable({
                clearKey: true,
                loadError: true,
                silent: true
              });
              const msg = "ElevenLabs API key is invalid. Using browser voice.";
              d.announceLive(msg);
              if (!stillCurrent()) return;
              speakWithBrowser(phrase, browserCtx);
              return;
            }
            throw err;
          }
          return;
        }
      } catch (_) {
        if (alertOnError && !playbackStarted && stillCurrent()) alert("Failed to generate speech.");
        finishUi();
        d.focusDisplayInput();
      }
    }

    /** Generate speech for the current speak text. Stops if already speaking/loading. */
    async function speakText() {
      if (speakUiState === "speaking" || speakUiState === "loading") {
        stopAllSpeech();
        return;
      }
      // Resume inside the tap so iOS will play the streamed chunks.
      try { ensureAudioCtx(); } catch (_) {}
      const text = d.getSpeakText();
      if (!d.trim(text)) {
        d.announceLive("Nothing to speak");
        d.focusDisplayInput();
        return;
      }
      if (typeof d.onAfterSpeakLearn === "function") {
        try { d.onAfterSpeakLearn(text); } catch (_) {}
      }
      await speakPhrase(text, { recordHistory: true, showLoading: true, alertOnError: true });
    }

    function bind() {
      speakBtn?.addEventListener("click", () => {
        if (typeof d.onSpeakClick === "function") d.onSpeakClick();
        else speakText();
      });
    }

    return {
      bind,
      speakPhrase,
      speakText,
      stopAllSpeech,
      playSpeechSource,
      playAudioData,
      bakeEffectsIntoAudioData,
      playAudioWithGain,
      playElevenPreview,
      getSharedAudioContext,
      isSpeakBusy: () => speakUiState === "speaking" || speakUiState === "loading"
    };
  }

  global.AacSpeechPlayback = { create };
})(typeof window !== "undefined" ? window : globalThis);
