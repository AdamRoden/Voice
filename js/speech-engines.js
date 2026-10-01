/**
 * Speech engine resolution and audio production: browser | piper | eleven.
 * Canonical home for app-wide model id normalization.
 */
(function (global) {
  "use strict";

  /** Only ElevenLabs model this app calls. Older ids migrate here. */
  const ELEVEN_MODEL_ID = "eleven_v4_turbo";

  const MODEL_ALIASES = {
    browser_tts: "browser_tts",
    piper_tts: "piper_tts",
    eleven_v4_turbo: ELEVEN_MODEL_ID,
    eleven_v4: ELEVEN_MODEL_ID,
    eleven_v3: ELEVEN_MODEL_ID,
    eleven_flash_v2_5: ELEVEN_MODEL_ID,
    eleven_flash_v2: ELEVEN_MODEL_ID,
    eleven_multilingual_v2: ELEVEN_MODEL_ID,
    eleven_turbo_v2_5: ELEVEN_MODEL_ID,
    eleven_turbo_v2: ELEVEN_MODEL_ID
  };

  /** listMode = active voice list in the panel; engine = produce path. */
  const MODEL_UI = {
    browser_tts: { listMode: "browser", engine: "browser" },
    piper_tts: { listMode: "piper", engine: "piper" },
    eleven_v4_turbo: { listMode: "eleven", engine: "eleven" }
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
   *   hasElevenApiKey?: boolean,
   *   Piper?: object
   * }} ctx
   */
  async function resolveEngine(ctx) {
    const Piper = ctx.Piper || global.AacPiper;
    const model = normalizeModelId(ctx.selectedModel);
    const offline = !!ctx.offline;
    const hasKey = !!ctx.hasElevenApiKey;
    const hasVoice = !!(ctx.elevenVoiceId);

    if (model === "browser_tts") {
      return { id: "browser" };
    }

    if (model === "piper_tts") {
      if (Piper && typeof Piper.isSupported === "function" && !Piper.isSupported()) {
        return { id: "browser", reason: "piper_unsupported" };
      }
      if (Piper && typeof Piper.isVoiceStored === "function") {
        try {
          if (!(await Piper.isVoiceStored(ctx.piperVoiceId))) {
            if (offline) {
              return { id: "browser", reason: "offline_piper_uncached" };
            }
            // Online but model not fully downloaded — do not auto-download on speak.
            return {
              id: "piper",
              voiceId: ctx.piperVoiceId,
              modelId: "piper_tts",
              missingDownload: true,
              reason: "piper_not_downloaded"
            };
          }
        } catch (_) {
          if (offline) {
            return { id: "browser", reason: "offline_piper_error" };
          }
          return {
            id: "piper",
            voiceId: ctx.piperVoiceId,
            modelId: "piper_tts",
            missingDownload: true,
            reason: "piper_not_downloaded"
          };
        }
      }
      return { id: "piper", voiceId: ctx.piperVoiceId, modelId: "piper_tts" };
    }

    if (offline) {
      return { id: "browser", reason: "offline_eleven" };
    }
    if (!hasKey) {
      return {
        id: "eleven",
        modelId: model,
        voiceId: ctx.elevenVoiceId,
        missingConfig: true,
        reason: "eleven_no_key"
      };
    }
    if (!hasVoice) {
      return {
        id: "eleven",
        modelId: model,
        voiceId: ctx.elevenVoiceId,
        missingConfig: true,
        reason: "eleven_no_voice"
      };
    }
    return { id: "eleven", modelId: model, voiceId: ctx.elevenVoiceId };
  }

  /**
   * Produce Piper audio. ElevenLabs is streamed by AacEleven.playStream.
   * Browser TTS stays in the app shell.
   */
  async function produce(engine, payload, deps) {
    const Piper = (deps && deps.Piper) || global.AacPiper;

    if (!engine || engine.id !== "piper") {
      throw new Error("produce() is for Piper only");
    }
    if (engine.missingDownload) {
      const err = new Error("Piper voice not downloaded");
      err.code = "piper_not_downloaded";
      throw err;
    }
    if (!Piper || typeof Piper.synthesize !== "function") throw new Error("AacPiper missing");
    const text = String(
      payload.text != null ? payload.text : payload.phrase || ""
    ).trim();
    if (!text) throw new Error("Empty text");
    const voiceId = payload.voiceId || engine.voiceId;
    // Synthesize uses cache only — never starts a model download.
    const result = await Piper.synthesize({
      text,
      voiceId,
      speed: payload.speed
    });
    const pitch = Number.isFinite(payload.pitch) ? payload.pitch : 1;
    return {
      id: "piper",
      blob: result.blob,
      modelId: "piper_tts",
      voiceId: result.voiceId || voiceId,
      fx: { speed: 1, pitch },
      downloaded: false
    };
  }

  global.AacSpeechEngines = {
    ELEVEN_MODEL_ID,
    MODEL_ALIASES,
    MODEL_UI,
    normalizeModelId,
    voiceListModeForModel,
    isElevenModel,
    resolveEngine,
    produce
  };
})(typeof window !== "undefined" ? window : globalThis);
