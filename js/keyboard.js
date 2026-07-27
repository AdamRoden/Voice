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

  function isSoftKeyboardOpen() {
    const vv = window.visualViewport;
    if (!vv) return false;
    const layoutH = window.innerHeight || document.documentElement.clientHeight || 0;
    return (layoutH - vv.height) > 120;
  }

  function resetDocumentScroll() {
    try {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (_) {}
  }

  /**
   * @param {object} opts
   * @param {() => boolean} opts.isMobileLayout
   * @returns {{ sync: Function, schedule: Function, bind: Function, isTextEntryElement: Function }}
   */
  function createController(opts) {
    const isMobileLayout = typeof opts.isMobileLayout === "function"
      ? opts.isMobileLayout
      : () => false;

    let raf = 0;
    let settleTimer = 0;

    function clearSettle() {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = 0;
      }
    }

    function sync() {
      const vv = window.visualViewport;
      const root = document.documentElement;
      const typing = isTextEntryElement(document.activeElement);
      const osk = isSoftKeyboardOpen();
      const keyboardOpen = osk && typing;
      // Pin as soon as a field is focused on mobile (OSK often lags visualViewport).
      const pinShell = keyboardOpen || (isMobileLayout() && typing);

      if (root) {
        // CSS dock rules must match the pinned shell, not only late OSK detection.
        root.classList.toggle("keyboard-open", !!pinShell);
        if (vv) {
          root.style.setProperty("--vv-height", `${Math.max(1, Math.round(vv.height))}px`);
          root.style.setProperty("--vv-offset-top", `${Math.round(vv.offsetTop || 0)}px`);
        } else {
          root.style.setProperty("--vv-height", `${window.innerHeight}px`);
          root.style.setProperty("--vv-offset-top", "0px");
        }
      }

      // Desktop: leave layout alone unless OSK is open.
      // Mobile: track visual viewport height (browser chrome + keyboard).
      if (!isMobileLayout() && !keyboardOpen) {
        document.body.style.height = "";
        document.body.style.width = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.position = "";
        return;
      }

      if (vv) {
        const h = Math.max(1, Math.round(vv.height));
        const w = Math.max(1, Math.round(vv.width));
        const top = Math.round(vv.offsetTop || 0);
        const left = Math.round(vv.offsetLeft || 0);
        // Pin shell to visual viewport while typing so body bottom = keyboard top.
        if (pinShell) {
          document.body.style.position = "fixed";
          document.body.style.top = `${top}px`;
          document.body.style.left = `${left}px`;
          document.body.style.width = `${w}px`;
          document.body.style.height = `${h}px`;
          resetDocumentScroll();
        } else if (isMobileLayout()) {
          document.body.style.position = "";
          document.body.style.top = "";
          document.body.style.left = "";
          document.body.style.width = "";
          document.body.style.height = `${h}px`;
        }
      } else if (isMobileLayout()) {
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.width = "";
        document.body.style.height = `${window.innerHeight}px`;
      }
    }

    /**
     * Coalesce focus/resize/growth into one frame + one follow-up (iOS pan),
     * plus a short settle pass after OSK animation (~300ms on iOS/Android).
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
        settleTimer = setTimeout(() => {
          settleTimer = 0;
          sync();
        }, 300);
      }
    }

    function bind() {
      // Single focus entry — covers display + modals (no duplicate focus listeners).
      document.addEventListener("focusin", (e) => {
        if (isTextEntryElement(e.target)) schedule({ settle: true });
      });
      document.addEventListener("focusout", () => {
        requestAnimationFrame(() => {
          if (!isTextEntryElement(document.activeElement)) {
            clearSettle();
            document.documentElement.classList.remove("keyboard-open");
            sync();
          }
        });
      });
      window.addEventListener("resize", schedule);
      window.addEventListener("orientationchange", () => schedule({ settle: true }));
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", schedule);
        window.visualViewport.addEventListener("scroll", schedule);
      }
      window.addEventListener("scroll", () => {
        if (isTextEntryElement(document.activeElement)) resetDocumentScroll();
      }, { passive: true });
      schedule();
    }

    return {
      sync,
      schedule,
      bind,
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
