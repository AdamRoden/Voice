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
   *   lsSet?: (k: string, v: string) => void,
   *   lsDel?: (k: string) => void,
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
   *   onSpeakClick?: () => void,
   *   getSpeakIdleChrome?: () => { label: string, title: string }
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

    const OUTPUT_DEVICE_KEY = "aac_output_device";
    const OUTPUT_DEVICE_LABEL_KEY = "aac_output_device_label";

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
    const lsSet = typeof d.lsSet === "function"
      ? d.lsSet
      : (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
    const lsDel = typeof d.lsDel === "function"
      ? d.lsDel
      : (k) => { try { localStorage.removeItem(k); } catch (_) {} };

    let activeOutputDeviceId = lsGet(OUTPUT_DEVICE_KEY, "") || "";
    let activeOutputDeviceLabel = lsGet(OUTPUT_DEVICE_LABEL_KEY, "") || "";

    let activeBufferSources = [];
    let activeHtmlAudio = null;
    let speakUiState = "idle";
    let speakGeneration = 0;
    /** Invalidates in-flight enumerateDevices so a newer selection wins. */
    let outputDeviceRefreshGen = 0;

    function canSelectOutputDevice() {
      const mediaOk = typeof HTMLMediaElement !== "undefined"
        && typeof HTMLMediaElement.prototype.setSinkId === "function";
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctxOk = !!(Ctx && typeof Ctx.prototype.setSinkId === "function");
      return !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices && (mediaOk || ctxOk));
    }

    function persistOutputDevice(deviceId, label) {
      activeOutputDeviceId = deviceId || "";
      activeOutputDeviceLabel = activeOutputDeviceId ? (label || activeOutputDeviceLabel || "") : "";
      if (activeOutputDeviceId) {
        lsSet(OUTPUT_DEVICE_KEY, activeOutputDeviceId);
        if (activeOutputDeviceLabel) lsSet(OUTPUT_DEVICE_LABEL_KEY, activeOutputDeviceLabel);
        else lsDel(OUTPUT_DEVICE_LABEL_KEY);
      } else {
        lsDel(OUTPUT_DEVICE_KEY);
        lsDel(OUTPUT_DEVICE_LABEL_KEY);
      }
    }

    function updateOutputDeviceHint(kind, outputCount) {
      const hint = document.getElementById("output-device-hint");
      if (!hint) return;
      if (!canSelectOutputDevice()) {
        hint.textContent = "Output device selection is not supported in this browser.";
        return;
      }
      if (kind === "unavailable") {
        hint.textContent = "Saved speaker is offline or not listed yet. Preference kept; using system default until it returns.";
        return;
      }
      if (kind === "list-error") {
        hint.textContent = activeOutputDeviceId
          ? "Could not list speakers. Saved preference kept."
          : "Could not list speakers. Check browser permissions.";
        return;
      }
      if (!outputCount) {
        hint.textContent = "No speakers found. Connect a device or use system default.";
        return;
      }
      hint.textContent = "Applies to Piper, ElevenLabs, and sound-button playback. Browser TTS uses the system default speaker.";
    }

    /**
     * Match preferred sink: deviceId first, then label (adopt new id when ids rotate).
     * @returns {{ id: string, label: string, matched: boolean, persist: boolean }}
     */
    function resolvePreferredOutput(outputs) {
      const preferredId = activeOutputDeviceId || "";
      const preferredLabel = (activeOutputDeviceLabel || "").trim().toLowerCase();
      if (!preferredId && !preferredLabel) {
        return { id: "", label: "", matched: true, persist: false };
      }
      if (preferredId) {
        const byId = outputs.find((dev) => dev.deviceId === preferredId);
        if (byId) {
          const label = byId.label || activeOutputDeviceLabel || "";
          return {
            id: byId.deviceId,
            label,
            matched: true,
            persist: !!(label && label !== activeOutputDeviceLabel)
          };
        }
      }
      if (preferredLabel) {
        const byLabel = outputs.find((dev) =>
          (dev.label || "").trim().toLowerCase() === preferredLabel
        );
        if (byLabel && byLabel.deviceId) {
          return {
            id: byLabel.deviceId,
            label: byLabel.label || activeOutputDeviceLabel || "",
            matched: true,
            persist: byLabel.deviceId !== preferredId
              || (byLabel.label && byLabel.label !== activeOutputDeviceLabel)
          };
        }
      }
      return {
        id: preferredId,
        label: activeOutputDeviceLabel || "",
        matched: false,
        persist: false
      };
    }

    function appendUnavailableOption(select) {
      if (!select || !activeOutputDeviceId) return;
      const opt = document.createElement("option");
      opt.value = activeOutputDeviceId;
      opt.textContent = `${activeOutputDeviceLabel || "Saved speaker"} (unavailable)`;
      select.appendChild(opt);
      select.value = activeOutputDeviceId;
    }

    function fillOutputSelect(select, outputs) {
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
    }

    async function refreshOutputDevices() {
      const select = document.getElementById("output-device-select");
      if (!select) return;
      const gen = ++outputDeviceRefreshGen;

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function") {
        select.innerHTML = `<option value="">Not supported</option>`;
        select.disabled = true;
        updateOutputDeviceHint("unsupported", 0);
        return;
      }

      if (!canSelectOutputDevice()) {
        select.disabled = true;
        updateOutputDeviceHint("unsupported", 0);
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (gen !== outputDeviceRefreshGen) return;

        const outputs = devices.filter((dev) => dev.kind === "audiooutput" && dev.deviceId);
        const resolved = resolvePreferredOutput(outputs);
        if (resolved.persist) persistOutputDevice(resolved.id, resolved.label);

        fillOutputSelect(select, outputs);
        if (!resolved.matched && activeOutputDeviceId) {
          appendUnavailableOption(select);
          updateOutputDeviceHint("unavailable", outputs.length);
        } else {
          select.value = resolved.matched ? (resolved.id || "") : "";
          updateOutputDeviceHint("ok", outputs.length);
        }
        select.disabled = false;
        if (resolved.matched && resolved.id) {
          applyOutputDeviceToAudioGraph(resolved.id).catch(() => {});
        }
      } catch (_) {
        if (gen !== outputDeviceRefreshGen) return;
        select.innerHTML = `<option value="">System default</option>`;
        appendUnavailableOption(select);
        select.disabled = false;
        updateOutputDeviceHint("list-error", 0);
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
      const id = deviceId || "";
      let label = "";
      if (id) {
        const select = document.getElementById("output-device-select");
        const opt = select && [...select.options].find((o) => o.value === id);
        if (opt) {
          label = (opt.textContent || "")
            .replace(/\s*\(unavailable\)\s*$/i, "")
            .trim();
        }
        if (!label) label = activeOutputDeviceLabel || "";
      }
      outputDeviceRefreshGen += 1;
      persistOutputDevice(id, label);
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

    function speakIdleChrome() {
      if (typeof d.getSpeakIdleChrome === "function") {
        const chrome = d.getSpeakIdleChrome();
        if (chrome && chrome.label) return chrome;
      }
      return {
        label: "Speak",
        title: "Speak text (or selection). Enter or click again while speaking to stop."
      };
    }

    function setSpeakBtnIdle() {
      speakUiState = "idle";
      if (!speakBtn) return;
      const chrome = speakIdleChrome();
      speakBtn.classList.remove("speaking");
      speakBtn.innerHTML = '<span class="material-symbols-outlined icon-medium">volume_up</span>';
      speakBtn.disabled = false;
      speakBtn.setAttribute("aria-label", chrome.label);
      speakBtn.title = chrome.title;
    }

    /** Re-paint idle speak labels when host replay availability changes. */
    function syncSpeakBtnChrome() {
      if (speakUiState !== "idle") return;
      setSpeakBtnIdle();
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
        // Store as MP3 even if FX bake timed out / failed
        try {
          saveDataUrl = await AudioFx.toMp3DataUrl(blob, { getContext: ensureAudioCtx });
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

      let engine = await SpeechEngines.resolveEngine({
        selectedModel,
        offline,
        piperVoiceId,
        elevenVoiceId,
        hasElevenApiKey,
        Piper,
        Eleven
      });

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
        return;
      } else if (engine.id === "eleven" && engine.missingConfig) {
        const msg = "Please configure your API key and select a voice in Settings.";
        d.announceLive(msg);
        if (alertOnError) alert(msg);
        return;
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
            const out = await SpeechEngines.produce(engine, {
              phrase,
              text: Eleven.stripInlineTags(phrase) || phrase,
              voiceId: engine.voiceId || (engine.id === "piper" ? piperVoiceId : elevenVoiceId),
              selectedModel: engine.modelId || selectedModel,
              apiKey,
              speed,
              pitch
            }, { Piper, Eleven });
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
      syncSpeakBtnChrome,
      isSpeakBusy: () => speakUiState === "speaking" || speakUiState === "loading"
    };
  }

  global.AacSpeechPlayback = { create };
})(typeof window !== "undefined" ? window : globalThis);
