/**
 * Speech engine resolution and audio production: browser | piper | eleven.
 * Canonical home for app-wide model id normalization.
 */
(function (global) {
  "use strict";

  const MODEL_ALIASES = {
    browser_tts: "browser_tts",
    piper_tts: "piper_tts",
    eleven_v3: "eleven_v3",
    eleven_flash_v2_5: "eleven_flash_v2_5",
    eleven_flash_v2: "eleven_flash_v2_5",
    eleven_multilingual_v2: "eleven_flash_v2_5"
  };

  /** listMode = active voice list in the panel; engine = produce path. */
  const MODEL_UI = {
    browser_tts: { listMode: "browser", engine: "browser" },
    piper_tts: { listMode: "piper", engine: "piper" },
    eleven_v3: { listMode: "eleven", engine: "eleven" },
    eleven_flash_v2_5: { listMode: "eleven", engine: "eleven" }
  };

  function normalizeModelId(id) {
    return MODEL_ALIASES[String(id || "")] || "browser_tts";
  }

  function voiceListModeForModel(modelId) {
    const mid = normalizeModelId(modelId);
    return (MODEL_UI[mid] && MODEL_UI[mid].listMode) || "browser";
  }

  function isElevenModel(modelId) {
    return voiceListModeForModel(modelId) === "eleven";
  }

  /**
   * @param {{
   *   selectedModel: string,
   *   offline: boolean,
   *   piperVoiceId: string,
   *   elevenVoiceId: string,
   *   canUseEleven: boolean,
   *   Piper?: object
   * }} ctx
   */
  async function resolveEngine(ctx) {
    const Piper = ctx.Piper || global.AacPiper;
    const model = normalizeModelId(ctx.selectedModel);
    const offline = !!ctx.offline;

    if (model === "browser_tts") {
      return { id: "browser" };
    }

    if (model === "piper_tts") {
      if (offline && Piper && typeof Piper.isVoiceStored === "function") {
        try {
          if (!(await Piper.isVoiceStored(ctx.piperVoiceId))) {
            return { id: "browser", reason: "offline_piper_uncached" };
          }
        } catch (_) {
          return { id: "browser", reason: "offline_piper_error" };
        }
      }
      return { id: "piper", voiceId: ctx.piperVoiceId, modelId: "piper_tts" };
    }

    if (offline) {
      return { id: "browser", reason: "offline_eleven" };
    }
    if (!ctx.canUseEleven) {
      return {
        id: "eleven",
        modelId: model,
        voiceId: ctx.elevenVoiceId,
        missingConfig: true
      };
    }
    return { id: "eleven", modelId: model, voiceId: ctx.elevenVoiceId };
  }

  /**
   * Produce audio for piper or eleven. Browser TTS stays in the app shell.
   * Network for Eleven is owned by AacEleven.fetchSpeech.
   */
  async function produce(engine, payload, deps) {
    const d = deps || {};
    const Piper = d.Piper || global.AacPiper;
    const Eleven = d.Eleven || global.AacEleven;

    if (!engine || engine.id === "browser") {
      throw new Error("produce() is for piper/eleven only");
    }

    if (engine.id === "piper") {
      if (!Piper || typeof Piper.synthesize !== "function") throw new Error("AacPiper missing");
      const text = String(
        payload.text != null ? payload.text : payload.phrase || ""
      ).trim();
      if (!text) throw new Error("Empty text");
      const voiceId = payload.voiceId || engine.voiceId;
      const result = await Piper.synthesize({
        text,
        voiceId,
        speed: payload.speed,
        onDownloadProgress: payload.onDownloadProgress
      });
      const pitch = Number.isFinite(payload.pitch) ? payload.pitch : 1;
      return {
        id: "piper",
        blob: result.blob,
        modelId: "piper_tts",
        voiceId: result.voiceId || voiceId,
        fx: { speed: 1, pitch },
        downloaded: !!result.downloaded
      };
    }

    if (engine.id === "eleven") {
      if (engine.missingConfig) {
        const err = new Error("ElevenLabs not configured");
        err.code = "missing_config";
        throw err;
      }
      if (!Eleven || typeof Eleven.fetchSpeech !== "function") throw new Error("AacEleven missing");
      const voiceId = payload.voiceId || engine.voiceId;
      const { blob, prepared } = await Eleven.fetchSpeech({
        phrase: payload.phrase,
        selectedModel: payload.selectedModel || engine.modelId,
        voiceId,
        apiKey: payload.apiKey,
        speed: payload.speed,
        pitch: payload.pitch,
        timeoutMs: payload.timeoutMs
      });
      return {
        id: "eleven",
        blob,
        modelId: prepared.modelId,
        voiceId,
        fx: prepared.fx,
        downloaded: false
      };
    }

    throw new Error("Unknown engine: " + (engine && engine.id));
  }

  global.AacSpeechEngines = {
    MODEL_ALIASES,
    MODEL_UI,
    normalizeModelId,
    voiceListModeForModel,
    isElevenModel,
    resolveEngine,
    produce
  };
})(typeof window !== "undefined" ? window : globalThis);
