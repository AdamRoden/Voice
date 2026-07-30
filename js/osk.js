/**
 * VoiceOsk — on-screen keyboard + prediction chips.
 * Orthography lives in composeInsert (app); this module never calls applyInsert.
 *
 * Public API:
 *   VoiceOsk.bindCompose({ ... })
 *   VoiceOsk.setVisible(bool) / isVisible() / schedulePredict() / refresh()
 *
 * Chip refresh ownership: schedulePredict only when
 *   (a) host setText runs while OSK is visible, or
 *   (b) caret moves without a text mutation (click/select/keyup), or
 *   (c) host undo/redo that does not go through setText.
 * Keystrokes do not schedule here — they go through setText via composeInsert.
 *
 * Layout: one declarative layer per mode (alpha / alpha⇧ / sym / sym⇧).
 * Each layer is 4 rows of key descriptors; insertable glyphs are unique within a layer.
 */
(function (global) {
  "use strict";

  /* ---- key descriptors: { ch } | { action, label } + optional width ---- */
  function ch(c, width) {
    return width ? { ch: c, width: width } : { ch: c };
  }
  function act(action, label, width) {
    const k = { action: action, label: label };
    if (width) k.width = width;
    return k;
  }
  function chars(s) {
    return String(s).split("").map((c) => ch(c));
  }

  /** Shift-dependent punctuation (always on chrome slots; never on face rows). */
  function punct(shift) {
    return {
      apos: shift ? "\"" : "'",
      comma: shift ? "?" : ",",
      period: shift ? "!" : "."
    };
  }

  /** symbolsLabel is honest per layer: "123?" on alpha, "ABC" on symbols. */
  function bottomRow(p, symbolsLabel) {
    return [
      act("symbols", symbolsLabel, "wide"),
      act("ctrl", "⌘", "wide"),
      act("space", "⎵", "space"),
      ch(p.comma, "slim"),
      ch(p.period, "slim"),
      act("enter", "↵", "wide")
    ];
  }

  /**
   * Four modes via layoutAlpha / layoutSym × shift.
   * Insertable uniqueness = inventory of `ch` values in the active layer
   * (actions excluded). Symbols shift face rows omit " ? ! — those are punct only.
   */
  function layoutAlpha(shift) {
    const letter = (s) => chars(shift ? s.toUpperCase() : s);
    const p = punct(shift);
    return [
      letter("qwertyuiop"),
      letter("asdfghjkl"),
      [act("shift", "⇧"), ...letter("zxcvbnm"), ch(p.apos), act("backspace", "⌫")],
      bottomRow(p, "123?")
    ];
  }

  function layoutSym(shift) {
    /* r1 digits stable; r2/r3 complementary; punct never duplicates face rows */
    const p = punct(shift);
    const r2 = chars(shift ? "'`~^|\\/{}±" : "@#$%&*()-+");
    const r3 = chars(shift ? ":·°§¶…—" : "_=[]<>;");
    return [
      chars("1234567890"),
      r2,
      [act("shift", "⇧"), ...r3, ch(p.apos), act("backspace", "⌫")],
      bottomRow(p, "ABC")
    ];
  }

  function currentLayout() {
    if (isSymbol) return layoutSym(isShift);
    return layoutAlpha(isShift);
  }

  /** Single source for pred chip gap; applied to --osk-pred-gap on the row. */
  const PRED_GAP_PX = 6;

  let opts = null;
  let root = null;
  let predRow = null;
  let keysEl = null;
  let visible = false;
  let isShift = false;
  let isCtrl = false;
  let isSymbol = false;
  let predTimer = 0;
  let lastSnap = { chips: [], prefix: "", ctxWords: [] };
  let predResizeObserver = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function keyClass(k) {
    const parts = [];
    if (k.action) {
      parts.push("action");
      if (k.action === "shift" && isShift) parts.push("latched");
      if (k.action === "ctrl" && isCtrl) parts.push("latched");
    } else {
      parts.push("char");
    }
    if (k.width) parts.push(k.width);
    return parts.join(" ");
  }

  function renderKey(k) {
    if (k.action) return keyBtn(k.label, keyClass(k), k.action);
    return keyBtn(k.ch, keyClass(k), null, k.ch);
  }

  function renderKeys() {
    if (!keysEl) return;
    keysEl.innerHTML = "";
    const rows = currentLayout();
    rows.forEach((rowKeys, i) => {
      const row = el("div", i === rows.length - 1 ? "osk-row osk-row-bottom" : "osk-row");
      rowKeys.forEach((k) => row.appendChild(renderKey(k)));
      keysEl.appendChild(row);
    });
  }

  function keyBtn(label, cls, action, char) {
    const b = el("button", "osk-key " + (cls || ""), label);
    b.type = "button";
    if (action) b.dataset.action = action;
    else b.dataset.char = char != null ? char : label;
    b.addEventListener("click", onKeyClick);
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    return b;
  }

  function consumeModifiers() {
    let dirty = false;
    if (isShift) {
      isShift = false;
      dirty = true;
    }
    if (isCtrl) {
      isCtrl = false;
      dirty = true;
    }
    if (dirty) renderKeys();
  }

  function onKeyClick(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    if (action === "backspace") {
      doBackspace(isCtrl);
      consumeModifiers();
      return;
    }
    if (action === "shift") {
      isShift = !isShift;
      renderKeys();
      return;
    }
    if (action === "ctrl") {
      isCtrl = !isCtrl;
      renderKeys();
      return;
    }
    if (action === "symbols") {
      isSymbol = !isSymbol;
      isShift = false;
      renderKeys();
      return;
    }
    if (action === "space") {
      insert(" ");
      consumeModifiers();
      return;
    }
    if (action === "enter") {
      insert("\n");
      consumeModifiers();
      return;
    }
    const chVal = btn.dataset.char;
    if (chVal != null) {
      if (isCtrl) {
        handleCtrlChord(chVal);
        consumeModifiers();
        return;
      }
      insert(chVal);
      consumeModifiers();
    }
  }

  function handleCtrlChord(chVal) {
    const lower = String(chVal).toLowerCase();
    if (lower === "a" && typeof opts.selectAll === "function") {
      opts.selectAll();
      return;
    }
    if ((lower === "c" || lower === "x") && typeof opts.clipboard === "function") {
      // cut → setText → schedulePredict via host; copy needs no chip refresh
      Promise.resolve(opts.clipboard(lower === "x" ? "cut" : "copy")).catch(() => {});
      return;
    }
    if (lower === "v" && typeof opts.clipboard === "function") {
      Promise.resolve(opts.clipboard("paste")).catch(() => {});
      return;
    }
    if (lower === "z" && typeof opts.undo === "function") {
      opts.undo();
      schedulePredict(); // may not go through setText
      return;
    }
    if (lower === "y" && typeof opts.redo === "function") {
      opts.redo();
      schedulePredict();
    }
  }

  /** Host owns orthography via insertText (composeInsert → setText → schedule). */
  function insert(str) {
    if (!opts) return;
    if (typeof opts.insertText === "function") {
      opts.insertText(str);
    } else if (typeof opts.setText === "function" && typeof opts.getText === "function") {
      const text = opts.getText();
      const caret = opts.getCaret ? opts.getCaret() : { start: text.length, end: text.length };
      const start = caret.start != null ? caret.start : text.length;
      const end = caret.end != null ? caret.end : start;
      opts.setText(text.slice(0, start) + str + text.slice(end), start + String(str).length);
    }
    if (opts.onChange) opts.onChange();
  }

  function wordLeft(text, pos) {
    let i = Math.max(0, Math.min(pos, text.length));
    while (i > 0 && /\s/.test(text[i - 1])) i--;
    while (i > 0 && !/\s/.test(text[i - 1])) i--;
    return i;
  }

  function doBackspace(ctrl) {
    if (!opts || typeof opts.getText !== "function" || typeof opts.setText !== "function") return;
    const text = opts.getText();
    const caret = opts.getCaret ? opts.getCaret() : { start: text.length, end: text.length };
    let start = caret.start;
    let end = caret.end;
    if (start !== end) {
      opts.setText(text.slice(0, start) + text.slice(end), start);
    } else if (start > 0) {
      const delStart = ctrl ? wordLeft(text, start) : start - 1;
      opts.setText(text.slice(0, delStart) + text.slice(start), delStart);
    }
    if (opts.onChange) opts.onChange();
  }

  function applyPrediction(chip) {
    if (!opts || !chip) return;
    const text = opts.getText ? opts.getText() : "";
    const caret = opts.getCaret ? opts.getCaret() : { start: text.length, end: text.length };
    const upTo = text.slice(0, caret.start);
    const match = upTo.match(/([a-zA-Z']+)$/i);
    let start = caret.start;
    const end = caret.end;
    if (match) start = caret.start - match[1].length;
    const piece = chip + " ";
    if (typeof opts.setText === "function") {
      opts.setText(text.slice(0, start) + piece + text.slice(end), start + piece.length);
    }
    if (global.VoicePredict && typeof VoicePredict.recordAccept === "function") {
      VoicePredict.recordAccept(lastSnap.ctxWords || [], chip);
    }
    if (opts.onChange) opts.onChange();
  }

  function makePredChip(label) {
    const b = el("button", "osk-pred-chip", label);
    b.type = "button";
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", () => applyPrediction(label));
    return b;
  }

  /**
   * Render only as many prediction chips as fit in the pred-row viewport.
   * Batch-append then prune the tail (one construction pass).
   * Width 0 → leave empty; ResizeObserver re-runs after layout.
   */
  function renderPredictions(chips) {
    if (!predRow) return;
    predRow.innerHTML = "";
    const list = chips && chips.length ? chips : [];
    if (!list.length) {
      predRow.appendChild(el("span", "osk-pred-empty", "Predictions appear as you type"));
      return;
    }

    const available = predRow.clientWidth;
    if (available <= 0) return;

    const frag = document.createDocumentFragment();
    const buttons = [];
    for (let i = 0; i < list.length; i++) {
      const b = makePredChip(list[i]);
      frag.appendChild(b);
      buttons.push(b);
    }
    predRow.appendChild(frag);

    let used = 0;
    for (let i = 0; i < buttons.length; i++) {
      const w = buttons[i].offsetWidth;
      const need = i === 0 ? w : used + PRED_GAP_PX + w;
      if (need > available && i > 0) {
        for (let j = i; j < buttons.length; j++) predRow.removeChild(buttons[j]);
        break;
      }
      // Single chip wider than the row: keep it (overflow:hidden) rather than empty.
      used = need;
    }
  }

  function recapPredictions() {
    if (!visible) return;
    renderPredictions(lastSnap.chips || []);
  }

  function ensurePredResizeObserver() {
    if (!predRow || predResizeObserver || typeof ResizeObserver === "undefined") return;
    predResizeObserver = new ResizeObserver(() => {
      if (visible) recapPredictions();
    });
    predResizeObserver.observe(predRow);
  }

  function schedulePredict() {
    if (!visible) return;
    clearTimeout(predTimer);
    predTimer = setTimeout(refresh, 60);
  }

  function refresh() {
    if (!opts || !visible) return;
    const text = opts.getText ? opts.getText() : "";
    const caret = opts.getCaret ? opts.getCaret() : { start: text.length, end: text.length };
    const pos = caret.end != null ? caret.end : caret.start;
    let chips = [];
    let prefix = "";
    let ctxWords = [];
    if (global.VoicePredict && typeof VoicePredict.suggest === "function") {
      try {
        if (!VoicePredict.ready) VoicePredict.init();
        const res = VoicePredict.suggest(text, pos);
        chips = res.chips || [];
        prefix = res.activePrefix || "";
        ctxWords = res.ctxWords || [];
      } catch (e) {
        console.warn("[VoiceOsk] predict failed", e);
      }
    }
    if (!chips.length && !String(text).trim()) {
      chips = ["I", "You", "Can", "Please", "Hello", "What", "Yes", "No", "Thank"];
    }
    lastSnap = { chips, prefix, ctxWords };
    renderPredictions(chips);
  }

  function buildShell() {
    if (predResizeObserver) {
      predResizeObserver.disconnect();
      predResizeObserver = null;
    }
    root.innerHTML = "";
    root.classList.add("osk-panel");
    const top = el("div", "osk-top-strip");
    predRow = el("div", "osk-pred-row");
    predRow.style.setProperty("--osk-pred-gap", PRED_GAP_PX + "px");
    predRow.setAttribute("role", "list");
    predRow.setAttribute("aria-label", "Word predictions");
    top.appendChild(predRow);
    keysEl = el("div", "osk-keys");
    root.appendChild(top);
    root.appendChild(keysEl);
    renderKeys();
    renderPredictions([]);
    ensurePredResizeObserver();
  }

  /** Internal mount — not on public API; use bindCompose. */
  function mountInternal(options) {
    opts = options || {};
    root = opts.root;
    if (!root) throw new Error("VoiceOsk requires root panel element");
    buildShell();
    if (global.VoicePredict && typeof VoicePredict.init === "function") {
      try {
        VoicePredict.init();
        if (typeof VoicePredict.loadFrequencyList === "function") {
          VoicePredict.loadFrequencyList().then(() => {
            if (visible) refresh();
          }).catch(() => {});
        }
      } catch (e) {
        console.warn("[VoiceOsk] VoicePredict init failed", e);
      }
    }
    setVisible(opts.startVisible === true);
  }

  /**
   * Soft (touch) keyboard policy for the compose field.
   * OSK on  → suppress OS virtual keyboard (inputmode=none); physical keys still type.
   * OSK off → restore normal system keyboard behavior.
   * Avoid permanent readonly — that blocks hardware keyboards.
   */
  function applySoftKeyboardPolicy(oskOn, displayInput) {
    if (!displayInput) return;
    if (oskOn) {
      displayInput.setAttribute("inputmode", "none");
      displayInput.setAttribute("virtualkeyboardpolicy", "manual");
      displayInput.removeAttribute("readonly");
      try {
        if (navigator.virtualKeyboard) {
          if (typeof navigator.virtualKeyboard.hide === "function") {
            navigator.virtualKeyboard.hide();
          }
          // Prefer overlay so layout isn’t shoved by a residual system KB.
          try { navigator.virtualKeyboard.overlaysContent = true; } catch (_) {}
        }
      } catch (_) {}
    } else {
      displayInput.removeAttribute("inputmode");
      displayInput.removeAttribute("virtualkeyboardpolicy");
      displayInput.removeAttribute("readonly");
      // System keyboard should resize / report visualViewport — not overlay.
      try {
        if (navigator.virtualKeyboard) {
          try { navigator.virtualKeyboard.overlaysContent = false; } catch (_) {}
        }
      } catch (_) {}
    }
  }

  function syncToggleUi(toggleBtn, on) {
    if (!toggleBtn) return;
    toggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    toggleBtn.classList.toggle("osk-toggle-active", !!on);
    // Active = custom OSK; inactive = system / OS keyboard
    const label = on
      ? "Use system keyboard"
      : "Use on-screen keyboard";
    toggleBtn.setAttribute("aria-label", label);
    toggleBtn.setAttribute("title", on
      ? "Show system keyboard (hide on-screen keyboard)"
      : "Show on-screen keyboard (hide system keyboard)");
  }

  function setVisible(on) {
    visible = !!on;
    if (root) {
      root.hidden = !visible;
      root.classList.toggle("osk-open", visible);
      document.body.classList.toggle("osk-visible", visible);
    }
    // Width may still be 0 on first show; ResizeObserver re-caps after layout.
    if (visible) refresh();
    if (opts && typeof opts.onVisibility === "function") opts.onVisibility(visible);
  }

  function isVisible() {
    return visible;
  }

  /**
   * Wire compose dock: OSK + system keyboard beforeinput + toggle.
   * App supplies composeInsert (canonical typing + orthography).
   *
   * Keyboard button toggles:
   *   pressed / OSK visible → custom board, system soft KB suppressed
   *   released / OSK hidden → system soft KB allowed (focus field to open it)
   * Physical (hardware) keyboards always type into the field via beforeinput.
   */
  function bindCompose(cfg) {
    const optsIn = cfg || {};
    const {
      panel,
      toggleBtn,
      displayInput,
      getText,
      setText,
      getCaret,
      focus,
      composeInsert,
      lsGet,
      lsSet,
      onChange,
      selectAll,
      clipboard,
      undo,
      redo
    } = optsIn;
    if (!panel) return;

    const LS_OSK = "aac_osk_visible";
    const LS_OSK_V2 = "aac_osk_default_v2";
    // Default ON. Older builds wrote "0" on first load even when the user never
    // chose; migrate once to the new default, then honor the toggle thereafter.
    let startVisible = true;
    if (lsGet && lsSet) {
      if (lsGet(LS_OSK_V2, null) !== "1") {
        lsSet(LS_OSK_V2, "1");
        lsSet(LS_OSK, "1");
        startVisible = true;
      } else {
        startVisible = lsGet(LS_OSK, "1") === "1";
      }
    }

    mountInternal({
      root: panel,
      startVisible,
      getText,
      setText,
      getCaret,
      insertText: (str) => {
        if (typeof composeInsert === "function") composeInsert(str);
        else if (typeof setText === "function" && typeof getText === "function") {
          const text = getText();
          const c = getCaret ? getCaret() : { start: text.length, end: text.length };
          setText(text.slice(0, c.start) + str + text.slice(c.end), c.start + String(str).length);
        }
        // composeInsert already focuses when provided by app
      },
      onChange,
      onVisibility: (on) => {
        if (lsSet) lsSet(LS_OSK, on ? "1" : "0");
        syncToggleUi(toggleBtn, on);
        applySoftKeyboardPolicy(on, displayInput);
        if (on) {
          try {
            if (navigator.virtualKeyboard && typeof navigator.virtualKeyboard.hide === "function") {
              navigator.virtualKeyboard.hide();
            }
          } catch (_) {}
        }
        if (typeof optsIn.onLayout === "function") {
          optsIn.onLayout({ oskVisible: on });
        }
      },
      selectAll,
      clipboard,
      undo,
      redo
    });

    // Apply policy for initial visibility (onVisibility also runs from setVisible).
    applySoftKeyboardPolicy(startVisible, displayInput);
    syncToggleUi(toggleBtn, startVisible);

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const next = !isVisible();
        // Before hide: pin shell so the dock cannot drop under the rising iOS keyboard
        // during the button blur → field focus handoff.
        if (!next && typeof optsIn.onSystemKeyboard === "function") {
          optsIn.onSystemKeyboard();
        }
        setVisible(next);
        // Focus so system soft KB opens when OSK hides, and caret stays ready when OSK shows.
        if (typeof focus === "function") focus();
        if (typeof optsIn.onLayout === "function") {
          optsIn.onLayout({ oskVisible: next });
        }
      });
    }

    if (displayInput) {
      // Re-assert soft-KB suppression if iOS tries to surface it while OSK is up.
      displayInput.addEventListener("focus", () => {
        if (!isVisible()) return;
        applySoftKeyboardPolicy(true, displayInput);
        try {
          if (navigator.virtualKeyboard && typeof navigator.virtualKeyboard.hide === "function") {
            navigator.virtualKeyboard.hide();
          }
        } catch (_) {}
      });

      if (typeof composeInsert === "function") {
        displayInput.addEventListener("beforeinput", (e) => {
          if (e.isComposing) return;
          if (e.inputType !== "insertText" || e.data == null || e.data === "") return;
          e.preventDefault();
          composeInsert(e.data);
          // setText → schedulePredict; no second schedule here
        });
      }
      // Caret-only moves (no text mutation) — single path for non-setText refresh
      const onCaret = () => schedulePredict();
      displayInput.addEventListener("keyup", onCaret);
      displayInput.addEventListener("click", onCaret);
      displayInput.addEventListener("select", onCaret);
    }
  }

  global.VoiceOsk = {
    bindCompose,
    refresh,
    setVisible,
    isVisible,
    schedulePredict
  };
})(typeof window !== "undefined" ? window : globalThis);
