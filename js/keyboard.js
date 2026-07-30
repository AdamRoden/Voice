/**
 * Soft-keyboard layout: pin the app shell to the visual viewport so the
 * compose dock sits on the keyboard top. One strategy — viewport frame + CSS
 * (html.keyboard-open); no multi-timeout scroll fights.
 */
(function (global) {
  "use strict";

  function isTextEntryElement(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") {
      const type = String(el.type || "text").toLowerCase();
      return !/^(button|submit|reset|checkbox|radio|file|image|range|color|hidden)$/.test(type);
    }
    return !!el.isContentEditable;
  }

  /** Compose dock chrome (OSK toggle, speak, etc.) — keep pin while focusing these. */
  function isComposeDockChrome(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(".bottom-dock-wrap, .bottom-dock, .osk-panel");
  }

  function isSoftKeyboardOpen() {
    const vv = window.visualViewport;
    if (!vv) return false;
    const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
    // iOS keyboard animation: also treat a large offsetTop pan as "open".
    const inset = Math.max(0, layoutH - vv.height);
    const pan = Math.max(0, vv.offsetTop || 0);
    return inset > 120 || pan > 80;
  }

  /** Home-screen / installed web app (iOS uses navigator.standalone). */
  function isStandaloneDisplay() {
    try {
      if (typeof navigator !== "undefined" && navigator.standalone === true) return true;
      if (typeof window !== "undefined" && window.matchMedia) {
        if (window.matchMedia("(display-mode: standalone)").matches) return true;
        if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Layout height when the soft keyboard is closed. Prefer the larger of
   * visualViewport vs innerHeight so iOS home-screen PWAs never leave a gap
   * under a short visualViewport reading.
   */
  function closedShellHeight() {
    const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
    const vv = window.visualViewport;
    const vvH = vv ? Math.round(vv.height) : 0;
    return Math.max(1, layoutH, vvH);
  }

  function resetDocumentScroll() {
    try {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (_) {}
  }

  function clearBodyPinStyles() {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.width = "";
    document.body.style.height = "";
    document.body.style.maxHeight = "";
    document.body.style.transform = "";
  }

  /**
   * @param {object} opts
   * @param {() => boolean} opts.isMobileLayout
   * @returns {{ sync: Function, schedule: Function, bind: Function, expectSystemKeyboard: Function, isTextEntryElement: Function }}
   */
  function createController(opts) {
    const isMobileLayout = typeof opts.isMobileLayout === "function"
      ? opts.isMobileLayout
      : () => false;

    let raf = 0;
    /** @type {number[]} */
    let settleTimers = [];
    /** Keep shell pinned while OSK → system keyboard handoff (iOS focus dance). */
    let forcePinUntil = 0;

    function clearSettle() {
      for (let i = 0; i < settleTimers.length; i++) clearTimeout(settleTimers[i]);
      settleTimers = [];
    }

    function clearBodyToClosed() {
      clearBodyPinStyles();
      if (isStandaloneDisplay()) {
        document.body.style.height = "";
      } else {
        document.body.style.height = `${closedShellHeight()}px`;
      }
    }

    function isCustomOskVisible() {
      return !!(document.body && document.body.classList.contains("osk-visible"));
    }

    function sync() {
      const vv = window.visualViewport;
      const root = document.documentElement;
      const active = document.activeElement;
      const typing = isTextEntryElement(active);
      const dockChrome = isComposeDockChrome(active);
      const forcePin = Date.now() < forcePinUntil;
      const softKb = isSoftKeyboardOpen();
      const customOsk = isCustomOskVisible();
      // Dock chrome counts while handing off to the system keyboard.
      const composing = typing || (dockChrome && (forcePin || softKb));
      const keyboardOpen = softKb && (typing || forcePin || dockChrome);
      /*
       * Pin the shell only for the *system* soft keyboard (or handoff).
       * Do NOT pin while the custom OSK is up: focusing the field with
       * inputmode=none still set pinShell before, which shortened body to a
       * short visualViewport and stacked home-indicator padding on top —
       * dark-gray OSK strip + pure-black gap under it on iOS PWAs.
       */
      const pinShell = forcePin
        || keyboardOpen
        || (isMobileLayout() && composing && !customOsk);

      if (root) {
        root.classList.toggle("keyboard-open", !!pinShell);
        // System keyboard covers the home indicator — drop CSS safe-bottom.
        // Custom OSK keeps env() so keys clear the home indicator once.
        if (pinShell) {
          root.style.setProperty("--safe-bottom", "0px");
        } else {
          root.style.removeProperty("--safe-bottom");
        }
        if (vv) {
          root.style.setProperty("--vv-height", `${Math.max(1, Math.round(vv.height))}px`);
          root.style.setProperty("--vv-offset-top", `${Math.round(vv.offsetTop || 0)}px`);
        } else {
          root.style.setProperty("--vv-height", `${window.innerHeight}px`);
          root.style.setProperty("--vv-offset-top", "0px");
        }
      }

      // Desktop: leave layout alone unless system keyboard is open.
      if (!isMobileLayout() && !keyboardOpen && !forcePin) {
        clearBodyPinStyles();
        return;
      }

      // Custom OSK: full-screen CSS shell (no fixed pin).
      if (customOsk && !forcePin && !keyboardOpen) {
        clearBodyToClosed();
        return;
      }

      if (vv) {
        // When system KB is open use visualViewport; otherwise prefer the larger
        // closed height so we never leave a black strip under a short vv reading.
        const vvH = Math.max(1, Math.round(vv.height));
        const h = (keyboardOpen || forcePin)
          ? vvH
          : Math.max(vvH, closedShellHeight());
        const w = Math.max(1, Math.round(vv.width));
        const top = (keyboardOpen || forcePin) ? Math.round(vv.offsetTop || 0) : 0;
        const left = Math.round(vv.offsetLeft || 0);
        if (pinShell) {
          document.body.style.position = "fixed";
          document.body.style.top = `${top}px`;
          document.body.style.left = `${left}px`;
          document.body.style.width = `${w}px`;
          document.body.style.height = `${h}px`;
          document.body.style.maxHeight = `${h}px`;
          document.body.style.transform = "";
          resetDocumentScroll();
        } else if (isMobileLayout()) {
          clearBodyToClosed();
        }
      } else if (isMobileLayout()) {
        clearBodyToClosed();
      }
    }

    /**
     * Coalesce focus/resize into rAF passes, plus multi-stage settle for iOS
     * system-keyboard animation (~250–500ms on open).
     */
    function schedule(opts) {
      const withSettle = !!(opts && opts.settle);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        sync();
        // One deferred pass after Safari applies its own pan.
        requestAnimationFrame(sync);
      });
      if (withSettle) {
        clearSettle();
        // Staggered samples through the keyboard slide-up (iOS PWA is slow).
        const delays = [80, 200, 350, 500, 700];
        for (let i = 0; i < delays.length; i++) {
          const t = setTimeout(() => {
            settleTimers = settleTimers.filter((id) => id !== t);
            sync();
          }, delays[i]);
          settleTimers.push(t);
        }
      }
    }

    /**
     * Call when switching custom OSK → system keyboard so the shell stays
     * pinned through the blur/focus handoff and keyboard animation.
     */
    function expectSystemKeyboard() {
      forcePinUntil = Date.now() + 900;
      schedule({ settle: true });
    }

    function bind() {
      // Single focus entry — covers display + modals (no duplicate focus listeners).
      document.addEventListener("focusin", (e) => {
        if (!isTextEntryElement(e.target) && !isComposeDockChrome(e.target)) return;
        schedule({ settle: true });
        // Keep focused fields visible inside full-window / scrolling modals.
        const field = e.target;
        if (!isTextEntryElement(field)) return;
        requestAnimationFrame(() => {
          try {
            const modal = field.closest && field.closest(".modal.open");
            if (!modal) return;
            field.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
          } catch (_) {
            try { field.scrollIntoView(true); } catch (__) {}
          }
        });
      });
      document.addEventListener("focusout", () => {
        requestAnimationFrame(() => {
          const active = document.activeElement;
          if (isTextEntryElement(active) || isComposeDockChrome(active)) {
            // Stay pinned while the OSK toggle (or other dock control) has focus.
            sync();
            return;
          }
          if (Date.now() < forcePinUntil) {
            // Handoff window: OSK → system keyboard; do not unpin yet.
            schedule({ settle: true });
            return;
          }
          clearSettle();
          forcePinUntil = 0;
          document.documentElement.classList.remove("keyboard-open");
          sync();
        });
      });
      window.addEventListener("resize", () => schedule({ settle: true }));
      window.addEventListener("orientationchange", () => schedule({ settle: true }));
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", () => schedule({ settle: true }));
        window.visualViewport.addEventListener("scroll", schedule);
      }
      window.addEventListener("scroll", () => {
        if (isTextEntryElement(document.activeElement) || Date.now() < forcePinUntil) {
          resetDocumentScroll();
        }
      }, { passive: true });
      schedule();
    }

    return {
      sync,
      schedule,
      bind,
      expectSystemKeyboard,
      isTextEntryElement
    };
  }

  global.AacKeyboard = {
    createController,
    isTextEntryElement,
    isSoftKeyboardOpen,
    resetDocumentScroll
  };
})(typeof window !== "undefined" ? window : globalThis);
