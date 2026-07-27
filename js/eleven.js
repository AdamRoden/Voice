/**
 * ElevenLabs request policy: model ids, API speed split, bracket-tag text prep.
 */
(function (global) {
  "use strict";

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const ELEVEN_API_SPEED_MIN = 0.7;
  const ELEVEN_API_SPEED_MAX = 1.2;

  /** Canonical model ids + legacy aliases. */
  const MODEL_ALIASES = {
    browser_tts: "browser_tts",
    eleven_v3: "eleven_v3",
    eleven_flash_v2_5: "eleven_flash_v2_5",
    eleven_flash_v2: "eleven_flash_v2_5",
    eleven_multilingual_v2: "eleven_flash_v2_5"
  };

  function normalizeModelId(id) {
    const raw = String(id || "");
    return MODEL_ALIASES[raw] || "browser_tts";
  }

  /** True if text contains Eleven-style [tag] directives. */
  function phraseHasInlineTags(text) {
    return /\[[^\]]*\]/.test(String(text || ""));
  }

  /**
   * Replace [bracket] segments with a space, collapse whitespace, trim.
   * Used for non-v3 paths and for "has speech body" checks.
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
   * Split desired speed into API portion (0.7–1.2) + local remainder.
   * v3 does not support API speed — all speed is local.
   */
  function splitSpeed(desiredSpeed, modelId) {
    const desired = clamp(parseFloat(desiredSpeed) || 1, 0.25, 4);
    const model = normalizeModelId(modelId);
    if (model === "eleven_v3") {
      return { apiSpeed: null, localSpeed: desired };
    }
    const apiSpeed = clamp(desired, ELEVEN_API_SPEED_MIN, ELEVEN_API_SPEED_MAX);
    return { apiSpeed, localSpeed: desired / apiSpeed };
  }

  /**
   * Build TTS request pieces for a phrase.
   * Tags force v3; non-v3 text has brackets stripped via stripInlineTags.
   *
   * @param {{ phrase: string, selectedModel: string, speed: number, pitch: number }} input
   * @returns {{
   *   modelId: string,
   *   text: string,
   *   body: object,
   *   localSpeed: number,
   *   pitch: number,
   *   fx: { speed: number, pitch: number }
   * }}
   */
  function prepareSpeakRequest(input) {
    const phrase = String(input.phrase || "");
    const speed = clamp(parseFloat(input.speed) || 1, 0.25, 4);
    const pitch = clamp(parseFloat(input.pitch) || 1, 0.5, 2);
    const hasTags = phraseHasInlineTags(phrase);
    const selected = normalizeModelId(input.selectedModel);
    const modelId = hasTags ? "eleven_v3" : selected;
    const text = modelId === "eleven_v3" ? phrase : stripInlineTags(phrase);
    const { apiSpeed, localSpeed } = splitSpeed(speed, modelId);

    const body = {
      text,
      model_id: modelId
    };
    if (apiSpeed != null) {
      body.voice_settings = { speed: apiSpeed };
    }

    return {
      modelId,
      text,
      body,
      localSpeed,
      pitch,
      fx: { speed: localSpeed, pitch }
    };
  }

  global.AacEleven = {
    ELEVEN_API_SPEED_MIN,
    ELEVEN_API_SPEED_MAX,
    MODEL_ALIASES,
    normalizeModelId,
    phraseHasInlineTags,
    stripInlineTags,
    hasNonTagSpeechContent,
    splitSpeed,
    prepareSpeakRequest
  };
})(typeof window !== "undefined" ? window : globalThis);
