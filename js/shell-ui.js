/**
 * Shell chrome: theme/accent, sidebar, routes, modals, coach + advanced feature flags.
 * Exposes AacShellUi and AacFeatures.
 */

(function (global) {
  "use strict";

  const VALID_SIDEBAR_TABS = new Set(["voice", "history", "topics"]);
  const DEFAULT_SIDEBAR_TAB = "topics";
  const COACH_DISMISS_KEY = "aac_coach_dismissed";
  /** Old hash routes map to current tabs. */
  const TAB_ALIASES = { settings: "voice" };

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
   *   onOpenSettings?: () => void,
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
    const coachBanner = document.getElementById("coach-banner");

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
      const picker = document.getElementById("accent-color-picker");
      if (picker) picker.value = d.getAccent() || getDefaultAccentForResolvedTheme();
    }

    function syncThemeColorMeta() {
      const resolved = document.documentElement.getAttribute("data-theme") || "dark";
      const color = resolved === "light" ? "#f0f4f9" : "#131314";
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

      if (t === "history" && typeof d.onHistoryTab === "function") d.onHistoryTab();
      if (t === "voice" && typeof d.onVoiceTab === "function") d.onVoiceTab();
      d.focusDisplayInput();
      return t;
    }

    function isMoreMenuOpen() {
      const menu = document.getElementById("sidebar-more-menu");
      return !!(menu && !menu.hidden);
    }

    function setMoreMenuOpen(open) {
      const menu = document.getElementById("sidebar-more-menu");
      const btn = document.getElementById("sidebar-more-btn");
      if (!menu || !btn) return;
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function runMoreAction(action) {
      setMoreMenuOpen(false);
      if (action === "appearance") {
        openModal("modal-appearance");
        return;
      }
      if (action === "settings") {
        openModal("modal-advanced-settings");
        if (typeof d.onOpenSettings === "function") d.onOpenSettings();
        return;
      }
      if (action === "help") {
        setSidebarOpen(false, { restoreFocus: false });
        if (coachBanner?.classList.contains("open")) setCoachOpen(false);
        else showCoach();
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

    function isCoachDismissed() {
      return d.lsGet(COACH_DISMISS_KEY, "") === "1";
    }

    function setCoachOpen(open) {
      if (!coachBanner) return;
      coachBanner.classList.toggle("open", !!open);
    }

    function dismissCoach() {
      d.lsSet(COACH_DISMISS_KEY, "1");
      setCoachOpen(false);
      d.focusDisplayInput();
    }

    function showCoach() {
      setCoachOpen(true);
    }

    function bind() {
      window.addEventListener("hashchange", onRouteChange);

      document.querySelectorAll(".sidebar-tab").forEach((tabEl) => {
        tabEl.addEventListener("click", () => {
          const wasClosed = !isSidebarOpen();
          switchSidebarTab(tabEl.dataset.tab, wasClosed);
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
        if (isMoreMenuOpen()) {
          setMoreMenuOpen(false);
          return;
        }
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

      document.getElementById("coach-dismiss-btn")?.addEventListener("click", dismissCoach);

      const moreBtn = document.getElementById("sidebar-more-btn");
      const moreMenu = document.getElementById("sidebar-more-menu");
      moreBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        setMoreMenuOpen(!isMoreMenuOpen());
      });
      moreMenu?.querySelectorAll("[data-more-action]").forEach((item) => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          runMoreAction(item.getAttribute("data-more-action"));
        });
      });
      document.addEventListener("click", (e) => {
        if (!isMoreMenuOpen()) return;
        if (e.target.closest?.("#sidebar-more-wrap")) return;
        setMoreMenuOpen(false);
      });
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
      closeModals,
      isCoachDismissed,
      showCoach,
      dismissCoach,
      tabFromHash,
      switchSidebarTab,
      applySidebarTab,
      setMoreMenuOpen,
      isMoreMenuOpen,
      initRoute,
      bind,
      get modalOverlay() { return modalOverlay; }
    };
  }

  global.AacShellUi = { create, VALID_SIDEBAR_TABS, DEFAULT_SIDEBAR_TAB };
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

