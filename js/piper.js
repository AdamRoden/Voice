/**
 * Piper TTS (local neural speech) — browser ONNX + phonemizer WASM.
 * Models cached via Cache API (+ session memory) after first Hugging Face download.
 * Short sample previews use rhasspy/piper-voices speaker_0.mp3 (~100 KB).
 */
(function (global) {
  "use strict";

  const HF_BASE = "https://huggingface.co/diffusionstudio/piper-voices/resolve/main";
  /** Official samples (small MP3s) — not the full ONNX model. */
  const SAMPLE_HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
  const ONNX_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
  const ORT_SCRIPT = ONNX_BASE + "ort.min.js";
  const PIPER_WASM_BASE =
    "https://cdn.jsdelivr.net/gh/diffusionstudio/piper-wasm@main/build/piper_phonemize";
  const PIPER_SCRIPT = PIPER_WASM_BASE + ".js";
  /** Only medium-quality voices are offered in the UI. */
  const OFFERED_QUALITY = "medium";

  /**
   * Built-in English medium voices (used offline / before voices.json loads).
   * Paths follow: {family}/{locale}/{name}/medium/{key}.onnx
   */
  const SEED_VOICE_KEYS = [
    "en_US-lessac-medium",
    "en_US-amy-medium",
    "en_US-ryan-medium",
    "en_US-joe-medium",
    "en_US-kristin-medium",
    "en_US-kusal-medium",
    "en_US-hfc_female-medium",
    "en_US-hfc_male-medium",
    "en_US-ljspeech-medium",
    "en_GB-alan-medium",
    "en_GB-alba-medium",
    "en_GB-jenny_dioco-medium",
    "en_GB-cori-medium",
    "en_GB-northern_english_male-medium"
  ];

  const DEFAULT_VOICE_ID = "en_US-lessac-medium";

  /** Dynamic + seed path map (voiceId → relative .onnx path). */
  const PATH_MAP = Object.create(null);
  /** voiceId → onnx size in bytes (from voices.json when available). */
  const SIZE_MAP = Object.create(null);

  let ortReady = null;
  let phonemizeReady = null;
  /** @type {Map<string, { session: any, config: any, voiceId: string }>} */
  const sessionCache = new Map();
  let voicesCache = null;
  let voicesFetchPromise = null;

  /** Persistent model store name (Cache API). */
  const MODEL_CACHE_NAME = "aac-piper-models-v1";
  /** Session memory: full URL → Blob (avoids re-fetch if disk cache fails). */
  const memoryBlobs = new Map();
  const MIN_MODEL_BYTES = 100000;
  const MIN_CONFIG_BYTES = 50;
  let persistRequested = false;

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /** Parse Piper voice keys like en_US-lessac-medium / en_GB-jenny_dioco-medium. */
  function parseVoiceKey(key) {
    const raw = String(key || "").trim();
    const m = raw.match(/^([a-z]{2}_[A-Z]{2})-(.+)-(low|medium|high|x_low)$/);
    if (!m) return null;
    return {
      key: raw,
      locale: m[1],
      name: m[2],
      quality: m[3],
      family: m[1].split("_")[0]
    };
  }

  function isOfferedQualityKey(key) {
    const p = parseVoiceKey(key);
    return !!(p && p.quality === OFFERED_QUALITY);
  }

  function pathFromKey(key) {
    if (PATH_MAP[key]) return PATH_MAP[key];
    const p = parseVoiceKey(key);
    if (!p) return null;
    return `${p.family}/${p.locale}/${p.name}/${p.quality}/${p.key}.onnx`;
  }

  function registerPath(key, path) {
    if (!key || !path) return;
    PATH_MAP[key] = path;
  }

  function registerSize(key, bytes) {
    const n = Number(bytes);
    if (!key || !Number.isFinite(n) || n <= 0) return;
    SIZE_MAP[key] = n;
  }

  function seedPaths() {
    SEED_VOICE_KEYS.forEach((key) => {
      const path = pathFromKey(key);
      if (path) PATH_MAP[key] = path;
    });
  }
  seedPaths();

  function curatedVoiceFromKey(key) {
    const p = parseVoiceKey(key);
    if (!p) return null;
    return {
      key,
      name: p.name.replace(/_/g, " "),
      language: {
        code: p.locale,
        family: p.family,
        region: p.locale.includes("_") ? p.locale.split("_")[1] : "",
        name_english: "English",
        country_english: p.locale.startsWith("en_GB") ? "United Kingdom" : "United States"
      },
      quality: p.quality,
      num_speakers: 1,
      speaker_id_map: {},
      sizeBytes: SIZE_MAP[key] || null
    };
  }

  const CURATED_VOICES = SEED_VOICE_KEYS.map(curatedVoiceFromKey).filter(Boolean);

  /** Human-readable download size (ONNX model). */
  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    const mb = n / (1024 * 1024);
    if (mb < 10) return `${mb.toFixed(1)} MB`;
    if (mb < 1024) return `${Math.round(mb)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function onnxSizeFromFiles(files) {
    if (!files || typeof files !== "object") return null;
    const onnxKey = Object.keys(files).find(
      (k) => k.endsWith(".onnx") && !k.endsWith(".onnx.json")
    );
    if (!onnxKey || !files[onnxKey]) return null;
    const n = Number(files[onnxKey].size_bytes);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function getVoiceSizeBytes(voiceOrId) {
    if (voiceOrId == null) return null;
    if (typeof voiceOrId === "string") {
      if (SIZE_MAP[voiceOrId]) return SIZE_MAP[voiceOrId];
      return null;
    }
    const v = voiceOrId;
    if (Number.isFinite(v.sizeBytes) && v.sizeBytes > 0) return v.sizeBytes;
    if (v.key && SIZE_MAP[v.key]) return SIZE_MAP[v.key];
    const fromFiles = onnxSizeFromFiles(v.files);
    if (fromFiles) {
      if (v.key) registerSize(v.key, fromFiles);
      return fromFiles;
    }
    return null;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-aac-piper="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") resolve();
        else {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("Failed to load " + src)), {
            once: true
          });
        }
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.aacPiper = src;
      s.onload = () => {
        s.dataset.loaded = "1";
        resolve();
      };
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  async function ensureOrt() {
    if (global.ort && global.ort.InferenceSession) return global.ort;
    if (!ortReady) {
      ortReady = loadScript(ORT_SCRIPT).then(() => {
        if (!global.ort) throw new Error("onnxruntime-web failed to initialize");
        global.ort.env.allowLocalModels = false;
        try {
          global.ort.env.wasm.numThreads = Math.min(
            4,
            typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 1 : 1
          );
        } catch (_) {}
        global.ort.env.wasm.wasmPaths = ONNX_BASE;
        return global.ort;
      });
    }
    return ortReady;
  }

  async function ensurePhonemizeFactory() {
    if (typeof global.createPiperPhonemize === "function") {
      return global.createPiperPhonemize;
    }
    if (!phonemizeReady) {
      phonemizeReady = loadScript(PIPER_SCRIPT).then(() => {
        if (typeof global.createPiperPhonemize !== "function") {
          throw new Error("Piper phonemizer failed to load");
        }
        return global.createPiperPhonemize;
      });
    }
    return phonemizeReady;
  }

  function pcm2wav(buffer, numChannels, sampleRate) {
    const bufferLength = buffer.length;
    const headerLength = 44;
    const view = new DataView(new ArrayBuffer(bufferLength * numChannels * 2 + headerLength));

    view.setUint32(0, 0x46464952, true); // RIFF
    view.setUint32(4, view.buffer.byteLength - 8, true);
    view.setUint32(8, 0x45564157, true); // WAVE
    view.setUint32(12, 0x20746d66, true); // fmt
    view.setUint32(16, 0x10, true);
    view.setUint16(20, 0x0001, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, numChannels * 2 * sampleRate, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x61746164, true); // data
    view.setUint32(40, 2 * bufferLength, true);

    let p = headerLength;
    for (let i = 0; i < bufferLength; i++) {
      const v = buffer[i];
      if (v >= 1) view.setInt16(p, 0x7fff, true);
      else if (v <= -1) view.setInt16(p, -0x8000, true);
      else view.setInt16(p, (v * 0x8000) | 0, true);
      p += 2;
    }
    return view.buffer;
  }

  function cacheUrlKey(url) {
    return String(url || "").split("?")[0].split("#")[0];
  }

  function isPlausibleCachedBlob(url, blob) {
    if (!blob || !blob.size) return false;
    const u = cacheUrlKey(url).toLowerCase();
    if (u.endsWith(".json")) return blob.size >= MIN_CONFIG_BYTES;
    if (u.endsWith(".onnx")) return blob.size >= MIN_MODEL_BYTES;
    return blob.size > 0;
  }

  function requestPersistentStorage() {
    if (persistRequested) return;
    persistRequested = true;
    try {
      if (navigator.storage && typeof navigator.storage.persist === "function") {
        navigator.storage.persist().catch(() => {});
      }
    } catch (_) {}
  }

  /** Canonical store: session memory + Cache API. Returns whether disk write succeeded. */
  async function writeBlob(url, blob) {
    if (!url || !blob) return false;
    const key = cacheUrlKey(url);
    memoryBlobs.set(key, blob);
    requestPersistentStorage();
    try {
      if (typeof caches === "undefined" || !caches.open) return false;
      const cache = await caches.open(MODEL_CACHE_NAME);
      await cache.put(
        key,
        new Response(blob, {
          status: 200,
          headers: {
            "Content-Type": blob.type || "application/octet-stream",
            "Content-Length": String(blob.size)
          }
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  async function readBlob(url) {
    if (!url) return undefined;
    const key = cacheUrlKey(url);

    const mem = memoryBlobs.get(key);
    if (mem && isPlausibleCachedBlob(key, mem)) return mem;

    try {
      if (typeof caches === "undefined" || !caches.open) return undefined;
      const cache = await caches.open(MODEL_CACHE_NAME);
      const res = await cache.match(key);
      if (!res) return undefined;
      const blob = await res.blob();
      if (!isPlausibleCachedBlob(key, blob)) return undefined;
      memoryBlobs.set(key, blob);
      return blob;
    } catch (_) {
      return undefined;
    }
  }

  async function fetchBlob(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${url}`);
    if (!res.body || typeof onProgress !== "function") {
      return await res.blob();
    }
    const reader = res.body.getReader();
    const contentLength = +(res.headers.get("Content-Length") || 0);
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress({
        url,
        total: contentLength,
        loaded: received,
        percent: contentLength > 0 ? Math.min(100, Math.round((received * 100) / contentLength)) : null
      });
    }
    return new Blob(chunks, { type: res.headers.get("Content-Type") || undefined });
  }

  function normalizeVoiceId(id) {
    const raw = String(id || "").trim();
    if (!raw) return DEFAULT_VOICE_ID;

    // Migrate low/high/x_low → medium when possible
    const qualityShift = raw.match(/^(.+)-(low|high|x_low)$/);
    const candidate = qualityShift ? `${qualityShift[1]}-medium` : raw;

    if (isOfferedQualityKey(candidate) && pathFromKey(candidate)) {
      registerPath(candidate, pathFromKey(candidate));
      return candidate;
    }
    return DEFAULT_VOICE_ID;
  }

  function voicePath(voiceId) {
    const id = normalizeVoiceId(voiceId);
    const path = pathFromKey(id);
    if (!path) throw new Error("Unknown Piper voice: " + voiceId);
    registerPath(id, path);
    return path;
  }

  /** Directory under HF for samples/models, without the .onnx filename. */
  function voiceDir(voiceId) {
    const path = voicePath(voiceId);
    return path.replace(/\/[^/]+$/, "");
  }

  /**
   * Small official sample (~50–150 KB). Does not download the ONNX model.
   * @param {string} voiceId
   * @param {number} [speakerId=0]
   */
  function getSampleUrl(voiceId, speakerId) {
    const sid = Number.isFinite(speakerId) ? (speakerId | 0) : 0;
    const dir = voiceDir(voiceId);
    return `${SAMPLE_HF_BASE}/${dir}/samples/speaker_${sid}.mp3`;
  }

  function displayName(voice) {
    if (!voice) return "Piper voice";
    const name = voice.name || voice.key || "voice";
    const lang =
      voice.language && (voice.language.code || voice.language.name_english)
        ? ` (${voice.language.code || voice.language.name_english})`
        : "";
    return `${name}${lang}`;
  }

  function sortVoicesEnglishFirst(list) {
    return list.slice().sort((a, b) => {
      const aEn = String(a.language?.family || a.key || "").startsWith("en") ? 0 : 1;
      const bEn = String(b.language?.family || b.key || "").startsWith("en") ? 0 : 1;
      if (aEn !== bEn) return aEn - bEn;
      const aCode = String(a.language?.code || "");
      const bCode = String(b.language?.code || "");
      if (aCode !== bCode) return aCode.localeCompare(bCode);
      return String(a.name || a.key || "").localeCompare(String(b.name || b.key || ""), undefined, {
        sensitivity: "base"
      });
    });
  }

  function ingestRemoteVoice(v) {
    if (!v || !v.key) return null;
    // UI only offers medium quality
    if (v.quality && v.quality !== OFFERED_QUALITY) return null;
    if (!v.quality && !isOfferedQualityKey(v.key)) return null;
    // Prefer path from voices.json files map
    let path = null;
    if (v.files && typeof v.files === "object") {
      const onnxKey = Object.keys(v.files).find((k) => k.endsWith(".onnx") && !k.endsWith(".onnx.json"));
      if (onnxKey) path = onnxKey;
    }
    if (!path) path = pathFromKey(v.key);
    if (!path) return null;
    registerPath(v.key, path);
    const sizeBytes = onnxSizeFromFiles(v.files);
    if (sizeBytes) registerSize(v.key, sizeBytes);
    // Attach normalized size for UI
    return Object.assign({}, v, {
      quality: v.quality || OFFERED_QUALITY,
      sizeBytes: sizeBytes || v.sizeBytes || null
    });
  }

  async function listVoices() {
    if (voicesCache) return voicesCache;
    if (!voicesFetchPromise) {
      voicesFetchPromise = (async () => {
        try {
          const res = await fetch(`${HF_BASE}/voices.json`);
          if (!res.ok) throw new Error("voices.json");
          const data = await res.json();
          const all = Object.values(data || {});
          const voices = all.map(ingestRemoteVoice).filter(Boolean);
          voicesCache = sortVoicesEnglishFirst(voices);
        } catch (_) {
          CURATED_VOICES.forEach((v) => registerPath(v.key, pathFromKey(v.key)));
          voicesCache = sortVoicesEnglishFirst(CURATED_VOICES.slice());
        }
        return voicesCache;
      })();
    }
    return voicesFetchPromise;
  }

  async function isVoiceStored(voiceId) {
    try {
      const path = voicePath(normalizeVoiceId(voiceId));
      const modelUrl = `${HF_BASE}/${path}`;
      const blob = await readBlob(modelUrl);
      return !!(blob && isPlausibleCachedBlob(modelUrl, blob));
    } catch (_) {
      return false;
    }
  }

  async function phonemize(text, espeakVoice) {
    const createPiperPhonemize = await ensurePhonemizeFactory();
    const input = JSON.stringify([{ text: String(text || "").trim() }]);
    return new Promise(async (resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Phonemizer timed out"));
      }, 30000);
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      try {
        const module = await createPiperPhonemize({
          print: (data) => {
            try {
              const parsed = JSON.parse(data);
              const ids = (parsed.phoneme_ids || []).map((n) => Number(n) | 0);
              finish(resolve, ids);
            } catch (e) {
              finish(reject, e);
            }
          },
          printErr: (message) => {
            finish(reject, new Error(String(message || "phonemize error")));
          },
          locateFile: (url) => {
            if (String(url).endsWith(".wasm")) return `${PIPER_WASM_BASE}.wasm`;
            if (String(url).endsWith(".data")) return `${PIPER_WASM_BASE}.data`;
            return url;
          }
        });
        module.callMain([
          "-l",
          espeakVoice || "en-us",
          "--input",
          input,
          "--espeak_data",
          "/espeak-ng-data"
        ]);
      } catch (e) {
        finish(reject, e);
      }
    });
  }

  /**
   * Ensure ONNX + config are available. Progress only fires on network model fetch.
   * @returns {Promise<{ downloaded: boolean, voiceId: string, modelBlob: Blob, config: object }>}
   */
  async function ensureVoice(voiceId, onProgress) {
    const id = normalizeVoiceId(voiceId);
    const path = voicePath(id);
    const modelUrl = `${HF_BASE}/${path}`;
    const configUrl = `${HF_BASE}/${path}.json`;
    let downloaded = false;

    let configBlob = await readBlob(configUrl);
    if (!configBlob || !isPlausibleCachedBlob(configUrl, configBlob)) {
      configBlob = await fetchBlob(configUrl);
      await writeBlob(configUrl, configBlob);
    }

    let modelBlob = await readBlob(modelUrl);
    if (!modelBlob || !isPlausibleCachedBlob(modelUrl, modelBlob)) {
      downloaded = true;
      if (typeof onProgress === "function") {
        onProgress({ url: modelUrl, total: 0, loaded: 0, percent: null, phase: "model" });
      }
      modelBlob = await fetchBlob(modelUrl, (p) => {
        if (typeof onProgress === "function") onProgress({ ...p, phase: "model" });
      });
      if (!isPlausibleCachedBlob(modelUrl, modelBlob)) {
        throw new Error("Piper model download incomplete or too small");
      }
      await writeBlob(modelUrl, modelBlob);
      if (typeof onProgress === "function") {
        onProgress({
          url: modelUrl,
          total: modelBlob.size,
          loaded: modelBlob.size,
          percent: 100,
          phase: "done"
        });
      }
    }

    const config = JSON.parse(await configBlob.text());
    return { downloaded, voiceId: id, modelBlob, config };
  }

  async function getSession(voiceId, onProgress) {
    const id = normalizeVoiceId(voiceId);
    if (sessionCache.has(id)) {
      return { ...sessionCache.get(id), downloaded: false };
    }

    const ort = await ensureOrt();
    const ensured = await ensureVoice(id, onProgress);
    const session = await ort.InferenceSession.create(await ensured.modelBlob.arrayBuffer());
    const entry = { session, config: ensured.config, voiceId: id };
    sessionCache.set(id, entry);
    return { ...entry, downloaded: ensured.downloaded };
  }

  /**
   * Ensure model (with optional download progress) and synthesize WAV.
   * @param {{ text: string, voiceId?: string, speed?: number, speakerId?: number, onDownloadProgress?: function }} opts
   * @returns {Promise<{ blob: Blob, downloaded: boolean, voiceId: string }>}
   */
  async function synthesize(opts) {
    const text = String(opts && opts.text != null ? opts.text : "").trim();
    if (!text) throw new Error("Empty text");
    const voiceId = normalizeVoiceId(opts && opts.voiceId);
    const speed = clamp(parseFloat(opts && opts.speed) || 1, 0.25, 4);
    const speakerId = Number.isFinite(opts && opts.speakerId) ? (opts.speakerId | 0) : 0;
    const onProgress = opts && opts.onDownloadProgress;

    const { session, config, downloaded } = await getSession(voiceId, onProgress);
    const espeakVoice =
      (config.espeak && config.espeak.voice) ||
      (String(voiceId).startsWith("en_GB") ? "en-gb" : "en-us");

    const phonemeIds = await phonemize(text, espeakVoice);
    if (!phonemeIds || !phonemeIds.length) throw new Error("No phonemes produced");

    const sampleRate = (config.audio && config.audio.sample_rate) || 22050;
    const inf = config.inference || {};
    const noiseScale = inf.noise_scale != null ? inf.noise_scale : 0.667;
    const baseLength = inf.length_scale != null ? inf.length_scale : 1;
    const lengthScale = baseLength / speed;
    const noiseW = inf.noise_w != null ? inf.noise_w : 0.8;

    const feeds = {
      input: new ort.Tensor("int64", phonemeIds, [1, phonemeIds.length]),
      input_lengths: new ort.Tensor("int64", [phonemeIds.length]),
      scales: new ort.Tensor("float32", [noiseScale, lengthScale, noiseW])
    };

    const speakerMap = config.speaker_id_map || {};
    if (speakerMap && Object.keys(speakerMap).length) {
      feeds.sid = new ort.Tensor("int64", [speakerId]);
    }

    const result = await session.run(feeds);
    const pcm = result.output && result.output.data;
    if (!pcm || !pcm.length) throw new Error("Empty synthesis output");
    const floatPcm = pcm instanceof Float32Array ? pcm : new Float32Array(pcm);
    return {
      blob: new Blob([pcm2wav(floatPcm, 1, sampleRate)], { type: "audio/wav" }),
      downloaded: !!downloaded,
      voiceId
    };
  }

  // ---------- Download progress UI (settings bar) ----------
  /**
   * @param {{
   *   wrap?: HTMLElement|null,
   *   bar?: HTMLElement|null,
   *   pctEl?: HTMLElement|null,
   *   labelEl?: HTMLElement|null,
   *   track?: HTMLElement|null,
   *   getExpectedBytes?: () => number|null,
   *   formatBytes?: (n: number) => string,
   *   announce?: (msg: string) => void
   * }} [opts]
   */
  function createProgressController(opts) {
    const o = opts || {};
    const $ = (id) => (typeof document !== "undefined" ? document.getElementById(id) : null);
    const wrap = o.wrap || $("piper-download-progress");
    const bar = o.bar || $("piper-download-bar");
    const pctEl = o.pctEl || $("piper-download-pct");
    const labelEl = o.labelEl || $("piper-download-label");
    const track = o.track || $("piper-download-track");

    function hide() {
      if (!wrap) return;
      wrap.hidden = true;
      wrap.classList.remove("is-indeterminate");
      if (bar) bar.style.width = "0%";
      if (pctEl) pctEl.textContent = "0%";
      if (track) track.setAttribute("aria-valuenow", "0");
    }

    function show(state) {
      if (!wrap || !state || state.hidden) {
        hide();
        return;
      }
      wrap.hidden = false;
      if (labelEl && state.label) labelEl.textContent = state.label;
      const pct = state.percent;
      if (pct == null || !Number.isFinite(pct)) {
        wrap.classList.add("is-indeterminate");
        if (bar) bar.style.width = "35%";
        if (pctEl) pctEl.textContent = "…";
        if (track) track.removeAttribute("aria-valuenow");
      } else {
        const clamped = clamp(Math.round(pct), 0, 100);
        wrap.classList.remove("is-indeterminate");
        if (bar) bar.style.width = `${clamped}%`;
        if (pctEl) pctEl.textContent = `${clamped}%`;
        if (track) track.setAttribute("aria-valuenow", String(clamped));
      }
    }

    function baseLabel() {
      const expectedBytes = typeof o.getExpectedBytes === "function" ? o.getExpectedBytes() : null;
      const formatBytes = o.formatBytes;
      if (expectedBytes && formatBytes) {
        return `Downloading voice model (${formatBytes(expectedBytes)})…`;
      }
      return "Downloading voice model…";
    }

    function beginSession() {
      let sawProgress = false;
      const formatBytes = o.formatBytes;

      function onDownloadProgress(progress) {
        sawProgress = true;
        if (progress && (progress.phase === "done" || progress.percent === 100)) {
          hide();
          return;
        }
        if (!progress) {
          show({ label: baseLabel(), percent: null });
          return;
        }
        const pct = progress.percent != null
          ? progress.percent
          : (progress.total > 0
            ? Math.round((progress.loaded * 100) / progress.total)
            : null);
        let label = baseLabel();
        if (progress.total > 0 && formatBytes) {
          label = `Downloading ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}…`;
        } else if (progress.loaded > 0 && formatBytes) {
          const expectedBytes = typeof o.getExpectedBytes === "function" ? o.getExpectedBytes() : null;
          const expectedLabel = expectedBytes ? formatBytes(expectedBytes) : "";
          label = expectedLabel
            ? `Downloading ${formatBytes(progress.loaded)} / ${expectedLabel}…`
            : `Downloading ${formatBytes(progress.loaded)}…`;
        }
        show({ label, percent: pct });
        if (pct != null && pct > 0 && pct < 100 && typeof o.announce === "function") {
          o.announce(`Downloading Piper voice… ${pct}%`);
        }
      }

      function finish() {
        hide();
      }

      return {
        onDownloadProgress,
        finish,
        didDownload: () => sawProgress
      };
    }

    return { show, hide, beginSession };
  }

  global.AacPiper = {
    MODEL_ID: "piper_tts",
    DEFAULT_VOICE_ID,
    OFFERED_QUALITY,
    CURATED_VOICES,
    normalizeVoiceId,
    displayName,
    formatBytes,
    getVoiceSizeBytes,
    listVoices,
    isVoiceStored,
    ensureVoice,
    getSampleUrl,
    pathFromKey,
    synthesize,
    createProgressController,
    ensureRuntime: async () => {
      await ensureOrt();
      await ensurePhonemizeFactory();
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
