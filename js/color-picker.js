/**
 * Shared color picker modal: inline HSV spectrum + sample palette.
 * Field helpers (setFieldColor / getFieldColor / toHex6) are module-level so
 * shell, topics-edit, and the modal instance share one color-field owner.
 */
(function (global) {
  "use strict";

  const MODAL_ID = "color-picker-modal";
  const FALLBACK = "#8ab4f8";

  function resolveEl(fieldElOrId) {
    if (!fieldElOrId) return null;
    return typeof fieldElOrId === "string"
      ? document.getElementById(fieldElOrId)
      : fieldElOrId;
  }

  function normalizeToHex(col) {
    if (!col) return "";
    col = String(col).trim();
    if (col.startsWith("#")) {
      if (/^#[0-9a-f]{3}$/i.test(col)) {
        return ("#" + col[1] + col[1] + col[2] + col[2] + col[3] + col[3]).toLowerCase();
      }
      if (/^#[0-9a-f]{6}$/i.test(col)) return col.toLowerCase();
      return col;
    }
    const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return col;
    const toHex = (n) => ("0" + Number(n).toString(16)).slice(-2);
    return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
  }

  function toHex6(col, fallback = FALLBACK) {
    const h = normalizeToHex(col);
    if (/^#[0-9a-f]{6}$/i.test(h)) return h.toLowerCase();
    return fallback;
  }

  /**
   * Write color onto a .color-field root: data-color, swatch button, hex input.
   * @param {string|HTMLElement} fieldElOrId root .color-field (or id)
   */
  function setFieldColor(fieldElOrId, color, fallback = FALLBACK) {
    const fieldEl = resolveEl(fieldElOrId);
    if (!fieldEl) return null;
    const hex = toHex6(color, fallback);
    fieldEl.dataset.color = hex;
    const swatch = fieldEl.querySelector(".color-field-swatch-btn");
    if (swatch) swatch.style.backgroundColor = hex;
    const hexInput = fieldEl.querySelector(".color-field-hex");
    if (hexInput && document.activeElement !== hexInput) {
      hexInput.value = hex;
    }
    return hex;
  }

  /** Read hex from a .color-field root (dataset preferred, else input value). */
  function getFieldColor(fieldElOrId, fallback = FALLBACK) {
    const el = resolveEl(fieldElOrId);
    if (!el) return fallback;
    const fromData = el.dataset.color || "";
    if (fromData) return toHex6(fromData, fallback);
    const hexInput = el.querySelector(".color-field-hex");
    if (hexInput?.value) return toHex6(hexInput.value, fallback);
    return fallback;
  }

  /**
   * @param {{
   *   COLOR_PALETTE: string[],
   *   openModal: (id: string) => void,
   *   closeModals: () => void,
   *   openNestedModal?: (id: string) => string|null,
   *   closeNestedModal?: (returnId: string|null) => void,
   *   modalOverlay?: HTMLElement|null
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    const palette = Array.isArray(d.COLOR_PALETTE) ? d.COLOR_PALETTE : [];
    const openModal = d.openModal;
    const closeModals = d.closeModals;
    const openNestedModal = typeof d.openNestedModal === "function" ? d.openNestedModal : null;
    const closeNestedModal = typeof d.closeNestedModal === "function" ? d.closeNestedModal : null;
    const modalOverlay = d.modalOverlay || document.getElementById("modal-overlay");

    let draftHex = FALLBACK;
    /** @type {{ h: number, s: number, v: number }} */
    let draftHsv = { h: 210, s: 0.4, v: 0.97 };
    let returnModalId = null;
    /** @type {null | ((hex: string) => void)} */
    let onApplyCb = null;
    let sessionOpen = false;
    let suppressHexInput = false;

    const svEl = () => document.getElementById("color-picker-sv");
    const hueEl = () => document.getElementById("color-picker-hue");
    const svCursor = () => document.getElementById("color-picker-sv-cursor");
    const hueCursor = () => document.getElementById("color-picker-hue-cursor");
    const previewEl = () => document.getElementById("color-picker-preview");
    const hexInput = () => document.getElementById("color-picker-hex-input");

    function clamp01(n) {
      return Math.max(0, Math.min(1, n));
    }

    function hexToRgb(hex) {
      const h = toHex6(hex, FALLBACK);
      return {
        r: parseInt(h.slice(1, 3), 16),
        g: parseInt(h.slice(3, 5), 16),
        b: parseInt(h.slice(5, 7), 16)
      };
    }

    function rgbToHex(r, g, b) {
      const to = (n) => ("0" + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2);
      return `#${to(r)}${to(g)}${to(b)}`;
    }

    function rgbToHsv(r, g, b) {
      r /= 255;
      g /= 255;
      b /= 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const dlt = max - min;
      let h = 0;
      const s = max === 0 ? 0 : dlt / max;
      const v = max;
      if (dlt !== 0) {
        switch (max) {
          case r: h = ((g - b) / dlt + (g < b ? 6 : 0)); break;
          case g: h = (b - r) / dlt + 2; break;
          default: h = (r - g) / dlt + 4; break;
        }
        h /= 6;
      }
      return { h: h * 360, s, v };
    }

    function hsvToRgb(h, s, v) {
      h = ((h % 360) + 360) % 360;
      const c = v * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = v - c;
      let rp = 0;
      let gp = 0;
      let bp = 0;
      if (h < 60) { rp = c; gp = x; }
      else if (h < 120) { rp = x; gp = c; }
      else if (h < 180) { gp = c; bp = x; }
      else if (h < 240) { gp = x; bp = c; }
      else if (h < 300) { rp = x; bp = c; }
      else { rp = c; bp = x; }
      return {
        r: Math.round((rp + m) * 255),
        g: Math.round((gp + m) * 255),
        b: Math.round((bp + m) * 255)
      };
    }

    function hsvToHex(hsv) {
      const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
      return rgbToHex(r, g, b);
    }

    function pureHueHex(h) {
      const { r, g, b } = hsvToRgb(h, 1, 1);
      return rgbToHex(r, g, b);
    }

    function syncSpectrumUi() {
      const sv = svEl();
      const hue = hueEl();
      const sc = svCursor();
      const hc = hueCursor();
      const prev = previewEl();
      const input = hexInput();

      if (sv) sv.style.setProperty("--cp-hue", pureHueHex(draftHsv.h));
      if (sc) {
        sc.style.left = `${draftHsv.s * 100}%`;
        sc.style.top = `${(1 - draftHsv.v) * 100}%`;
      }
      if (hc) hc.style.left = `${(draftHsv.h / 360) * 100}%`;
      if (sv) {
        sv.setAttribute("aria-valuenow", String(Math.round(draftHsv.s * 100)));
        sv.setAttribute("aria-valuetext", `Saturation ${Math.round(draftHsv.s * 100)}%, brightness ${Math.round(draftHsv.v * 100)}%`);
      }
      if (hue) {
        hue.setAttribute("aria-valuenow", String(Math.round(draftHsv.h)));
        hue.setAttribute("aria-valuetext", `${Math.round(draftHsv.h)} degrees`);
      }
      if (prev) prev.style.backgroundColor = draftHex;
      if (input && document.activeElement !== input) {
        suppressHexInput = true;
        input.value = draftHex;
        suppressHexInput = false;
      }

      const root = document.getElementById("color-picker-palette");
      if (root) {
        root.querySelectorAll(".color-option").forEach((opt) => {
          const c = opt.dataset.color || "";
          opt.classList.toggle("selected", toHex6(c, "") === draftHex);
        });
      }
    }

    function setFromHsv(h, s, v) {
      draftHsv = {
        h: ((h % 360) + 360) % 360,
        s: clamp01(s),
        v: clamp01(v)
      };
      draftHex = hsvToHex(draftHsv);
      syncSpectrumUi();
    }

    function paintDraft(hex) {
      draftHex = toHex6(hex, FALLBACK);
      const { r, g, b } = hexToRgb(draftHex);
      const next = rgbToHsv(r, g, b);
      // Keep prior hue when picking pure gray (s ≈ 0) so the SV square stays useful
      if (next.s < 0.001) next.h = draftHsv.h;
      draftHsv = next;
      syncSpectrumUi();
    }

    function setSvFromPointer(clientX, clientY) {
      const el = svEl();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const s = clamp01((clientX - rect.left) / rect.width);
      const v = clamp01(1 - (clientY - rect.top) / rect.height);
      setFromHsv(draftHsv.h, s, v);
    }

    function setHueFromPointer(clientX) {
      const el = hueEl();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const h = clamp01((clientX - rect.left) / rect.width) * 360;
      setFromHsv(h, draftHsv.s, draftHsv.v);
    }

    function bindDrag(el, onMove) {
      if (!el) return;
      let active = false;
      let pointerId = null;

      const move = (e) => {
        if (!active) return;
        onMove(e);
      };
      const up = (e) => {
        if (!active) return;
        if (pointerId != null && e.pointerId !== pointerId) return;
        active = false;
        pointerId = null;
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };

      el.addEventListener("pointerdown", (e) => {
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        active = true;
        pointerId = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        onMove(e);
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      });
    }

    function renderPalette() {
      const root = document.getElementById("color-picker-palette");
      if (!root) return;
      root.innerHTML = "";
      palette.forEach((col) => {
        const hex = toHex6(col, col);
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = "color-option";
        opt.dataset.color = hex;
        opt.style.backgroundColor = hex;
        opt.setAttribute("role", "option");
        opt.setAttribute("aria-label", hex);
        opt.title = hex;
        opt.addEventListener("click", () => paintDraft(hex));
        root.appendChild(opt);
      });
    }

    function restoreParentModal() {
      const returnTo = returnModalId;
      returnModalId = null;
      onApplyCb = null;
      sessionOpen = false;
      if (closeNestedModal) {
        closeNestedModal(returnTo);
      } else if (returnTo) {
        document.querySelectorAll(".modal").forEach((m) => m.classList.remove("open"));
        document.getElementById(returnTo)?.classList.add("open");
        if (modalOverlay) modalOverlay.classList.add("open");
        document.body.classList.add("modal-open");
      } else {
        closeModals();
      }
    }

    /**
     * @param {{
     *   color?: string,
     *   title?: string,
     *   onApply?: (hex: string) => void
     * }} opts
     */
    function openColorPicker(opts) {
      const o = opts || {};
      onApplyCb = typeof o.onApply === "function" ? o.onApply : null;
      sessionOpen = true;

      const titleEl = document.getElementById("color-picker-modal-title");
      if (titleEl) titleEl.textContent = o.title || "Choose color";

      renderPalette();
      paintDraft(o.color || FALLBACK);

      if (openNestedModal) {
        returnModalId = openNestedModal(MODAL_ID);
      } else {
        const openParent = Array.from(document.querySelectorAll(".modal.open"))
          .find((m) => m.id !== MODAL_ID);
        returnModalId = openParent ? openParent.id : null;
        openModal(MODAL_ID);
      }
    }

    function closeColorPicker(save) {
      if (!sessionOpen && !document.getElementById(MODAL_ID)?.classList.contains("open")) {
        return false;
      }
      if (save && typeof onApplyCb === "function") {
        try { onApplyCb(draftHex); } catch (_) {}
      }
      restoreParentModal();
      return true;
    }

    function isOpen() {
      return !!document.getElementById(MODAL_ID)?.classList.contains("open");
    }

    /**
     * Wire a .color-field: swatch opens modal; hex input is editable.
     * @param {string|HTMLElement} fieldElOrId root .color-field
     * @param {{
     *   title?: string,
     *   fallback?: string,
     *   onApply?: (hex: string) => void
     * }} [opts]
     */
    function bindField(fieldElOrId, opts) {
      const el = resolveEl(fieldElOrId);
      if (!el) return;
      const o = opts || {};
      const fallback = o.fallback || FALLBACK;
      const title = o.title || el.getAttribute("data-title") || "Choose color";

      const applyHex = (hex) => {
        setFieldColor(el, hex, fallback);
        if (typeof o.onApply === "function") o.onApply(hex);
      };

      const swatchBtn = el.querySelector(".color-field-swatch-btn");
      swatchBtn?.addEventListener("click", () => {
        openColorPicker({
          color: getFieldColor(el, fallback),
          title,
          onApply: applyHex
        });
      });

      const hexInput = el.querySelector(".color-field-hex");
      if (hexInput) {
        hexInput.addEventListener("input", () => {
          let raw = String(hexInput.value || "").trim();
          if (raw && !raw.startsWith("#")) raw = `#${raw}`;
          if (/^#[0-9a-f]{6}$/i.test(raw) || /^#[0-9a-f]{3}$/i.test(raw)) {
            const hex = toHex6(raw, fallback);
            el.dataset.color = hex;
            if (swatchBtn) swatchBtn.style.backgroundColor = hex;
            if (typeof o.onApply === "function") o.onApply(hex);
          }
        });
        hexInput.addEventListener("blur", () => {
          let raw = String(hexInput.value || "").trim();
          if (raw && !raw.startsWith("#")) raw = `#${raw}`;
          if (/^#[0-9a-f]{6}$/i.test(raw) || /^#[0-9a-f]{3}$/i.test(raw)) {
            applyHex(raw);
          } else {
            hexInput.value = getFieldColor(el, fallback);
          }
        });
        hexInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            hexInput.blur();
          }
        });
      }
    }

    bindDrag(svEl(), (e) => setSvFromPointer(e.clientX, e.clientY));
    bindDrag(hueEl(), (e) => setHueFromPointer(e.clientX));

    svEl()?.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 0.05 : 0.02;
      let { h, s, v } = draftHsv;
      if (e.key === "ArrowLeft") { s -= step; e.preventDefault(); }
      else if (e.key === "ArrowRight") { s += step; e.preventDefault(); }
      else if (e.key === "ArrowUp") { v += step; e.preventDefault(); }
      else if (e.key === "ArrowDown") { v -= step; e.preventDefault(); }
      else return;
      setFromHsv(h, s, v);
    });
    hueEl()?.addEventListener("keydown", (e) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        setFromHsv(draftHsv.h - step, draftHsv.s, draftHsv.v);
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        setFromHsv(draftHsv.h + step, draftHsv.s, draftHsv.v);
      }
    });

    hexInput()?.addEventListener("input", (e) => {
      if (suppressHexInput) return;
      let raw = String(e.target.value || "").trim();
      if (raw && !raw.startsWith("#")) raw = `#${raw}`;
      if (/^#[0-9a-f]{6}$/i.test(raw) || /^#[0-9a-f]{3}$/i.test(raw)) {
        paintDraft(raw);
      }
    });
    hexInput()?.addEventListener("blur", (e) => {
      let raw = String(e.target.value || "").trim();
      if (raw && !raw.startsWith("#")) raw = `#${raw}`;
      if (/^#[0-9a-f]{6}$/i.test(raw) || /^#[0-9a-f]{3}$/i.test(raw)) {
        paintDraft(raw);
      } else {
        e.target.value = draftHex;
      }
    });

    document.getElementById("color-picker-apply")?.addEventListener("click", () => {
      closeColorPicker(true);
    });
    document.getElementById("color-picker-cancel")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeColorPicker(false);
    }, true);

    // Overlay click: return to parent without full closeModals (preserves edit state)
    if (modalOverlay) {
      modalOverlay.addEventListener("click", (e) => {
        if (e.target !== modalOverlay || !isOpen()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        closeColorPicker(false);
      }, true);
    }

    return {
      openColorPicker,
      closeColorPicker,
      isOpen,
      bindField,
      setFieldColor,
      getFieldColor,
      normalizeToHex,
      toHex6
    };
  }

  global.AacColorPicker = {
    create,
    setFieldColor,
    getFieldColor,
    normalizeToHex,
    toHex6,
    FALLBACK
  };
})(typeof window !== "undefined" ? window : globalThis);
