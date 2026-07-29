/**
 * ElevenLabs request policy: model ids, API speed split, bracket-tag text prep.
 */
(function (global) {
  "use strict";

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const ELEVEN_API_SPEED_MIN = 0.7;
  const ELEVEN_API_SPEED_MAX = 1.2;

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

  /**
   * Fetch TTS audio from ElevenLabs.
   * @param {{
   *   phrase: string,
   *   selectedModel: string,
   *   voiceId: string,
   *   apiKey: string,
   *   speed: number,
   *   pitch: number,
   *   timeoutMs?: number
   * }} opts
   * @returns {Promise<{ blob: Blob, prepared: object }>}
   */
  async function fetchSpeech(opts) {
    const prepared = prepareSpeakRequest({
      phrase: opts.phrase,
      selectedModel: opts.selectedModel,
      speed: opts.speed,
      pitch: opts.pitch
    });
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const fetchTimeout = setTimeout(() => {
      try { controller?.abort(); } catch (_) {}
    }, opts.timeoutMs != null ? opts.timeoutMs : 25000);
    let res;
    try {
      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${opts.voiceId}`, {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": opts.apiKey
        },
        body: JSON.stringify(prepared.body),
        signal: controller ? controller.signal : undefined
      });
    } finally {
      clearTimeout(fetchTimeout);
    }
    if (!res.ok) {
      const err = new Error("ElevenLabs API error (" + res.status + ")");
      err.status = res.status;
      if (res.status === 401 || res.status === 403) err.code = "eleven_auth";
      throw err;
    }
    const blob = await res.blob();
    if (!blob || blob.size < 16) throw new Error("Empty audio");
    return { blob, prepared };
  }

  /**
   * Probe whether an API key can list voices (auth check).
   * @param {string} apiKey
   * @returns {Promise<{ ok: true, voices: any[] } | { ok: false, reason: string, status?: number }>}
   */
  async function validateApiKey(apiKey) {
    const key = String(apiKey || "").trim();
    if (!key) return { ok: false, reason: "empty" };
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { Accept: "application/json", "xi-api-key": key }
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: "invalid", status: res.status };
      }
      if (!res.ok) {
        return { ok: false, reason: "error", status: res.status };
      }
      const data = await res.json();
      return { ok: true, voices: data.voices || [] };
    } catch (_) {
      return { ok: false, reason: "network" };
    }
  }

  global.AacEleven = {
    ELEVEN_API_SPEED_MIN,
    ELEVEN_API_SPEED_MAX,
    normalizeModelId,
    isElevenModelId,
    phraseHasInlineTags,
    stripInlineTags,
    hasNonTagSpeechContent,
    splitSpeed,
    prepareSpeakRequest,
    fetchSpeech,
    validateApiKey
  };
})(typeof window !== "undefined" ? window : globalThis);
