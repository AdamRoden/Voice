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
 */
(function (global) {
  "use strict";

  const LETTERS = "qwertyuiopasdfghjkl,'zxcvbnm.".split("");
  const LETTERS_SHIFT = "qwertyuiopasdfghjkl?\"zxcvbnm!".split("");
  const SYMBOLS = "1234567890!@#$%^&*();-+=/[]<>".split("");
  const SYMBOLS_SHIFT = "1234567890!@#$%^&*():-+=/{}<>".split("");

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

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function currentFaces() {
    if (isSymbol) return isShift ? SYMBOLS_SHIFT : SYMBOLS;
    if (isShift) return LETTERS_SHIFT.map((c) => (/[a-z]/i.test(c) ? c.toUpperCase() : c));
    return LETTERS.slice();
  }

  function renderKeys() {
    if (!keysEl) return;
    keysEl.innerHTML = "";
    const faces = currentFaces();

    const row1 = el("div", "osk-row");
    for (let i = 0; i < 10; i++) row1.appendChild(charBtn(faces[i]));
    row1.appendChild(keyBtn("⌫", "action", "backspace"));
    keysEl.appendChild(row1);

    const row2 = el("div", "osk-row");
    row2.appendChild(keyBtn("⇧", "action narrow" + (isShift ? " latched" : ""), "shift"));
    for (let i = 10; i < 21; i++) {
      row2.appendChild(charBtn(faces[i], i === 20 ? "char narrow" : "char"));
    }
    keysEl.appendChild(row2);

    const row3 = el("div", "osk-row");
    row3.appendChild(keyBtn("⌘", "action" + (isCtrl ? " latched" : ""), "ctrl"));
    for (let i = 21; i < 25; i++) row3.appendChild(charBtn(faces[i]));
    row3.appendChild(keyBtn("⎵", "action space", "space"));
    for (let i = 25; i < 29; i++) row3.appendChild(charBtn(faces[i]));
    row3.appendChild(keyBtn(isSymbol ? "ABC" : "123?", "action", "symbols"));
    keysEl.appendChild(row3);
  }

  function charBtn(label, cls) {
    return keyBtn(label, cls || "char", null, label);
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
    const ch = btn.dataset.char;
    if (ch != null) {
      if (isCtrl) {
        handleCtrlChord(ch);
        consumeModifiers();
        return;
      }
      insert(ch);
      consumeModifiers();
    }
  }

  function handleCtrlChord(ch) {
    const lower = String(ch).toLowerCase();
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

  function renderPredictions(chips) {
    if (!predRow) return;
    predRow.innerHTML = "";
    const list = chips && chips.length ? chips : [];
    list.slice(0, 9).forEach((label) => {
      const b = el("button", "osk-pred-chip", label);
      b.type = "button";
      b.addEventListener("pointerdown", (e) => e.preventDefault());
      b.addEventListener("click", () => applyPrediction(label));
      predRow.appendChild(b);
    });
    if (!list.length) {
      predRow.appendChild(el("span", "osk-pred-empty", "Predictions appear as you type"));
    }
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
    if (global.VoicePredict && typeof VoicePredict.suggest === "function") {
      try {
        if (!VoicePredict.ready) VoicePredict.init();
        const res = VoicePredict.suggest(text, pos);
        chips = res.chips || [];
        lastSnap = {
          chips,
          prefix: res.activePrefix || "",
          ctxWords: res.ctxWords || []
        };
      } catch (e) {
        console.warn("[VoiceOsk] predict failed", e);
      }
    }
    if (!chips.length && !String(text).trim()) {
      chips = ["I", "You", "Can", "Please", "Hello", "What", "Yes", "No", "Thank"];
    }
    renderPredictions(chips);
  }

  function buildShell() {
    root.innerHTML = "";
    root.classList.add("osk-panel");
    const top = el("div", "osk-top-strip");
    predRow = el("div", "osk-pred-row");
    predRow.setAttribute("role", "list");
    predRow.setAttribute("aria-label", "Word predictions");
    const hide = el("button", "osk-hide-btn", "Hide");
    hide.type = "button";
    hide.title = "Hide keyboard";
    hide.addEventListener("click", () => setVisible(false));
    top.appendChild(predRow);
    top.appendChild(hide);
    keysEl = el("div", "osk-keys");
    root.appendChild(top);
    root.appendChild(keysEl);
    renderKeys();
    renderPredictions([]);
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

  function setVisible(on) {
    visible = !!on;
    if (root) {
      root.hidden = !visible;
      root.classList.toggle("osk-open", visible);
      document.body.classList.toggle("osk-visible", visible);
    }
    if (visible) refresh();
    if (opts && typeof opts.onVisibility === "function") opts.onVisibility(visible);
  }

  function isVisible() {
    return visible;
  }

  /**
   * Wire compose dock: OSK + system keyboard beforeinput + toggle.
   * App supplies composeInsert (canonical typing + orthography).
   */
  function bindCompose(cfg) {
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
    } = cfg || {};
    if (!panel) return;

    const LS_OSK = "aac_osk_visible";
    const startVisible = lsGet ? lsGet(LS_OSK, "0") === "1" : false;

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
        if (toggleBtn) {
          toggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
          toggleBtn.classList.toggle("osk-toggle-active", !!on);
        }
      },
      selectAll,
      clipboard,
      undo,
      redo
    });

    if (toggleBtn) {
      toggleBtn.setAttribute("aria-pressed", startVisible ? "true" : "false");
      toggleBtn.classList.toggle("osk-toggle-active", startVisible);
      toggleBtn.addEventListener("click", () => {
        const next = !isVisible();
        setVisible(next);
        if (next && typeof focus === "function") focus();
      });
    }

    if (displayInput && typeof composeInsert === "function") {
      displayInput.addEventListener("beforeinput", (e) => {
        if (e.isComposing) return;
        if (e.inputType !== "insertText" || e.data == null || e.data === "") return;
        e.preventDefault();
        composeInsert(e.data);
        // setText → schedulePredict; no second schedule here
      });
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
