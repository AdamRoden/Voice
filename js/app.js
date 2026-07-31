    // ==================== STATE & PALETTE CONFIG ====================
    const COLOR_PALETTE = [
      "#a0a0a0", "#cc0000", "#e69138", "#f1c232", "#6aa84f", "#45818e", "#3c78d8", "#3d85c6",
      "#674ea7", "#a64d79", "#808080", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c",
      "#1155cc", "#0b5394", "#351c75", "#741b47", "#606060", "#660000", "#783f04", "#7f6000",
      "#274e13", "#0c343d", "#1c4587", "#073763", "#20124d", "#4c1130", "#000000", "#ffffff",
      "#dddddd", "#bbbbbb", "#999999", "#777777", "#555555", "#333333", "#111111"
    ];

    /** Desktop default columns; mobile uses fewer for readable button width. */
    const DEFAULT_GRID_COLS_DESKTOP = 4;
    const DEFAULT_GRID_COLS_MOBILE = 3;
    const DEFAULT_GRID_ROWS = 2;
    /** Shared with sidebar / keyboard mobile layout. */
    const MOBILE_LAYOUT_MQ = "(max-width: 900px)";

    function getDefaultGridCols() {
      try {
        if (typeof window !== "undefined" && window.matchMedia(MOBILE_LAYOUT_MQ).matches) {
          return DEFAULT_GRID_COLS_MOBILE;
        }
      } catch (_) {}
      return DEFAULT_GRID_COLS_DESKTOP;
    }

    // Unicode escapes keep this file encoding-safe (emoji -> Material icon migration).
    const SYMBOL_MIGRATION_MAP = {
      "\uD83D\uDCC1": "folder",
      "\uD83D\uDCAC": "chat",
      "\uD83D\uDD52": "history",
      "\u2699\uFE0F": "settings",
      "\u2630": "menu",
      "\u25BC": "expand_more",
      "\u276F": "chevron_right",
      "\uD83D\uDD0D": "search",
      "\uD83C\uDFA8": "palette",
      "\uD83D\uDDE3\uFE0F": "record_voice_over",
      "\u270E": "edit",
      "\uD83D\uDC49": "touch_app",
      "\uD83D\uDD0A": "volume_up",
      "\u25B6": "play_arrow",
      "\uD83D\uDCCC": "push_pin",
      "\uD83D\uDDD1\uFE0F": "delete",
      "\u2600\uFE0F": "light_mode",
      "\uD83C\uDF19": "dark_mode",
      "\uD83D\uDCBB": "computer",
      "\uD83D\uDD04": "refresh",
      "\u2B50": "star",
      "\uD83C\uDFE0": "home"
    };
    /** Offline icon fallback catalog lives in AacIconStudio.DEFAULT_FALLBACK. */
    const ICON_DATABASE_FALLBACK = (window.AacIconStudio && window.AacIconStudio.DEFAULT_FALLBACK) || [];


    // ==================== CORE HELPERS ====================
    const $ = (id) => document.getElementById(id);
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
    const speakBtn = $("speak-btn");
    const audioActionsBar = $("generated-audio-actions");
    const modelSelect = $("model-select");
    const volumeSlider = $("volume-slider");
    const speedSlider = $("speed-slider");
    const pitchSlider = $("pitch-slider");
    const valVolume = $("val-volume");
    /** Gain multipliers for Amplifier stops 1-10 -> 100%...1000%. */
    const VOLUME_STOP_COUNT = 10;
    const VOLUME_STOP_GAINS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const VOLUME_GAIN_MAX = VOLUME_STOP_GAINS[VOLUME_STOP_GAINS.length - 1];
    const AudioFx = window.AacAudioFx;
    const Eleven = window.AacEleven;
    const ElevenKeyApi = window.AacElevenKey;
    const Piper = window.AacPiper;
    const SpeechEngines = window.AacSpeechEngines;
    const VoicesFilters = window.AacVoicesFilters;
    const VoicesPanel = window.AacVoicesPanel;
    const VoicesControllerApi = window.AacVoicesController;
    const SpeechPlaybackApi = window.AacSpeechPlayback;
    const KeyboardApi = window.AacKeyboard;
    const TopicsApi = window.AacTopics;
    const IconStudioApi = window.AacIconStudio;
    const BoardIoApi = window.AacBoardIo;
    const WorkspaceApi = window.AacWorkspace;
    const ComposeApi = window.AacCompose;
    const HistoryUiApi = window.AacHistoryUi;
    const SpeechItemsApi = window.AacSpeechItems;
    const ShellUiApi = window.AacShellUi;
    const FeaturesApi = window.AacFeatures;

    function requireModule(name, mod) {
      if (!mod) throw new Error(`Required module missing: ${name}`);
      return mod;
    }
    requireModule("AacSpeechEngines", SpeechEngines);
    requireModule("AacEleven", Eleven);
    requireModule("AacElevenKey", ElevenKeyApi);
    requireModule("AacPiper", Piper);
    requireModule("AacVoicesFilters", VoicesFilters);
    requireModule("AacVoicesPanel", VoicesPanel);
    requireModule("AacVoicesController", VoicesControllerApi);
    requireModule("AacSpeechPlayback", SpeechPlaybackApi);
    requireModule("AacTopicsEdit", window.AacTopicsEdit);
    requireModule("AacTopics", TopicsApi);
    requireModule("AacWorkspace", WorkspaceApi);
    requireModule("AacCompose", ComposeApi);
    requireModule("AacHistoryUi", HistoryUiApi);
    requireModule("AacIconStudio", IconStudioApi);
    requireModule("AacBoardIo", BoardIoApi);
    requireModule("AacSpeechItems", SpeechItemsApi);
    requireModule("AacShellUi", ShellUiApi);
    requireModule("AacFeatures", FeaturesApi);

    const modelId = (id) => SpeechEngines.normalizeModelId(id);

    function getVolumeStop() {
      const raw = parseInt(volumeSlider?.value, 10);
      if (!Number.isFinite(raw)) return 1; // default Amplifier 100%
      return clamp(raw, 1, VOLUME_STOP_COUNT);
    }

    /** Audio gain for the current Amplifier stop (1-10). */
    function getVolumeGain() {
      return VOLUME_STOP_GAINS[getVolumeStop() - 1];
    }

    /** Display percent for a stop: 100, 200, ..., 1000. */
    function volumeStopToPercent(stop) {
      const s = clamp(stop, 1, VOLUME_STOP_COUNT);
      return Math.round(VOLUME_STOP_GAINS[s - 1] * 100);
    }

    function getSpeechSpeed() {
      const n = parseFloat(speedSlider?.value);
      return Number.isFinite(n) ? clamp(n, 0.25, 4) : 1;
    }

    function getSpeechPitch() {
      const n = parseFloat(pitchSlider?.value);
      return Number.isFinite(n) ? clamp(n, 0.5, 2) : 1;
    }

    /** Current slider FX for unbaked clips. */
    function getSpeechFx() {
      return { speed: getSpeechSpeed(), pitch: getSpeechPitch() };
    }

    const valSpeed = $("val-speed");
    const valPitch = $("val-pitch");
    const fontDisplay = $("font-display");

    // State Variables (modules wired after helpers / modals)
    /** @type {ReturnType<typeof VoicesControllerApi.create>|null} */
    let Voices = null;
    /** @type {ReturnType<typeof ElevenKeyApi.create>|null} */
    let ElevenKey = null;
    /** @type {ReturnType<typeof SpeechPlaybackApi.create>|null} */
    let Speech = null;
    /** @type {ReturnType<typeof WorkspaceApi.create>|null} */
    let Workspace = null;
    /** @type {ReturnType<typeof TopicsApi.create>|null} */
    let Topics = null;
    /** @type {ReturnType<typeof ComposeApi.createActions>|null} */
    let Compose = null;
    /** @type {ReturnType<typeof IconStudioApi.create>|null} */
    let Icons = null;
    /** @type {ReturnType<typeof BoardIoApi.create>|null} */
    let BoardIo = null;
    /** @type {ReturnType<typeof HistoryUiApi.create>|null} */
    let HistoryUi = null;
    /** @type {ReturnType<typeof ComposeApi.createDisplay>|null} */
    let ComposeDisplay = null;
    let currentFontSize = parseInt(lsGet("aac_font_size", "28"), 10) || 28;
    let currentTheme = lsGet("aac_theme", "system") || "system";
    let customAccentColor = lsGet("aac_accent_color", "") || "";
    /** Saved caret in #display-input so programmatic refocus restores it. */
    let savedDisplaySelection = { start: null, end: null };

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
          // Settle through iOS system-keyboard open (especially after OSK → iOS switch).
          scheduleKeyboardAlign({ settle: true });
        } catch (_) {
          try {
            displayInput.focus({ preventScroll: true });
            scheduleKeyboardAlign({ settle: true });
          } catch (__) {}
        }
      });
    }

    // Soft keyboard: viewport pin + CSS dock (see js/keyboard.js)
    let keyboardCtl = null;
    function ensureKeyboard() {
      if (!keyboardCtl && KeyboardApi && typeof KeyboardApi.createController === "function") {
        keyboardCtl = KeyboardApi.createController({
          isMobileLayout: () => window.matchMedia(MOBILE_LAYOUT_MQ).matches
        });
      }
      return keyboardCtl;
    }
    function scheduleKeyboardAlign(opts) {
      ensureKeyboard()?.schedule(opts && opts.settle ? { settle: true } : undefined);
    }
    function expectSystemKeyboard() {
      const ctl = ensureKeyboard();
      if (ctl && typeof ctl.expectSystemKeyboard === "function") ctl.expectSystemKeyboard();
      else scheduleKeyboardAlign({ settle: true });
    }
    displayInput.addEventListener("blur", saveDisplaySelection);
    document.addEventListener("selectionchange", () => {
      if (document.activeElement === displayInput) saveDisplaySelection();
    });

    let iconFill = parseInt(lsGet("aac_icon_fill", "0"), 10) || 0;
    let iconWght = parseInt(lsGet("aac_icon_wght", "400"), 10) || 400;
    let iconGrad = parseInt(lsGet("aac_icon_grad", "0"), 10) || 0;
    let iconOpsz = parseInt(lsGet("aac_icon_opsz", "24"), 10) || 24;

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

    let lastGeneratedAudio = null;

    // ==================== SPEECH ITEM HELPERS ====================
    const SpeechItems = SpeechItemsApi.create({ trim, generateId });
    const makeSpeechItem = SpeechItems.makeSpeechItem;
    const isUtteranceSource = SpeechItems.isUtteranceSource;
    const getUtteranceText = SpeechItems.getUtteranceText;
    const getButtonSourceText = SpeechItems.getButtonSourceText;
    const canUseGeneratedActions = SpeechItems.canUseGeneratedActions;
    const canReplay = (item, text) => SpeechItems.canReplay(item, text);
    const canAssignFromDisplay = () => SpeechItems.canAssignFromDisplay(getText);
    const getAssignSource = () => SpeechItems.getAssignSource(getText, () => lastGeneratedAudio);

    // Theme / sidebar / router / coach live in AacShellUi (created below with ports).
    // ==================== TEXT DISPLAY ====================
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
      // Only refresh chips when OSK is open (not on history restore / bulk setText)
      if (window.VoiceOsk && VoiceOsk.isVisible() && typeof VoiceOsk.schedulePredict === "function") {
        try { VoiceOsk.schedulePredict(); } catch (_) {}
      }
    }

    // Ports: late modules close over these; methods call current instances (no rebind).
    const ports = {
      playSpeechSource(...a) { return Speech ? Speech.playSpeechSource(...a) : undefined; },
      refreshOutputDevices(...a) { return Speech ? Speech.refreshOutputDevices(...a) : Promise.resolve(); },
      setActiveOutputDevice(...a) { return Speech ? Speech.setActiveOutputDevice(...a) : Promise.resolve(); },
      addToHistory(...a) { return HistoryUi ? HistoryUi.addToHistory(...a) : null; },
      renderHistory() { HistoryUi?.renderHistory(); },
      clearDisplayText() { if (Workspace) Workspace.clearDisplayText(); else { setText(""); focusDisplayInput(); } },
      syncChatUi() { Workspace?.syncChatUi(); },
      onWorkspaceDisplayInput() { Workspace?.onDisplayInput(); },
      isMobileLayout() { return Shell ? Shell.isMobileLayout() : window.matchMedia(MOBILE_LAYOUT_MQ).matches; },
      closeMobileSidebar() { Shell?.closeMobileSidebar(); },
      openModal(id) { Shell?.openModal(id); },
      closeModals() { Shell?.closeModals(); },
      applyTheme(theme) { Shell?.applyTheme(theme); },
      applyAccentColor(c, o) { Shell?.applyAccentColor(c, o); },
      setSidebarOpen(...a) { Shell?.setSidebarOpen(...a); },
      switchSidebarTab(...a) { return Shell?.switchSidebarTab(...a); },
      isCoachDismissed() { return Shell ? Shell.isCoachDismissed() : true; },
      showCoach() { Shell?.showCoach(); }
    };
    let Shell = null;

    function announceLive(msg) {
      const el = document.getElementById("sr-live");
      if (!el) return;
      el.textContent = "";
      requestAnimationFrame(() => { el.textContent = String(msg || ""); });
    }

    // Compose display created early (ports resolve Shell later)
    ComposeDisplay = ComposeApi.createDisplay({
      displayInput,
      getText,
      setText,
      focusDisplayInput,
      announceLive,
      openModal: (id) => ports.openModal(id),
      closeModals: () => ports.closeModals(),
      isFeatMessageWords: () => Features.get("messageWords"),
      getSavedSelection: () => savedDisplaySelection,
      setSavedSelection: (sel) => { savedDisplaySelection = sel; },
      scheduleKeyboardAlign,
      getCurrentFontSize: () => currentFontSize
    });
    const syncComposeStrip = () => ComposeDisplay.syncComposeStrip();
    const getDisplayCaretRange = () => ComposeDisplay.getDisplayCaretRange();
    const insertTextAtDisplayCaret = (t) => ComposeDisplay.insertTextAtDisplayCaret(t);
    const deleteWholeWordBeforeCaret = () => ComposeDisplay.deleteWholeWordBeforeCaret();
    const moveDisplayCaretLeft = () => ComposeDisplay.moveDisplayCaretLeft();
    const openTagInsertModal = () => ComposeDisplay.openTagInsertModal();
    const autosizeDisplayInput = () => ComposeDisplay.autosizeDisplayInput();
    ComposeDisplay.bind();

    /** Advanced optional UI — Settings → Advanced (table-driven). */
    const Features = FeaturesApi.create({
      lsGet,
      lsSet,
      onChange: () => {
        syncComposeStrip();
        syncGeneratedAudioActions();
        if (Topics) Topics.renderSoundButtons();
      }
    });

    function getSpeakText() {
      const full = getText();
      const { start, end } = getDisplayCaretRange();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return full.substring(start, end);
      }
      return full;
    }

    /** Canonical compose typing path: orthography then setText. */
    function composeInsert(chunk) {
      const text = getText();
      const { start, end } = getDisplayCaretRange();
      if (window.VoicePredict && typeof VoicePredict.applyInsert === "function") {
        const res = VoicePredict.applyInsert(text, start, end, chunk);
        setText(res.text, res.caret);
      } else {
        setText(text.substring(0, start) + chunk + text.substring(end), start + String(chunk).length);
      }
      focusDisplayInput();
    }

    function initVoiceOsk() {
      const panel = $("osk-panel");
      if (!panel || !window.VoiceOsk || typeof VoiceOsk.bindCompose !== "function") return;
      VoiceOsk.bindCompose({
        panel,
        toggleBtn: $("compose-osk-btn"),
        displayInput,
        getText,
        setText,
        getCaret: getDisplayCaretRange,
        focus: focusDisplayInput,
        composeInsert,
        lsGet,
        lsSet,
        onChange: null,
        onSystemKeyboard: expectSystemKeyboard,
        onLayout: () => scheduleKeyboardAlign({ settle: true }),
        selectAll: () => {
          try {
            displayInput.focus();
            displayInput.select();
          } catch (_) {}
        },
        clipboard: async (op) => {
          const text = getText();
          const { start, end } = getDisplayCaretRange();
          const a = Math.min(start, end);
          const b = Math.max(start, end);
          if (op === "copy" || op === "cut") {
            const slice = a !== b ? text.slice(a, b) : text;
            if (slice && navigator.clipboard?.writeText) {
              await navigator.clipboard.writeText(slice).catch(() => {});
            }
            if (op === "cut" && a !== b) setText(text.slice(0, a) + text.slice(b), a);
          } else if (op === "paste" && navigator.clipboard?.readText) {
            const clip = await navigator.clipboard.readText().catch(() => "");
            if (clip) composeInsert(clip);
          }
        }
      });
    }

    function syncGeneratedAudioActions() {
      const hasText = canAssignFromDisplay();
      const replayOk = canReplay(lastGeneratedAudio, getText());

      const replayBtn = document.getElementById("textarea-replay-btn");
      const assignBtn = document.getElementById("textarea-assign-btn");
      const composePin = document.getElementById("compose-pin-btn");
      const composeReplay = document.getElementById("compose-replay-btn");
      if (replayBtn) replayBtn.style.display = replayOk ? "" : "none";
      if (assignBtn) {
        assignBtn.disabled = !hasText;
        assignBtn.classList.toggle("is-disabled", !hasText);
        assignBtn.title = hasText ? "Assign to button" : "Type something to assign";
      }
      if (composePin) {
        composePin.disabled = !hasText;
        composePin.classList.toggle("is-disabled", !hasText);
        composePin.title = hasText ? "Pin message to button" : "Type something to pin";
      }
      if (composeReplay) {
        composeReplay.disabled = !replayOk;
        composeReplay.classList.toggle("is-disabled", !replayOk);
        composeReplay.title = replayOk ? "Replay message" : "Speak first to enable replay";
      }
      if (Compose && Compose.isOpen()) Compose.render();
      const showAudio = Features.get("messageWords") && replayOk;
      if (audioActionsBar) audioActionsBar.classList.toggle("active", showAudio);
      document.getElementById("compose-strip")?.classList.toggle("has-audio", showAudio);
    }

    displayInput.addEventListener("input", () => {
      autosizeDisplayInput();
      syncGeneratedAudioActions();
      syncComposeStrip();
      ports.onWorkspaceDisplayInput();
    });
    displayInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (Speech && !speakBtn?.disabled) Speech.speakText();
        return;
      }
      if (e.key === "Backspace" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        deleteWholeWordBeforeCaret();
        return;
      }
      if (e.key === " " && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        moveDisplayCaretLeft();
      }
    });
    window.addEventListener("resize", () => {
      autosizeDisplayInput();
      const active = Topics && Topics.getActiveTopic();
      if (active) Topics.autosizeSoundCanvas(active);
    });

    // Expose only handlers used by index.html onclick= attributes
    window.openModal = (id) => ports.openModal(id);
    window.closeModals = () => ports.closeModals();
    window.applyTheme = (t) => ports.applyTheme(t);
    window.openIconStudio = (id) => Icons?.openIconStudio(id);
    window.closeIconStudio = (save) => Icons?.closeIconStudio(save);
    window.setStudioIconSize = (px, btn) => Icons?.setStudioIconSize(px, btn);
    window.stepModalGrid = (...a) => { if (Topics) Topics.stepModalGrid(...a); };

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const studioOpen = document.getElementById("icon-studio-modal")?.classList.contains("open");
      if (studioOpen) {
        e.preventDefault();
        if (Icons) Icons.closeIconStudio(false);
        return;
      }
      if (document.body.classList.contains("modal-open") || document.getElementById("modal-overlay")?.classList.contains("open")) {
        e.preventDefault();
        ports.closeModals();
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

    /** Amplifier: 10 stops -> gain 1-10; label shows 100%-1000%. */
    function syncVolumeSlider() {
      if (!volumeSlider || !valVolume) return;
      const saved = lsGet("elevenlabs_volume");
      if (saved !== null && saved !== "") {
        const n = parseFloat(saved);
        // Migrate legacy values to nearest stop 1-10
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

    // ==================== SHELL + TOPICS + WORKSPACE + SPEECH + VOICES ====================
    Shell = ShellUiApi.create({
      sidebar,
      mobileLayoutMq: MOBILE_LAYOUT_MQ,
      focusDisplayInput,
      lsGet,
      lsSet,
      lsDel,
      getTheme: () => currentTheme,
      setTheme: (t) => { currentTheme = t; },
      getAccent: () => customAccentColor,
      setAccent: (c) => { customAccentColor = c; },
      onHistoryTab: () => ports.renderHistory(),
      onVoiceTab: () => {
        if (Voices) Voices.syncSelectedVoiceSummary();
      },
      onSettingsTab: () => ports.refreshOutputDevices(),
      isHeaderMenuOpen: () => !!(Workspace && Workspace.isHeaderTopicMenuOpen()),
      closeHeaderMenu: () => Workspace?.setHeaderTopicMenuOpen(false),
      isComposeMenuOpen: () => !!(Compose && Compose.isOpen()),
      closeComposeMenu: () => Compose?.setOpen(false),
      onCloseModal: () => {
        if (Topics) Topics.resetEditState();
        document.getElementById("workspace-header-shell")?.classList.remove("menu-open");
        // Overlay / Escape: finish API-key cancel (revert model / browser fallback).
        if (Voices && typeof Voices.onApiKeyModalDismissed === "function") {
          try { Voices.onApiKeyModalDismissed(); } catch (_) {}
        } else if (ElevenKey && typeof ElevenKey.onShellModalsClosed === "function") {
          try { ElevenKey.onShellModalsClosed(); } catch (_) {}
        }
      }
    });
    Shell.bind();

    HistoryUi = HistoryUiApi.create({
      $,
      escapeHtml,
      lsSet,
      lsGetJson,
      asArray,
      makeSpeechItem,
      isUtteranceSource,
      canUseGeneratedActions,
      playSpeechSource: (...a) => ports.playSpeechSource(...a),
      setText,
      focusDisplayInput,
      closeModals: () => ports.closeModals(),
      onLastGenerated: (item) => {
        lastGeneratedAudio = item;
        syncGeneratedAudioActions();
      }
    });
    HistoryUi.bind();
    document.getElementById("textarea-replay-btn")?.addEventListener("click", () => {
      if (canUseGeneratedActions(lastGeneratedAudio)) ports.playSpeechSource(lastGeneratedAudio);
      else focusDisplayInput();
    });

    Icons = IconStudioApi.create({
      fallbackCatalog: ICON_DATABASE_FALLBACK,
      mapSymbol,
      escapeHtml,
      openModal: (id) => ports.openModal(id),
      closeModals: () => ports.closeModals(),
      modalOverlay: Shell.modalOverlay,
      lsSet,
      getIconStyles: () => ({ fill: iconFill, wght: iconWght, grad: iconGrad, opsz: iconOpsz }),
      setIconStyles: (s) => {
        iconFill = s.fill;
        iconWght = s.wght;
        iconGrad = s.grad;
        iconOpsz = s.opsz;
      },
      applyGlobalIconStyles
    });

    // Shared ports bag for Topics (no per-call identity re-wraps inside Topics).
    const topicsDeps = {
      $,
      trim,
      clamp,
      generateId,
      escapeHtml,
      lsGet,
      lsSet,
      COLOR_PALETTE,
      DEFAULT_GRID_ROWS,
      getDefaultGridCols,
      mapSymbol,
      soundCanvas,
      openModal: (id) => ports.openModal(id),
      closeModals: () => ports.closeModals(),
      focusDisplayInput,
      announceLive,
      playSpeechSource: (...a) => ports.playSpeechSource(...a),
      getText,
      getAssignSource,
      canAssignFromDisplay,
      isUtteranceSource,
      getUtteranceText,
      getButtonSourceText,
      isMobileLayout: () => ports.isMobileLayout(),
      isFeatButtonInsert: () => Features.get("buttonInsert"),
      closeMobileSidebar: () => ports.closeMobileSidebar(),
      insertTextAtDisplayCaret,
      initialTopicsRaw: lsGetJson("aac_tabs", null)
    };

    Workspace = WorkspaceApi.create({
      trim,
      clamp,
      lsGet,
      lsSet,
      lsGetJson,
      getText,
      setText,
      focusDisplayInput,
      syncComposeStrip,
      syncGeneratedAudioActions,
      autosizeDisplayInput,
      escapeHtml,
      topicsDeps
    });
    Topics = Workspace.topics;

    Compose = ComposeApi.createActions({
      canAssignFromDisplay,
      getText,
      canReplay,
      canUseGeneratedActions,
      getLastGeneratedAudio: () => lastGeneratedAudio,
      clearDisplayText: () => ports.clearDisplayText(),
      startAssignFromDisplay: () => Topics.startAssignFromDisplay(),
      playSpeechSource: (...a) => ports.playSpeechSource(...a),
      openTagInsertModal,
      openModal: (id) => ports.openModal(id),
      renderHistory: () => ports.renderHistory(),
      setHeaderTopicMenuOpen: (open) => Workspace.setHeaderTopicMenuOpen(open)
    });
    Compose.bind();

    function applyImportedSettings(settings) {
      if (!settings || typeof settings !== "object") return;
      if (settings.theme) ports.applyTheme(settings.theme);
      if (Object.prototype.hasOwnProperty.call(settings, "accentColor")) {
        ports.applyAccentColor(settings.accentColor || "");
      }
      if (Number.isFinite(Number(settings.fontSize))) {
        currentFontSize = clamp(parseInt(settings.fontSize, 10) || 28, 16, 48);
        lsSet("aac_font_size", currentFontSize);
        applyDisplayFontSize();
      }
      if (settings.model) Voices.setModel(settings.model);
      if (settings.piperVoice) Voices.setPiperVoiceId(settings.piperVoice);
      const fireSlider = (el, value) => {
        if (!el || value == null || value === "") return;
        el.value = value;
        el.dispatchEvent(new Event("input"));
      };
      fireSlider(speedSlider, settings.speed);
      fireSlider(pitchSlider, settings.pitch);
      if (settings.volume != null && settings.volume !== "" && volumeSlider) {
        const n = parseFloat(settings.volume);
        fireSlider(volumeSlider, Number.isFinite(n) ? String(clamp(Math.round(n), 1, VOLUME_STOP_COUNT)) : settings.volume);
      }
      if (settings.iconFill != null) iconFill = parseInt(settings.iconFill, 10) || 0;
      if (settings.iconWght != null) iconWght = parseInt(settings.iconWght, 10) || 400;
      if (settings.iconGrad != null) iconGrad = parseInt(settings.iconGrad, 10) || 0;
      if (settings.iconOpsz != null) iconOpsz = parseInt(settings.iconOpsz, 10) || 24;
      lsSet("aac_icon_fill", iconFill);
      lsSet("aac_icon_wght", iconWght);
      lsSet("aac_icon_grad", iconGrad);
      lsSet("aac_icon_opsz", iconOpsz);
      Features.importFrom(settings);
      applyGlobalIconStyles();
    }

    BoardIo = BoardIoApi.create({
      topics: Topics,
      generateId,
      lsSet,
      getSettings: () => ({
        theme: currentTheme,
        accentColor: customAccentColor || "",
        fontSize: currentFontSize,
        model: modelSelect?.value || "browser_tts",
        piperVoice: Voices ? Voices.getPiperVoiceId() || "" : "",
        speed: speedSlider?.value || "1",
        pitch: pitchSlider?.value || "1",
        volume: volumeSlider?.value || "1",
        iconFill,
        iconWght,
        iconGrad,
        iconOpsz,
        ...Features.exportTo()
      }),
      applyImportedSettings,
      onAfterImport: () => {
        Workspace.reconcileChatsAfterTopicChange();
        if (Voices) Voices.syncSelectedVoiceSummary();
      },
      openModal: (id) => ports.openModal(id),
      closeModals: () => ports.closeModals(),
      announceLive,
      focusDisplayInput
    });
    BoardIo.bind();

    Speech = SpeechPlaybackApi.create({
      AudioFx,
      Eleven,
      Piper,
      SpeechEngines,
      speakBtn,
      modelSelect,
      volumeGainMax: VOLUME_GAIN_MAX,
      getVolumeGain,
      getSpeechSpeed,
      getSpeechPitch,
      getSpeechFx,
      modelId,
      lsGet,
      lsSet,
      lsDel,
      trim,
      withTimeout,
      blobToDataUrl,
      getSpeakText,
      getVoiceSelection: () => (Voices
        ? {
          piperVoiceId: Voices.getPiperVoiceId(),
          elevenVoiceId: Voices.getElevenVoiceId(),
          browserVoiceIndex: Voices.getBrowserVoiceIndex()
        }
        : {
          piperVoiceId: Piper.DEFAULT_VOICE_ID,
          elevenVoiceId: "",
          browserVoiceIndex: 0
        }),
      addToHistory: (...a) => ports.addToHistory(...a),
      isUtteranceSource,
      getUtteranceText,
      focusDisplayInput,
      announceLive,
      onAfterSpeakLearn: (text) => {
        if (window.VoicePredict && typeof VoicePredict.learnText === "function") {
          try { VoicePredict.learnText(text); } catch (_) {}
        }
      },
      onElevenUnavailable: (opts) => {
        if (Voices && typeof Voices.handleInvalidElevenKey === "function") {
          try { Voices.handleInvalidElevenKey(opts || { silent: true }); } catch (_) {}
        } else if (ElevenKey && typeof ElevenKey.revokeAndFallback === "function") {
          try { ElevenKey.revokeAndFallback(opts || { silent: true }); } catch (_) {}
        }
      }
    });

    ElevenKey = ElevenKeyApi.create({
      $,
      lsGet,
      lsSet,
      Eleven,
      openModal: (id) => ports.openModal(id),
      closeModals: () => ports.closeModals(),
      isElevenModelSelected: () => !!(Voices && Voices.isElevenModelSelected && Voices.isElevenModelSelected()),
      onNeedBrowserFallback: () => { Voices?.fallbackToDefaultModel(); },
      onRevertModel: (mid) => { Voices?.applyModelUi(mid, { persist: true }); },
      onCommitPendingModel: (mid) => { Voices?.applyModelUi(mid, { persist: true }); },
      onKeyStateChanged: (state) => { Voices?.onElevenKeyStateChanged(state); }
    });
    ElevenKey.bind();

    Voices = VoicesControllerApi.create({
      $,
      lsGet,
      lsSet,
      escapeHtml,
      modelSelect,
      SpeechEngines,
      Piper,
      Eleven,
      ElevenKey,
      VoicesFilters,
      VoicesPanel,
      getSpeechSpeed,
      getSpeechPitch,
      getVolumeGain,
      playPreviewBlob: (blob, fx) => Speech.playPreviewBlob(blob, fx),
      openModal: (id) => ports.openModal(id),
      closeModals: () => ports.closeModals(),
      focusDisplayInput
    });
    Voices.bind();
    Speech.bind();
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
      ports.applyTheme(currentTheme);
      applyGlobalIconStyles();
      syncOfflineBanner();
      window.addEventListener("online", syncOfflineBanner);
      window.addEventListener("offline", syncOfflineBanner);
      registerServiceWorker();

      syncVolumeSlider();
      syncSlider(speedSlider, valSpeed, "elevenlabs_speed");
      syncSlider(pitchSlider, valPitch, "aac_pitch");

      Voices.syncSelectedVoiceSummary();
      Voices.updateApiKeyStatus();

      Features.bind();
      const outputSelect = document.getElementById("output-device-select");
      if (outputSelect) {
        outputSelect.addEventListener("change", (e) => {
          ports.setActiveOutputDevice(e.target.value).catch(() => {});
        });
      }
      ports.refreshOutputDevices();
      if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === "function") {
        navigator.mediaDevices.addEventListener("devicechange", () => ports.refreshOutputDevices());
      }

      if (ports.isMobileLayout()) ports.setSidebarOpen(false, { restoreFocus: false });

      const accentPicker = document.getElementById("accent-color-picker");
      if (accentPicker) {
        accentPicker.value = customAccentColor || Shell.getDefaultAccentForResolvedTheme();
        accentPicker.addEventListener("input", (e) => ports.applyAccentColor(e.target.value));
      }
      document.getElementById("accent-color-reset")?.addEventListener("click", () => {
        ports.applyAccentColor("");
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

      ensureKeyboard()?.bind();
      initVoiceOsk();

      Workspace.render();
      Features.apply();
      Shell.initRoute();
      autosizeDisplayInput();
      ports.syncChatUi();
      if (!ports.isCoachDismissed()) ports.showCoach();
      if (!ports.isMobileLayout()) focusDisplayInput();
    }

    window.addEventListener("DOMContentLoaded", init);
