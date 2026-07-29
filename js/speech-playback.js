/**
 * Speech playback: output device, bake/play, speakPhrase (browser | piper | eleven).
 */
(function (global) {
  "use strict";

  /**
   * @param {{
   *   AudioFx: object,
   *   Eleven: object,
   *   Piper: object,
   *   SpeechEngines: object,
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
   *   onAfterSpeakLearn?: (text: string) => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    const AudioFx = d.AudioFx;
    const Eleven = d.Eleven;
    const Piper = d.Piper;
    const SpeechEngines = d.SpeechEngines;
    const speakBtn = d.speakBtn;
    const modelSelect = d.modelSelect;
    const VOLUME_GAIN_MAX = d.volumeGainMax;

    if (!AudioFx || !Eleven || !Piper || !SpeechEngines) {
      throw new Error("AacSpeechPlayback requires AudioFx, Eleven, Piper, SpeechEngines");
    }

    let activeOutputDeviceId = "";
    try {
      activeOutputDeviceId = d.lsGet("aac_output_device", "") || "";
    } catch (_) {
      activeOutputDeviceId = "";
    }

    let activeBufferSources = [];
    let activeHtmlAudio = null;
    let speakUiState = "idle";
    let speakGeneration = 0;

    const piperProgress = Piper.createProgressController({
      getExpectedBytes: () => {
        const sel = d.getVoiceSelection();
        return Piper.getVoiceSizeBytes(sel && sel.piperVoiceId);
      },
      formatBytes: Piper.formatBytes.bind(Piper),
      announce: d.announceLive
    });
    piperProgress.hide();

    function canSelectOutputDevice() {
      const mediaOk = typeof HTMLMediaElement !== "undefined"
        && typeof HTMLMediaElement.prototype.setSinkId === "function";
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctxOk = !!(Ctx && typeof Ctx.prototype.setSinkId === "function");
      return !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices && (mediaOk || ctxOk));
    }

    function updateOutputDeviceHint(outputCount) {
      const hint = document.getElementById("output-device-hint");
      if (!hint) return;
      if (!canSelectOutputDevice()) {
        hint.textContent = "Output device selection is not supported in this browser.";
        return;
      }
      if (outputCount === 0) {
        hint.textContent = "No speakers found. Connect a device or use system default.";
        return;
      }
      hint.textContent = "Applies to Piper, ElevenLabs, and sound-button playback. Browser TTS uses the system default speaker.";
    }

    async function refreshOutputDevices() {
      const select = document.getElementById("output-device-select");
      if (!select) return;

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function") {
        select.innerHTML = `<option value="">Not supported</option>`;
        select.disabled = true;
        updateOutputDeviceHint(0);
        const hint = document.getElementById("output-device-hint");
        if (hint) hint.textContent = "Output device selection is not supported in this browser.";
        return;
      }

      if (!canSelectOutputDevice()) {
        select.disabled = true;
        updateOutputDeviceHint(0);
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter((dev) => dev.kind === "audiooutput");
        const previous = activeOutputDeviceId;

        select.innerHTML = "";
        const defOpt = document.createElement("option");
        defOpt.value = "";
        defOpt.textContent = "System default";
        select.appendChild(defOpt);

        outputs.forEach((device, index) => {
          const opt = document.createElement("option");
          opt.value = device.deviceId;
          opt.textContent = device.label || `Speaker ${index + 1}`;
          select.appendChild(opt);
        });

        const stillThere = previous && [...select.options].some((o) => o.value === previous);
        if (stillThere) {
          select.value = previous;
        } else {
          select.value = "";
          if (previous) {
            activeOutputDeviceId = "";
            try { localStorage.removeItem("aac_output_device"); } catch (_) {}
            applyOutputDeviceToAudioGraph("").catch(() => {});
          }
        }
        select.disabled = false;
        updateOutputDeviceHint(outputs.length);
      } catch (_) {
        select.innerHTML = `<option value="">System default</option>`;
        select.disabled = false;
        updateOutputDeviceHint(0);
        const hint = document.getElementById("output-device-hint");
        if (hint) hint.textContent = "Could not list speakers. Check browser permissions.";
      }
    }

    async function applyOutputDeviceToAudioGraph(deviceId) {
      const id = deviceId || "";
      const ctx = window.sharedAudioContext;
      if (ctx && typeof ctx.setSinkId === "function") {
        try {
          await ctx.setSinkId(id);
        } catch (_) {}
      }
    }

    async function applySinkToMediaElement(el) {
      if (!el || typeof el.setSinkId !== "function") return;
      try {
        await el.setSinkId(activeOutputDeviceId || "");
      } catch (_) {}
    }

    async function setActiveOutputDevice(deviceId) {
      activeOutputDeviceId = deviceId || "";
      try {
        if (activeOutputDeviceId) localStorage.setItem("aac_output_device", activeOutputDeviceId);
        else localStorage.removeItem("aac_output_device");
      } catch (_) {}
      await applyOutputDeviceToAudioGraph(activeOutputDeviceId);
    }

    function getSharedAudioContext() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!window.sharedAudioContext) {
        window.sharedAudioContext = new Ctx();
        if (typeof window.sharedAudioContext.setSinkId === "function" && activeOutputDeviceId) {
          window.sharedAudioContext.setSinkId(activeOutputDeviceId).catch(() => {});
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
    }

    function stopActiveBufferSources() {
      activeBufferSources.forEach((source) => {
        try { source.onended = null; } catch (_) {}
        try { source.stop(0); } catch (_) {}
        try { source.disconnect(); } catch (_) {}
      });
      activeBufferSources = [];
      stopActiveHtmlAudio();
    }

    function playAudioData(audioData, opts) {
      const o = opts || {};
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
      d.focusDisplayInput();
    }

    async function ensureAudioCtx() {
      const ctx = getSharedAudioContext();
      if (!ctx) throw new Error("no audio context");
      if (ctx.state === "suspended") await ctx.resume();
      return ctx;
    }

    async function bakeEffectsIntoAudioData(audioSource, fx) {
      const nfx = AudioFx.normalizeFx(fx != null ? fx : d.getSpeechFx());
      return AudioFx.bakeEffects(audioSource, nfx, { getContext: ensureAudioCtx });
    }

    async function playAudioWithGain(audioElement, gainValue, opts) {
      const o = opts || {};
      if (!AudioFx) {
        try {
          audioElement.volume = 1;
          await audioElement.play();
        } catch (_) {}
        return;
      }
      const onEndedEl = typeof audioElement.onended === "function"
        ? audioElement.onended.bind(audioElement)
        : null;
      const onEnded = typeof o.onEnded === "function" ? o.onEnded : onEndedEl;
      const onStarted = typeof o.onStarted === "function" ? o.onStarted : null;
      const fx = o.fx != null ? AudioFx.normalizeFx(o.fx) : { speed: 1, pitch: 1 };

      await AudioFx.playUrl({
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
          await applySinkToMediaElement(el);
        },
        fallbackElement: audioElement,
        onStarted,
        onEnded: () => {
          if (activeHtmlAudio === audioElement) activeHtmlAudio = null;
          if (onEnded) {
            try { onEnded(); } catch (_) {}
          }
        }
      });
    }

    async function playPreviewBlob(blob, fx) {
      if (!blob || blob.size < 16) throw new Error("Empty audio");
      let objectUrl = URL.createObjectURL(blob);
      let playUrl = objectUrl;
      let playFx = fx;
      try {
        try {
          const baked = await bakeEffectsIntoAudioData(blob, fx);
          if (baked.dataUrl) {
            playUrl = baked.dataUrl;
            if (baked.effectsBaked) playFx = null;
          }
        } catch (_) {}
        const audio = new Audio(playUrl);
        await new Promise((resolve, reject) => {
          let settled = false;
          const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            if (objectUrl) {
              try { URL.revokeObjectURL(objectUrl); } catch (_) {}
              objectUrl = null;
            }
            fn(value);
          };
          audio.onerror = () => finish(reject, new Error("preview play failed"));
          playAudioWithGain(audio, d.getVolumeGain(), {
            fx: playFx,
            onEnded: () => finish(resolve)
          }).catch((err) => finish(reject, err));
        });
      } catch (err) {
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        }
        throw err;
      }
    }

    function setSpeakBtnIdle() {
      speakUiState = "idle";
      if (!speakBtn) return;
      speakBtn.classList.remove("speaking");
      speakBtn.innerHTML = '<span class="material-symbols-outlined icon-medium">volume_up</span>';
      speakBtn.disabled = false;
      speakBtn.setAttribute("aria-label", "Speak");
      speakBtn.title = "Speak text (or selection). Click again while speaking to stop.";
    }

    function setSpeakBtnLoading() {
      speakUiState = "loading";
      if (!speakBtn) return;
      speakBtn.classList.remove("speaking");
      speakBtn.innerHTML = '<span class="material-symbols-outlined icon-medium">hourglass_empty</span>';
      speakBtn.disabled = true;
      speakBtn.setAttribute("aria-label", "Generating speech");
      speakBtn.title = "Generating speech…";
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
      speakGeneration += 1;
      try { window.speechSynthesis.cancel(); } catch (_) {}
      stopActiveBufferSources();
      stopActiveHtmlAudio();
      setSpeakBtnIdle();
      d.announceLive("Speech stopped");
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
      if (!blob || blob.size < 16) throw new Error("Empty audio");
      let playUrl;
      let saveDataUrl = null;
      let effectsBaked = false;
      const objectUrl = URL.createObjectURL(blob);
      let playFx = fx;
      try {
        const baked = await d.withTimeout(
          bakeEffectsIntoAudioData(blob, fx),
          8000,
          "bake timeout"
        );
        if (!stillCurrent()) {
          try { URL.revokeObjectURL(objectUrl); } catch (_) {}
          return;
        }
        saveDataUrl = baked.dataUrl;
        effectsBaked = !!baked.effectsBaked;
        playUrl = saveDataUrl || objectUrl;
        if (effectsBaked) playFx = null;
      } catch (_) {
        playUrl = objectUrl;
        effectsBaked = false;
        playFx = fx;
        try {
          saveDataUrl = await d.blobToDataUrl(blob);
        } catch (__) {
          saveDataUrl = null;
        }
      }

      const audio = new Audio(playUrl);
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        if (stillCurrent()) {
          finishUi();
          d.announceLive("Speech finished");
        }
        d.focusDisplayInput();
      };

      audio.onended = cleanup;
      await playAudioWithGain(audio, gainSetting, {
        fx: playFx,
        onStarted: () => {
          setPlaybackStarted();
          if (stillCurrent()) setSpeakBtnSpeaking();
        }
      });
      if (!stillCurrent()) {
        try { audio.pause(); } catch (_) {}
        cleanup();
        return;
      }
      setPlaybackStarted();
      if (stillCurrent()) setSpeakBtnSpeaking();
      d.focusDisplayInput();

      if (recordHistory && saveDataUrl) {
        d.addToHistory(phrase, modelId, voiceId, saveDataUrl, { effectsBaked });
      }
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
      const apiKey = d.lsGet("elevenlabs_key", "");
      const sel = d.getVoiceSelection() || {};
      const piperVoiceId = sel.piperVoiceId;
      const elevenVoiceId = sel.elevenVoiceId;
      const browserVoiceIndex = sel.browserVoiceIndex;
      const canUseEleven = !!(apiKey && elevenVoiceId);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const selectedModel = d.modelId(modelSelect?.value);

      const engine = await SpeechEngines.resolveEngine({
        selectedModel,
        offline,
        piperVoiceId,
        elevenVoiceId,
        canUseEleven,
        Piper,
        Eleven
      });

      if (engine.reason === "offline_piper_uncached") {
        d.announceLive("Offline — Piper voice not cached; using browser voice");
      } else if (engine.reason === "offline_eleven" || engine.reason === "offline_piper_error") {
        d.announceLive("Offline — using browser voice");
      }

      if (engine.id !== "browser" && !hasSpeechBody) {
        if (alertOnError) {
          alert(hasTags
            ? "Add some words to speak. Tags alone cannot be sent to this voice model."
            : "Type something to speak first.");
        }
        return;
      }

      try { window.speechSynthesis.cancel(); } catch (_) {}
      stopActiveBufferSources();

      const myGen = ++speakGeneration;
      const stillCurrent = () => myGen === speakGeneration;

      if (showLoading) setSpeakBtnLoading();
      else setSpeakBtnIdle();

      const finishUi = () => {
        if (!stillCurrent()) return;
        setSpeakBtnIdle();
      };
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

      try {
        if (engine.id === "browser") {
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
          playbackStarted = true;
          if (stillCurrent()) setSpeakBtnSpeaking();
          d.focusDisplayInput();
          return;
        }

        if (engine.id === "piper" || engine.id === "eleven") {
          if (engine.missingConfig) {
            if (alertOnError) alert("Please configure your API Key and select a voice in Settings.");
            finishUi();
            d.focusDisplayInput();
            return;
          }
          const dl = engine.id === "piper" ? piperProgress.beginSession() : null;
          try {
            const out = await SpeechEngines.produce(engine, {
              phrase,
              text: Eleven.stripInlineTags(phrase) || phrase,
              voiceId: engine.voiceId || (engine.id === "piper" ? piperVoiceId : elevenVoiceId),
              selectedModel: engine.modelId || selectedModel,
              apiKey,
              speed,
              pitch,
              onDownloadProgress: dl ? dl.onDownloadProgress : undefined
            }, { Piper, Eleven });
            if (!stillCurrent()) return;
            await playGeneratedBlob(out.blob, out.modelId, out.voiceId, out.fx, playCtx);
          } finally {
            if (dl) dl.finish();
          }
          return;
        }
      } catch (_) {
        if (alertOnError && !playbackStarted && stillCurrent()) alert("Failed to generate speech.");
        finishUi();
        d.focusDisplayInput();
      }
    }

    async function speakText() {
      if (speakUiState === "speaking" || speakUiState === "loading") {
        stopAllSpeech();
        return;
      }
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
      speakBtn?.addEventListener("click", speakText);
    }

    function getSpeakUiState() {
      return speakUiState;
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
      playPreviewBlob,
      refreshOutputDevices,
      setActiveOutputDevice,
      getSharedAudioContext,
      canSelectOutputDevice,
      getSpeakUiState,
      isSpeakBusy: () => speakUiState === "speaking" || speakUiState === "loading"
    };
  }

  global.AacSpeechPlayback = { create };
})(typeof window !== "undefined" ? window : globalThis);
