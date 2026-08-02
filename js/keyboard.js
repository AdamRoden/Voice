/**
 * Soft-keyboard layout: pin the app shell to the visual viewport so the
 * compose dock sits on the keyboard top. One strategy — viewport frame + CSS
 * (html.keyboard-open); no multi-timeout scroll fights.
 *
 * Two frames only:
 *   closed — fixed inset 0 (layout viewport). Standalone min-height/paint is CSS.
 *   keyboard — pin body to visualViewport while the *system* soft keyboard is up.
 * Custom OSK never uses the keyboard frame (avoids short vv + black band).
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

  function resetDocumentScroll() {
    try {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (_) {}
  }

  /** Clear every inline shell property this module may set (closed or keyboard). */
  function clearShellInlineStyles() {
    const b = document.body;
    if (b) {
      b.style.position = "";
      b.style.top = "";
      b.style.left = "";
      b.style.right = "";
      b.style.bottom = "";
      b.style.width = "";
      b.style.height = "";
      b.style.minHeight = "";
      b.style.maxHeight = "";
      b.style.transform = "";
    }
    const root = document.documentElement;
    if (root) {
      root.style.height = "";
      root.style.minHeight = "";
    }
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

    function isCustomOskVisible() {
      return !!(document.body && document.body.classList.contains("osk-visible"));
    }

    /**
     * Closed frame: layout viewport, L/R/B flush. No screen.* / pixel height —
     * browser chrome stays correct; standalone home-indicator paint is CSS.
     */
    function applyClosedShell() {
      clearShellInlineStyles();
      document.body.style.position = "fixed";
      document.body.style.top = "0";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.bottom = "0";
      document.body.style.width = "100%";
      document.body.style.height = "auto";
      document.body.style.minHeight = "0";
      document.body.style.maxHeight = "none";
      document.body.style.transform = "";
      resetDocumentScroll();
    }

    /** System soft keyboard: pin body to visualViewport (clears closed-frame styles first). */
    function applyKeyboardPin(vv) {
      clearShellInlineStyles();
      const vvH = Math.max(1, Math.round(vv.height));
      const w = Math.max(1, Math.round(vv.width));
      const top = Math.round(vv.offsetTop || 0);
      const left = Math.round(vv.offsetLeft || 0);
      document.body.style.position = "fixed";
      document.body.style.top = `${top}px`;
      document.body.style.left = `${left}px`;
      document.body.style.width = `${w}px`;
      document.body.style.height = `${vvH}px`;
      document.body.style.maxHeight = `${vvH}px`;
      document.body.style.transform = "";
      resetDocumentScroll();
    }

    /**
     * Prefer closed shell. Only pin for system soft keyboard (or OSK→system handoff).
     * Custom OSK always stays on the closed frame.
     */
    function shouldPinToKeyboard(state) {
      if (state.forcePin) return true;
      if (state.customOsk) return false;
      if (state.keyboardOpen) return true;
      // Mobile: pin early while composing so the shell tracks the system KB open.
      if (isMobileLayout() && state.composing) return true;
      return false;
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
      const composing = typing || (dockChrome && (forcePin || softKb));
      const keyboardOpen = softKb && (typing || forcePin || dockChrome);
      const pin = shouldPinToKeyboard({ forcePin, customOsk, keyboardOpen, composing });

      if (root) {
        root.classList.toggle("keyboard-open", !!pin);
        if (vv) {
          root.style.setProperty("--vv-height", `${Math.max(1, Math.round(vv.height))}px`);
          root.style.setProperty("--vv-offset-top", `${Math.round(vv.offsetTop || 0)}px`);
        } else {
          root.style.setProperty("--vv-height", `${window.innerHeight}px`);
          root.style.setProperty("--vv-offset-top", "0px");
        }
      }

      if (pin && vv) {
        applyKeyboardPin(vv);
        return;
      }
      applyClosedShell();
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
