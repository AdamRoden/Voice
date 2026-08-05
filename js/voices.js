/**
 * Voices: filters, panel DOM, and controller (model select, catalogs).
 * ElevenLabs API key lifecycle lives in AacElevenKey.
 * Exposes AacVoicesFilters, AacVoicesPanel, AacVoicesController, AacVoicesUi.
 */
(function (global) {
  "use strict";

  // ========== FILTERS ==========
/** Known Piper single-speaker name → gender. */
  const PIPER_NAME_GENDER = {
    amy: "female", lessac: "female", alba: "female", cori: "female",
    jenny_dioco: "female", hfc_female: "female", kathleen: "female",
    kristin: "female", ljspeech: "female", southern_english_female: "female",
    alan: "male", ryan: "male", joe: "male", john: "male", danny: "male",
    hfc_male: "male", kusal: "male", northern_english_male: "male",
    bryce: "male", norman: "male", reza_ibrahim: "male", sam: "male",
    upc_ona: "female", upc_pau: "male", eva_k: "female", karlsson: "male",
    kerstin: "female", pavoque: "male", ramona: "female", thorsten: "male",
    thorsten_emotional: "male", rapunzelina: "female", jirka: "male",
    carlfm: "male", davefx: "male", ald: "male", claude: "male",
    amir: "male", gyro: "male", harri: "male", gilles: "male",
    siwis: "female", tom: "male", anna: "female", berta: "female",
    imre: "male", bui: "male", salka: "female", steinn: "male",
    ugla: "female", paola: "female", riccardo: "male", natia: "female",
    iseke: "male", raya: "female", marylux: "female", nathalie: "female",
    rdh: "male", pim: "male", ronnie: "male", darkman: "male",
    gosia: "female", cadu: "male", edresson: "male", faber: "male",
    jeff: "male", mihai: "male", denis: "male", dmitri: "male",
    irina: "female", ruslan: "male", lili: "female", artur: "male",
    lisa: "female", lada: "female", huayan: "female", pratham: "male",
    priyamvada: "female", arjun: "male", meera: "female", daniela: "female",
    fahrettin: "male", fettah: "male", aivars: "male"
  };

  const LANG_NAME_TO_CODE = {
    english: "en", spanish: "es", french: "fr", german: "de",
    italian: "it", portuguese: "pt", polish: "pl", dutch: "nl",
    chinese: "zh", japanese: "ja", korean: "ko", arabic: "ar",
    hindi: "hi", russian: "ru"
  };

  function normalizeLangKey(raw) {
    const s = String(raw || "").trim().replace(/_/g, "-");
    if (!s) return "";
    const parts = s.split("-").filter(Boolean);
    if (!parts.length) return "";
    const lang = parts[0].toLowerCase();
    if (parts.length === 1) return lang;
    const region = parts[1].length === 2 || parts[1].length === 3
      ? parts[1].toUpperCase()
      : parts[1];
    return `${lang}-${region}`;
  }

  function languageFamily(key) {
    return String(key || "").split("-")[0].toLowerCase() || "";
  }

  function languageLabel(key) {
    const k = normalizeLangKey(key);
    if (!k) return "Unknown";
    try {
      const parts = k.split("-");
      const lang = parts[0];
      const region = parts[1] || "";
      const dnLang = new Intl.DisplayNames([navigator.language || "en"], { type: "language" });
      const base = dnLang.of(lang) || lang;
      if (region && region.length <= 3) {
        try {
          const dnReg = new Intl.DisplayNames([navigator.language || "en"], { type: "region" });
          return `${base} (${dnReg.of(region) || region})`;
        } catch (_) {
          return `${base} (${region})`;
        }
      }
      return base;
    } catch (_) {
      return k;
    }
  }

  function browserVoiceLangKey(voice) {
    return normalizeLangKey(voice && voice.lang);
  }

  function elevenVoiceLangKey(voice) {
    if (!voice) return "";
    const labels = voice.labels || {};
    const raw = labels.language || labels.Language || labels.accent || voice.language || "";
    const s = String(raw).trim();
    if (!s) return "";
    if (/^[a-z]{2}([-_][a-zA-Z]{2,})?$/i.test(s)) return normalizeLangKey(s);
    const lower = s.toLowerCase();
    for (const [name, code] of Object.entries(LANG_NAME_TO_CODE)) {
      if (lower === code || lower.includes(name)) return code;
    }
    return normalizeLangKey(s) || languageFamily(s) || "";
  }

  function piperVoiceLangKey(voice) {
    if (!voice) return "";
    if (voice.language && voice.language.code) return normalizeLangKey(voice.language.code);
    const key = String(voice.key || "");
    const m = key.match(/^([a-z]{2}_[A-Z]{2})-/);
    if (m) return normalizeLangKey(m[1]);
    return "";
  }

  function matchesLanguageFilter(voiceLangKey, filter) {
    if (!filter || filter === "all") return true;
    const v = normalizeLangKey(voiceLangKey);
    const f = normalizeLangKey(filter);
    if (!f) return true;
    if (!v) return false;
    if (v === f) return true;
    if (!f.includes("-") && languageFamily(v) === f) return true;
    if (!v.includes("-") && languageFamily(f) === v) return true;
    return false;
  }

  /**
   * @returns {"male"|"female"|"unknown"}
   */
  function guessGenderFromText(text) {
    const s = String(text || "").toLowerCase().replace(/[_-]+/g, " ");
    if (!s) return "unknown";
    if (/\bfemale\b|\bwoman\b|\bgirl\b|\blady\b/.test(s)) return "female";
    if (/\bmale\b|\bman\b|\bboy\b|\bgentleman\b/.test(s)) return "male";
    if (/\b(zira|susan|hazel|linda|heather|samantha|karen|moira|tessa|fiona|victoria|kate|allison|ava|sara|salli|joanna|amy|emma|ivy|kendra|kimberly|olivia|aria|jenny|sonia)\b/.test(s)) {
      return "female";
    }
    if (/\b(david|mark|george|james|daniel|thomas|richard|brian|matthew|justin|kevin|eric|guy|ryan|alex|christopher|arthur|ravi|geraint)\b/.test(s)) {
      return "male";
    }
    return "unknown";
  }

  function guessPiperGender(voice) {
    if (!voice) return "unknown";
    const key = String(voice.key || "");
    const name = String(voice.name || "");
    const parsed = key.match(/^[a-z]{2}_[A-Z]{2}-(.+)-(?:low|medium|high|x_low)$/);
    const slug = (parsed ? parsed[1] : name).toLowerCase().replace(/\s+/g, "_");
    if (PIPER_NAME_GENDER[slug]) return PIPER_NAME_GENDER[slug];
    if (/_female\b|female_|_woman\b|southern_english_female/.test(slug)) return "female";
    if (/_male\b|male_|_man\b|northern_english_male/.test(slug)) return "male";
    return guessGenderFromText(`${name} ${slug} ${key}`);
  }

  function guessBrowserGender(voice) {
    if (!voice) return "unknown";
    const g = String(voice.gender || "").toLowerCase();
    if (g === "male" || g === "female") return g;
    return guessGenderFromText(voice.name || "");
  }

  function guessElevenGender(voice) {
    if (!voice) return "unknown";
    const labels = voice.labels || {};
    const g = String(labels.gender || labels.Gender || "").toLowerCase();
    if (g === "male" || g === "female") return g;
    if (g.startsWith("m")) return "male";
    if (g.startsWith("f")) return "female";
    return guessGenderFromText(`${voice.name || ""} ${voice.description || ""}`);
  }

  function matchesGenderFilter(gender, filter) {
    if (!filter || filter === "all") return true;
    return gender === filter;
  }

  function getGenderFilterValue(selectEl) {
    const v = (selectEl && selectEl.value) || "all";
    return v === "male" || v === "female" ? v : "all";
  }

  function getLanguageFilterValue(selectEl) {
    const v = (selectEl && selectEl.value) || "all";
    return v && v !== "all" ? v : "all";
  }

  /**
   * Rebuild language <select> using language families only (en, es, …).
   * @param {HTMLSelectElement|null} sel
   * @param {string[]} langKeys — full keys from voices; families derived from these
   * @param {(s: string) => string} escapeHtml
   * @param {{ preferred?: string, defaultFilter?: string }} [options]
   */
  function rebuildLanguageFilterOptions(sel, langKeys, escapeHtml, options) {
    if (!sel) return;
    const esc = typeof escapeHtml === "function" ? escapeHtml : (s) => String(s ?? "");
    const defaultFilter = (options && options.defaultFilter) || "en";
    const preferredRaw =
      options && options.preferred != null ? String(options.preferred) : (sel.value || "");
    const wantsAll = preferredRaw === "all";
    // Prefer family of saved value (en-US → en)
    const preferred = !wantsAll && preferredRaw
      ? languageFamily(normalizeLangKey(preferredRaw) || preferredRaw)
      : "";

    const families = [...new Set(
      (langKeys || []).map((k) => languageFamily(normalizeLangKey(k) || k)).filter(Boolean)
    )].sort((a, b) => languageLabel(a).localeCompare(languageLabel(b), undefined, { sensitivity: "base" }));

    const opts = [`<option value="all">All languages</option>`];
    families.forEach((fam) => {
      opts.push(`<option value="${esc(fam)}">${esc(languageLabel(fam))}</option>`);
    });
    sel.innerHTML = opts.join("");

    if (wantsAll) {
      sel.value = "all";
    } else if (preferred && families.includes(preferred)) {
      sel.value = preferred;
    } else if (defaultFilter && families.includes(defaultFilter)) {
      sel.value = defaultFilter;
    } else {
      sel.value = "all";
    }
  }

  function compareVoicesByFavoriteThenName(aFav, aName, bFav, bName) {
    if (aFav !== bFav) return aFav ? -1 : 1;
    return String(aName || "").localeCompare(String(bName || ""), undefined, { sensitivity: "base" });
  }

  /**
   * Shared filter/sort for voice row models.
   * Each row: { searchText, langKey, gender, favorite, sortName, ... }
   */
  function filterSortVoiceRows(rows, filters) {
    const q = String((filters && filters.query) || "").toLowerCase().trim();
    const langFilter = (filters && filters.langFilter) || "all";
    const genderFilter = (filters && filters.genderFilter) || "all";
    return (rows || [])
      .filter((r) => {
        if (!q) return true;
        const hay = String(r.searchText != null ? r.searchText : r.label || "").toLowerCase();
        return hay.includes(q);
      })
      .filter((r) => matchesLanguageFilter(r.langKey, langFilter))
      .filter((r) => matchesGenderFilter(r.gender, genderFilter))
      .sort((a, b) => compareVoicesByFavoriteThenName(
        !!a.favorite,
        a.sortName || a.label || "",
        !!b.favorite,
        b.sortName || b.label || ""
      ));
  }

  global.AacVoicesFilters = {
    normalizeLangKey,
    languageFamily,
    languageLabel,
    browserVoiceLangKey,
    elevenVoiceLangKey,
    piperVoiceLangKey,
    matchesLanguageFilter,
    guessGenderFromText,
    guessPiperGender,
    guessBrowserGender,
    guessElevenGender,
    matchesGenderFilter,
    getGenderFilterValue,
    getLanguageFilterValue,
    rebuildLanguageFilterOptions,
    compareVoicesByFavoriteThenName,
    filterSortVoiceRows,
    PIPER_NAME_GENDER
  };

  // ========== PANEL ==========
function defaultLoadKeys(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw == null || raw === "") return new Set();
      const arr = JSON.parse(raw);
      return new Set((Array.isArray(arr) ? arr : []).map((k) => String(k)));
    } catch (_) {
      return new Set();
    }
  }

  function defaultSaveKeys(storageKey, set) {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...set]));
    } catch (_) {}
  }

  /**
   * One favorite store per provider (browser / eleven / piper).
   * @param {string} storageKey
   * @param {{
   *   load?: (key: string) => Set<string>,
   *   save?: (key: string, set: Set<string>) => void,
   *   keyOf?: (item: any) => string
   * }} [opts]
   */
  function createFavoriteStore(storageKey, opts) {
    const o = opts || {};
    const load = typeof o.load === "function" ? o.load : defaultLoadKeys;
    const save = typeof o.save === "function" ? o.save : defaultSaveKeys;
    const keyOf = typeof o.keyOf === "function" ? o.keyOf : (item) => String(item ?? "");
    let set = load(storageKey);

    function keyFor(item) {
      return keyOf(item);
    }

    function has(item) {
      const k = keyFor(item);
      return !!k && set.has(k);
    }

    function toggle(item) {
      const k = keyFor(item);
      if (!k) return false;
      if (set.has(k)) set.delete(k);
      else set.add(k);
      save(storageKey, set);
      return set.has(k);
    }

    return { has, toggle, keyFor };
  }

  /**
   * @param {HTMLElement} listEl
   * @param {Array<{
   *   id: string,
   *   label: string,
   *   metaHtml?: string,
   *   selected?: boolean,
   *   favorite?: boolean
   * }>} items
   * @param {{
   *   escapeHtml: (s: string) => string,
   *   emptyHtml?: string,
   *   onSelect: (item: object, row: HTMLElement) => void,
   *   onToggleFavorite?: (item: object) => void,
   *   onPreview?: (item: object, previewBtn: HTMLElement) => void|Promise<void>,
   *   onDownload?: (item: object, downloadBtn: HTMLElement) => void|Promise<void>,
   *   previewTitle?: string
   * }} opts
   */
  function renderVoiceRows(listEl, items, opts) {
    if (!listEl) return;
    const escapeHtml = opts.escapeHtml || ((s) => String(s ?? ""));
    listEl.innerHTML = "";

    if (!items || !items.length) {
      listEl.innerHTML = opts.emptyHtml
        || `<div class="history-empty-notice">No matching voices found</div>`;
      return;
    }

    items.forEach((item) => {
      const fav = !!item.favorite;
      const downloading = !!item.downloading;
      const cached = !!item.cached;
      const showDownloadUi = !!item.piperDownloadUi;
      const ready = cached && !downloading;
      const row = document.createElement("div");
      const stateClass = !showDownloadUi
        ? ""
        : (downloading
          ? " is-downloading"
          : (ready ? " is-ready" : " needs-download"));
      row.className = `voice-item ${item.selected ? "selected" : ""}${fav ? " is-favorite" : ""}${stateClass}`;
      row.dataset.voiceId = String(item.id || "");
      const meta = item.metaHtml || "";

      let downloadHtml = "";
      if (showDownloadUi) {
        if (ready) {
          downloadHtml = `
        <button type="button" class="voice-download-btn is-ready" disabled title="Voice model downloaded" aria-label="Voice model downloaded">
          <span class="material-symbols-outlined icon-small">check_circle</span>
        </button>`;
        } else if (downloading) {
          downloadHtml = `
        <button type="button" class="voice-download-btn is-downloading" disabled title="Downloading voice model…" aria-label="Downloading voice model" aria-busy="true">
          <span class="material-symbols-outlined icon-small">hourglass_top</span>
        </button>`;
        } else {
          downloadHtml = `
        <button type="button" class="voice-download-btn" title="Download voice model" aria-label="Download voice model">
          <span class="material-symbols-outlined icon-small">download</span>
        </button>`;
        }
      }

      row.innerHTML = `
        <button type="button" class="voice-fav-btn${fav ? " is-on" : ""}" title="${fav ? "Remove from favorites" : "Add to favorites"}" aria-label="${fav ? "Remove from favorites" : "Add to favorites"}" aria-pressed="${fav ? "true" : "false"}">
          <span class="material-symbols-outlined icon-small">${fav ? "star" : "star_border"}</span>
        </button>
        <span class="voice-item-name">${escapeHtml(item.label)}${meta}</span>
        ${downloadHtml}
        <button class="voice-preview-btn" type="button" title="${escapeHtml(opts.previewTitle || "Preview Voice")}">
          <span class="material-symbols-outlined icon-small">play_arrow</span>
        </button>
      `;

      row.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        if (typeof opts.onSelect === "function") opts.onSelect(item, row);
      });

      row.querySelector(".voice-fav-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof opts.onToggleFavorite === "function") opts.onToggleFavorite(item);
      });

      const downloadBtn = row.querySelector(".voice-download-btn");
      if (downloadBtn && !downloadBtn.classList.contains("is-ready") && !downloadBtn.classList.contains("is-downloading")) {
        downloadBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof opts.onDownload === "function") opts.onDownload(item, downloadBtn);
        });
      }

      const previewBtn = row.querySelector(".voice-preview-btn");
      previewBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof opts.onPreview === "function") opts.onPreview(item, previewBtn);
      });

      listEl.appendChild(row);
    });
  }

  function setActiveList(doc, mode) {
    const root = doc || document;
    root.getElementById("voice-list-browser")?.classList.toggle("active", mode === "browser");
    root.getElementById("voice-list-eleven")?.classList.toggle("active", mode === "eleven");
    root.getElementById("voice-list-piper")?.classList.toggle("active", mode === "piper");
  }

  /**
   * Map → filter/sort → optional enrich → render.
   * @param {HTMLElement} listEl
   * @param {{
   *   voices: any[],
   *   toRow: (voice: any, index: number) => object,
   *   filters: { query?: string, langFilter?: string, genderFilter?: string },
   *   filterSort?: (rows: object[], filters: object) => object[],
   *   enrich?: (rows: object[]) => object[]|Promise<object[]>,
   *   emptySourceHtml?: string,
   *   emptyHtml?: string,
   *   escapeHtml: (s: string) => string,
   *   previewTitle?: string,
   *   onSelect: function,
   *   onToggleFavorite?: function,
   *   onPreview?: function,
   *   onDownload?: function
   * }} opts
   */
  async function renderCatalog(listEl, opts) {
    if (!listEl || !opts) return;
    const voices = opts.voices || [];
    if (!voices.length) {
      listEl.innerHTML = opts.emptySourceHtml
        || opts.emptyHtml
        || `<div class="history-empty-notice">No voices available</div>`;
      return;
    }

    const mapped = voices.map((v, i) => opts.toRow(v, i));
    const filterSort = opts.filterSort || filterSortVoiceRows || ((rows) => rows);
    let rows = filterSort(mapped, opts.filters || {});
    if (typeof opts.enrich === "function") {
      rows = await opts.enrich(rows);
    }

    renderVoiceRows(listEl, rows, {
      escapeHtml: opts.escapeHtml,
      emptyHtml: opts.emptyHtml || `<div class="history-empty-notice">No matching voices found</div>`,
      previewTitle: opts.previewTitle,
      onSelect: opts.onSelect,
      onToggleFavorite: opts.onToggleFavorite,
      onPreview: opts.onPreview,
      onDownload: opts.onDownload
    });
  }

  /**
   * Piper size/cached/downloading meta span for a voice row.
   */
  function piperMetaHtml(voice, state, Piper, escapeHtml) {
    const esc = escapeHtml || ((s) => String(s ?? ""));
    const st = typeof state === "boolean"
      ? { cached: state, downloading: false }
      : (state || {});
    const cached = !!st.cached;
    const downloading = !!st.downloading;
    const sizeBytes = Piper && Piper.getVoiceSizeBytes ? Piper.getVoiceSizeBytes(voice) : null;
    const sizeLabel = sizeBytes && Piper.formatBytes ? Piper.formatBytes(sizeBytes) : "";
    const metaParts = [];
    if (sizeLabel) metaParts.push(sizeLabel);
    if (downloading) metaParts.push("downloading…");
    else if (cached) metaParts.push("ready");
    else metaParts.push("not downloaded");
    if (!metaParts.length) return "";
    const sizeTitle = sizeBytes
      ? `Download size: ${sizeLabel} (${sizeBytes.toLocaleString()} bytes)`
      : "Download size unknown";
    let metaTitle = sizeTitle;
    if (downloading) metaTitle = `${sizeTitle} · Download in progress`;
    else if (cached) metaTitle = `${sizeTitle} · Ready on this device`;
    else metaTitle = `${sizeTitle} · Download required before use`;
    const cls = downloading ? " downloading" : (cached ? " cached" : " not-cached");
    return `<span class="voice-item-meta${cls}" title="${esc(metaTitle)}">${esc(metaParts.join(" · "))}</span>`;
  }

  global.AacVoicesPanel = {
    createFavoriteStore,
    renderVoiceRows,
    renderCatalog,
    piperMetaHtml,
    setActiveList
  };

  global.AacVoicesUi = {
    Filters: global.AacVoicesFilters,
    Panel: global.AacVoicesPanel
  };
})(typeof window !== "undefined" ? window : globalThis);

(function (global) {
  "use strict";

  const MODEL_STORAGE_KEY = "aac_voice_model";
  const LEGACY_MODEL_STORAGE_KEY = "elevenlabs_model";
  const VOICE_LANG_FILTER_KEY = "aac_voice_language_filter";
  const DEFAULT_VOICE_LANG_FILTER = "en";
  const FAV_BROWSER_KEY = "aac_fav_browser_voices";
  const FAV_ELEVEN_KEY = "aac_fav_eleven_voices";
  const FAV_PIPER_KEY = "aac_fav_piper_voices";
  const PREVIEW_TEXT = "This is a preview.";

  /**
   * @param {{
   *   $: (id: string) => HTMLElement|null,
   *   lsGet: (k: string, fb?: any) => any,
   *   lsSet: (k: string, v: any) => void,
   *   escapeHtml: (s: string) => string,
   *   modelSelect: HTMLSelectElement|null,
   *   SpeechEngines: object,
   *   Piper: object,
   *   Eleven: object,
   *   ElevenKey: object,
   *   VoicesFilters: object,
   *   VoicesPanel: object,
   *   getSpeechSpeed: () => number,
   *   getSpeechPitch: () => number,
   *   getVolumeGain: () => number,
   *   playPreviewBlob: (blob: Blob, fx: object|null) => Promise<void>,
   *   openModal: (id: string) => void,
   *   closeModals: () => void,
   *   focusDisplayInput: () => void,
   *   onVoiceContextChanged?: () => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    const $ = d.$;
    const lsGet = d.lsGet;
    const lsSet = d.lsSet;
    const escapeHtml = d.escapeHtml;
    const modelSelect = d.modelSelect;
    const SpeechEngines = d.SpeechEngines;
    const Piper = d.Piper;
    const Eleven = d.Eleven;
    const ElevenKey = d.ElevenKey;
    const VF = d.VoicesFilters;
    const Panel = d.VoicesPanel;

    if (!SpeechEngines || !VF || !Panel || !Piper || !Eleven || !ElevenKey) {
      throw new Error("AacVoicesController requires SpeechEngines, Piper, Eleven, ElevenKey, VoicesFilters, VoicesPanel");
    }
    if (typeof d.playPreviewBlob !== "function") {
      throw new Error("AacVoicesController requires playPreviewBlob");
    }

    let browserVoiceIndex = (() => {
      const raw = lsGet("aac_browser_voice_index", "");
      if (raw === "" || raw == null) return "";
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? "" : n;
    })();

    let piperVoiceId = Piper.normalizeVoiceId(
      lsGet("aac_piper_voice", "") || Piper.DEFAULT_VOICE_ID
    );
    lsSet("aac_piper_voice", piperVoiceId);

    let elevenVoiceId = lsGet("elevenlabs_voice", "") || "";
    let elevenVoicesCache = [];
    let elevenLoadError = false;
    let piperVoicesCache = [];
    let languageFilterSource = "";
    let voiceSearchTimeout = null;
    let piperPreviewAudio = null;
    /** Voice id currently driving the shared download progress bar (for size label). */
    let piperProgressVoiceId = "";
    const piperDownloadProgress = Piper.createProgressController({
      getExpectedBytes: () => Piper.getVoiceSizeBytes(piperProgressVoiceId),
      formatBytes: Piper.formatBytes.bind(Piper)
    });
    try { piperDownloadProgress.hide(); } catch (_) {}

    const favBrowser = Panel.createFavoriteStore(FAV_BROWSER_KEY, {
      keyOf: (voice) => (voice ? `${voice.name || ""}\u0000${voice.lang || ""}` : "")
    });
    const favEleven = Panel.createFavoriteStore(FAV_ELEVEN_KEY, {
      keyOf: (id) => String(id || "")
    });
    const favPiper = Panel.createFavoriteStore(FAV_PIPER_KEY, {
      keyOf: (id) => String(id || "")
    });

    function modelId(id) {
      return SpeechEngines.normalizeModelId(id);
    }

    function isPiperAvailable() {
      return !!(Piper && typeof Piper.isSupported === "function" && Piper.isSupported());
    }

    /** Coerce piper → browser when this runtime cannot run Piper reliably. */
    function coerceAvailableModel(id) {
      const mid = modelId(id);
      if (mid === "piper_tts" && !isPiperAvailable()) return "browser_tts";
      return mid;
    }

    /** Hide Piper from the model picker when unsupported (e.g. iPhone Safari). */
    function applyPiperModelOptionVisibility() {
      if (!modelSelect) return;
      const opt = modelSelect.querySelector('option[value="piper_tts"]');
      if (!opt) return;
      if (isPiperAvailable()) {
        opt.hidden = false;
        opt.disabled = false;
        opt.removeAttribute("aria-hidden");
      } else {
        opt.hidden = true;
        opt.disabled = true;
        opt.setAttribute("aria-hidden", "true");
        // Remove so it cannot be chosen via keyboard/UI on picky mobile browsers.
        try { opt.remove(); } catch (_) {}
      }
    }

    function readStoredModel() {
      let raw = lsGet(MODEL_STORAGE_KEY, null);
      if (raw == null || raw === "") {
        raw = lsGet(LEGACY_MODEL_STORAGE_KEY, "browser_tts");
      }
      const mid = coerceAvailableModel(raw || "browser_tts");
      if (lsGet(MODEL_STORAGE_KEY, "") !== mid) lsSet(MODEL_STORAGE_KEY, mid);
      return mid;
    }

    function persistModel(mid) {
      const id = coerceAvailableModel(mid);
      lsSet(MODEL_STORAGE_KEY, id);
      lsSet(LEGACY_MODEL_STORAGE_KEY, id);
      return id;
    }

    function currentVoiceGroup() {
      return SpeechEngines.voiceListModeForModel(modelSelect?.value);
    }

    function selectedModel() {
      return modelId(modelSelect?.value);
    }

    function hasElevenApiKey() {
      return ElevenKey.hasApiKey();
    }

    function isVoicesPanelOpen() {
      return !!$("voices-panel")?.classList.contains("open");
    }

    const DEFAULT_VOICE_MODEL = "browser_tts";

    /** Switch off Eleven models when key is missing or rejected by the API. */
    function fallbackToDefaultModel() {
      const mid = persistModel(DEFAULT_VOICE_MODEL);
      if (modelSelect) modelSelect.value = mid;
      syncSelectedVoiceSummary();
      if (isVoicesPanelOpen()) {
        applyVoiceModelList("browser", { resetSearch: false });
      }
      notifyVoiceContextChanged();
      return mid;
    }

    function isElevenModelSelected() {
      return SpeechEngines.isElevenModel(selectedModel());
    }

    /** Apply UI model without always persisting (used while API-key sheet is open). */
    function applyModelUi(mid, { persist = true } = {}) {
      const id = coerceAvailableModel(mid);
      if (persist) persistModel(id);
      if (modelSelect) modelSelect.value = id;
      syncSelectedVoiceSummary();
      if (isVoicesPanelOpen()) {
        applyVoiceModelList(SpeechEngines.voiceListModeForModel(id), { resetSearch: false });
      }
      notifyVoiceContextChanged();
      return id;
    }

    /**
     * Clear invalid/empty key and return to browser TTS when on an Eleven model.
     * @param {{ clearKey?: boolean, silent?: boolean, message?: string, loadError?: boolean }} [opts]
     */
    function handleInvalidElevenKey(opts) {
      return ElevenKey.revokeAndFallback(opts);
    }

    /** Shell overlay/Escape closed modals — finish API-key cancel side effects. */
    function onApiKeyModalDismissed() {
      ElevenKey.onShellModalsClosed();
    }

    function modelLabelForSummary(model) {
      const mid = modelId(model);
      if (mid === "browser_tts") return "Browser";
      if (mid === "piper_tts") return "Piper";
      if (mid === "eleven_v3") return "Eleven v3";
      if (mid === "eleven_flash_v2_5") return "Eleven Flash";
      return "Voice";
    }

    function piperVoiceLabel() {
      const id = piperVoiceId || Piper.DEFAULT_VOICE_ID;
      const fromCache = (piperVoicesCache || []).find((v) => v.key === id);
      const curated = (Piper.CURATED_VOICES || []).find((v) => v.key === id);
      const voice = fromCache || curated;
      let label = voice && Piper.displayName ? Piper.displayName(voice) : id;
      if (Piper.getVoiceSizeBytes && Piper.formatBytes) {
        const bytes = Piper.getVoiceSizeBytes(voice || id);
        const size = Piper.formatBytes(bytes);
        if (size) label = `${label} · ${size}`;
      }
      return label;
    }

    function notifyVoiceContextChanged() {
      if (typeof d.onVoiceContextChanged === "function") d.onVoiceContextChanged();
    }

    function syncSelectedVoiceSummary() {
      const el = $("selected-voice-summary");
      if (!el) return;
      const model = selectedModel();
      const group = currentVoiceGroup();
      const engine = modelLabelForSummary(model);
      let voicePart = "Select voice…";
      if (group === "browser") {
        const voices = window.speechSynthesis.getVoices();
        const v = (browserVoiceIndex !== "" && voices[browserVoiceIndex])
          ? voices[browserVoiceIndex]
          : voices[0];
        voicePart = v ? v.name : "Select voice…";
      } else if (group === "piper") {
        voicePart = piperVoiceLabel();
      } else {
        const selected = (elevenVoicesCache || []).find((v) => v.voice_id === elevenVoiceId);
        voicePart = selected
          ? selected.name
          : (elevenVoiceId ? "ElevenLabs voice" : "Select voice…");
      }
      el.textContent = `${engine} · ${voicePart}`;
    }

    function getVoiceSearchQuery() {
      return ($("voice-search-input")?.value || "").toLowerCase().trim();
    }

    function getVoiceGenderFilter() {
      return VF.getGenderFilterValue($("voice-gender-filter"));
    }

    function getVoiceLanguageFilter() {
      return VF.getLanguageFilterValue($("voice-language-filter"));
    }

    function getPreferredVoiceLanguageFilter() {
      const saved = lsGet(VOICE_LANG_FILTER_KEY, null);
      if (saved == null || saved === "") return DEFAULT_VOICE_LANG_FILTER;
      return saved;
    }

    function rebuildLanguageFilterOptions(langKeys, source) {
      if (source && source === languageFilterSource && $("voice-language-filter")?.options?.length > 1) {
        return;
      }
      if (source) languageFilterSource = source;
      VF.rebuildLanguageFilterOptions(
        $("voice-language-filter"),
        langKeys,
        escapeHtml,
        {
          preferred: getPreferredVoiceLanguageFilter(),
          defaultFilter: DEFAULT_VOICE_LANG_FILTER
        }
      );
    }

    function ensureDefaultBrowserVoice(voices) {
      if (!voices || !voices.length) return;
      const idxValid = browserVoiceIndex !== "" && voices[browserVoiceIndex];
      if (!idxValid) {
        browserVoiceIndex = 0;
        lsSet("aac_browser_voice_index", "0");
      }
    }

    function stopPiperSamplePreview() {
      if (piperPreviewAudio) {
        try { piperPreviewAudio.pause(); } catch (_) {}
        try { piperPreviewAudio.removeAttribute("src"); piperPreviewAudio.load(); } catch (_) {}
        piperPreviewAudio = null;
      }
      document.querySelectorAll("#voice-list-piper .voice-preview-btn").forEach((btn) => {
        btn.dataset.playing = "0";
        btn.disabled = false;
        const icon = btn.querySelector(".material-symbols-outlined");
        if (icon) icon.textContent = "play_arrow";
      });
    }

    function closeVoicesPanel() {
      $("voices-panel")?.classList.remove("open");
      stopPiperSamplePreview();
      d.focusDisplayInput();
    }

    function selectVoice(persist) {
      persist();
      syncSelectedVoiceSummary();
      setTimeout(closeVoicesPanel, 200);
    }

    function setLoading(listEl, message) {
      if (listEl) {
        listEl.innerHTML = `<div class="history-empty-notice">${message || "Loading voices..."}</div>`;
      }
    }

    /** Provider configs: load, row map, select, preview — one catalog path. */
    const providers = {
      browser: {
        listId: "voice-list-browser",
        source: "browser",
        async loadVoices() {
          const voices = window.speechSynthesis.getVoices();
          ensureDefaultBrowserVoice(voices);
          return voices;
        },
        langKey: (v) => VF.browserVoiceLangKey(v),
        toRow: (voice, index) => ({
          voice,
          index,
          id: String(index),
          label: `${voice.name} (${voice.lang})`,
          favorite: favBrowser.has(voice),
          selected: String(browserVoiceIndex) === String(index),
          langKey: VF.browserVoiceLangKey(voice),
          gender: VF.guessBrowserGender(voice),
          searchText: `${voice.name} ${voice.lang}`,
          sortName: voice.name
        }),
        onSelect: (item) => {
          selectVoice(() => {
            browserVoiceIndex = item.index;
            lsSet("aac_browser_voice_index", String(item.index));
          });
        },
        onToggleFavorite: (item) => favBrowser.toggle(item.voice),
        onPreview: (item) => {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(PREVIEW_TEXT);
          utterance.voice = item.voice;
          utterance.rate = d.getSpeechSpeed();
          utterance.volume = d.getVolumeGain();
          utterance.pitch = d.getSpeechPitch();
          window.speechSynthesis.speak(utterance);
        }
      },

      piper: {
        listId: "voice-list-piper",
        source: "piper",
        previewTitle: "Play sample preview (no full model download)",
        async loadVoices(listEl) {
          if (piperVoicesCache.length) return piperVoicesCache;
          setLoading(listEl, "Loading Piper voices...");
          try {
            piperVoicesCache = await Piper.listVoices();
          } catch (_) {
            piperVoicesCache = Piper.CURATED_VOICES || [];
          }
          piperVoiceId = Piper.normalizeVoiceId(piperVoiceId);
          lsSet("aac_piper_voice", piperVoiceId);
          return piperVoicesCache;
        },
        langKey: (v) => VF.piperVoiceLangKey(v),
        toRow: (voice) => ({
          voice,
          id: voice.key,
          label: Piper.displayName ? Piper.displayName(voice) : (voice.name || voice.key),
          favorite: favPiper.has(voice.key),
          selected: piperVoiceId === voice.key,
          langKey: VF.piperVoiceLangKey(voice),
          gender: VF.guessPiperGender(voice),
          searchText: `${voice.name || ""} ${voice.key || ""} ${voice.language?.code || ""}`,
          sortName: voice.name || voice.key,
          piperDownloadUi: true
        }),
        enrich: async (rows) => {
          const flags = await Promise.all(
            rows.map((row) => Piper.isVoiceStored(row.voice.key).catch(() => false))
          );
          return rows.map((row, idx) => {
            const cached = !!flags[idx];
            const downloading = !!(Piper.isVoiceDownloading
              && Piper.isVoiceDownloading(row.voice.key));
            return {
              ...row,
              cached,
              downloading,
              needsDownload: !cached,
              showDownload: true,
              piperDownloadUi: true,
              // Only highlight as selected when ready — undownloaded cannot be used yet.
              selected: cached && piperVoiceId === row.voice.key,
              metaHtml: Panel.piperMetaHtml(
                row.voice,
                { cached, downloading },
                Piper,
                escapeHtml
              )
            };
          });
        },
        onSelect: (item) => {
          if (!item.cached) {
            alert("Download this Piper voice first. Tap the download button on the right.");
            return;
          }
          if (item.downloading) {
            alert("This voice is still downloading. Wait until it finishes before selecting it.");
            return;
          }
          selectVoice(() => {
            piperVoiceId = Piper.normalizeVoiceId(item.voice.key);
            lsSet("aac_piper_voice", piperVoiceId);
          });
        },
        onToggleFavorite: (item) => favPiper.toggle(item.voice.key),
        onDownload: async (item, downloadBtn) => {
          const voiceId = Piper.normalizeVoiceId(item.voice.key);
          // Never start a second download for the same voice.
          if (Piper.isVoiceDownloading && Piper.isVoiceDownloading(voiceId)) {
            return;
          }
          if (item.cached) return;

          piperProgressVoiceId = voiceId;
          const session = piperDownloadProgress.beginSession();
          const icon = downloadBtn && downloadBtn.querySelector(".material-symbols-outlined");
          if (downloadBtn) {
            downloadBtn.disabled = true;
            downloadBtn.classList.add("is-downloading");
            downloadBtn.title = "Downloading voice model…";
            downloadBtn.setAttribute("aria-busy", "true");
          }
          if (icon) icon.textContent = "hourglass_top";

          // Kick off download first so inflight state is set before list re-render.
          const downloadPromise = Piper.downloadVoice(voiceId, session.onDownloadProgress);
          if (isVoicesPanelOpen() && currentVoiceGroup() === "piper") {
            renderProviderCatalog("piper");
          }

          try {
            await downloadPromise;
            session.finish();
            // Prefer the freshly downloaded voice.
            piperVoiceId = voiceId;
            lsSet("aac_piper_voice", piperVoiceId);
            syncSelectedVoiceSummary();
            if (isVoicesPanelOpen() && currentVoiceGroup() === "piper") {
              await renderProviderCatalog("piper");
            }
          } catch (_) {
            session.finish();
            alert("Failed to download Piper voice. Check your connection and try again.");
            if (isVoicesPanelOpen() && currentVoiceGroup() === "piper") {
              await renderProviderCatalog("piper");
            }
          } finally {
            piperProgressVoiceId = "";
          }
        },
        onPreview: async (item, previewBtn) => {
          const icon = previewBtn.querySelector(".material-symbols-outlined");
          if (previewBtn.dataset.playing === "1" && piperPreviewAudio) {
            stopPiperSamplePreview();
            return;
          }
          const resetPreview = () => {
            if (icon) icon.textContent = "play_arrow";
            previewBtn.disabled = false;
            previewBtn.dataset.playing = "0";
          };
          stopPiperSamplePreview();
          if (icon) icon.textContent = "hourglass_top";
          previewBtn.disabled = true;
          previewBtn.dataset.playing = "0";
          try {
            const sampleUrl = Piper.getSampleUrl(item.voice.key);
            const audio = new Audio(sampleUrl);
            piperPreviewAudio = audio;
            audio.volume = Math.min(1, d.getVolumeGain());
            const cleanup = () => {
              if (piperPreviewAudio === audio) piperPreviewAudio = null;
              resetPreview();
            };
            audio.onended = cleanup;
            audio.onerror = () => {
              cleanup();
              alert("Sample preview unavailable for this voice (network or missing sample).");
            };
            await audio.play();
            if (icon) icon.textContent = "stop_circle";
            previewBtn.disabled = false;
            previewBtn.dataset.playing = "1";
          } catch (_) {
            alert("Could not play sample preview. Check your connection.");
            resetPreview();
          }
        }
      },

      eleven: {
        listId: "voice-list-eleven",
        source: "eleven",
        emptySourceHtml: () => {
          if (elevenLoadError) {
            return `<div class="history-empty-notice">Could not load voices. Check API Key.</div>`;
          }
          if (!hasElevenApiKey()) {
            return `<div class="history-empty-notice">Add an ElevenLabs API key to load voices.</div>`;
          }
          return `<div class="history-empty-notice">No ElevenLabs voices found.</div>`;
        },
        async loadVoices(listEl) {
          if (elevenVoicesCache.length) {
            elevenLoadError = false;
            return elevenVoicesCache;
          }
          const apiKey = ElevenKey.getApiKey();
          if (!apiKey) {
            elevenLoadError = false;
            if (isElevenModelSelected()) fallbackToDefaultModel();
            return [];
          }
          setLoading(listEl, "Loading ElevenLabs voices...");
          try {
            const validated = await Eleven.validateApiKey(apiKey);
            if (!validated.ok) {
              if (validated.reason === "invalid") {
                handleInvalidElevenKey({
                  clearKey: true,
                  loadError: true,
                  silent: false,
                  message: "ElevenLabs API key is invalid. Switched to browser voice."
                });
                return [];
              }
              // Network/other — keep key, show error state
              elevenVoicesCache = [];
              elevenLoadError = true;
              return [];
            }
            elevenVoicesCache = validated.voices || [];
            elevenLoadError = false;
            return elevenVoicesCache;
          } catch (_) {
            elevenVoicesCache = [];
            elevenLoadError = true;
            return [];
          }
        },
        langKey: (v) => VF.elevenVoiceLangKey(v),
        toRow: (voice) => ({
          voice,
          id: voice.voice_id,
          label: `${voice.name} (${voice.category || "General"})`,
          favorite: favEleven.has(voice.voice_id),
          selected: elevenVoiceId === voice.voice_id,
          langKey: VF.elevenVoiceLangKey(voice),
          gender: VF.guessElevenGender(voice),
          searchText: `${voice.name} ${voice.category || ""}`,
          sortName: voice.name
        }),
        onSelect: (item) => {
          selectVoice(() => {
            elevenVoiceId = item.voice.voice_id;
            lsSet("elevenlabs_voice", elevenVoiceId);
          });
        },
        onToggleFavorite: (item) => favEleven.toggle(item.voice.voice_id),
        onPreview: async (item, previewBtn) => {
          const icon = previewBtn.querySelector(".material-symbols-outlined");
          if (icon) icon.textContent = "hourglass_top";
          previewBtn.disabled = true;
          const resetPreview = () => {
            if (icon) icon.textContent = "play_arrow";
            previewBtn.disabled = false;
          };
          try {
            const apiKey = ElevenKey.getApiKey();
            if (!apiKey) throw new Error("No API key");
            const selected = SpeechEngines.isElevenModel(modelSelect?.value)
              ? modelSelect.value
              : "eleven_v3";
            const out = await SpeechEngines.produce({
              id: "eleven",
              voiceId: item.voice.voice_id,
              modelId: selected
            }, {
              phrase: PREVIEW_TEXT,
              selectedModel: selected,
              voiceId: item.voice.voice_id,
              apiKey,
              speed: d.getSpeechSpeed(),
              pitch: d.getSpeechPitch()
            }, { Eleven });
            await d.playPreviewBlob(out.blob, out.fx);
            resetPreview();
          } catch (err) {
            resetPreview();
            if (err && err.code === "eleven_auth") {
              handleInvalidElevenKey({
                clearKey: true,
                loadError: true,
                silent: false,
                message: "ElevenLabs API key is invalid. Switched to browser voice."
              });
              return;
            }
            alert("Could not preview voice.");
          }
        }
      }
    };

    async function renderProviderCatalog(group) {
      const mode = group || currentVoiceGroup();
      const provider = providers[mode] || providers.browser;
      const list = $(provider.listId);
      if (!list) return;

      let voices;
      try {
        voices = await provider.loadVoices(list);
      } catch (_) {
        voices = [];
      }

      rebuildLanguageFilterOptions(
        (voices || []).map((v) => provider.langKey(v)),
        provider.source
      );
      syncSelectedVoiceSummary();

      await Panel.renderCatalog(list, {
        voices: voices || [],
        emptySourceHtml: typeof provider.emptySourceHtml === "function"
          ? provider.emptySourceHtml()
          : undefined,
        filters: {
          query: getVoiceSearchQuery(),
          langFilter: getVoiceLanguageFilter(),
          genderFilter: getVoiceGenderFilter()
        },
        filterSort: VF.filterSortVoiceRows,
        escapeHtml,
        previewTitle: provider.previewTitle,
        toRow: (voice, index) => provider.toRow(voice, index),
        enrich: provider.enrich,
        onSelect: (item) => provider.onSelect(item),
        onToggleFavorite: (item) => {
          provider.onToggleFavorite(item);
          renderProviderCatalog(mode);
        },
        onPreview: (item, btn) => provider.onPreview(item, btn),
        onDownload: provider.onDownload
          ? (item, btn) => provider.onDownload(item, btn)
          : undefined
      });
    }

    /** Set active list + render. Providers own fetch/loading. */
    function applyVoiceModelList(mode, { resetSearch = false } = {}) {
      const group = mode || currentVoiceGroup();
      Panel.setActiveList(document, group);
      if (resetSearch && $("voice-search-input")) $("voice-search-input").value = "";
      languageFilterSource = "";
      renderProviderCatalog(group);
      return group;
    }

    function openVoicesPanel(mode) {
      const group = applyVoiceModelList(mode || currentVoiceGroup(), { resetSearch: true });
      $("voices-panel")?.classList.add("open");
      if (group === "eleven" && !hasElevenApiKey()) {
        ElevenKey.openApiKeyModal({
          previousModel: readStoredModel(),
          pendingModel: selectedModel()
        });
      }
    }

    function activeListMode() {
      if ($("voice-list-piper")?.classList.contains("active")) return "piper";
      if ($("voice-list-eleven")?.classList.contains("active")) return "eleven";
      if ($("voice-list-browser")?.classList.contains("active")) return "browser";
      return currentVoiceGroup();
    }

    function refreshActiveVoiceList() {
      renderProviderCatalog(activeListMode());
    }

    /** Invalidate Eleven cache and refresh list/summary once. */
    function updateApiKeyStatus() {
      ElevenKey.paintApiKeyButton();
      elevenVoicesCache = [];
      elevenLoadError = false;
      if (!hasElevenApiKey() && isElevenModelSelected()) {
        fallbackToDefaultModel();
        return;
      }
      if (isVoicesPanelOpen() && currentVoiceGroup() === "eleven") {
        renderProviderCatalog("eleven");
      } else if (hasElevenApiKey()) {
        providers.eleven.loadVoices(null).then(() => syncSelectedVoiceSummary());
      } else {
        syncSelectedVoiceSummary();
      }
    }

    /** Apply cache/load-error updates from AacElevenKey. */
    function onElevenKeyStateChanged(state) {
      const s = state || {};
      if (s.clearCache) elevenVoicesCache = [];
      if (Array.isArray(s.voices)) elevenVoicesCache = s.voices;
      if (typeof s.loadError === "boolean") elevenLoadError = s.loadError;
      if (!s.refreshList) {
        syncSelectedVoiceSummary();
        return;
      }
      if (!hasElevenApiKey() && isElevenModelSelected()) {
        // Fallback handled by key module / model revert; still refresh summary.
        syncSelectedVoiceSummary();
        return;
      }
      if (isVoicesPanelOpen() && currentVoiceGroup() === "eleven") {
        renderProviderCatalog("eleven");
      } else if (hasElevenApiKey() && s.voices) {
        syncSelectedVoiceSummary();
      } else {
        syncSelectedVoiceSummary();
      }
    }

    function bind() {
      applyPiperModelOptionVisibility();
      const savedModel = readStoredModel();
      if (modelSelect) modelSelect.value = savedModel;

      $("open-voices")?.addEventListener("click", () => openVoicesPanel());
      $("close-voices-panel-btn")?.addEventListener("click", closeVoicesPanel);

      modelSelect?.addEventListener("change", (e) => {
        const previousModel = readStoredModel();
        const mid = coerceAvailableModel(e.target.value);
        // Do not persist Eleven until a key is present (or validated via modal).
        if (SpeechEngines.isElevenModel(mid) && !hasElevenApiKey()) {
          applyModelUi(mid, { persist: false });
          ElevenKey.openApiKeyModal({
            previousModel,
            pendingModel: mid
          });
          return;
        }
        applyModelUi(mid, { persist: true });
      });

      $("voice-search-input")?.addEventListener("input", () => {
        clearTimeout(voiceSearchTimeout);
        voiceSearchTimeout = setTimeout(refreshActiveVoiceList, 200);
      });

      $("voice-gender-filter")?.addEventListener("change", () => {
        refreshActiveVoiceList();
      });

      $("voice-language-filter")?.addEventListener("change", () => {
        const sel = $("voice-language-filter");
        if (sel) lsSet(VOICE_LANG_FILTER_KEY, sel.value || DEFAULT_VOICE_LANG_FILTER);
        refreshActiveVoiceList();
      });

      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
          if (currentVoiceGroup() === "browser") {
            if (isVoicesPanelOpen()) renderProviderCatalog("browser");
            else syncSelectedVoiceSummary();
          }
        };
      }

      ElevenKey.paintApiKeyButton();
      syncSelectedVoiceSummary();
      notifyVoiceContextChanged();
    }

    function setPiperVoiceId(id) {
      piperVoiceId = Piper.normalizeVoiceId(id || Piper.DEFAULT_VOICE_ID);
      lsSet("aac_piper_voice", piperVoiceId);
      syncSelectedVoiceSummary();
      return piperVoiceId;
    }

    function setModel(id) {
      applyPiperModelOptionVisibility();
      const mid = persistModel(id);
      if (modelSelect) {
        modelSelect.value = mid;
        modelSelect.dispatchEvent(new Event("change"));
      } else {
        syncSelectedVoiceSummary();
        notifyVoiceContextChanged();
      }
      return mid;
    }

    // Minimal public surface for the app shell
    return {
      bind,
      setModel,
      setPiperVoiceId,
      syncSelectedVoiceSummary,
      updateApiKeyStatus,
      onElevenKeyStateChanged,
      onApiKeyModalDismissed,
      handleInvalidElevenKey,
      revokeAndFallback: handleInvalidElevenKey,
      fallbackToDefaultModel,
      applyModelUi,
      isElevenModelSelected,
      isVoicesPanelOpen,
      openVoicesPanel,
      closeVoicesPanel,
      hasElevenApiKey,
      getBrowserVoiceIndex: () => browserVoiceIndex,
      getPiperVoiceId: () => piperVoiceId,
      getElevenVoiceId: () => elevenVoiceId
    };
  }

  global.AacVoicesController = {
    MODEL_STORAGE_KEY,
    LEGACY_MODEL_STORAGE_KEY,
    create
  };
})(typeof window !== "undefined" ? window : globalThis);

