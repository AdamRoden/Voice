/**
 * Shell chrome: theme/accent, sidebar, routes, modals, help + feature flags.
 * Also hosts AacFloatMenu (shared fixed placement for floating menus).
 * Exposes AacFloatMenu, AacShellUi, and AacFeatures.
 */

/**
 * Fixed placement for floating menus (topic picker, compose actions).
 * Escapes parent overflow:hidden; clamps to visualViewport when available.
 *
 * overflow "shift" — full natural height, no scrollbar; clamp top/left
 *   (caller should keep content short enough to fit the viewport).
 * overflow "scroll" — cap maxHeight and allow overflow-y: auto.
 */
(function (global) {
  "use strict";

  function viewportRect() {
    const vv = window.visualViewport;
    if (vv) {
      const top = vv.offsetTop || 0;
      const left = vv.offsetLeft || 0;
      return {
        top,
        left,
        bottom: top + vv.height,
        right: left + vv.width,
        width: vv.width,
        height: vv.height
      };
    }
    return {
      top: 0,
      left: 0,
      bottom: window.innerHeight,
      right: window.innerWidth,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  /**
   * @param {HTMLElement} menu
   * @param {Element|DOMRect} anchor
   * @param {{
   *   prefer?: "above"|"below",
   *   overflow?: "shift"|"scroll",
   *   pad?: number,
   *   gap?: number,
   *   width?: number,
   *   maxHeight?: number,
   *   zIndex?: string|number
   * }} [opts]
   */
  function place(menu, anchor, opts) {
    if (!menu || menu.hidden) return;
    const o = opts || {};
    const pad = o.pad != null ? o.pad : 8;
    const gap = o.gap != null ? o.gap : 8;
    const prefer = o.prefer === "below" ? "below" : "above";
    const overflow = o.overflow === "scroll" ? "scroll" : "shift";
    const anchorRect = typeof anchor.getBoundingClientRect === "function"
      ? anchor.getBoundingClientRect()
      : anchor;

    menu.style.position = "fixed";
    menu.style.top = "0";
    menu.style.left = "0";
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.transform = "none";
    if (o.width != null) menu.style.width = `${Math.round(o.width)}px`;
    if (o.zIndex != null) menu.style.zIndex = String(o.zIndex);

    if (overflow === "shift") {
      menu.style.maxHeight = "none";
      menu.style.overflow = "visible";
    }

    const view = viewportRect();
    const mw = o.width != null ? o.width : menu.offsetWidth;
    let mh = menu.offsetHeight;

    if (overflow === "scroll") {
      const cap = o.maxHeight != null ? o.maxHeight : 320;
      const roomBelow = Math.max(0, view.bottom - pad - (anchorRect.bottom + gap));
      const roomAbove = Math.max(0, anchorRect.top - gap - (view.top + pad));
      let maxH = Math.min(cap, Math.max(120, prefer === "below" ? roomBelow : roomAbove));
      let top;
      if (prefer === "below") {
        top = anchorRect.bottom + gap;
        // Flip above when there is little room below and more above.
        if (maxH < 140 && roomAbove > roomBelow && roomAbove >= 120) {
          maxH = Math.min(cap, roomAbove);
          top = Math.max(view.top + pad, anchorRect.top - gap - maxH);
        }
      } else {
        maxH = Math.min(cap, Math.max(120, roomAbove));
        top = anchorRect.top - gap - Math.min(mh, maxH);
        if (top < view.top + pad) {
          top = anchorRect.bottom + gap;
          maxH = Math.min(cap, Math.max(80, roomBelow));
        }
      }
      menu.style.maxHeight = `${Math.round(Math.max(80, maxH))}px`;
      menu.style.overflowY = "auto";
      menu.style.overflowX = "hidden";

      let left = anchorRect.left + (anchorRect.width / 2) - (mw / 2);
      if (left + mw > view.right - pad) left = view.right - pad - mw;
      if (left < view.left + pad) left = view.left + pad;

      menu.style.top = `${Math.round(top)}px`;
      menu.style.left = `${Math.round(left)}px`;
      return;
    }

    // shift: prefer side, flip if needed, then clamp (no internal scroll)
    let top = prefer === "above"
      ? anchorRect.top - mh - gap
      : anchorRect.bottom + gap;

    if (prefer === "above" && top < view.top + pad) {
      const below = anchorRect.bottom + gap;
      if (below + mh <= view.bottom - pad || (view.bottom - below) >= (anchorRect.top - view.top)) {
        top = below;
      } else {
        top = view.top + pad;
      }
    } else if (prefer === "below" && top + mh > view.bottom - pad) {
      const above = anchorRect.top - mh - gap;
      if (above >= view.top + pad || (anchorRect.top - view.top) >= (view.bottom - anchorRect.bottom)) {
        top = above;
      } else {
        top = Math.max(view.top + pad, view.bottom - pad - mh);
      }
    }

    if (top + mh > view.bottom - pad) {
      top = Math.max(view.top + pad, view.bottom - pad - mh);
    }
    if (top < view.top + pad) top = view.top + pad;

    let left = anchorRect.left;
    if (left + mw > view.right - pad) left = view.right - pad - mw;
    left = Math.max(view.left + pad, left);

    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
  }

  /** Clear inline placement set by place(). */
  function clear(menu) {
    if (!menu) return;
    menu.style.position = "";
    menu.style.top = "";
    menu.style.left = "";
    menu.style.right = "";
    menu.style.bottom = "";
    menu.style.width = "";
    menu.style.maxHeight = "";
    menu.style.overflow = "";
    menu.style.overflowX = "";
    menu.style.overflowY = "";
    menu.style.transform = "";
    menu.style.zIndex = "";
  }

  global.AacFloatMenu = { place, clear, viewportRect };
})(typeof window !== "undefined" ? window : globalThis);

(function (global) {
  "use strict";

  const VALID_SIDEBAR_TABS = new Set(["voice", "history", "topics", "settings"]);
  const DEFAULT_SIDEBAR_TAB = "topics";
  /** Persisted dismiss for first-run help (legacy key name kept for continuity). */
  const HELP_DISMISS_KEY = "aac_coach_dismissed";
  const HELP_MODAL_ID = "modal-help";
  const SECTION_TITLES = {
    voice: "Voice",
    history: "History",
    topics: "Topics",
    settings: "Settings"
  };
  /** Old hash routes map to current tabs. */
  const TAB_ALIASES = { appearance: "settings" };

  /**
   * @param {{
   *   sidebar: HTMLElement,
   *   mobileLayoutMq: string,
   *   focusDisplayInput: () => void,
   *   lsGet: (k: string, fb?: any) => any,
   *   lsSet: (k: string, v: string) => void,
   *   lsDel: (k: string) => void,
   *   getTheme: () => string,
   *   setTheme: (t: string) => void,
   *   getAccent: () => string,
   *   setAccent: (c: string) => void,
   *   onHistoryTab?: () => void,
   *   onVoiceTab?: () => void,
   *   onSettingsTab?: () => void,
   *   isHeaderMenuOpen?: () => boolean,
   *   closeHeaderMenu?: () => void,
   *   isComposeMenuOpen?: () => boolean,
   *   closeComposeMenu?: () => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    for (const key of [
      "sidebar", "mobileLayoutMq", "focusDisplayInput",
      "lsGet", "lsSet", "lsDel", "getTheme", "setTheme", "getAccent", "setAccent"
    ]) {
      if (d[key] === undefined || d[key] === null) {
        throw new Error(`AacShellUi missing required dep: ${key}`);
      }
    }

    const sidebar = d.sidebar;
    const sidebarBackdrop = document.getElementById("sidebar-backdrop");
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const modalOverlay = document.getElementById("modal-overlay");

    function isMobileLayout() {
      return window.matchMedia(d.mobileLayoutMq).matches;
    }

    function isSidebarOpen() {
      if (isMobileLayout()) return sidebar.classList.contains("mobile-open");
      return !sidebar.classList.contains("collapsed");
    }

    function setSidebarOpen(open, { restoreFocus = true } = {}) {
      if (isMobileLayout()) {
        sidebar.classList.toggle("mobile-open", open);
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
      if (restoreFocus) d.focusDisplayInput();
    }

    function closeMobileSidebar() {
      if (isMobileLayout()) setSidebarOpen(false);
    }

    function getDefaultAccentForResolvedTheme() {
      const resolved = document.documentElement.getAttribute("data-theme") || "dark";
      return resolved === "light" ? "#0b57d0" : "#8ab4f8";
    }

    function accentHoverFrom(hex) {
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
        d.setAccent(color);
        root.style.setProperty("--accent", color);
        root.style.setProperty("--accent-hover", accentHoverFrom(color));
        if (persist) d.lsSet("aac_accent_color", color);
      } else {
        d.setAccent("");
        root.style.removeProperty("--accent");
        root.style.removeProperty("--accent-hover");
        if (persist) d.lsDel("aac_accent_color");
      }
      const hex = d.getAccent() || getDefaultAccentForResolvedTheme();
      if (global.AacColorPicker && typeof global.AacColorPicker.setFieldColor === "function") {
        global.AacColorPicker.setFieldColor("accent-color-field", hex);
      }
    }

    function syncThemeColorMeta() {
      const resolved = document.documentElement.getAttribute("data-theme") || "dark";
      const color = resolved === "light" ? "#f0f4f9" : "#0a0a0b";
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
    }

    function applyTheme(theme) {
      d.setTheme(theme);
      try { localStorage.setItem("aac_theme", theme); } catch (_) {}
      if (theme === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
      document.querySelectorAll(".theme-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.theme === theme);
      });
      applyAccentColor(d.getAccent() || "", { persist: false });
      syncThemeColorMeta();
    }

    function tabFromHash() {
      let raw = (location.hash || "").replace(/^#\/?/, "").split(/[/?#&]/)[0].toLowerCase();
      if (TAB_ALIASES[raw]) raw = TAB_ALIASES[raw];
      return VALID_SIDEBAR_TABS.has(raw) ? raw : DEFAULT_SIDEBAR_TAB;
    }

    function normalizeTab(tab) {
      let t = String(tab || "").toLowerCase();
      if (TAB_ALIASES[t]) t = TAB_ALIASES[t];
      return VALID_SIDEBAR_TABS.has(t) ? t : DEFAULT_SIDEBAR_TAB;
    }

    function updateSectionTitle(tab) {
      const titleEl = document.getElementById("sidebar-section-title");
      if (!titleEl) return;
      titleEl.textContent = SECTION_TITLES[tab] || SECTION_TITLES[DEFAULT_SIDEBAR_TAB];
    }

    function syncNavActive(tab) {
      const t = normalizeTab(tab);
      document.querySelectorAll(".sidebar-nav-btn").forEach((el) => {
        const nav = el.getAttribute("data-nav");
        const isContent = nav === t;
        el.classList.toggle("active", isContent);
        if (isContent) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      });
    }

    function applySidebarTab(tab, expandIfCollapsed = false) {
      const t = normalizeTab(tab);
      if (expandIfCollapsed && !isSidebarOpen()) {
        setSidebarOpen(true, { restoreFocus: false });
      }
      syncNavActive(t);
      updateSectionTitle(t);
      document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
      const content = document.getElementById(`tab-content-${t}`);
      if (content) content.classList.add("active");

      if (t === "history" && typeof d.onHistoryTab === "function") d.onHistoryTab();
      if (t === "voice" && typeof d.onVoiceTab === "function") d.onVoiceTab();
      if (t === "settings" && typeof d.onSettingsTab === "function") d.onSettingsTab();
      // Settings is interactive in the sidebar — don't steal focus to the compose field.
      if (t !== "settings") d.focusDisplayInput();
      return t;
    }

    /**
     * Open a shell modal; optionally close the mobile drawer first.
     * @param {string} id
     * @param {{ closeDrawer?: boolean }} [opts]
     */
    function openShellModal(id, opts) {
      const o = opts || {};
      if (o.closeDrawer !== false && isMobileLayout()) {
        setSidebarOpen(false, { restoreFocus: false });
      }
      openModal(id);
    }

    /** Open Settings as a sidebar tab (expands drawer / desktop rail if needed). */
    function openSettings() {
      const wasClosed = !isSidebarOpen();
      switchSidebarTab("settings", wasClosed);
    }

    function isSettingsOpen() {
      return !!document.getElementById("tab-content-settings")?.classList.contains("active");
    }

    function openHelpModal() {
      openShellModal(HELP_MODAL_ID, { closeDrawer: true });
    }

    function runNavAction(action) {
      const a = String(action || "").toLowerCase();
      if (a === "help") {
        openHelpModal();
        return;
      }
      if (VALID_SIDEBAR_TABS.has(a)) {
        const wasClosed = !isSidebarOpen();
        switchSidebarTab(a, wasClosed);
      }
    }

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

    function openModal(modalId) {
      document.querySelectorAll(".modal").forEach((m) => m.classList.remove("open"));
      const el = document.getElementById(modalId);
      if (!el) return;
      el.classList.add("open");
      if (modalOverlay) modalOverlay.classList.add("open");
      document.body.classList.add("modal-open");
    }

    function closeModals() {
      document.querySelectorAll(".modal").forEach((m) => m.classList.remove("open"));
      if (modalOverlay) modalOverlay.classList.remove("open");
      document.body.classList.remove("modal-open");
      if (typeof d.onCloseModal === "function") {
        try { d.onCloseModal(); } catch (_) {}
      }
      d.focusDisplayInput();
    }

    /**
     * Open a modal over the currently open one (Icon Studio, color picker).
     * Returns parent modal id (or null). Restore with closeNestedModal — does
     * not run onCloseModal, so parent edit state is preserved.
     */
    function openNestedModal(modalId) {
      const openParent = Array.from(document.querySelectorAll(".modal.open"))
        .find((m) => m.id !== modalId);
      const returnId = openParent ? openParent.id : null;
      openModal(modalId);
      return returnId;
    }

    /** Restore parent modal from openNestedModal, or full close if none. */
    function closeNestedModal(returnId) {
      if (returnId) {
        document.querySelectorAll(".modal").forEach((m) => m.classList.remove("open"));
        document.getElementById(returnId)?.classList.add("open");
        if (modalOverlay) modalOverlay.classList.add("open");
        document.body.classList.add("modal-open");
      } else {
        closeModals();
      }
    }

    function isHelpDismissed() {
      return d.lsGet(HELP_DISMISS_KEY, "") === "1";
    }

    /** @deprecated Use isHelpDismissed — alias for app ports. */
    function isCoachDismissed() {
      return isHelpDismissed();
    }

    function dismissHelp() {
      d.lsSet(HELP_DISMISS_KEY, "1");
      closeModals();
      d.focusDisplayInput();
    }

    /** First-run / Help entry: same as openHelpModal. */
    function showCoach() {
      openHelpModal();
    }

    function bind() {
      window.addEventListener("hashchange", onRouteChange);

      document.querySelectorAll(".sidebar-nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          runNavAction(btn.getAttribute("data-nav"));
        });
      });

      document.getElementById("toggle-sidebar-btn")?.addEventListener("click", () => {
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

      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (typeof d.isHeaderMenuOpen === "function" && d.isHeaderMenuOpen()) {
          if (typeof d.closeHeaderMenu === "function") d.closeHeaderMenu();
          return;
        }
        if (typeof d.isComposeMenuOpen === "function" && d.isComposeMenuOpen()) {
          if (typeof d.closeComposeMenu === "function") d.closeComposeMenu();
          return;
        }
        const voicesPanel = document.getElementById("voices-panel");
        if (voicesPanel?.classList.contains("open")) {
          voicesPanel.classList.remove("open");
          return;
        }
        if (isMobileLayout() && isSidebarOpen()) closeMobileSidebar();
      });

      window.matchMedia(d.mobileLayoutMq).addEventListener("change", (e) => {
        if (e.matches) {
          setSidebarOpen(false);
        } else {
          sidebar.classList.remove("mobile-open");
          if (sidebarBackdrop) sidebarBackdrop.classList.remove("open");
          sidebar.classList.remove("collapsed");
        }
      });

      document.getElementById("coach-dismiss-btn")?.addEventListener("click", dismissHelp);

      // Theme buttons use onclick="applyTheme(...)" in index.html via window.applyTheme

      if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
          if (e.target === modalOverlay) closeModals();
        });
      }
      document.querySelectorAll(".modal .modal-btn.secondary, .modal [data-close-modal]").forEach((btn) => {
        const handler = btn.getAttribute("onclick") || "";
        if (handler.includes("closeModals") || btn.hasAttribute("data-close-modal")) {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            closeModals();
          });
        }
      });
    }

    function initRoute() {
      const initialTab = tabFromHash();
      const next = `#/${initialTab}`;
      if (location.hash !== next) {
        const url = new URL(location.href);
        url.hash = `/${initialTab}`;
        history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      switchSidebarTab(initialTab, false, { fromRoute: true });
    }

    return {
      isMobileLayout,
      isSidebarOpen,
      setSidebarOpen,
      closeMobileSidebar,
      applyTheme,
      applyAccentColor,
      getDefaultAccentForResolvedTheme,
      openModal,
      openNestedModal,
      closeNestedModal,
      openShellModal,
      closeModals,
      isHelpDismissed,
      isCoachDismissed,
      showCoach,
      dismissHelp,
      tabFromHash,
      switchSidebarTab,
      applySidebarTab,
      openSettings,
      isSettingsOpen,
      openHelpModal,
      initRoute,
      bind,
      get modalOverlay() { return modalOverlay; },
      HELP_MODAL_ID
    };
  }

  global.AacShellUi = {
    create,
    VALID_SIDEBAR_TABS,
    DEFAULT_SIDEBAR_TAB,
    SECTION_TITLES,
    HELP_MODAL_ID
  };
})(typeof window !== "undefined" ? window : globalThis);

(function (global) {
  "use strict";

  /** @type {Record<string, { key: string, dataset: string, optId: string, settingsKey: string }>} */
  const SPEC = {
    messageWords: {
      key: "aac_feat_message_words",
      dataset: "featMessageWords",
      optId: "opt-message-words",
      settingsKey: "featMessageWords"
    },
    buttonInsert: {
      key: "aac_feat_button_insert",
      dataset: "featButtonInsert",
      optId: "opt-button-insert",
      settingsKey: "featButtonInsert"
    },
    insertTag: {
      key: "aac_feat_insert_tag",
      dataset: "featInsertTag",
      optId: "opt-insert-tag",
      settingsKey: "featInsertTag"
    },
    composeNew: {
      key: "aac_feat_compose_new",
      dataset: "featComposeNew",
      optId: "opt-compose-new",
      settingsKey: "featComposeNew"
    },
    composePin: {
      key: "aac_feat_compose_pin",
      dataset: "featComposePin",
      optId: "opt-compose-pin",
      settingsKey: "featComposePin"
    },
    composeReplay: {
      key: "aac_feat_compose_replay",
      dataset: "featComposeReplay",
      optId: "opt-compose-replay",
      settingsKey: "featComposeReplay"
    },
    composeHistory: {
      key: "aac_feat_compose_history",
      dataset: "featComposeHistory",
      optId: "opt-compose-history",
      settingsKey: "featComposeHistory"
    }
  };

  /**
   * @param {{
   *   lsGet: (k: string, fb?: any) => any,
   *   lsSet: (k: string, v: string) => void,
   *   onChange?: () => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    if (typeof d.lsGet !== "function" || typeof d.lsSet !== "function") {
      throw new Error("AacFeatures requires lsGet and lsSet");
    }

    const state = Object.create(null);

    function lsGetBool(key, defaultVal) {
      const v = d.lsGet(key, null);
      if (v == null || v === "") return defaultVal;
      return v === "1" || v === "true";
    }

    Object.keys(SPEC).forEach((id) => {
      state[id] = lsGetBool(SPEC[id].key, false);
    });

    function get(id) {
      return !!state[id];
    }

    function set(id, enabled, { silent = false } = {}) {
      if (!SPEC[id]) return;
      state[id] = !!enabled;
      d.lsSet(SPEC[id].key, state[id] ? "1" : "0");
      if (!silent) {
        apply();
        if (typeof d.onChange === "function") d.onChange();
      }
    }

    function apply() {
      const body = document.body;
      Object.keys(SPEC).forEach((id) => {
        const spec = SPEC[id];
        if (body) body.dataset[spec.dataset] = state[id] ? "1" : "0";
        const opt = document.getElementById(spec.optId);
        if (opt) opt.checked = !!state[id];
      });
    }

    function bind() {
      Object.keys(SPEC).forEach((id) => {
        const opt = document.getElementById(SPEC[id].optId);
        if (!opt) return;
        opt.addEventListener("change", (e) => {
          set(id, !!e.target.checked);
        });
      });
      apply();
    }

    /** Import all known feature keys from a settings object. */
    function importFrom(settings) {
      if (!settings || typeof settings !== "object") return;
      let any = false;
      Object.keys(SPEC).forEach((id) => {
        const sk = SPEC[id].settingsKey;
        if (Object.prototype.hasOwnProperty.call(settings, sk)) {
          state[id] = !!settings[sk];
          d.lsSet(SPEC[id].key, state[id] ? "1" : "0");
          any = true;
        }
      });
      if (any) {
        apply();
        if (typeof d.onChange === "function") d.onChange();
      }
    }

    /** Snapshot for board export. */
    function exportTo() {
      const out = {};
      Object.keys(SPEC).forEach((id) => {
        out[SPEC[id].settingsKey] = !!state[id];
      });
      return out;
    }

    return {
      SPEC,
      get,
      set,
      apply,
      bind,
      importFrom,
      exportTo
    };
  }

  global.AacFeatures = { create, SPEC };
})(typeof window !== "undefined" ? window : globalThis);

