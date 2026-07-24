    // ==================== STATE & PALETTE CONFIG ====================
    const COLOR_PALETTE = [
      "#a0a0a0", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6",
      "#674ea7", "#a64d79", "#808080", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c",
      "#1155cc", "#0b5394", "#351c75", "#741b47", "#606060", "#660000", "#783f04", "#7f6000",
      "#274e13", "#0c343d", "#1c4587", "#073763", "#20124d", "#4c1130", "#000000", "#ffffff",
      "#dddddd", "#bbbbbb", "#999999", "#777777", "#555555", "#333333", "#111111"
    ];

    const DEFAULT_GRID_COLS = 4;
    const DEFAULT_GRID_ROWS = 2;

    const SYMBOL_MIGRATION_MAP = {
      "📁": "folder", "💬": "chat", "🕒": "history", "⚙️": "settings", "☰": "menu", "▼": "expand_more",
      "❯": "chevron_right", "🔍": "search", "🎨": "palette", "🗣️": "record_voice_over", "✎": "edit",
      "👉": "touch_app", "🔊": "volume_up", "▶": "play_arrow", "📌": "push_pin", "🗑️": "delete",
      "☀️": "light_mode", "🌙": "dark_mode", "💻": "computer", "🔄": "refresh", "⭐": "star", "🏠": "home"
    };

    /**
     * Offline fallback when Google Fonts icon metadata cannot be fetched
     * (CORS, offline, file://). Same shape as catalog entries from fonts.google.com.
     */
    const ICON_DATABASE_FALLBACK = [
      { ico: "chat", name: "chat message talk speech bubble communication", popularity: 1e6 },
      { ico: "folder", name: "folder topic category directory storage", popularity: 9e5 },
      { ico: "history", name: "time clock history watch schedule recent", popularity: 9e5 },
      { ico: "settings", name: "settings gear cog preferences options", popularity: 9e5 },
      { ico: "volume_up", name: "speaker audio sound volume play music", popularity: 9e5 },
      { ico: "home", name: "home house building living residence", popularity: 9e5 },
      { ico: "star", name: "star favorite rating important badge", popularity: 9e5 },
      { ico: "restaurant", name: "food burger eat dining restaurant meal", popularity: 8e5 },
      { ico: "local_pizza", name: "pizza slice Italian food dinner", popularity: 8e5 },
      { ico: "local_cafe", name: "coffee tea drink cup beverage morning", popularity: 8e5 },
      { ico: "directions_car", name: "car vehicle travel drive transport automobile", popularity: 8e5 },
      { ico: "flight", name: "airplane flight travel vacation fly", popularity: 8e5 },
      { ico: "sports_esports", name: "game play controller fun hobby entertainment", popularity: 8e5 },
      { ico: "medical_services", name: "doctor medical hospital stethoscope health illness", popularity: 8e5 },
      { ico: "medication", name: "pill medicine drug prescription pharmacy health", popularity: 8e5 },
      { ico: "shopping_cart", name: "shopping cart store groceries market buy", popularity: 8e5 },
      { ico: "music_note", name: "music note song audio melody rhythm", popularity: 8e5 },
      { ico: "lightbulb", name: "idea lightbulb bright thought electricity", popularity: 8e5 },
      { ico: "pets", name: "pets dog cat animal paw footprint", popularity: 8e5 },
      { ico: "call", name: "phone call contact telephone dial", popularity: 8e5 },
      { ico: "favorite", name: "heart love like care feeling emotion", popularity: 8e5 },
      { ico: "sentiment_satisfied", name: "happy smile face joy glad emotion good", popularity: 8e5 },
      { ico: "sentiment_dissatisfied", name: "sad cry tears upset unhappy feeling", popularity: 8e5 },
      { ico: "bed", name: "sleep tired nap rest bed exhausted", popularity: 8e5 },
      { ico: "priority_high", name: "exclamation alert attention warning important", popularity: 8e5 },
      { ico: "help", name: "question ask help query doubt what", popularity: 8e5 },
      { ico: "workspace_premium", name: "glowing star bright excellent winner", popularity: 8e5 },
      { ico: "celebration", name: "party celebration congrats birthday festive", popularity: 8e5 },
      { ico: "visibility", name: "eyes look see watch observe vision", popularity: 8e5 },
      { ico: "hearing", name: "ear listen hear sound deaf auditory", popularity: 8e5 },
      { ico: "psychology", name: "brain mind think psychology intelligence idea", popularity: 8e5 },
      { ico: "bolt", name: "lightning fast power energy electric speed", popularity: 8e5 },
      { ico: "trophy", name: "trophy win award achievement success goal", popularity: 8e5 },
      { ico: "edit", name: "note write pencil text edit document", popularity: 8e5 },
      { ico: "push_pin", name: "pin tack location assign fix remember", popularity: 8e5 },
      { ico: "delete", name: "trash garbage delete remove dispose clear", popularity: 8e5 },
      { ico: "key", name: "key lock password access security safe", popularity: 8e5 },
      { ico: "directions_walk", name: "walk pedestrian go step move exercise", popularity: 8e5 },
      { ico: "thumb_up", name: "thumbs up yes approve like good okay", popularity: 8e5 },
      { ico: "thumb_down", name: "thumbs down no disapprove bad reject", popularity: 8e5 },
      { ico: "recycling", name: "recycle reuse environment arrows", popularity: 8e5 }
    ];

    // ==================== CORE HELPERS ====================
    const $ = (id) => document.getElementById(id);
    const $$ = (sel, root = document) => root.querySelectorAll(sel);
    const trim = (v) => (v == null ? "" : String(v)).trim();
    const generateId = () => Math.random().toString(36).slice(2, 11);
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const lsGet = (key, fallback = null) => {
      try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (_) { return fallback; }
    };
    const lsSet = (key, val) => { try { localStorage.setItem(key, val); } catch (_) {} };
    const lsDel = (key) => { try { localStorage.removeItem(key); } catch (_) {} };
    const lsGetJson = (key, fallback) => {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null || raw === "") return fallback;
        return JSON.parse(raw);
      } catch (_) { return fallback; }
    };
    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    /** Race a promise against a timeout without leaving unhandled rejections. */
    const withTimeout = (promise, ms, label = "timeout") => {
      let timer = null;
      let settled = false;
      return new Promise((resolve, reject) => {
        const settle = (fn, value) => {
          if (settled) return;
          settled = true;
          if (timer != null) clearTimeout(timer);
          fn(value);
        };
        timer = setTimeout(() => settle(reject, new Error(label)), ms);
        Promise.resolve(promise).then(
          (v) => settle(resolve, v),
          (e) => settle(reject, e)
        );
      });
    };
    const escapeHtml = (s) => String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const asArray = (v) => (Array.isArray(v) ? v : []);
    const mapSymbol = (raw, fallback = "") => {
      const s = trim(raw);
      return SYMBOL_MIGRATION_MAP[s] || s || fallback;
    };

    // DOM References
    const sidebar = $("sidebar");
    const displayInput = $("display-input");
    const soundCanvas = $("sound-canvas");
    const modalOverlay = $("modal-overlay");
    const speakBtn = $("speak-btn");
    const audioActionsBar = $("generated-audio-actions");
    const modelSelect = $("model-select");
    const volumeSlider = $("volume-slider");
    const speedSlider = $("speed-slider");
    const stabilitySlider = $("stability-slider");
    const similaritySlider = $("similarity-slider");
    const valVolume = $("val-volume");
    /** Gain multipliers for Volume Percent stops 1–10 → 100%…1000%. */
    const VOLUME_STOP_COUNT = 10;
    const VOLUME_STOP_GAINS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const VOLUME_GAIN_MAX = VOLUME_STOP_GAINS[VOLUME_STOP_GAINS.length - 1];

    function getVolumeStop() {
      const raw = parseInt(volumeSlider?.value, 10);
      if (!Number.isFinite(raw)) return 3;
      return clamp(raw, 1, VOLUME_STOP_COUNT);
    }

    /** Audio gain for the current volume stop (1…10). */
    function getVolumeGain() {
      return VOLUME_STOP_GAINS[getVolumeStop() - 1];
    }

    /** Display percent for a stop: 100, 200, …, 1000. */
    function volumeStopToPercent(stop) {
      const s = clamp(stop, 1, VOLUME_STOP_COUNT);
      return Math.round(VOLUME_STOP_GAINS[s - 1] * 100);
    }
    const valSpeed = $("val-speed");
    const valStability = $("val-stability");
    const valSimilarity = $("val-similarity");
    const fontDisplay = $("font-display");

    // State Variables
    let activeBrowserVoiceIndex = (() => {
      const raw = lsGet("aac_browser_voice_index", "");
      if (raw === "" || raw == null) return "";
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? "" : n;
    })();
    let activeElevenVoiceId = lsGet("elevenlabs_voice", "") || "";
    /** Audio output deviceId for setSinkId ("" = system default). */
    let activeOutputDeviceId = lsGet("aac_output_device", "") || "";
    let currentFontSize = parseInt(lsGet("aac_font_size", "40"), 10) || 40;
    let currentTheme = lsGet("aac_theme", "system") || "system";
    let customAccentColor = lsGet("aac_accent_color", "") || "";
    /** Saved caret in #display-input so programmatic refocus restores it. */
    let savedDisplaySelection = { start: null, end: null };
    /** Active Web Audio buffer sources (stop previous speech when starting new). */
    let activeBufferSources = [];

    function saveDisplaySelection() {
      // On blur, activeElement has already left the textarea; still read selection from it.
      try {
        savedDisplaySelection = {
          start: displayInput.selectionStart,
          end: displayInput.selectionEnd
        };
      } catch (_) {}
    }

    /** Return keyboard focus to the main text display and restore caret. */
    function focusDisplayInput() {
      requestAnimationFrame(() => {
        try {
          displayInput.focus({ preventScroll: true });
          const len = displayInput.value.length;
          let start = savedDisplaySelection.start;
          let end = savedDisplaySelection.end;
          if (start == null || end == null) {
            start = end = len;
          } else {
            start = Math.max(0, Math.min(start, len));
            end = Math.max(0, Math.min(end, len));
          }
          displayInput.setSelectionRange(start, end);
        } catch (_) {
          try { displayInput.focus(); } catch (__) {}
        }
      });
    }

    displayInput.addEventListener("blur", saveDisplaySelection);
    // selectionchange is a document-level event
    document.addEventListener("selectionchange", () => {
      if (document.activeElement === displayInput) saveDisplaySelection();
    });

    let iconFill = parseInt(lsGet("aac_icon_fill", "0"), 10) || 0;
    let iconWght = parseInt(lsGet("aac_icon_wght", "400"), 10) || 400;
    let iconGrad = parseInt(lsGet("aac_icon_grad", "0"), 10) || 0;
    let iconOpsz = parseInt(lsGet("aac_icon_opsz", "24"), 10) || 24;
    let initialIconStyles = {};

    function applyGlobalIconStyles() {
      document.documentElement.style.setProperty("--icon-fill", iconFill);
      document.documentElement.style.setProperty("--icon-wght", iconWght);
      document.documentElement.style.setProperty("--icon-grad", iconGrad);
      document.documentElement.style.setProperty("--icon-opsz", iconOpsz);

      const fillBtn = document.getElementById("studio-fill-btn");
      if (fillBtn) fillBtn.textContent = iconFill ? "Filled (1)" : "Outlined (0)";
      document.getElementById("studio-wght-slider").value = iconWght;
      document.getElementById("studio-val-wght").textContent = iconWght;
      document.getElementById("studio-grad-slider").value = iconGrad;
      document.getElementById("studio-val-grad").textContent = iconGrad;
      document.getElementById("studio-opsz-slider").value = iconOpsz;
      document.getElementById("studio-val-opsz").textContent = iconOpsz;
    }

    // First visit (no aac_tabs): seed Everyday starter phrases. Existing saves unchanged.
    const savedTopicsRaw = lsGetJson("aac_tabs", null);
    let topicsList = normalizeTopicsList(
      savedTopicsRaw != null ? savedTopicsRaw : createStarterTopicsRaw()
    );
    if (savedTopicsRaw == null) {
      try { lsSet("aac_tabs", JSON.stringify(topicsList)); } catch (_) {}
    }
    let activeTopicId = lsGet("aac_active_tab") || topicsList[0].id;
    if (!topicsList.find(t => t.id === activeTopicId)) activeTopicId = topicsList[0].id;

    let audioHistory = asArray(lsGetJson("aac_history", []));
    let isOverwriteMode = false;
    let editingButtonId = null;
    let editingButtonTopicId = null;
    /** 1-based position draft while the button edit modal is open */
    let modalButtonIndex = 1;
    let modalButtonIndexMax = 1;
    let editingTopicId = null;
    /** Draft grid size while the topic edit modal is open */
    let modalGridCols = DEFAULT_GRID_COLS;
    let modalGridRows = DEFAULT_GRID_ROWS;
    let targetStudioInputId = null;
    let selectedStudioIcon = null;
    let lastGeneratedAudio = null;

    // ==================== DATA NORMALIZATION ====================
    function normalizeButton(btn, index = 0) {
      const col = Number.isFinite(btn.col) ? btn.col : (Number.isFinite(btn.x) ? Math.max(0, Math.floor(btn.x / 100)) : (index % DEFAULT_GRID_COLS));
      const row = Number.isFinite(btn.row) ? btn.row : (Number.isFinite(btn.y) ? Math.max(0, Math.floor(btn.y / 80)) : Math.floor(index / DEFAULT_GRID_COLS));
      const utteranceText = trim(btn.utteranceText) || null;
      const sourceText = trim(btn.sourceText || utteranceText || btn.text || btn.label) || null;
      return {
        id: btn.id || generateId(),
        label: btn.label || "Button",
        symbol: mapSymbol(btn.symbol || btn.icon),
        color: btn.color || COLOR_PALETTE[index % COLOR_PALETTE.length],
        audioData: utteranceText ? null : (btn.audioData || null),
        utteranceText,
        sourceText,
        effectsBaked: !!btn.effectsBaked,
        col, row,
        colSpan: clamp(btn.colSpan || 1, 1, 12),
        rowSpan: clamp(btn.rowSpan || 1, 1, 8)
      };
    }

    /**
     * Canonical speech/history item (history, assign, restore, lastGeneratedAudio).
     * utteranceText wins over audioData (live regen). effectsBaked only with a clip.
     */
    function makeSpeechItem({
      text = "",
      model = null,
      voiceId = null,
      audioData = null,
      utteranceText = null,
      effectsBaked = false,
      id = null,
      withTimestamp = false
    } = {}) {
      const phrase = trim(text);
      const utt = trim(utteranceText) || null;
      const clip = utt ? null : (audioData || null);
      const item = {
        id: id || generateId(),
        text: phrase,
        model: model || null,
        voiceId: voiceId || null,
        audioData: clip,
        utteranceText: utt,
        effectsBaked: !!(effectsBaked && clip)
      };
      if (withTimestamp) {
        item.timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return item;
    }

    function isUtteranceSource(item) {
      if (!item) return false;
      if (trim(item.utteranceText)) return true;
      return item.model === "browser_tts" && trim(item.text) && !item.audioData;
    }

    function getUtteranceText(item) {
      return item ? trim(item.utteranceText || item.text) : "";
    }

    function getButtonSourceText(btn) {
      return btn ? trim(btn.sourceText || btn.utteranceText || btn.text || btn.label) : "";
    }

    function canUseGeneratedActions(item) {
      return !!(item && (item.audioData || isUtteranceSource(item)));
    }

    function canAssignFromDisplay() {
      return trim(getText()).length > 0;
    }

    function getAssignSource() {
      const text = trim(getText());
      if (!text) return null;
      if (canUseGeneratedActions(lastGeneratedAudio) && trim(lastGeneratedAudio.text) === text) {
        return lastGeneratedAudio;
      }
      return makeSpeechItem({
        text,
        utteranceText: text,
        model: "browser_tts",
        effectsBaked: false
      });
    }

    /**
     * Starter boards for first visit — three topics × 12 live utterance buttons each
     * (regenerate with the current voice on play).
     */
    function createStarterTopicsRaw() {
      const cols = 4;
      const makeButtons = (phrases, idPrefix) => phrases.map((p, i) => ({
        id: `${idPrefix}-${i}`,
        label: p.label,
        symbol: p.symbol,
        color: COLOR_PALETTE[i % COLOR_PALETTE.length],
        utteranceText: p.text,
        sourceText: p.text,
        audioData: null,
        effectsBaked: false,
        col: i % cols,
        row: Math.floor(i / cols),
        colSpan: 1,
        rowSpan: 1
      }));

      const everydayPhrases = [
        { label: "Hello", symbol: "waving_hand", text: "Hello" },
        { label: "How are you?", symbol: "chat", text: "How are you?" },
        { label: "Yes", symbol: "thumb_up", text: "Yes" },
        { label: "No", symbol: "thumb_down", text: "No" },
        { label: "Please", symbol: "front_hand", text: "Please" },
        { label: "Thank you", symbol: "favorite", text: "Thank you" },
        { label: "You're welcome", symbol: "volunteer_activism", text: "You're welcome" },
        { label: "Sorry", symbol: "sentiment_dissatisfied", text: "I'm sorry" },
        { label: "Wait", symbol: "hourglass_empty", text: "Please wait" },
        { label: "More", symbol: "add", text: "More please" },
        { label: "Stop", symbol: "stop_circle", text: "Stop" },
        { label: "Don't know", symbol: "help", text: "I don't know" }
      ];

      const needsPhrases = [
        { label: "Help", symbol: "emergency_home", text: "I need help" },
        { label: "I'm OK", symbol: "sentiment_satisfied", text: "I'm okay" },
        { label: "Bathroom", symbol: "wc", text: "I need the bathroom" },
        { label: "Water", symbol: "water_drop", text: "I would like some water" },
        { label: "Hungry", symbol: "restaurant", text: "I'm hungry" },
        { label: "Thirsty", symbol: "local_cafe", text: "I'm thirsty" },
        { label: "Pain", symbol: "healing", text: "I'm in pain" },
        { label: "Tired", symbol: "bed", text: "I'm tired" },
        { label: "Cold", symbol: "ac_unit", text: "I'm cold" },
        { label: "Hot", symbol: "thermometer", text: "I'm hot" },
        { label: "Medicine", symbol: "medication", text: "I need my medicine" },
        { label: "Break", symbol: "pause_circle", text: "I need a break" }
      ];

      const feelingsPhrases = [
        { label: "Happy", symbol: "sentiment_satisfied", text: "I'm happy" },
        { label: "Sad", symbol: "sentiment_dissatisfied", text: "I'm sad" },
        { label: "Angry", symbol: "priority_high", text: "I'm angry" },
        { label: "Scared", symbol: "visibility", text: "I'm scared" },
        { label: "Worried", symbol: "psychology", text: "I'm worried" },
        { label: "Excited", symbol: "celebration", text: "I'm excited" },
        { label: "Frustrated", symbol: "bolt", text: "I'm frustrated" },
        { label: "Bored", symbol: "hourglass_empty", text: "I'm bored" },
        { label: "Lonely", symbol: "person", text: "I feel lonely" },
        { label: "Love you", symbol: "favorite", text: "I love you" },
        { label: "Confused", symbol: "help", text: "I'm confused" },
        { label: "Calm", symbol: "spa", text: "I feel calm" }
      ];

      return [
        {
          id: "starter-everyday",
          name: "Everyday",
          icon: "chat",
          color: "#8ab4f8",
          gridCols: cols,
          gridRows: Math.ceil(everydayPhrases.length / cols),
          buttons: makeButtons(everydayPhrases, "starter-everyday")
        },
        {
          id: "starter-needs",
          name: "Needs",
          icon: "medical_services",
          color: "#f2b8b5",
          gridCols: cols,
          gridRows: Math.ceil(needsPhrases.length / cols),
          buttons: makeButtons(needsPhrases, "starter-needs")
        },
        {
          id: "starter-feelings",
          name: "Feelings",
          icon: "sentiment_satisfied",
          color: "#81c784",
          gridCols: cols,
          gridRows: Math.ceil(feelingsPhrases.length / cols),
          buttons: makeButtons(feelingsPhrases, "starter-feelings")
        }
      ];
    }

    function loadStarterPhrasesIntoActiveTopic() {
      const tab = getActiveTopic();
      if (!tab) return;
      const starter = createStarterTopicsRaw()[0];
      tab.name = tab.name || starter.name;
      tab.gridCols = starter.gridCols;
      tab.gridRows = starter.gridRows;
      tab.buttons = starter.buttons.map((b, i) => normalizeButton({ ...b, id: generateId() }, i));
      commitTopicsUi();
      focusDisplayInput();
    }

    function normalizeTopicsList(rawList) {
      if (!Array.isArray(rawList) || rawList.length === 0) {
        return normalizeTopicsList(createStarterTopicsRaw());
      }
      return rawList.map((topic, idx) => ({
        id: topic.id || generateId(),
        name: topic.name || `Topic ${idx + 1}`,
        icon: mapSymbol(topic.icon, "folder"),
        color: topic.color || COLOR_PALETTE[idx % COLOR_PALETTE.length],
        gridCols: clamp(parseInt(topic.gridCols, 10) || DEFAULT_GRID_COLS, 1, 12),
        gridRows: clamp(parseInt(topic.gridRows, 10) || DEFAULT_GRID_ROWS, 1, 8),
        buttons: Array.isArray(topic.buttons) ? topic.buttons.map((btn, bIdx) => normalizeButton(btn, bIdx)) : []
      }));
    }

    function getActiveTopic() { return topicsList.find(t => t.id === activeTopicId); }
    function saveTopicsList() { lsSet("aac_tabs", JSON.stringify(topicsList)); }
    function saveHistory() { lsSet("aac_history", JSON.stringify(audioHistory)); }
    function commitTopicsUi() {
      saveTopicsList();
      renderTopics();
      renderSoundButtons();
    }

    // ==================== EXPORT / IMPORT BOARDS ====================
    const BOARD_EXPORT_FORMAT = "aac-workspace";
    const BOARD_EXPORT_VERSION = 1;

    /** Serializable button: keep clips, drop nothing needed for restore. */
    function exportButtonPayload(btn) {
      return {
        id: btn.id,
        label: btn.label,
        symbol: btn.symbol || "",
        color: btn.color,
        sourceText: btn.sourceText || null,
        utteranceText: btn.utteranceText || null,
        audioData: btn.audioData || null,
        effectsBaked: !!btn.effectsBaked,
        col: btn.col,
        row: btn.row,
        colSpan: btn.colSpan,
        rowSpan: btn.rowSpan
      };
    }

    function exportTopicPayload(topic) {
      return {
        id: topic.id,
        name: topic.name,
        icon: topic.icon,
        color: topic.color,
        gridCols: topic.gridCols,
        gridRows: topic.gridRows,
        buttons: (topic.buttons || []).map(exportButtonPayload)
      };
    }

    function buildBoardExport() {
      return {
        format: BOARD_EXPORT_FORMAT,
        version: BOARD_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        activeTopicId,
        topics: topicsList.map(exportTopicPayload),
        settings: {
          theme: currentTheme,
          accentColor: customAccentColor || "",
          fontSize: currentFontSize,
          model: modelSelect?.value || "browser_tts",
          speed: speedSlider?.value || "1",
          volume: volumeSlider?.value || "3",
          stability: stabilitySlider?.value || "0.5",
          similarity: similaritySlider?.value || "0.75",
          iconFill,
          iconWght,
          iconGrad,
          iconOpsz
          // API key intentionally omitted
        },
        // Text-only recents for convenience across devices
        recentPhrases: Array.isArray(recentPhrases) ? recentPhrases.slice() : []
      };
    }

    function downloadBoardExport() {
      try {
        let payload = buildBoardExport();
        let json;
        try {
          json = JSON.stringify(payload, null, 2);
        } catch (_) {
          // Huge baked audio can blow the stringifier — export text/utterance only
          payload = buildBoardExport();
          payload.topics = (payload.topics || []).map((topic) => ({
            ...topic,
            buttons: (topic.buttons || []).map((b) => ({
              ...b,
              audioData: null,
              utteranceText: b.utteranceText || b.sourceText || b.label || null,
              sourceText: b.sourceText || b.utteranceText || b.label || null,
              effectsBaked: false
            }))
          }));
          payload.exportNote = "Audio clips omitted (file too large); phrases export as live text.";
          json = JSON.stringify(payload, null, 2);
        }
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `aac-workspace-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 1500);
      } catch (err) {
        alert("Could not export boards. Try removing large audio clips first.");
      }
    }

    function applyImportedSettings(settings) {
      if (!settings || typeof settings !== "object") return;
      if (settings.theme) applyTheme(settings.theme);
      if (Object.prototype.hasOwnProperty.call(settings, "accentColor")) {
        applyAccentColor(settings.accentColor || "");
      }
      if (Number.isFinite(Number(settings.fontSize))) {
        currentFontSize = clamp(parseInt(settings.fontSize, 10) || 40, 16, 48);
        lsSet("aac_font_size", currentFontSize);
        applyDisplayFontSize();
      }
      if (settings.model && modelSelect) {
        modelSelect.value = settings.model;
        lsSet("elevenlabs_model", settings.model);
        modelSelect.dispatchEvent(new Event("change"));
      }
      const fireSlider = (el, value) => {
        if (!el || value == null || value === "") return;
        el.value = value;
        el.dispatchEvent(new Event("input"));
      };
      fireSlider(speedSlider, settings.speed);
      if (settings.volume != null && settings.volume !== "" && volumeSlider) {
        const n = parseFloat(settings.volume);
        // Accept stop 1–10 (or legacy values) → nearest stop
        fireSlider(volumeSlider, Number.isFinite(n) ? String(clamp(Math.round(n), 1, VOLUME_STOP_COUNT)) : settings.volume);
      }
      fireSlider(stabilitySlider, settings.stability);
      fireSlider(similaritySlider, settings.similarity);
      if (settings.iconFill != null) iconFill = parseInt(settings.iconFill, 10) || 0;
      if (settings.iconWght != null) iconWght = parseInt(settings.iconWght, 10) || 400;
      if (settings.iconGrad != null) iconGrad = parseInt(settings.iconGrad, 10) || 0;
      if (settings.iconOpsz != null) iconOpsz = parseInt(settings.iconOpsz, 10) || 24;
      lsSet("aac_icon_fill", iconFill);
      lsSet("aac_icon_wght", iconWght);
      lsSet("aac_icon_grad", iconGrad);
      lsSet("aac_icon_opsz", iconOpsz);
      applyGlobalIconStyles();
    }

    function mergeTopicsFromImport(incomingList) {
      const incoming = normalizeTopicsList(incomingList);
      incoming.forEach((inc) => {
        const existing = topicsList.find(t => t.id === inc.id)
          || topicsList.find(t => (t.name || "").toLowerCase() === (inc.name || "").toLowerCase());
        if (!existing) {
          // Fresh topic — keep ids or assign new ones if collision
          if (topicsList.some(t => t.id === inc.id)) {
            inc.id = generateId();
          }
          topicsList.push(inc);
          return;
        }
        // Merge buttons into matching topic
        const byId = new Map(existing.buttons.map(b => [b.id, b]));
        (inc.buttons || []).forEach((btn) => {
          if (byId.has(btn.id)) {
            Object.assign(byId.get(btn.id), btn);
          } else {
            const copy = { ...btn, id: generateId() };
            existing.buttons.push(normalizeButton(copy, existing.buttons.length));
          }
        });
        existing.gridCols = Math.max(existing.gridCols || 1, inc.gridCols || 1);
        existing.gridRows = Math.max(existing.gridRows || 1, inc.gridRows || 1);
        if (inc.icon) existing.icon = inc.icon;
        if (inc.color) existing.color = inc.color;
        repackSequentialGrid(existing);
      });
    }

    /**
     * @param {object} data
     * @param {"replace"|"merge"} mode
     */
    function importBoardFromObject(data, mode = "replace") {
      if (!data || typeof data !== "object") throw new Error("Invalid file");
      if (data.format && data.format !== BOARD_EXPORT_FORMAT) {
        throw new Error("Not an AAC Workspace export file");
      }
      const rawTopics = Array.isArray(data.topics) ? data.topics : null;
      if (!rawTopics || !rawTopics.length) throw new Error("Export has no topics");

      const next = normalizeTopicsList(rawTopics);
      if (!next.length) throw new Error("No valid topics in file");

      if (mode === "merge") {
        mergeTopicsFromImport(next);
      } else {
        topicsList = next;
      }

      const preferred = data.activeTopicId;
      activeTopicId = topicsList.find(t => t.id === preferred)?.id || topicsList[0].id;
      expandedTopicIds = new Set([activeTopicId]);
      lsSet("aac_active_tab", activeTopicId);
      saveTopicsList();

      if (data.settings && mode === "replace") applyImportedSettings(data.settings);

      if (Array.isArray(data.recentPhrases)) {
        if (mode === "merge") {
          data.recentPhrases.forEach((t) => {
            const phrase = trim(t);
            if (!phrase) return;
            recentPhrases = recentPhrases.filter(x => x !== phrase);
            recentPhrases.unshift(phrase);
          });
          if (recentPhrases.length > RECENTS_MAX) recentPhrases.length = RECENTS_MAX;
        } else {
          recentPhrases = data.recentPhrases
            .map(t => trim(t))
            .filter(Boolean)
            .slice(0, RECENTS_MAX);
        }
        saveRecentPhrases();
        renderRecentsStrip();
      }

      commitTopicsUi();
      updateSettingsVisibility();
      focusDisplayInput();
      announceLive(mode === "merge" ? "Boards merged" : "Boards replaced");
    }

    let pendingImportData = null;

    async function parseImportFile(file) {
      if (!file) return null;
      const text = await file.text();
      try {
        return JSON.parse(text);
      } catch (_) {
        throw new Error("File is not valid JSON");
      }
    }

    document.getElementById("export-board-btn")?.addEventListener("click", () => {
      downloadBoardExport();
    });
    document.getElementById("import-board-btn")?.addEventListener("click", () => {
      document.getElementById("import-board-file")?.click();
    });
    document.getElementById("import-board-file")?.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        pendingImportData = await parseImportFile(file);
        openModal("modal-import-choice");
      } catch (err) {
        pendingImportData = null;
        alert(err?.message || "Could not import boards.");
      }
    });
    document.getElementById("import-merge-btn")?.addEventListener("click", () => {
      if (!pendingImportData) return;
      try {
        importBoardFromObject(pendingImportData, "merge");
        pendingImportData = null;
        closeModals();
      } catch (err) {
        alert(err?.message || "Could not merge boards.");
      }
    });
    document.getElementById("import-replace-btn")?.addEventListener("click", () => {
      if (!pendingImportData) return;
      if (!confirm("Replace will remove all current topics and buttons on this device. Continue?")) return;
      try {
        importBoardFromObject(pendingImportData, "replace");
        pendingImportData = null;
        closeModals();
      } catch (err) {
        alert(err?.message || "Could not replace boards.");
      }
    });

    function getDefaultAccentForResolvedTheme() {
      const resolved = document.documentElement.getAttribute("data-theme") || "dark";
      return resolved === "light" ? "#0b57d0" : "#8ab4f8";
    }

    function accentHoverFrom(hex) {
      // Lighten custom accent slightly for hover states
      const m = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
      if (!m) return hex;
      const n = parseInt(m[1], 16);
      const r = Math.min(255, ((n >> 16) & 255) + 28);
      const g = Math.min(255, ((n >> 8) & 255) + 28);
      const b = Math.min(255, (n & 255) + 28);
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    function applyAccentColor(color, { persist = true } = {}) {
      const root = document.documentElement;
      if (color) {
        customAccentColor = color;
        root.style.setProperty("--accent", color);
        root.style.setProperty("--accent-hover", accentHoverFrom(color));
        if (persist) lsSet("aac_accent_color", color);
      } else {
        customAccentColor = "";
        root.style.removeProperty("--accent");
        root.style.removeProperty("--accent-hover");
        if (persist) lsDel("aac_accent_color");
      }
      const picker = document.getElementById("accent-color-picker");
      if (picker) picker.value = customAccentColor || getDefaultAccentForResolvedTheme();
    }

    function syncThemeColorMeta() {
      const resolved = document.documentElement.getAttribute("data-theme") || "dark";
      const color = resolved === "light" ? "#f0f4f9" : "#131314";
      document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", color));
    }

    function applyTheme(theme) {
      currentTheme = theme;
      localStorage.setItem("aac_theme", theme);
      if (theme === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
      document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
      });
      // Re-apply custom accent (or sync picker to theme default)
      applyAccentColor(customAccentColor || "", { persist: false });
      syncThemeColorMeta();
    }

    // ==================== SIDEBAR TABS & MOBILE DRAWER ====================
    const sidebarBackdrop = document.getElementById("sidebar-backdrop");
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const MOBILE_MQ = "(max-width: 900px)";

    function isMobileLayout() {
      return window.matchMedia(MOBILE_MQ).matches;
    }

    function isSidebarOpen() {
      if (isMobileLayout()) return sidebar.classList.contains("mobile-open");
      return !sidebar.classList.contains("collapsed");
    }

    function setSidebarOpen(open, { restoreFocus = true } = {}) {
      if (isMobileLayout()) {
        sidebar.classList.toggle("mobile-open", open);
        // On mobile, keep "collapsed" unused for layout; drawer is full content
        sidebar.classList.remove("collapsed");
        if (sidebarBackdrop) {
          sidebarBackdrop.classList.toggle("open", open);
          sidebarBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
        }
        if (mobileMenuBtn) {
          mobileMenuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
          mobileMenuBtn.setAttribute("title", open ? "Close menu" : "Open menu");
        }
      } else {
        sidebar.classList.toggle("collapsed", !open);
        sidebar.classList.remove("mobile-open");
        if (sidebarBackdrop) {
          sidebarBackdrop.classList.remove("open");
          sidebarBackdrop.setAttribute("aria-hidden", "true");
        }
      }
      if (restoreFocus) focusDisplayInput();
    }

    function closeMobileSidebar() {
      if (isMobileLayout()) setSidebarOpen(false);
    }

    // ==================== HASH ROUTER (zero-build SPA) ====================
    // Sidebar panels are client routes: #/settings | #/history | #/topics
    const VALID_SIDEBAR_TABS = new Set(["settings", "history", "topics"]);
    const DEFAULT_SIDEBAR_TAB = "topics";

    function tabFromHash() {
      const raw = (location.hash || "").replace(/^#\/?/, "").split(/[/?#&]/)[0].toLowerCase();
      return VALID_SIDEBAR_TABS.has(raw) ? raw : DEFAULT_SIDEBAR_TAB;
    }

    function normalizeTab(tab) {
      return VALID_SIDEBAR_TABS.has(tab) ? tab : DEFAULT_SIDEBAR_TAB;
    }

    /** Apply sidebar panel UI without touching the URL. */
    function applySidebarTab(tab, expandIfCollapsed = false) {
      const t = normalizeTab(tab);
      if (expandIfCollapsed && !isSidebarOpen()) {
        setSidebarOpen(true, { restoreFocus: false });
      }
      document.querySelectorAll(".sidebar-tab").forEach((el) => {
        el.classList.toggle("active", el.dataset.tab === t);
      });
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      const content = document.getElementById(`tab-content-${t}`);
      if (content) content.classList.add("active");

      if (t === "history") renderHistory();
      if (t === "settings") refreshOutputDevices();
      focusDisplayInput();
      return t;
    }

    /**
     * Switch sidebar tab and sync the hash route (back/forward friendly).
     * @param {string} tab
     * @param {boolean} [expandIfCollapsed]
     * @param {{ replace?: boolean, fromRoute?: boolean }} [opts]
     */
    function switchSidebarTab(tab, expandIfCollapsed = false, opts = {}) {
      const { replace = false, fromRoute = false } = opts;
      const t = applySidebarTab(tab, expandIfCollapsed);
      if (fromRoute) return t;
      const next = `#/${t}`;
      if (location.hash === next) return t;
      if (replace) {
        const url = new URL(location.href);
        url.hash = `/${t}`;
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      } else {
        location.hash = `/${t}`;
      }
      return t;
    }

    function onRouteChange() {
      applySidebarTab(tabFromHash(), false);
    }

    window.addEventListener("hashchange", onRouteChange);

    document.querySelectorAll(".sidebar-tab").forEach((tabEl) => {
      tabEl.addEventListener("click", () => {
        const wasClosed = !isSidebarOpen();
        switchSidebarTab(tabEl.dataset.tab, wasClosed);
      });
    });

    document.getElementById("toggle-sidebar-btn").addEventListener("click", () => {
      setSidebarOpen(!isSidebarOpen());
    });

    document.getElementById("sidebar-collapse-btn")?.addEventListener("click", () => {
      setSidebarOpen(false, { restoreFocus: false });
    });

    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", () => setSidebarOpen(!isSidebarOpen()));
    }
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener("click", () => closeMobileSidebar());
    }

    // Escape closes topic mode menu / mobile drawer / voices panel
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (isModeTopicMenuOpen()) {
        setModeTopicMenuOpen(false);
        return;
      }
      const voicesPanel = document.getElementById("voices-panel");
      if (voicesPanel?.classList.contains("open")) {
        voicesPanel.classList.remove("open");
        return;
      }
      if (isMobileLayout() && isSidebarOpen()) closeMobileSidebar();
    });

    window.matchMedia(MOBILE_MQ).addEventListener("change", (e) => {
      if (e.matches) {
        // Entering mobile: start with drawer closed
        setSidebarOpen(false);
      } else {
        // Leaving mobile: restore desktop rail as expanded
        sidebar.classList.remove("mobile-open");
        if (sidebarBackdrop) sidebarBackdrop.classList.remove("open");
        sidebar.classList.remove("collapsed");
      }
    });

    // ==================== GOOGLE FONTS ICON STUDIO ====================
    /**
     * Catalog powering fonts.google.com/icons (Material Symbols + Icons).
     * Response is JSON with a )]}' anti-XSSI prefix.
     * incomplete=1 includes Material Symbols–only glyphs (e.g. recycling).
     */
    const GOOGLE_ICONS_METADATA_URL = "https://fonts.google.com/metadata/icons?incomplete=1";
    /** CORS-friendly name list if the Google metadata endpoint is blocked. */
    const MATERIAL_SYMBOLS_NAMES_URL =
      "https://raw.githubusercontent.com/marella/material-symbols/main/material-symbols/index.d.ts";
    const ICON_SEARCH_RESULT_LIMIT = 120;
    const ICON_SEARCH_DEBOUNCE_MS = 220;

    let iconStudioReturnModalId = null;
    /** @type {Array<{ico:string,name:string,popularity:number}>|null} */
    let iconCatalog = null;
    let iconCatalogSource = "local"; // "google" | "github" | "local"
    let iconCatalogLoadPromise = null;
    let iconSearchTimer = null;
    let iconSearchRequestId = 0;

    function parseGoogleIconsMetadata(text) {
      let raw = String(text || "").trim();
      // Google Fonts prefixes JSON with )]}' to discourage naive XSSI
      if (raw.startsWith(")]}'")) {
        const brace = raw.indexOf("{");
        if (brace >= 0) raw = raw.slice(brace);
      }
      const data = JSON.parse(raw);
      const icons = Array.isArray(data.icons) ? data.icons : [];
      return icons.map((icon) => {
        const ico = String(icon.name || "").trim();
        const tags = Array.isArray(icon.tags) ? icon.tags : [];
        const cats = Array.isArray(icon.categories) ? icon.categories : [];
        const haystack = [ico, ...tags, ...cats].join(" ").toLowerCase();
        return {
          ico,
          name: haystack,
          popularity: Number(icon.popularity) || 0
        };
      }).filter((item) => item.ico);
    }

    function parseMaterialSymbolsNamesDts(text) {
      const names = [];
      const re = /"([a-z0-9_]+)"/g;
      let m;
      while ((m = re.exec(String(text || ""))) !== null) {
        names.push(m[1]);
      }
      // de-dupe while preserving order
      const seen = new Set();
      const out = [];
      for (const ico of names) {
        if (seen.has(ico)) continue;
        seen.add(ico);
        out.push({ ico, name: ico, popularity: 0 });
      }
      return out;
    }

    async function loadIconCatalogFromGoogle() {
      const res = await fetch(GOOGLE_ICONS_METADATA_URL, {
        credentials: "omit",
        mode: "cors"
      });
      if (!res.ok) throw new Error(`Google icons metadata HTTP ${res.status}`);
      const text = await res.text();
      const list = parseGoogleIconsMetadata(text);
      if (!list.length) throw new Error("Google icons metadata empty");
      return { list, source: "google" };
    }

    async function loadIconCatalogFromGithubNames() {
      const res = await fetch(MATERIAL_SYMBOLS_NAMES_URL, {
        credentials: "omit",
        mode: "cors"
      });
      if (!res.ok) throw new Error(`Material Symbols names HTTP ${res.status}`);
      const text = await res.text();
      const list = parseMaterialSymbolsNamesDts(text);
      if (!list.length) throw new Error("Material Symbols names empty");
      return { list, source: "github" };
    }

    async function ensureIconCatalog() {
      if (iconCatalog && iconCatalog.length) {
        return { list: iconCatalog, source: iconCatalogSource };
      }
      if (iconCatalogLoadPromise) return iconCatalogLoadPromise;

      iconCatalogLoadPromise = (async () => {
        // 1) Official catalog used by fonts.google.com/icons
        try {
          const loaded = await loadIconCatalogFromGoogle();
          iconCatalog = loaded.list;
          iconCatalogSource = loaded.source;
          return loaded;
        } catch (_) { /* CORS / offline / file:// */ }

        // 2) CORS-friendly full Material Symbols name list
        try {
          const loaded = await loadIconCatalogFromGithubNames();
          iconCatalog = loaded.list;
          iconCatalogSource = loaded.source;
          return loaded;
        } catch (_) { /* network */ }

        // 3) Built-in short list
        iconCatalog = ICON_DATABASE_FALLBACK.slice();
        iconCatalogSource = "local";
        return { list: iconCatalog, source: iconCatalogSource };
      })();

      try {
        return await iconCatalogLoadPromise;
      } finally {
        iconCatalogLoadPromise = null;
      }
    }

    function filterIconCatalog(catalog, query) {
      const q = String(query || "").toLowerCase().trim();
      let list = catalog;
      if (q) {
        list = catalog.filter((item) =>
          item.ico.includes(q) || (item.name && item.name.includes(q))
        );
      }
      list = list.slice().sort((a, b) => {
        if (q) {
          const rank = (item) => {
            if (item.ico === q) return 0;
            if (item.ico.startsWith(q)) return 1;
            if (item.ico.includes(q)) return 2;
            return 3;
          };
          const ra = rank(a);
          const rb = rank(b);
          if (ra !== rb) return ra - rb;
        }
        return (b.popularity || 0) - (a.popularity || 0) || a.ico.localeCompare(b.ico);
      });
      return list.slice(0, ICON_SEARCH_RESULT_LIMIT);
    }

    function iconCatalogSourceLabel(source) {
      if (source === "google") return "fonts.google.com/icons";
      if (source === "github") return "Material Symbols (mirror)";
      return "offline favorites";
    }

    function paintIconStudioGrid(items, query, source) {
      const grid = document.getElementById("icon-studio-grid");
      if (!grid) return;
      grid.innerHTML = "";

      if (!items.length) {
        grid.innerHTML = `<div class="icon-studio-empty">No matching icons for “${escapeHtml(query || "")}”</div>`;
        return;
      }

      const frag = document.createDocumentFragment();
      items.forEach((item) => {
        const el = document.createElement("div");
        el.className = `icon-studio-item material-symbols-outlined ${item.ico === selectedStudioIcon ? "selected" : ""}`;
        el.textContent = item.ico;
        el.title = item.ico;
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", item.ico);
        const select = () => {
          grid.querySelectorAll(".icon-studio-item").forEach((o) => o.classList.remove("selected"));
          el.classList.add("selected");
          selectedStudioIcon = item.ico;
          const status = document.getElementById("icon-studio-status");
          if (status) status.textContent = `Selected: ${item.ico} · ${iconCatalogSourceLabel(source)}`;
        };
        el.addEventListener("click", select);
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select();
          }
        });
        frag.appendChild(el);
      });
      grid.appendChild(frag);

      const status = document.getElementById("icon-studio-status");
      if (status && selectedStudioIcon) {
        const qNote = query ? ` · “${query.trim()}”` : " · popular";
        status.textContent =
          `Selected: ${selectedStudioIcon}${qNote} · ${items.length} shown · ${iconCatalogSourceLabel(source)}`;
      }
    }

    async function renderIconStudioGrid(query) {
      const grid = document.getElementById("icon-studio-grid");
      if (!grid) return;
      const reqId = ++iconSearchRequestId;
      const q = String(query || "");

      if (!iconCatalog) {
        grid.innerHTML = `<div class="icon-studio-empty">Loading icons from fonts.google.com…</div>`;
      }

      try {
        const { list, source } = await ensureIconCatalog();
        if (reqId !== iconSearchRequestId) return; // stale search
        const filtered = filterIconCatalog(list, q);
        paintIconStudioGrid(filtered, q, source);
      } catch (_) {
        if (reqId !== iconSearchRequestId) return;
        paintIconStudioGrid(
          filterIconCatalog(ICON_DATABASE_FALLBACK, q),
          q,
          "local"
        );
      }
    }

    function scheduleIconStudioSearch(query) {
      clearTimeout(iconSearchTimer);
      iconSearchTimer = setTimeout(() => {
        renderIconStudioGrid(query);
      }, ICON_SEARCH_DEBOUNCE_MS);
    }

    function openIconStudio(targetInputId) {
      targetStudioInputId = targetInputId;
      const currentVal = document.getElementById(targetInputId)?.value || "chat";
      selectedStudioIcon = mapSymbol(currentVal, "chat");

      // Remember which edit modal to restore after picking an icon
      const openParent = document.querySelector(".modal.open:not(#icon-studio-modal)");
      iconStudioReturnModalId = openParent ? openParent.id : null;

      initialIconStyles = { fill: iconFill, wght: iconWght, grad: iconGrad, opsz: iconOpsz };
      const searchInput = document.getElementById("icon-search-input");
      if (searchInput) searchInput.value = "";
      document.getElementById("icon-studio-status").textContent = `Selected: ${selectedStudioIcon}`;
      applyGlobalIconStyles();
      renderIconStudioGrid("");
      openModal("icon-studio-modal");
      // Prefetch catalog as soon as studio opens
      ensureIconCatalog().catch(() => {});
    }

    function closeIconStudio(save) {
      if (!save) {
        iconFill = initialIconStyles.fill;
        iconWght = initialIconStyles.wght;
        iconGrad = initialIconStyles.grad;
        iconOpsz = initialIconStyles.opsz;
        applyGlobalIconStyles();
      }
      const returnTo = iconStudioReturnModalId;
      iconStudioReturnModalId = null;
      if (returnTo) {
        document.querySelectorAll(".modal").forEach(m => m.classList.remove("open"));
        document.getElementById(returnTo)?.classList.add("open");
        modalOverlay.classList.add("open");
        document.body.classList.add("modal-open");
      } else {
        closeModals();
      }
    }

    document.getElementById("icon-search-input").addEventListener("input", (e) => {
      scheduleIconStudioSearch(e.target.value);
    });
    document.getElementById("studio-fill-btn").addEventListener("click", () => { iconFill = iconFill ? 0 : 1; applyGlobalIconStyles(); });
    document.getElementById("studio-wght-slider").addEventListener("input", (e) => { iconWght = parseInt(e.target.value, 10); applyGlobalIconStyles(); });
    document.getElementById("studio-grad-slider").addEventListener("input", (e) => { iconGrad = parseInt(e.target.value, 10); applyGlobalIconStyles(); });
    document.getElementById("studio-opsz-slider").addEventListener("input", (e) => { iconOpsz = parseInt(e.target.value, 10); applyGlobalIconStyles(); });

    function setStudioIconSize(px, btnEl) {
      document.querySelectorAll(".icon-size-btns .size-btn").forEach(b => b.classList.remove("active"));
      btnEl.classList.add("active");
      document.querySelectorAll(".icon-studio-item").forEach(item => item.style.fontSize = `${px}px`);
    }

    document.getElementById("confirm-icon-studio-btn").addEventListener("click", () => {
      if (targetStudioInputId && selectedStudioIcon) {
        const input = document.getElementById(targetStudioInputId);
        if (input) input.value = selectedStudioIcon;
      }
      lsSet("aac_icon_fill", iconFill);
      lsSet("aac_icon_wght", iconWght);
      lsSet("aac_icon_grad", iconGrad);
      lsSet("aac_icon_opsz", iconOpsz);
      closeIconStudio(true);
    });

    // ==================== TOPICS NAVIGATION ====================
    /** Topic ids currently expanded in the Topics sidebar list (independent of active topic). */
    let expandedTopicIds = new Set([activeTopicId]);

    // ---- Compose "Mode" topic picker (Grok-style) ----
    const modeTopicBtn = document.getElementById("mode-topic-btn");
    const modeTopicMenu = document.getElementById("mode-topic-menu");
    const modeTopicLabel = document.getElementById("mode-topic-label");
    const modeTopicIcon = document.getElementById("mode-topic-icon");

    function isModeTopicMenuOpen() {
      return !!(modeTopicMenu && !modeTopicMenu.hidden);
    }

    function setModeTopicMenuOpen(open) {
      if (!modeTopicMenu || !modeTopicBtn) return;
      modeTopicMenu.hidden = !open;
      modeTopicBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) renderModeTopicMenu();
    }

    function syncModeTopicButton() {
      const topic = getActiveTopic();
      const name = topic?.name || "Topics";
      if (modeTopicLabel) modeTopicLabel.textContent = name;
      if (modeTopicIcon) modeTopicIcon.textContent = topic?.icon || "folder";
      if (modeTopicIcon && topic?.color) modeTopicIcon.style.color = topic.color;
      else if (modeTopicIcon) modeTopicIcon.style.color = "";
      if (modeTopicBtn) {
        modeTopicBtn.title = `Topic: ${name}`;
        modeTopicBtn.setAttribute("aria-label", `Switch topic — ${name}`);
      }
    }

    function renderModeTopicMenu() {
      if (!modeTopicMenu) return;
      modeTopicMenu.innerHTML = "";
      if (!topicsList.length) {
        const empty = document.createElement("div");
        empty.className = "mode-topic-empty";
        empty.textContent = "No topics yet";
        modeTopicMenu.appendChild(empty);
        return;
      }
      topicsList.forEach((topic) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `mode-topic-item${topic.id === activeTopicId ? " active" : ""}`;
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", topic.id === activeTopicId ? "true" : "false");
        btn.dataset.topicId = topic.id;
        btn.innerHTML = `
          <span class="material-symbols-outlined" style="color: ${topic.color || "inherit"};">${topic.icon || "folder"}</span>
          <span class="mode-topic-item-name">${topic.name || "Topic"}</span>
        `;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          switchTopic(topic.id);
          setModeTopicMenuOpen(false);
          focusDisplayInput();
        });
        modeTopicMenu.appendChild(btn);
      });
    }

    modeTopicBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      setModeTopicMenuOpen(!isModeTopicMenuOpen());
    });
    document.addEventListener("click", (e) => {
      if (!isModeTopicMenuOpen()) return;
      const wrap = e.target.closest?.(".compose-mode-wrap");
      if (!wrap) setModeTopicMenuOpen(false);
    });

    function renderTopics() {
      const listEl = document.getElementById("topics-list");
      listEl.innerHTML = "";
      syncModeTopicButton();

      // Drop expand state for topics that no longer exist
      expandedTopicIds = new Set([...expandedTopicIds].filter(id => topicsList.some(t => t.id === id)));

      topicsList.forEach(topic => {
        const isActive = topic.id === activeTopicId;
        const isExpanded = expandedTopicIds.has(topic.id);
        const item = document.createElement("div");
        item.className = `topic-item${isActive ? " active" : ""}${isExpanded ? " expanded" : ""}`;

        const header = document.createElement("div");
        header.className = "topic-item-header";
        header.setAttribute("role", "button");
        header.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        header.innerHTML = `
          <div class="topic-item-content">
            <span class="material-symbols-outlined topic-expand-icon icon-small">${isExpanded ? "expand_more" : "chevron_right"}</span>
            <span class="material-symbols-outlined icon-medium" style="color: ${topic.color};">${topic.icon || "folder"}</span>
            <span class="topic-item-name">${topic.name}</span>
          </div>
          <div class="topic-actions">
            <button class="nav-action-btn edit-topic-btn" type="button" title="Edit Topic Settings">
              <span class="material-symbols-outlined icon-small">edit</span>
            </button>
          </div>
        `;
        header.addEventListener("click", (e) => {
          if (e.target.closest(".edit-topic-btn")) { e.stopPropagation(); openTopicEditModal(topic.id); return; }
          toggleTopicExpanded(topic.id);
        });
        item.appendChild(header);

        // Expanded topics list their sound buttons
        if (isExpanded) {
          const buttonsList = document.createElement("div");
          buttonsList.className = "topic-buttons-list";
          const buttons = Array.isArray(topic.buttons) ? topic.buttons : [];
          if (buttons.length === 0) {
            buttonsList.innerHTML = `<div class="topic-buttons-empty">No sound buttons yet</div>`;
          } else {
            buttons.forEach(btn => {
              const row = document.createElement("div");
              row.className = "topic-sound-item";
              const symbolHtml = btn.symbol
                ? `<span class="material-symbols-outlined topic-sound-symbol">${btn.symbol}</span>`
                : "";
              row.innerHTML = `
                <span class="topic-sound-swatch" style="background-color: ${btn.color || "#8ab4f8"};"></span>
                ${symbolHtml}
                <span class="topic-sound-label">${btn.label || "Button"}</span>
                <button class="topic-sound-edit-btn" type="button" title="Edit button">
                  <span class="material-symbols-outlined icon-small">edit</span>
                </button>
              `;
              row.querySelector(".topic-sound-edit-btn")?.addEventListener("click", (e) => {
                e.stopPropagation();
                openButtonEditModal(btn.id, topic.id);
              });
              buttonsList.appendChild(row);
            });
          }
          item.appendChild(buttonsList);
        }

        listEl.appendChild(item);
      });
    }

    /** Toggle a topic's expanded state; expanding also activates it for the workspace. */
    function toggleTopicExpanded(id) {
      if (expandedTopicIds.has(id)) {
        expandedTopicIds.delete(id);
        renderTopics();
        return;
      }
      expandedTopicIds.add(id);
      if (activeTopicId !== id) {
        activeTopicId = id;
        lsSet("aac_active_tab", activeTopicId);
        renderSoundButtons();
      }
      renderTopics();
    }

    function switchTopic(id) {
      activeTopicId = id;
      lsSet("aac_active_tab", activeTopicId);
      expandedTopicIds.add(id);
      renderTopics();
      renderSoundButtons();
      closeMobileSidebar();
      focusDisplayInput();
    }

    function syncModalGridLabels() {
      const colsEl = document.getElementById("topic-cols-val");
      const rowsEl = document.getElementById("topic-rows-val");
      if (colsEl) colsEl.textContent = String(modalGridCols);
      if (rowsEl) rowsEl.textContent = String(modalGridRows);
    }

    function stepModalGrid(deltaCols, deltaRows) {
      modalGridCols = clamp(modalGridCols + deltaCols, 1, 12);
      modalGridRows = clamp(modalGridRows + deltaRows, 1, 8);
      syncModalGridLabels();
    }

    document.getElementById("add-topic-sidebar-btn").addEventListener("click", () => {
      const name = prompt("Enter new topic name:", `Topic ${topicsList.length + 1}`);
      if (name === null) return;
      const newTopic = {
        id: generateId(), name: name.trim() || "New Topic", icon: "folder",
        color: COLOR_PALETTE[topicsList.length % COLOR_PALETTE.length],
        gridCols: DEFAULT_GRID_COLS, gridRows: DEFAULT_GRID_ROWS, buttons: []
      };
      topicsList.push(newTopic); saveTopicsList(); switchTopic(newTopic.id);
      focusDisplayInput();
    });

    function normalizeToHex(col) {
      if (!col) return "";
      col = String(col).trim();
      if (col.startsWith("#")) return col;
      const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return col;
      const toHex = n => ("0" + Number(n).toString(16)).slice(-2);
      return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
    }

    /** Build palette + custom color swatches into a picker container. */
    function fillColorPicker(picker, selectedColor, fallback = "#3f3f4e") {
      if (!picker) return;
      picker.innerHTML = "";
      const selectedHex = normalizeToHex(selectedColor);
      const clearSel = () => $$(".color-option", picker).forEach(o => o.classList.remove("selected"));

      COLOR_PALETTE.forEach(col => {
        const opt = document.createElement("div");
        opt.className = `color-option${selectedHex === normalizeToHex(col) ? " selected" : ""}`;
        opt.style.backgroundColor = col;
        opt.addEventListener("click", () => { clearSel(); opt.classList.add("selected"); });
        picker.appendChild(opt);
      });

      const customOpt = document.createElement("div");
      customOpt.className = "color-option custom";
      if (selectedHex && !COLOR_PALETTE.some(c => normalizeToHex(c) === selectedHex)) {
        customOpt.classList.add("selected");
      }
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "color-picker-input";
      colorInput.value = selectedHex || fallback;
      customOpt.style.backgroundColor = colorInput.value;
      colorInput.addEventListener("input", (e) => {
        customOpt.style.backgroundColor = e.target.value;
        clearSel();
        customOpt.classList.add("selected");
      });
      customOpt.addEventListener("click", () => {
        clearSel();
        customOpt.classList.add("selected");
        colorInput.focus();
      });
      customOpt.appendChild(colorInput);
      picker.appendChild(customOpt);
    }

    function getSelectedPickerColor(pickerId) {
      const sel = document.querySelector(`#${pickerId} .color-option.selected`);
      return sel ? sel.style.backgroundColor : null;
    }

    function openTopicEditModal(topicId) {
      const topic = topicsList.find(t => t.id === topicId);
      if (!topic) return;
      editingTopicId = topicId;
      $("topic-name-input").value = topic.name;
      $("topic-icon-input").value = topic.icon || "folder";
      modalGridCols = clamp(parseInt(topic.gridCols, 10) || DEFAULT_GRID_COLS, 1, 12);
      modalGridRows = clamp(parseInt(topic.gridRows, 10) || DEFAULT_GRID_ROWS, 1, 8);
      syncModalGridLabels();
      fillColorPicker($("topic-color-picker"), topic.color);
      openModal("topic-edit-modal");
    }

    $("save-topic-meta-btn").addEventListener("click", () => {
      const topic = topicsList.find(t => t.id === editingTopicId);
      if (!topic) return;
      topic.name = trim($("topic-name-input").value) || "Untitled";
      topic.icon = mapSymbol($("topic-icon-input").value, "folder");
      const col = getSelectedPickerColor("topic-color-picker");
      if (col) topic.color = col;
      topic.gridCols = clamp(modalGridCols, 1, 12);
      topic.gridRows = clamp(modalGridRows, 1, 8);
      repackSequentialGrid(topic);
      commitTopicsUi();
      closeModals();
    });

    $("delete-topic-btn").addEventListener("click", () => {
      if (topicsList.length === 1) { alert("Cannot delete the last topic."); return; }
      if (!confirm("Are you sure you want to delete this topic and all its buttons?")) return;
      topicsList = topicsList.filter(t => t.id !== editingTopicId);
      if (!topicsList.find(t => t.id === activeTopicId)) activeTopicId = topicsList[0].id;
      commitTopicsUi();
      closeModals();
    });

    // ==================== SOUND BUTTON GRID ====================
    /** Size the canvas height to grid rows / button content (and set fixed track sizes). */
    function autosizeSoundCanvas(activeTab) {
      if (!soundCanvas || !activeTab) return;
      const cols = Math.max(1, activeTab.gridCols || 1);
      let contentRows = 0;
      (activeTab.buttons || []).forEach(b => {
        contentRows = Math.max(contentRows, (b.row || 0) + (b.rowSpan || 1));
      });
      const rows = Math.max(1, activeTab.gridRows || 1, contentRows);
      const rowHCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sound-row-height"));
      const rowH = Number.isFinite(rowHCss) && rowHCss > 0 ? rowHCss : (isMobileLayout() ? 48 : 44);
      const styles = getComputedStyle(soundCanvas);
      const gap = parseFloat(styles.rowGap || styles.gap) || (isMobileLayout() ? 4 : 4);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      const borderY = (parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.borderBottomWidth) || 0);
      const height = padY + borderY + rows * rowH + Math.max(0, rows - 1) * gap;

      soundCanvas.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      soundCanvas.style.gridTemplateRows = `repeat(${rows}, ${rowH}px)`;
      soundCanvas.style.gridAutoRows = `${rowH}px`;
      soundCanvas.style.height = `${height}px`;
    }

    function renderSoundButtons() {
      const activeTab = getActiveTopic();
      if (!activeTab) return;
      soundCanvas.innerHTML = "";

      if (!Array.isArray(activeTab.buttons) || activeTab.buttons.length === 0) {
        // Empty board: single-cell CTA instead of a blank grid
        soundCanvas.style.gridTemplateColumns = "1fr";
        soundCanvas.style.gridTemplateRows = "auto";
        soundCanvas.style.gridAutoRows = "auto";
        soundCanvas.style.height = "auto";
        soundCanvas.style.minHeight = "120px";
        const empty = document.createElement("div");
        empty.className = "sound-canvas-empty";
        empty.innerHTML = `
          <div class="sound-canvas-empty-title">No sound buttons yet</div>
          <div class="sound-canvas-empty-text">
            Type a phrase below, speak it, then use <strong>Assign to Button</strong> —
            or load starter everyday phrases.
          </div>
          <div class="sound-canvas-empty-actions">
            <button type="button" class="status-btn" id="empty-load-starters-btn">
              <span class="material-symbols-outlined icon-small icon-btn-margin">auto_awesome</span>
              Load starter phrases
            </button>
            <button type="button" class="status-btn" id="empty-focus-display-btn">
              <span class="material-symbols-outlined icon-small icon-btn-margin">edit</span>
              Type a phrase
            </button>
          </div>
        `;
        empty.querySelector("#empty-load-starters-btn")?.addEventListener("click", () => {
          loadStarterPhrasesIntoActiveTopic();
        });
        empty.querySelector("#empty-focus-display-btn")?.addEventListener("click", () => {
          focusDisplayInput();
        });
        soundCanvas.appendChild(empty);
        return;
      }

      soundCanvas.style.minHeight = "";
      autosizeSoundCanvas(activeTab);

      activeTab.buttons.forEach(btnData => {
        const isUtteranceBtn = !!(btnData.utteranceText || "").trim();
        const btnColor = btnData.color || "#3f3f4e";
        const btnEl = document.createElement("div");
        btnEl.className = `sound-button${isOverwriteMode ? " overwrite-target" : ""}${isUtteranceBtn ? " utterance-button" : ""}${!isOverwriteMode ? " speak-layout" : ""}`;
        btnEl.id = `btn-${btnData.id}`;
        btnEl.style.gridColumn = `${btnData.col + 1} / span ${btnData.colSpan}`;
        btnEl.style.gridRow = `${btnData.row + 1} / span ${btnData.rowSpan}`;
        if (isUtteranceBtn) {
          btnEl.style.backgroundColor = "transparent";
          btnEl.style.borderColor = btnColor;
          btnEl.style.color = btnColor;
        } else {
          btnEl.style.backgroundColor = btnColor;
        }

        const symbolPart = btnData.symbol
          ? `<span class="material-symbols-outlined sound-button-symbol">${btnData.symbol}</span>`
          : "";
        const label = btnData.label || "Button";
        const insertText = getButtonSourceText(btnData) || trim(btnData.label) || "";

        if (isOverwriteMode) {
          btnEl.innerHTML = `
            <div class="sound-button-inner" style="width:100%;padding:0 8px;">
              ${symbolPart}
              <div class="sound-button-label">${label}</div>
            </div>
          `;
          btnEl.addEventListener("click", () => executeOverwrite(btnData.id));
        } else {
          // Main area speaks; tiny + inserts into the message
          btnEl.innerHTML = `
            <button type="button" class="sound-button-main" title="Speak" aria-label="Speak ${label}">
              <div class="sound-button-inner">
                ${symbolPart}
                <div class="sound-button-label">${label}</div>
              </div>
            </button>
            <button type="button" class="sound-button-insert" title="Insert into message" aria-label="Insert ${label} into message">
              <span class="material-symbols-outlined">add</span>
            </button>
          `;
          btnEl.querySelector(".sound-button-main")?.addEventListener("click", (e) => {
            e.stopPropagation();
            playSpeechSource(btnData);
          });
          btnEl.querySelector(".sound-button-insert")?.addEventListener("click", (e) => {
            e.stopPropagation();
            insertTextAtDisplayCaret(insertText);
            announceLive(`Inserted ${label}`);
          });
        }
        soundCanvas.appendChild(btnEl);
      });
    }

    function syncModalButtonIndexLabels() {
      const valEl = document.getElementById("button-index-val");
      const hintEl = document.getElementById("button-index-hint");
      if (valEl) valEl.textContent = String(modalButtonIndex);
      if (hintEl) {
        hintEl.textContent = modalButtonIndexMax <= 0
          ? "No buttons"
          : `${modalButtonIndex} of ${modalButtonIndexMax} (1 = first)`;
      }
      const downBtn = document.getElementById("button-index-down");
      const upBtn = document.getElementById("button-index-up");
      if (downBtn) downBtn.disabled = modalButtonIndex <= 1;
      if (upBtn) upBtn.disabled = modalButtonIndex >= modalButtonIndexMax;
    }

    function stepModalButtonIndex(delta) {
      if (modalButtonIndexMax <= 0) return;
      modalButtonIndex = clamp(modalButtonIndex + delta, 1, modalButtonIndexMax);
      syncModalButtonIndexLabels();
    }

    function moveButtonToIndex(tab, btnId, zeroBasedIndex) {
      if (!tab || !Array.isArray(tab.buttons)) return;
      const from = tab.buttons.findIndex(b => b.id === btnId);
      if (from < 0) return;
      const to = clamp(zeroBasedIndex, 0, tab.buttons.length - 1);
      if (from === to) return;
      const [item] = tab.buttons.splice(from, 1);
      tab.buttons.splice(to, 0, item);
    }

    function openButtonEditModal(btnId, topicId = null) {
      const tab = topicId ? topicsList.find(t => t.id === topicId) : getActiveTopic();
      const btn = tab?.buttons.find(b => b.id === btnId);
      if (!btn || !tab) return;
      editingButtonId = btnId;
      editingButtonTopicId = tab.id;
      $("button-label-input").value = btn.label || "";
      $("button-symbol-input").value = btn.symbol || "";
      const currentIdx = tab.buttons.findIndex(b => b.id === btnId);
      modalButtonIndexMax = Math.max(1, tab.buttons.length);
      modalButtonIndex = currentIdx >= 0 ? currentIdx + 1 : 1;
      syncModalButtonIndexLabels();
      fillColorPicker($("button-color-picker"), btn.color);
      openModal("button-edit-modal");
    }

    $("button-index-down")?.addEventListener("click", () => stepModalButtonIndex(-1));
    $("button-index-up")?.addEventListener("click", () => stepModalButtonIndex(1));

    $("save-button-edit").addEventListener("click", () => {
      const tab = topicsList.find(t => t.id === editingButtonTopicId) || getActiveTopic();
      const btn = tab?.buttons.find(b => b.id === editingButtonId);
      if (!btn || !tab) return;
      btn.label = trim($("button-label-input").value) || "Button";
      btn.symbol = mapSymbol($("button-symbol-input").value);
      const col = getSelectedPickerColor("button-color-picker");
      if (col) btn.color = col;
      moveButtonToIndex(tab, editingButtonId, modalButtonIndex - 1);
      repackSequentialGrid(tab);
      commitTopicsUi();
      closeModals();
    });

    $("delete-button-edit").addEventListener("click", () => {
      const tab = topicsList.find(t => t.id === editingButtonTopicId) || getActiveTopic();
      if (!tab) return;
      tab.buttons = tab.buttons.filter(b => b.id !== editingButtonId);
      repackSequentialGrid(tab);
      commitTopicsUi();
      closeModals();
    });

    function repackSequentialGrid(tab) {
      let col = 0, row = 0;
      tab.buttons.forEach(btn => {
        if (col + btn.colSpan > tab.gridCols) { col = 0; row++; }
        btn.col = col; btn.row = row;
        col += btn.colSpan;
        if (col >= tab.gridCols) { col = 0; row++; }
      });
    }

    // ==================== ASSIGN & OVERWRITE ====================
    function applyGeneratedSpeechToButton(btn, source) {
      if (!btn || !source) return;
      const phrase = trim(source.text || getUtteranceText(source));
      btn.label = phrase.substring(0, 24) || "Speech";
      btn.sourceText = phrase || null;
      if (isUtteranceSource(source)) {
        btn.utteranceText = phrase;
        btn.audioData = null;
        btn.effectsBaked = false;
      } else {
        btn.audioData = source.audioData || null;
        btn.utteranceText = null;
        btn.effectsBaked = !!(source.effectsBaked && btn.audioData);
      }
    }

    document.getElementById("textarea-assign-btn").addEventListener("click", () => {
      if (!canAssignFromDisplay()) return;
      openModal("modal-assign-choice");
    });

    $("choice-create-new-btn").addEventListener("click", () => {
      const source = getAssignSource();
      if (!source) return;
      const activeTab = getActiveTopic();
      if (!activeTab) return;
      const btn = normalizeButton({
        id: generateId(),
        col: activeTab.buttons.length % activeTab.gridCols,
        row: Math.floor(activeTab.buttons.length / activeTab.gridCols)
      }, activeTab.buttons.length);
      applyGeneratedSpeechToButton(btn, source);
      pushRecentPhrase(source.text || getUtteranceText(source));
      activeTab.buttons.push(btn);
      repackSequentialGrid(activeTab);
      commitTopicsUi();
      closeModals();
    });

    $("choice-overwrite-btn").addEventListener("click", () => {
      closeModals();
      setOverwriteMode(true);
    });

    function setOverwriteMode(enabled) {
      isOverwriteMode = enabled;
      $("overwrite-banner")?.classList.toggle("active", enabled);
      renderSoundButtons();
    }

    document.getElementById("cancel-overwrite-btn").addEventListener("click", () => {
      setOverwriteMode(false);
      focusDisplayInput();
    });

    function executeOverwrite(btnId) {
      const source = getAssignSource();
      if (!source) return;
      const tab = getActiveTopic();
      const btn = tab?.buttons.find(b => b.id === btnId);
      if (!btn) return;
      applyGeneratedSpeechToButton(btn, source);
      pushRecentPhrase(source.text || getUtteranceText(source));
      setOverwriteMode(false);
      commitTopicsUi();
      focusDisplayInput();
    }

    // ==================== RECENT PHRASES (under display) ====================
    const RECENTS_MAX = 16;
    const RECENTS_STORAGE_KEY = "aac_recent_phrases";
    let recentPhrases = loadRecentPhrases();

    function loadRecentPhrases() {
      const raw = lsGetJson(RECENTS_STORAGE_KEY, null);
      if (Array.isArray(raw)) {
        return raw.map(t => trim(t)).filter(Boolean).slice(0, RECENTS_MAX);
      }
      // Seed from speech history text (text only)
      try {
        const hist = asArray(lsGetJson("aac_history", []));
        const seen = new Set();
        const seeded = [];
        for (const h of hist) {
          const t = trim(h && h.text);
          if (!t || seen.has(t)) continue;
          seen.add(t);
          seeded.push(t);
          if (seeded.length >= RECENTS_MAX) break;
        }
        return seeded;
      } catch (_) {
        return [];
      }
    }

    function saveRecentPhrases() {
      lsSet(RECENTS_STORAGE_KEY, JSON.stringify(recentPhrases));
    }

    function pushRecentPhrase(text) {
      const t = trim(text);
      if (!t) return;
      recentPhrases = recentPhrases.filter(x => x !== t);
      recentPhrases.unshift(t);
      if (recentPhrases.length > RECENTS_MAX) recentPhrases.length = RECENTS_MAX;
      saveRecentPhrases();
      renderRecentsStrip();
    }

    function clearRecentPhrases() {
      recentPhrases = [];
      saveRecentPhrases();
      renderRecentsStrip();
    }

    function renderRecentsStrip() {
      const strip = document.getElementById("recents-strip");
      const chips = document.getElementById("recents-chips");
      const toolbar = document.getElementById("insert-toolbar");
      if (!strip || !chips) return;
      chips.innerHTML = "";
      if (!recentPhrases.length) {
        strip.classList.remove("has-items");
        toolbar?.classList.remove("has-items");
        return;
      }
      strip.classList.add("has-items");
      toolbar?.classList.add("has-items");
      recentPhrases.forEach((phrase) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "recents-chip";
        btn.setAttribute("role", "listitem");
        btn.textContent = phrase;
        btn.title = `Tap: insert · Double-tap: speak — ${phrase}`;
        let lastTap = 0;
        btn.addEventListener("click", () => {
          const now = Date.now();
          if (now - lastTap < 380) {
            lastTap = 0;
            speakPhrase(phrase, { recordHistory: true, showLoading: false, alertOnError: false });
            return;
          }
          lastTap = now;
          // Delay single-tap insert slightly so double-tap can cancel
          setTimeout(() => {
            if (lastTap && Date.now() - lastTap >= 360) {
              insertTextAtDisplayCaret(phrase);
              lastTap = 0;
            }
          }, 370);
        });
        chips.appendChild(btn);
      });
    }

    document.getElementById("recents-clear-btn")?.addEventListener("click", () => {
      if (!recentPhrases.length) return;
      if (!confirm("Clear all recent phrases?")) return;
      clearRecentPhrases();
    });

    // ==================== HISTORY (No Inline Relabeling) ====================
    function addToHistory(textSpoken, model, voiceId, audioBlob, extra = {}) {
      const isUtt = model === "browser_tts" && !audioBlob;
      const item = makeSpeechItem({
        text: textSpoken,
        model,
        voiceId,
        audioData: audioBlob || null,
        utteranceText: isUtt ? textSpoken : null,
        effectsBaked: !!(extra.effectsBaked && audioBlob),
        withTimestamp: true
      });
      try {
        if (!Array.isArray(audioHistory)) audioHistory = [];
        audioHistory.unshift(item);
        if (audioHistory.length > 50) audioHistory.length = 50;
        saveHistory();
        renderHistory();
        setGeneratedAudioActions(item);
        pushRecentPhrase(textSpoken);
        return item;
      } catch (_) {
        // History is best-effort — never fail speech because of storage/UI
        try {
          setGeneratedAudioActions(item);
          pushRecentPhrase(textSpoken);
        } catch (__) {}
        return null;
      }
    }

    function renderHistory() {
      const container = $("audio-history");
      if (!container) return;
      if (!Array.isArray(audioHistory)) audioHistory = [];
      const query = ($("history-search-input")?.value || "").toLowerCase().trim();
      const filtered = audioHistory.filter(item => (item.text || "").toLowerCase().includes(query));
      container.innerHTML = "";

      if (filtered.length === 0) {
        container.innerHTML = `<div class="history-empty-notice">No speech history found</div>`;
        return;
      }

      filtered.forEach(item => {
        const el = document.createElement("div");
        el.className = "history-item";
        const isUtt = isUtteranceSource(item);
        el.innerHTML = `
          <div class="history-item-header">
            <span class="history-item-text">${escapeHtml(item.text)}</span>
            <span class="history-item-meta">${escapeHtml(item.timestamp || "")}${isUtt ? " · live TTS" : ""}</span>
          </div>
          <div class="history-actions">
            <button class="history-btn replay-btn" type="button"><span class="material-symbols-outlined icon-small">play_arrow</span> Play</button>
            <button class="history-btn restore restore-btn" type="button"><span class="material-symbols-outlined icon-small">restore</span> Restore</button>
            <button class="history-btn delete delete-btn" type="button"><span class="material-symbols-outlined icon-small">delete</span></button>
          </div>
        `;

        el.querySelector(".replay-btn")?.addEventListener("click", () => playSpeechSource(item));
        el.querySelector(".restore-btn")?.addEventListener("click", () => restoreSpeechToDisplay(item));
        el.querySelector(".delete-btn")?.addEventListener("click", () => {
          audioHistory = audioHistory.filter(h => h.id !== item.id);
          saveHistory();
          renderHistory();
        });
        container.appendChild(el);
      });
    }

    document.getElementById("history-search-input")?.addEventListener("input", renderHistory);
    document.getElementById("clear-history-btn")?.addEventListener("click", () => {
      if (!confirm("Clear all audio history?")) return;
      audioHistory = []; saveHistory(); renderHistory();
    });

    function setGeneratedAudioActions(historyItem) {
      lastGeneratedAudio = historyItem;
      syncGeneratedAudioActions();
    }

    /**
     * Restore text into the display and arm Replay when a clip/utterance is available.
     * Never mutates the selected model or voice.
     */
    function restoreSpeechToDisplay(item) {
      if (!item) {
        focusDisplayInput();
        return;
      }
      const text = item.text || "";
      setText(text, text.length);
      setGeneratedAudioActions(item);
      focusDisplayInput();
    }

    document.getElementById("textarea-replay-btn").addEventListener("click", () => {
      if (canUseGeneratedActions(lastGeneratedAudio)) playSpeechSource(lastGeneratedAudio);
      else focusDisplayInput();
    });

    // ==================== TEXT DISPLAY ====================
    /**
     * Size Speak as a circle matching one-line message height
     * (textarea font + line-height + padding). Multi-line growth does not enlarge it.
     */
    function syncSpeakClearToDisplayHeight() {
      if (!displayInput) return;
      const styles = getComputedStyle(displayInput);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      let lineH = parseFloat(styles.lineHeight);
      if (!Number.isFinite(lineH) || styles.lineHeight === "normal") {
        lineH = currentFontSize * 1.35;
      }
      const size = Math.max(36, Math.min(52, Math.ceil(lineH + padY)));
      document.documentElement.style.setProperty("--display-ctrl-size", `${size}px`);
    }

    /** Apply Settings font size to the message field; Speak follows one-line height. */
    function applyDisplayFontSize() {
      const px = `${currentFontSize}px`;
      document.documentElement.style.setProperty("--display-font-size", px);
      if (fontDisplay) fontDisplay.textContent = px;
      autosizeDisplayInput();
    }

    function getText() { return displayInput.value; }
    function setText(val, caret = val.length) {
      displayInput.value = val;
      const len = val.length;
      const pos = Math.max(0, Math.min(caret, len));
      try { displayInput.setSelectionRange(pos, pos); } catch (_) {}
      savedDisplaySelection = { start: pos, end: pos };
      autosizeDisplayInput();
      syncGeneratedAudioActions();
      syncComposeStrip();
    }

    // ==================== COMPOSITION WORD CHIPS ====================
    function tokenizeDisplayWords(text) {
      const tokens = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(String(text || ""))) !== null) {
        tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      return tokens;
    }

    function removeDisplayWordAt(index) {
      const text = getText();
      const tokens = tokenizeDisplayWords(text);
      if (index < 0 || index >= tokens.length) return;
      const t = tokens[index];
      let start = t.start;
      let end = t.end;
      // Prefer dropping a trailing space, else a leading space
      if (end < text.length && /\s/.test(text[end])) end += 1;
      else if (start > 0 && /\s/.test(text[start - 1])) start -= 1;
      const next = text.slice(0, start) + text.slice(end);
      setText(next, Math.min(start, next.length));
      announceLive(`Removed ${t.text}`);
      focusDisplayInput();
    }

    function syncComposeStrip() {
      const strip = document.getElementById("compose-strip");
      const chips = document.getElementById("compose-chips");
      if (!strip || !chips) return;
      const tokens = tokenizeDisplayWords(getText());
      chips.innerHTML = "";
      if (!tokens.length) {
        strip.classList.remove("has-items");
        return;
      }
      strip.classList.add("has-items");
      tokens.forEach((tok, i) => {
        const chip = document.createElement("div");
        chip.className = "compose-chip";
        chip.setAttribute("role", "listitem");
        chip.innerHTML = `
          <span class="compose-chip-text"></span>
          <button type="button" class="compose-chip-remove" title="Remove word" aria-label="Remove ${tok.text}">
            <span class="material-symbols-outlined">close</span>
          </button>
        `;
        chip.querySelector(".compose-chip-text").textContent = tok.text;
        chip.querySelector(".compose-chip-remove")?.addEventListener("click", (e) => {
          e.stopPropagation();
          removeDisplayWordAt(i);
        });
        chips.appendChild(chip);
      });
    }

    /** Caret/selection for insert — prefer live selection, else saved, else end. */
    function getDisplayCaretRange() {
      const len = getText().length;
      if (document.activeElement === displayInput && typeof displayInput.selectionStart === "number") {
        return {
          start: displayInput.selectionStart,
          end: typeof displayInput.selectionEnd === "number" ? displayInput.selectionEnd : displayInput.selectionStart
        };
      }
      let start = savedDisplaySelection.start;
      let end = savedDisplaySelection.end;
      if (start == null || !Number.isFinite(start)) start = len;
      if (end == null || !Number.isFinite(end)) end = start;
      start = Math.max(0, Math.min(start, len));
      end = Math.max(0, Math.min(end, len));
      return { start, end };
    }

    /**
     * Ensure at least one whitespace between inserted text and any adjacent non-space
     * characters already in the display (start and/or end boundaries).
     */
    function padInsertAgainstNeighbors(text, start, end, insert) {
      let piece = insert == null ? "" : String(insert);
      if (!piece) return piece;
      const before = start > 0 ? text[start - 1] : "";
      const after = end < text.length ? text[end] : "";
      if (before && !/\s/.test(before) && !/^\s/.test(piece)) piece = ` ${piece}`;
      if (after && !/\s/.test(after) && !/\s$/.test(piece)) piece = `${piece} `;
      return piece;
    }

    /** Insert plain text at the saved caret (replaces selection if any). */
    function insertTextAtDisplayCaret(raw) {
      const insert = (raw == null ? "" : String(raw));
      if (!insert) {
        focusDisplayInput();
        return;
      }
      const text = getText();
      const { start, end } = getDisplayCaretRange();
      const padded = padInsertAgainstNeighbors(text, start, end, insert);
      const next = text.substring(0, start) + padded + text.substring(end);
      const newCaret = start + padded.length;
      setText(next, newCaret);
      focusDisplayInput();
    }

    /** Delete the whole word before the caret (or the current selection). */
    function deleteWholeWordBeforeCaret() {
      const text = getText();
      const { start, end } = getDisplayCaretRange();
      if (start !== end) {
        setText(text.substring(0, start) + text.substring(end), start);
        focusDisplayInput();
        return;
      }
      if (start <= 0) {
        focusDisplayInput();
        return;
      }
      let i = start;
      // Consume trailing whitespace first (same as typical Ctrl+Backspace)
      while (i > 0 && /\s/.test(text[i - 1])) i--;
      // Then the preceding word characters
      while (i > 0 && !/\s/.test(text[i - 1])) i--;
      setText(text.substring(0, i) + text.substring(start), i);
      focusDisplayInput();
    }

    /** Move caret one character left (collapses selection to its start first). */
    function moveDisplayCaretLeft() {
      const { start, end } = getDisplayCaretRange();
      const pos = start !== end ? start : Math.max(0, start - 1);
      try {
        displayInput.focus({ preventScroll: true });
        displayInput.setSelectionRange(pos, pos);
      } catch (_) {
        try { displayInput.focus(); } catch (__) {}
      }
      savedDisplaySelection = { start: pos, end: pos };
    }

    // ==================== SAVED TAGS (insert modal) ====================
    const DEFAULT_SAVED_TAGS = [
      "laugh", "cry", "burp", "loud", "soft", "sing", "english accent", "irish accent", "pirate accent"
    ];
    const SAVED_TAGS_STORAGE_KEY = "aac_saved_tags";
    let savedTagsList = loadSavedTags();
    let savedTagsInputTimer = null;

    function parseTagsList(str) {
      return String(str || "")
        .split(",")
        .map(t => t.trim())
        .filter(Boolean);
    }

    function loadSavedTags() {
      try {
        const raw = localStorage.getItem(SAVED_TAGS_STORAGE_KEY);
        if (raw == null || raw === "") return [...DEFAULT_SAVED_TAGS];
        const parsed = parseTagsList(raw);
        return parsed.length ? parsed : [...DEFAULT_SAVED_TAGS];
      } catch (_) {
        return [...DEFAULT_SAVED_TAGS];
      }
    }

    function persistSavedTags(tags) {
      savedTagsList = Array.isArray(tags) ? tags.slice() : [];
      try {
        localStorage.setItem(SAVED_TAGS_STORAGE_KEY, savedTagsList.join(", "));
      } catch (_) {}
    }

    function tagsListToText(tags) {
      return (tags || []).join(", ");
    }

    function renderTagInsertGrid(tags) {
      const grid = document.getElementById("tag-insert-grid");
      if (!grid) return;
      grid.innerHTML = "";
      const list = Array.isArray(tags) ? tags : [];
      if (list.length === 0) {
        grid.innerHTML = `<div class="tag-insert-empty">No saved tags. Add some below (comma-separated).</div>`;
        return;
      }
      list.forEach(tag => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tag-insert-btn";
        btn.textContent = tag;
        btn.title = `Insert [${tag}]`;
        btn.addEventListener("click", () => {
          insertBracketTag(tag);
          closeModals();
        });
        grid.appendChild(btn);
      });
    }

    function openTagInsertModal() {
      savedTagsList = loadSavedTags();
      const savedInput = document.getElementById("saved-tags-input");
      if (savedInput) savedInput.value = tagsListToText(savedTagsList);
      renderTagInsertGrid(savedTagsList);
      const customInput = document.getElementById("insert-tag-input");
      if (customInput) customInput.value = "";
      openModal("tag-insert-modal");
      // Focus custom tag field so the user can type immediately
      requestAnimationFrame(() => {
        const el = document.getElementById("insert-tag-input");
        if (!el) return;
        try {
          el.focus({ preventScroll: true });
          el.select();
        } catch (_) {
          try { el.focus(); } catch (__) {}
        }
      });
    }

    function onSavedTagsInputChange() {
      const input = document.getElementById("saved-tags-input");
      if (!input) return;
      const tags = parseTagsList(input.value);
      renderTagInsertGrid(tags);
      clearTimeout(savedTagsInputTimer);
      savedTagsInputTimer = setTimeout(() => {
        persistSavedTags(tags);
      }, 250);
    }

    document.getElementById("saved-tags-input")?.addEventListener("input", onSavedTagsInputChange);
    document.getElementById("saved-tags-input")?.addEventListener("change", () => {
      const input = document.getElementById("saved-tags-input");
      if (!input) return;
      persistSavedTags(parseTagsList(input.value));
      renderTagInsertGrid(savedTagsList);
    });

    /** Insert `[tag]` into the display at the saved caret (replaces selection if any). */
    function insertBracketTag(rawOverride) {
      const insertInput = document.getElementById("insert-tag-input");
      const raw = (rawOverride != null ? String(rawOverride) : (insertInput?.value || "")).trim();
      if (!raw) return;
      // Spacing against neighbors is handled by insertTextAtDisplayCaret
      insertTextAtDisplayCaret(`[${raw}]`);
    }

    document.getElementById("insert-tag-btn")?.addEventListener("click", () => openTagInsertModal());
    document.getElementById("insert-tag-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const raw = (document.getElementById("insert-tag-input")?.value || "").trim();
        if (!raw) return;
        insertBracketTag(raw);
        const customInput = document.getElementById("insert-tag-input");
        if (customInput) customInput.value = "";
        closeModals();
      }
    });

    /** Grow/shrink the display field to fit its content (capped by CSS max-height). */
    function autosizeDisplayInput() {
      if (!displayInput) return;
      syncSpeakClearToDisplayHeight();
      displayInput.style.height = "auto";
      displayInput.style.height = `${displayInput.scrollHeight}px`;
    }

    /**
     * Show Assign whenever the display has text (text-only pins allowed).
     * Show Replay only when last generated speech still matches the display text.
     */
    function syncGeneratedAudioActions() {
      const hasText = canAssignFromDisplay();
      const text = getText().trim();
      const replayOk = canUseGeneratedActions(lastGeneratedAudio)
        && text === (lastGeneratedAudio.text || "").trim();

      const replayBtn = document.getElementById("textarea-replay-btn");
      const assignBtn = document.getElementById("textarea-assign-btn");
      if (replayBtn) replayBtn.style.display = replayOk ? "" : "none";
      if (assignBtn) {
        assignBtn.disabled = !hasText;
        assignBtn.classList.toggle("is-disabled", !hasText);
        assignBtn.title = hasText ? "Assign to button" : "Type something to assign";
      }
      const showAudio = replayOk;
      if (audioActionsBar) audioActionsBar.classList.toggle("active", showAudio);
      // Keep Message row visible when Replay is shown even if chips are empty
      document.getElementById("compose-strip")?.classList.toggle("has-audio", showAudio);
    }

    displayInput.addEventListener("input", () => {
      autosizeDisplayInput();
      syncGeneratedAudioActions();
      syncComposeStrip();
    });

    /**
     * Three text drafts (1 / 2 / 3).
     * One is active in the display; tap a chip to jump (current text is saved first).
     */
    const DRAFT_LABELS = ["1", "2", "3"];
    const drafts = ["", "", ""];
    let activeDraft = 0;
    const draftSlotsEl = document.getElementById("draft-slots");

    function previewSnippet(text, max = 36) {
      const t = String(text || "").replace(/\s+/g, " ").trim();
      if (!t) return "(empty)";
      return t.length > max ? `${t.slice(0, max)}…` : t;
    }

    function syncDraftUi() {
      const chips = draftSlotsEl ? draftSlotsEl.querySelectorAll(".draft-chip[data-draft]") : [];
      chips.forEach((chip) => {
        const idx = parseInt(chip.getAttribute("data-draft"), 10);
        if (!Number.isFinite(idx)) return;
        const label = DRAFT_LABELS[idx] || String(idx + 1);
        const text = idx === activeDraft ? getText() : drafts[idx];
        const filled = String(text || "").length > 0;
        chip.classList.toggle("active", idx === activeDraft);
        chip.classList.toggle("has-text", filled);
        chip.setAttribute("aria-pressed", idx === activeDraft ? "true" : "false");
        chip.title = `Draft ${label}${idx === activeDraft ? " (current)" : ""}: ${previewSnippet(text)}`;
        chip.setAttribute(
          "aria-label",
          `Draft ${label}${idx === activeDraft ? ", current" : ""}${filled ? "" : ", empty"}`
        );
      });
    }

    function saveActiveDraftFromDisplay() {
      drafts[activeDraft] = getText();
    }

    function showDraft(index) {
      const i = clamp(index, 0, drafts.length - 1);
      activeDraft = i;
      const text = drafts[i] || "";
      setText(text, text.length);
      syncDraftUi();
      focusDisplayInput();
    }

    function selectDraft(index) {
      const i = clamp(index, 0, drafts.length - 1);
      if (i === activeDraft) {
        saveActiveDraftFromDisplay();
        syncDraftUi();
        focusDisplayInput();
        return;
      }
      saveActiveDraftFromDisplay();
      showDraft(i);
    }

    function clearDisplayText() {
      // Discard display text only (does not wipe other drafts)
      setText("");
      drafts[activeDraft] = "";
      syncDraftUi();
      focusDisplayInput();
    }

    document.getElementById("new-message-btn")?.addEventListener("click", clearDisplayText);
    draftSlotsEl?.addEventListener("click", (e) => {
      if (e.target.closest("#new-message-btn, #textarea-assign-btn")) return;
      const chip = e.target.closest(".draft-chip[data-draft]");
      if (!chip || !draftSlotsEl.contains(chip)) return;
      const idx = parseInt(chip.getAttribute("data-draft"), 10);
      if (!Number.isFinite(idx)) return;
      selectDraft(idx);
    });
    // Keep active draft snapshot when the user types
    displayInput.addEventListener("input", () => {
      drafts[activeDraft] = getText();
      syncDraftUi();
    });
    syncDraftUi();

    // ==================== FIRST-RUN COACH ====================
    const COACH_DISMISS_KEY = "aac_coach_dismissed";
    const coachBanner = document.getElementById("coach-banner");

    function isCoachDismissed() {
      return lsGet(COACH_DISMISS_KEY, "") === "1";
    }

    function setCoachOpen(open) {
      if (!coachBanner) return;
      coachBanner.classList.toggle("open", !!open);
    }

    function dismissCoach() {
      lsSet(COACH_DISMISS_KEY, "1");
      setCoachOpen(false);
      focusDisplayInput();
    }

    function showCoach() {
      setCoachOpen(true);
    }

    document.getElementById("coach-dismiss-btn")?.addEventListener("click", dismissCoach);
    document.getElementById("help-coach-btn")?.addEventListener("click", () => {
      // Close the menu so the coach banner is visible in the main workspace
      setSidebarOpen(false, { restoreFocus: false });
      if (coachBanner?.classList.contains("open")) setCoachOpen(false);
      else showCoach();
    });

    window.addEventListener("resize", () => {
      autosizeDisplayInput();
      const active = getActiveTopic();
      if (active) autosizeSoundCanvas(active);
    });

    // ==================== AUDIO PLAYBACK ====================
    function canSelectOutputDevice() {
      const mediaOk = typeof HTMLMediaElement !== "undefined"
        && typeof HTMLMediaElement.prototype.setSinkId === "function";
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctxOk = !!(Ctx && typeof Ctx.prototype.setSinkId === "function");
      return !!(navigator.mediaDevices && navigator.mediaDevices.enumerateDevices && (mediaOk || ctxOk));
    }

    function updateOutputDeviceHint(outputCount = 0) {
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
      hint.textContent = "Applies to ElevenLabs clips and sound-button playback. Browser TTS uses the system default speaker.";
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
        const outputs = devices.filter(d => d.kind === "audiooutput");
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

        const stillThere = previous && [...select.options].some(o => o.value === previous);
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

    /** Active HTMLAudioElement playback (element path), so new speech can interrupt it. */
    let activeHtmlAudio = null;

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
      activeBufferSources.forEach(source => {
        try { source.onended = null; } catch (_) {}
        try { source.stop(0); } catch (_) {}
        try { source.disconnect(); } catch (_) {}
      });
      activeBufferSources = [];
      stopActiveHtmlAudio();
    }

    function playAudioData(audioData, opts = {}) {
      if (audioData) {
        const audio = new Audio(audioData);
        const gainSetting = getVolumeGain();
        // Clips with speed already baked play at rate 1
        const applySpeed = opts.applySpeed !== false;
        const speed = applySpeed ? (parseFloat(speedSlider.value) || 1.0) : 1.0;
        audio.playbackRate = speed;
        playAudioWithGain(audio, gainSetting, { applySpeed, speed });
      }
      focusDisplayInput();
    }

    /** Play history item or button: live utterance regen, or stored clip. */
    function playSpeechSource(src) {
      if (!src) { focusDisplayInput(); return; }
      const utt = trim(src.utteranceText) || (isUtteranceSource(src) ? getUtteranceText(src) : "");
      if (utt) {
        speakPhrase(utt, { recordHistory: false, showLoading: false, alertOnError: false });
        return;
      }
      if (src.audioData) {
        playAudioData(src.audioData, { applySpeed: !src.effectsBaked });
        return;
      }
      focusDisplayInput();
    }

    function interpolateSample(data, pos) {
      if (!data || data.length === 0) return 0;
      if (pos <= 0) return data[0] || 0;
      if (pos >= data.length - 1) return data[data.length - 1] || 0;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      return data[i0] * (1 - frac) + data[i0 + 1] * frac;
    }

    /** Linear resample a channel to a new length (speed change). */
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

    /** Apply speed offline (duration ≈ original / speed). */
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

    /** Encode an AudioBuffer as a 16-bit mono/stereo WAV data URL. */
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

    async function ensureAudioCtx() {
      const ctx = getSharedAudioContext();
      if (!ctx) throw new Error("no audio context");
      if (ctx.state === "suspended") await ctx.resume();
      return ctx;
    }

    async function decodeToBuffer(arrayBuffer) {
      const ctx = await ensureAudioCtx();
      return ctx.decodeAudioData(arrayBuffer.slice(0));
    }

    /** Bake current speed into a clip; identity speed keeps original encoding. */
    async function bakeSpeedIntoAudioData(audioSource) {
      const speed = parseFloat(speedSlider.value) || 1.0;
      const speedIdentity = Math.abs(speed - 1) < 1e-6;

      let arrayBuffer;
      if (typeof audioSource === "string") {
        if (speedIdentity) return { dataUrl: audioSource, effectsBaked: false };
        const res = await fetch(audioSource);
        if (!res.ok) throw new Error("fetch failed");
        arrayBuffer = await res.arrayBuffer();
      } else if (audioSource instanceof Blob) {
        if (speedIdentity) return { dataUrl: await blobToDataUrl(audioSource), effectsBaked: false };
        arrayBuffer = await audioSource.arrayBuffer();
      } else if (audioSource instanceof ArrayBuffer) {
        arrayBuffer = audioSource;
        if (speedIdentity) {
          return { dataUrl: audioBufferToWavDataUrl(await decodeToBuffer(arrayBuffer)), effectsBaked: true };
        }
      } else {
        throw new Error("unsupported audio source");
      }

      const ctx = await ensureAudioCtx();
      let audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      audioBuffer = applySpeedToBuffer(ctx, audioBuffer, speed);
      return { dataUrl: audioBufferToWavDataUrl(audioBuffer), effectsBaked: true };
    }

    /**
     * Play audio with raw gain (1…10) via Web Audio GainNode.
     * Falls back to HTMLAudioElement at full element volume if decode path fails
     * (element volume cannot exceed 1, so boost needs the Web Audio path).
     * @param {HTMLAudioElement} audioElement
     * @param {number} gainValue
     * @param {{ applySpeed?: boolean, speed?: number, onStarted?: Function }} [opts]
     */
    async function playAudioWithGain(audioElement, gainValue, opts = {}) {
      const applySpeed = opts.applySpeed !== false;
      const speed = applySpeed
        ? (opts.speed != null ? opts.speed : (audioElement.playbackRate || 1))
        : 1;
      const rate = clamp(speed, 0.25, 4);
      const onEnded = typeof audioElement.onended === "function" ? audioElement.onended.bind(audioElement) : null;
      const onStarted = typeof opts.onStarted === "function" ? opts.onStarted : null;
      // Raw multiplier — do not normalize into 0…1
      const safeGain = clamp(parseFloat(gainValue) || 1, 0.05, VOLUME_GAIN_MAX);
      const url = audioElement?.src || "";

      let endedFired = false;
      const fireEnded = () => {
        if (endedFired) return;
        endedFired = true;
        if (onEnded) {
          try { onEnded(); } catch (_) {}
        }
      };

      const playHtmlFallback = async () => {
        try {
          stopActiveHtmlAudio();
          activeHtmlAudio = audioElement;
          // Element volume is capped at 1 by the platform; do not scale gain into 0…1
          audioElement.volume = 1;
          try {
            audioElement.preservesPitch = true;
            audioElement.mozPreservesPitch = true;
            audioElement.webkitPreservesPitch = true;
          } catch (_) {}
          audioElement.playbackRate = rate;
          audioElement.onended = () => {
            if (activeHtmlAudio === audioElement) activeHtmlAudio = null;
            fireEnded();
          };
          audioElement.onerror = () => {
            if (activeHtmlAudio === audioElement) activeHtmlAudio = null;
            fireEnded();
          };
          await applySinkToMediaElement(audioElement);
          await audioElement.play();
          try { if (onStarted) onStarted(); } catch (_) {}
        } catch (_) {
          if (activeHtmlAudio === audioElement) activeHtmlAudio = null;
          fireEnded();
        }
      };

      const ctx = getSharedAudioContext();
      if (!ctx || !url) {
        await playHtmlFallback();
        return;
      }

      try {
        if (ctx.state === "suspended") await ctx.resume();
        stopActiveBufferSources();

        const response = await fetch(url);
        if (!response.ok) throw new Error("fetch failed");
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = rate;

        const gainNode = ctx.createGain();
        gainNode.gain.value = safeGain;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.onended = () => {
          activeBufferSources = activeBufferSources.filter((s) => s !== source);
          try { source.disconnect(); } catch (_) {}
          try { gainNode.disconnect(); } catch (_) {}
          fireEnded();
        };
        activeBufferSources.push(source);
        source.start(0);
        try { if (onStarted) onStarted(); } catch (_) {}
      } catch (_) {
        await playHtmlFallback();
      }
    }

    /** ElevenLabs-style [tag] directives. */
    function phraseHasInlineTags(text) {
      return /\[[^\]]*\]/.test(String(text || ""));
    }

    /** Non-tag spoken content (tags stripped). Empty when phrase is blank or tags-only. */
    function stripInlineTags(text) {
      return String(text || "")
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function hasNonTagSpeechContent(text) {
      return stripInlineTags(text).length > 0;
    }

    /** Screen-reader / status announcements */
    function announceLive(msg) {
      const el = document.getElementById("sr-live");
      if (!el) return;
      el.textContent = "";
      requestAnimationFrame(() => { el.textContent = String(msg || ""); });
    }

    /**
     * Text to speak: selected range if any, otherwise full display.
     */
    function getSpeakText() {
      const full = getText();
      const { start, end } = getDisplayCaretRange();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return full.substring(start, end);
      }
      return full;
    }

    let speakUiState = "idle"; // idle | loading | speaking
    let speakGeneration = 0;

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
      announceLive("Generating speech");
    }

    function setSpeakBtnSpeaking() {
      speakUiState = "speaking";
      if (!speakBtn) return;
      speakBtn.classList.add("speaking");
      speakBtn.innerHTML = '<span class="material-symbols-outlined icon-medium">stop_circle</span>';
      speakBtn.disabled = false;
      speakBtn.setAttribute("aria-label", "Stop speaking");
      speakBtn.title = "Speaking… click to stop";
      announceLive("Speaking");
    }

    function stopAllSpeech() {
      speakGeneration += 1;
      try { window.speechSynthesis.cancel(); } catch (_) {}
      stopActiveBufferSources();
      stopActiveHtmlAudio();
      setSpeakBtnIdle();
      announceLive("Speech stopped");
    }

    /**
     * Speak with current voice settings.
     * Offline + Eleven selected → fall back to browser TTS.
     * ElevenLabs requires non-empty speech content (not empty, not tags-only).
     */
    async function speakPhrase(text, opts = {}) {
      const {
        recordHistory = true,
        showLoading = false,
        alertOnError = false
      } = opts;
      const phrase = trim(text);
      if (!phrase) return;

      const gainSetting = getVolumeGain();
      const speed = parseFloat(speedSlider.value) || 1.0;
      const hasTags = phraseHasInlineTags(phrase);
      const hasSpeechBody = hasNonTagSpeechContent(phrase);
      const apiKey = lsGet("elevenlabs_key", "");
      const canUseEleven = !!(apiKey && activeElevenVoiceId);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      let useBrowser = modelSelect.value === "browser_tts";

      // Offline path: always allow browser TTS
      if (!useBrowser && offline) {
        useBrowser = true;
        announceLive("Offline — using browser voice");
      }

      // ElevenLabs only when there is real speech text (not empty / tags-only)
      if (!useBrowser && !hasSpeechBody) {
        if (alertOnError) {
          alert(hasTags
            ? "Add some words to speak. Tags alone cannot be sent to ElevenLabs."
            : "Type something to speak first.");
        }
        return;
      }

      try { window.speechSynthesis.cancel(); } catch (_) {}
      stopActiveBufferSources();
      stopActiveHtmlAudio();

      const myGen = ++speakGeneration;
      const stillCurrent = () => myGen === speakGeneration;

      if (showLoading) setSpeakBtnLoading();
      else setSpeakBtnIdle();

      const finishUi = () => {
        if (!stillCurrent()) return;
        setSpeakBtnIdle();
      };
      // Once playback has started, never show a hard failure popup
      let playbackStarted = false;

      try {
        if (useBrowser) {
          const utterance = new SpeechSynthesisUtterance(phrase);
          // Raw gain (browsers may clamp to [0,1]; do not pre-scale by /10)
          utterance.volume = gainSetting;
          utterance.rate = speed;
          utterance.pitch = 1;
          const voices = window.speechSynthesis.getVoices();
          const voiceIdx = (activeBrowserVoiceIndex !== "" && voices[activeBrowserVoiceIndex])
            ? activeBrowserVoiceIndex
            : 0;
          utterance.voice = voices[voiceIdx] || null;
          utterance.onend = () => {
            if (!stillCurrent()) return;
            finishUi();
            announceLive("Speech finished");
            if (recordHistory) addToHistory(phrase, "browser_tts", `voice_${voiceIdx}`, null);
            focusDisplayInput();
          };
          utterance.onerror = () => {
            if (!stillCurrent()) return;
            finishUi();
          };
          window.speechSynthesis.speak(utterance);
          playbackStarted = true;
          if (stillCurrent()) setSpeakBtnSpeaking();
          focusDisplayInput();
        } else {
          if (!canUseEleven) {
            if (alertOnError) alert("Please configure your API Key and select a voice in Settings.");
            finishUi();
            focusDisplayInput();
            return;
          }
          // Tags need v3; otherwise use the selected Eleven model
          const modelToUse = hasTags ? "eleven_v3" : modelSelect.value;

          const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
          const fetchTimeout = setTimeout(() => { try { controller?.abort(); } catch (_) {} }, 25000);
          let res;
          try {
            res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${activeElevenVoiceId}`, {
              method: "POST",
              headers: { Accept: "audio/mpeg", "Content-Type": "application/json", "xi-api-key": apiKey },
              body: JSON.stringify({
                text: phrase,
                model_id: modelToUse,
                voice_settings: {
                  stability: parseFloat(stabilitySlider.value),
                  similarity_boost: parseFloat(similaritySlider.value)
                }
              }),
              signal: controller ? controller.signal : undefined
            });
          } finally {
            clearTimeout(fetchTimeout);
          }
          if (!stillCurrent()) return;
          if (!res.ok) throw new Error("API Error");
          const blob = await res.blob();
          if (!blob || blob.size < 16) throw new Error("Empty audio");

          let playUrl;
          let saveDataUrl = null;
          let effectsBaked = false;
          const objectUrl = URL.createObjectURL(blob);
          try {
            const baked = await withTimeout(bakeSpeedIntoAudioData(blob), 6000, "bake timeout");
            if (!stillCurrent()) {
              try { URL.revokeObjectURL(objectUrl); } catch (_) {}
              return;
            }
            saveDataUrl = baked.dataUrl;
            effectsBaked = !!baked.effectsBaked;
            playUrl = saveDataUrl || objectUrl;
          } catch (_) {
            playUrl = objectUrl;
            effectsBaked = false;
            try {
              saveDataUrl = await blobToDataUrl(blob);
            } catch (__) {
              saveDataUrl = null;
            }
          }

          const audio = new Audio(playUrl);
          audio.playbackRate = effectsBaked ? 1 : speed;

          let cleaned = false;
          const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            try { URL.revokeObjectURL(objectUrl); } catch (_) {}
            if (stillCurrent()) {
              finishUi();
              announceLive("Speech finished");
            }
            focusDisplayInput();
          };

          audio.onended = cleanup;
          await playAudioWithGain(audio, gainSetting, {
            applySpeed: !effectsBaked,
            speed: effectsBaked ? 1 : speed,
            onStarted: () => {
              playbackStarted = true;
              if (stillCurrent()) setSpeakBtnSpeaking();
            }
          });
          if (!stillCurrent()) {
            try { audio.pause(); } catch (_) {}
            cleanup();
            return;
          }
          // play() resolved — treat as started even if onStarted was skipped
          playbackStarted = true;
          if (stillCurrent()) setSpeakBtnSpeaking();
          focusDisplayInput();

          if (recordHistory && saveDataUrl) {
            addToHistory(phrase, modelToUse, activeElevenVoiceId, saveDataUrl, { effectsBaked });
          }
        }
      } catch (_) {
        // Only alert when nothing actually started playing
        if (alertOnError && !playbackStarted && stillCurrent()) alert("Failed to generate speech.");
        finishUi();
        focusDisplayInput();
      }
    }

    async function speakText() {
      if (speakUiState === "speaking" || speakUiState === "loading") {
        stopAllSpeech();
        return;
      }
      const text = getSpeakText();
      if (!trim(text)) {
        announceLive("Nothing to speak");
        focusDisplayInput();
        return;
      }
      await speakPhrase(text, { recordHistory: true, showLoading: true, alertOnError: true });
    }

    speakBtn.addEventListener("click", speakText);
    displayInput.addEventListener("keydown", (e) => {
      // Enter (without Shift) → speak
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!speakBtn.disabled) speakText();
        return;
      }
      // Shift+Backspace → delete whole word
      if (e.key === "Backspace" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        deleteWholeWordBeforeCaret();
        return;
      }
      // Shift+Space → move cursor left one position
      if (e.key === " " && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        moveDisplayCaretLeft();
      }
    });

    // ==================== MODALS ====================
    function openModal(modalId) {
      document.querySelectorAll(".modal").forEach(m => m.classList.remove("open"));
      const el = document.getElementById(modalId);
      if (!el) return;
      el.classList.add("open");
      if (modalOverlay) modalOverlay.classList.add("open");
      document.body.classList.add("modal-open");
    }
    function closeModals() {
      document.querySelectorAll(".modal").forEach(m => m.classList.remove("open"));
      if (modalOverlay) modalOverlay.classList.remove("open");
      document.body.classList.remove("modal-open");
      editingButtonId = null;
      editingButtonTopicId = null;
      editingTopicId = null;
      iconStudioReturnModalId = null;
      // Don't steal focus while another non-modal panel might be open
      try { focusDisplayInput(); } catch (_) {}
    }
    // Expose for inline onclick handlers in the HTML markup
    window.openModal = openModal;
    window.closeModals = closeModals;
    window.closeIconStudio = closeIconStudio;
    window.openIconStudio = openIconStudio;
    window.applyTheme = applyTheme;
    window.stepModalGrid = stepModalGrid;
    window.setStudioIconSize = setStudioIconSize;
    window.switchSidebarTab = switchSidebarTab;

    if (modalOverlay) {
      modalOverlay.addEventListener("click", (e) => {
        // Only the dimmed backdrop itself (not bubbled content — modals are siblings)
        if (e.target === modalOverlay) closeModals();
      });
    }
    // Cancel / Close buttons that use onclick="closeModals()" also get a reliable listener
    document.querySelectorAll(".modal .modal-btn.secondary, .modal [data-close-modal]").forEach(btn => {
      const handler = (btn.getAttribute("onclick") || "");
      if (handler.includes("closeModals") || btn.hasAttribute("data-close-modal")) {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          closeModals();
        });
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const studioOpen = document.getElementById("icon-studio-modal")?.classList.contains("open");
      if (studioOpen) {
        e.preventDefault();
        closeIconStudio(false);
        return;
      }
      if (document.body.classList.contains("modal-open") || modalOverlay?.classList.contains("open")) {
        e.preventDefault();
        closeModals();
      }
    });

    function syncSlider(el, valEl, storeKey, isFloat = true) {
      if (!el || !valEl) return;
      const saved = lsGet(storeKey);
      if (saved !== null) el.value = saved;
      const paint = () => {
        valEl.textContent = isFloat ? parseFloat(el.value).toFixed(2) : el.value;
      };
      paint();
      el.addEventListener("input", () => { paint(); lsSet(storeKey, el.value); });
    }

    /** Volume Percent: 10 stops → gain 1…10; label shows 100%…1000%. */
    function syncVolumeSlider() {
      if (!volumeSlider || !valVolume) return;
      const saved = lsGet("elevenlabs_volume");
      if (saved !== null && saved !== "") {
        const n = parseFloat(saved);
        // Migrate legacy values to nearest stop 1–10
        if (Number.isFinite(n)) volumeSlider.value = String(clamp(Math.round(n), 1, VOLUME_STOP_COUNT));
      }
      const paint = () => {
        valVolume.textContent = `${volumeStopToPercent(getVolumeStop())}%`;
      };
      paint();
      volumeSlider.addEventListener("input", () => {
        paint();
        lsSet("elevenlabs_volume", String(getVolumeStop()));
      });
    }

    function updateSettingsVisibility() {
      const isBrowser = modelSelect.value === "browser_tts";
      $("group-browser-voice").style.display = isBrowser ? "flex" : "none";
      $("group-eleven-settings").style.display = isBrowser ? "none" : "flex";
    }

    modelSelect.value = lsGet("elevenlabs_model", "browser_tts") || "browser_tts";
    modelSelect.addEventListener("change", (e) => { lsSet("elevenlabs_model", e.target.value); updateSettingsVisibility(); });

    // ==================== VOICES & API KEY MANAGEMENT ====================
    const previewText = "This is a preview.";
    let elevenVoicesCache = [];
    let voiceSearchTimeout = null;

    function getVoiceSearchQuery() {
      return (document.getElementById("voice-search-input").value || "").toLowerCase().trim();
    }

    function ensureDefaultBrowserVoice(voices) {
      if (!voices || !voices.length) return;
      const idxValid = activeBrowserVoiceIndex !== "" && voices[activeBrowserVoiceIndex];
      if (!idxValid) {
        activeBrowserVoiceIndex = 0;
        localStorage.setItem("aac_browser_voice_index", "0");
      }
      const selected = voices[activeBrowserVoiceIndex];
      if (selected) {
        document.getElementById("selected-browser-name").textContent = selected.name;
      }
    }

    function loadBrowserVoices() {
      const voices = window.speechSynthesis.getVoices();
      const list = document.getElementById("voice-list-browser");
      list.innerHTML = "";

      ensureDefaultBrowserVoice(voices);

      const q = getVoiceSearchQuery();
      const filtered = voices
        .map((voice, index) => ({ voice, index }))
        .filter(({ voice }) => voice.name.toLowerCase().includes(q) || voice.lang.toLowerCase().includes(q));

      if (filtered.length === 0) {
        list.innerHTML = `<div class="history-empty-notice">No voices found</div>`;
        return;
      }

      filtered.forEach(({ voice, index }) => {
        const item = document.createElement("div");
        item.className = `voice-item ${String(activeBrowserVoiceIndex) === String(index) ? "selected" : ""}`;
        item.innerHTML = `
          <span class="voice-item-name">${voice.name} (${voice.lang})</span>
          <button class="voice-preview-btn" type="button" title="Preview Voice">
            <span class="material-symbols-outlined icon-small">play_arrow</span>
          </button>
        `;
        item.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          activeBrowserVoiceIndex = index;
          localStorage.setItem("aac_browser_voice_index", index);
          document.getElementById("selected-browser-name").textContent = voice.name;
          document.querySelectorAll("#voice-list-browser .voice-item").forEach(el => el.classList.remove("selected"));
          item.classList.add("selected");
          setTimeout(closeVoicesPanel, 200);
        });

        item.querySelector(".voice-preview-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(previewText);
          utterance.voice = voice;
          utterance.rate = parseFloat(speedSlider.value) || 1.0;
          utterance.volume = getVolumeGain();
          utterance.pitch = 1;
          window.speechSynthesis.speak(utterance);
        });
        list.appendChild(item);
      });
    }

    async function fetchElevenVoices(apiKey) {
      if (!apiKey) {
        elevenVoicesCache = [];
        renderElevenVoiceList();
        return;
      }
      const list = document.getElementById("voice-list-eleven");
      list.innerHTML = `<div class="history-empty-notice">Loading ElevenLabs voices...</div>`;

      try {
        const res = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: { Accept: "application/json", "xi-api-key": apiKey }
        });
        if (!res.ok) throw new Error("Could not fetch ElevenLabs voices");
        const data = await res.json();
        elevenVoicesCache = data.voices || [];
        renderElevenVoiceList();
      } catch (_) {
        elevenVoicesCache = [];
        list.innerHTML = `<div class="history-empty-notice">Could not load voices. Check API Key.</div>`;
      }
    }

    function renderElevenVoiceList() {
      const list = document.getElementById("voice-list-eleven");
      const q = getVoiceSearchQuery();
      const filtered = elevenVoicesCache.filter(v =>
        v.name.toLowerCase().includes(q) || (v.category || "").toLowerCase().includes(q)
      );
      list.innerHTML = "";

      const selected = elevenVoicesCache.find(v => v.voice_id === activeElevenVoiceId);
      if (selected) document.getElementById("selected-eleven-name").textContent = selected.name;

      if (!elevenVoicesCache.length) {
        list.innerHTML = `<div class="history-empty-notice">Enter an API Key to load voices...</div>`;
        return;
      }
      if (filtered.length === 0) {
        list.innerHTML = `<div class="history-empty-notice">No matching voices found.</div>`;
        return;
      }

      filtered.forEach(voice => {
        const item = document.createElement("div");
        item.className = `voice-item ${activeElevenVoiceId === voice.voice_id ? "selected" : ""}`;
        item.innerHTML = `
          <span class="voice-item-name">${voice.name} (${voice.category || "General"})</span>
          <button class="voice-preview-btn" type="button" title="Preview Voice">
            <span class="material-symbols-outlined icon-small">play_arrow</span>
          </button>
        `;

        item.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          activeElevenVoiceId = voice.voice_id;
          localStorage.setItem("elevenlabs_voice", activeElevenVoiceId);
          document.getElementById("selected-eleven-name").textContent = voice.name;
          document.querySelectorAll("#voice-list-eleven .voice-item").forEach(el => el.classList.remove("selected"));
          item.classList.add("selected");
          setTimeout(closeVoicesPanel, 200);
        });

        const previewBtn = item.querySelector(".voice-preview-btn");
        previewBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const icon = previewBtn.querySelector(".material-symbols-outlined");
          const resetPreview = () => { icon.textContent = "play_arrow"; previewBtn.disabled = false; };
          icon.textContent = "hourglass_top";
          previewBtn.disabled = true;
          const apiKey = lsGet("elevenlabs_key", "");
          const previewModel = modelSelect.value === "browser_tts" ? "eleven_v3" : modelSelect.value;
          try {
            if (!apiKey) throw new Error("No API key");
            const synRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voice_id}`, {
              method: "POST",
              headers: { Accept: "audio/mpeg", "Content-Type": "application/json", "xi-api-key": apiKey },
              body: JSON.stringify({ text: previewText, model_id: previewModel })
            });
            if (!synRes.ok) throw new Error("API Error");
            const audio = new Audio(URL.createObjectURL(await synRes.blob()));
            audio.playbackRate = parseFloat(speedSlider.value) || 1.0;
            audio.onended = resetPreview;
            audio.onerror = resetPreview;
            playAudioWithGain(audio, getVolumeGain());
          } catch (_) {
            alert("Could not preview voice.");
            resetPreview();
          }
        });
        list.appendChild(item);
      });
    }

    function openVoicesPanel(mode) {
      const browserList = $("voice-list-browser");
      const elevenList = $("voice-list-eleven");
      const isBrowser = mode === "browser";
      browserList.classList.toggle("active", isBrowser);
      elevenList.classList.toggle("active", !isBrowser);
      $("voice-search-input").value = "";
      if (isBrowser) loadBrowserVoices();
      else if (elevenVoicesCache.length) renderElevenVoiceList();
      else fetchElevenVoices(lsGet("elevenlabs_key", ""));
      $("voices-panel").classList.add("open");
    }

    function closeVoicesPanel() {
      $("voices-panel").classList.remove("open");
      focusDisplayInput();
    }

    $("open-browser-voices").addEventListener("click", () => openVoicesPanel("browser"));
    $("open-eleven-voices").addEventListener("click", () => openVoicesPanel("eleven"));
    $("close-voices-panel-btn").addEventListener("click", closeVoicesPanel);

    $("voice-search-input").addEventListener("input", () => {
      clearTimeout(voiceSearchTimeout);
      voiceSearchTimeout = setTimeout(() => {
        if ($("voice-list-browser").classList.contains("active")) loadBrowserVoices();
        if ($("voice-list-eleven").classList.contains("active")) renderElevenVoiceList();
      }, 200);
    });

    const apiKeyBtn = document.getElementById("api-key-btn");
    const apiKeyInput = document.getElementById("api-key-input");

    function updateApiKeyStatus() {
      const key = lsGet("elevenlabs_key", "") || "";
      const label = apiKeyBtn.querySelector(".status-btn-text");
      const hasKey = !!key;
      if (label) {
        label.innerHTML = hasKey
          ? `<span class="material-symbols-outlined icon-small icon-btn-margin">key</span>API Key Saved (••••${key.slice(-4)})`
          : `<span class="material-symbols-outlined icon-small icon-btn-margin">key</span>Missing API Key (Click to Add)`;
      }
      apiKeyBtn.classList.toggle("missing", !hasKey);
      apiKeyBtn.classList.toggle("saved", hasKey);
      if (hasKey) fetchElevenVoices(key);
      else elevenVoicesCache = [];
    }

    function openApiKeyModal() {
      if (apiKeyInput) apiKeyInput.value = lsGet("elevenlabs_key", "") || "";
      openModal("api-key-modal");
      requestAnimationFrame(() => { try { apiKeyInput?.focus(); } catch (_) {} });
    }

    function saveApiKeyFromModal() {
      lsSet("elevenlabs_key", trim(apiKeyInput?.value));
      updateApiKeyStatus();
      closeModals();
    }

    apiKeyBtn.addEventListener("click", openApiKeyModal);
    document.getElementById("save-api-key-btn")?.addEventListener("click", saveApiKeyFromModal);
    apiKeyInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveApiKeyFromModal();
      }
    });

    // ==================== LARGER TOUCH TARGETS ====================
    let largeTouchTargets = lsGet("aac_large_targets", "") === "1";

    function applyTouchSize(enabled, { persist = true } = {}) {
      largeTouchTargets = !!enabled;
      document.body.dataset.touchSize = largeTouchTargets ? "large" : "normal";
      if (persist) lsSet("aac_large_targets", largeTouchTargets ? "1" : "0");
      const toggle = document.getElementById("large-targets-toggle");
      if (toggle) toggle.checked = largeTouchTargets;
      // Grid height depends on --sound-row-height
      try {
        const active = getActiveTopic();
        if (active) autosizeSoundCanvas(active);
        renderSoundButtons();
        syncSpeakClearToDisplayHeight();
      } catch (_) {}
    }

    document.getElementById("large-targets-toggle")?.addEventListener("change", (e) => {
      applyTouchSize(!!e.target.checked);
    });

    function syncOfflineBanner() {
      const banner = document.getElementById("offline-banner");
      if (!banner) return;
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      banner.classList.toggle("open", offline);
    }

    function registerServiceWorker() {
      if (!("serviceWorker" in navigator)) return;
      // file:// cannot register SW
      if (location.protocol === "file:") return;
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }

    // ==================== INITIALIZATION ====================
    function init() {
      applyTheme(currentTheme);
      applyGlobalIconStyles();
      applyTouchSize(largeTouchTargets, { persist: false });
      syncOfflineBanner();
      window.addEventListener("online", syncOfflineBanner);
      window.addEventListener("offline", syncOfflineBanner);
      registerServiceWorker();

      syncSlider(stabilitySlider, valStability, "elevenlabs_stability");
      syncSlider(similaritySlider, valSimilarity, "elevenlabs_similarity");
      syncVolumeSlider();
      syncSlider(speedSlider, valSpeed, "elevenlabs_speed");

      updateSettingsVisibility();
      updateApiKeyStatus();

      // Speaker / output device picker
      const outputSelect = document.getElementById("output-device-select");
      if (outputSelect) {
        outputSelect.addEventListener("change", (e) => {
          setActiveOutputDevice(e.target.value).catch(() => {});
        });
      }
      refreshOutputDevices();
      if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === "function") {
        navigator.mediaDevices.addEventListener("devicechange", () => refreshOutputDevices());
      }

      // Mobile: start with drawer closed so the workspace is full-width
      if (isMobileLayout()) setSidebarOpen(false, { restoreFocus: false });

      const accentPicker = document.getElementById("accent-color-picker");
      if (accentPicker) {
        accentPicker.value = customAccentColor || getDefaultAccentForResolvedTheme();
        accentPicker.addEventListener("input", (e) => applyAccentColor(e.target.value));
      }
      document.getElementById("accent-color-reset")?.addEventListener("click", () => {
        applyAccentColor("");
      });

      applyDisplayFontSize();

      $("font-down").addEventListener("click", () => {
        currentFontSize = Math.max(16, currentFontSize - 2);
        lsSet("aac_font_size", currentFontSize);
        applyDisplayFontSize();
      });

      $("font-up").addEventListener("click", () => {
        currentFontSize = Math.min(48, currentFontSize + 2);
        lsSet("aac_font_size", currentFontSize);
        applyDisplayFontSize();
      });

      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => loadBrowserVoices();
        loadBrowserVoices();
      }

      // Keep body height in sync with mobile browser chrome / keyboard when possible
      const setAppHeight = () => {
        const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        if (isMobileLayout()) {
          document.body.style.height = `${h}px`;
        } else {
          document.body.style.height = "";
        }
      };
      setAppHeight();
      window.addEventListener("resize", setAppHeight);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", setAppHeight);
      }

      renderTopics();
      renderSoundButtons();
      renderRecentsStrip();
      syncComposeStrip();
      // Restore sidebar route from hash (default #/topics)
      {
        const initialTab = tabFromHash();
        const next = `#/${initialTab}`;
        if (location.hash !== next) {
          const url = new URL(location.href);
          url.hash = `/${initialTab}`;
          history.replaceState(null, "", url.pathname + url.search + url.hash);
        }
        switchSidebarTab(initialTab, false, { fromRoute: true });
      }
      autosizeDisplayInput();
      syncDraftUi();
      if (!isCoachDismissed()) showCoach();
      // Avoid auto-focus on mobile (opens keyboard immediately)
      if (!isMobileLayout()) focusDisplayInput();
    }

    window.addEventListener("DOMContentLoaded", init);
