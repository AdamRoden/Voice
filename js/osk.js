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

  /* ---- key descriptors: { ch, u? } | { action, label|icon, width? } ---- */
  /** @param {number} [u] face-row width in letter units (default 1) */
  function ch(c, u) {
    const k = { ch: c };
    if (u != null && u !== 1) k.u = u;
    return k;
  }
  function act(action, label, width) {
    const k = { action: action, label: label };
    if (width) k.width = width;
    return k;
  }
  /** Action key with a Material Symbol ligature (no text label). width = bottom-row class only. */
  function actIcon(action, icon, width) {
    const k = { action: action, icon: icon };
    if (width) k.width = width;
    return k;
  }
  function chars(s) {
    return String(s).split("").map((c) => ch(c));
  }
  /** Face row: { indent, keys }. indent is letter-key units (spacer before keys). */
  function face(keys, indent) {
    return { indent: indent || 0, keys: keys || [] };
  }

  /** symbolsLabel is honest per layer: "123?" on alpha, "ABC" on symbols. */
  function bottomRow(symbolsLabel) {
    return [
      act("symbols", symbolsLabel, "wide"),
      actIcon("ctrl", "keyboard_command_key", "wide"),
      actIcon("space", "space_bar", "space"),
      actIcon("arrowLeft", "keyboard_arrow_left"),
      actIcon("arrowRight", "keyboard_arrow_right"),
      actIcon("enter", "keyboard_return", "wide")
    ];
  }

  /**
   * Alpha QWERTY: bksp after P; home ; ' @ 0.85; , . / after M.
   * Shift uses US maps for those punct slots.
   */
  function layoutAlpha(shift) {
    const letter = (s) => chars(shift ? s.toUpperCase() : s);
    return [
      face([...letter("qwertyuiop"), actIcon("backspace", "backspace")]),
      face(
        [
          ...letter("asdfghjkl"),
          ch(shift ? ":" : ";", 0.85),
          ch(shift ? "\"" : "'", 0.85)
        ],
        0.3
      ),
      face([
        actIcon("shift", "shift"),
        ...letter("zxcvbnm"),
        ch(shift ? "<" : ","),
        ch(shift ? ">" : "."),
        ch(shift ? "?" : "/")
      ]),
      bottomRow("123?")
    ];
  }

  function layoutSym(shift) {
    /*
     * Digits shift to US top-row punct (!@#$…).
     * `!` is dual-homed: shift+1 and unshifted r2[0] for one-tap access.
     * r2/r3 omit alpha-owned punct (; ' , . /).
     */
    const r1 = chars(shift ? "!@#$%^&*()" : "1234567890");
    const r2 = chars(shift ? "`~^|\\{}±§" : "!@#$%&*()-+");
    const r3 = chars(shift ? "·°¶…—" : "_=[]<>");
    return [
      face([...r1, actIcon("backspace", "backspace")]),
      face(r2, 0.3),
      face([actIcon("shift", "shift"), ...r3]),
      bottomRow("ABC")
    ];
  }

  function currentLayout() {
    if (isSymbol) return layoutSym(isShift);
    return layoutAlpha(isShift);
  }

  /**
   * Phones only (portrait-ish widths). Desktop + iPad keep custom OSK.
   * Keep in sync with css/app.css @media (max-width: 600px) OSK hide.
   */
  const PHONE_OSK_MQ = "(max-width: 600px)";
  const LS_OSK = "aac_osk_visible";
  const LS_OSK_V2 = "aac_osk_default_v2";

  function oskAllowed() {
    try {
      return !(window.matchMedia && window.matchMedia(PHONE_OSK_MQ).matches);
    } catch (_) {
      return true;
    }
  }

  /** Single source for pred chip gap; applied as --osk-pred-gap on the row. */
  const PRED_GAP_PX = 6;

  let opts = null;
  let root = null;
  let predRow = null;
  let keysEl = null;
  let visible = false;
  /** User preference only — never overwritten by phone policy. */
  let userPrefersOsk = true;
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

  /** Face row geometry: --row-units / --gaps / --u consumed by CSS. */
  function appendFaceRow(parent, rowSpec) {
    const indent = Number(rowSpec && rowSpec.indent) || 0;
    const keys = (rowSpec && rowSpec.keys) || [];
    const row = el("div", "osk-row");
    const units = keys.map((k) => (typeof k.u === "number" ? k.u : 1));
    const sumKeys = units.reduce((a, b) => a + b, 0);
    const totalU = sumKeys + (indent > 0 ? indent : 0) || 1;
    const itemCount = keys.length + (indent > 0 ? 1 : 0);
    const gaps = Math.max(0, itemCount - 1);
    row.style.setProperty("--row-units", String(totalU));
    row.style.setProperty("--gaps", String(gaps));

    if (indent > 0) {
      const sp = el("div", "osk-indent");
      sp.setAttribute("aria-hidden", "true");
      sp.style.setProperty("--u", String(indent));
      row.appendChild(sp);
    }
    keys.forEach((k, i) => {
      const btn = renderKey(k);
      btn.style.setProperty("--u", String(units[i]));
      row.appendChild(btn);
    });
    parent.appendChild(row);
  }

  const ACTION_ARIA = {
    shift: "Shift",
    ctrl: "Command",
    space: "Space",
    backspace: "Backspace",
    enter: "Enter",
    symbols: "Symbols",
    arrowLeft: "Move caret left",
    arrowRight: "Move caret right"
  };

  function renderKey(k) {
    if (k.action) return keyBtn(k.label, keyClass(k), k.action, null, k.icon);
    return keyBtn(k.ch, keyClass(k), null, k.ch);
  }

  function renderKeys() {
    if (!keysEl) return;
    keysEl.innerHTML = "";
    const rows = currentLayout();
    rows.forEach((rowSpec, i) => {
      const isBottom = i === rows.length - 1;
      if (!isBottom) {
        appendFaceRow(keysEl, rowSpec);
        return;
      }
      const row = el("div", "osk-row osk-row-bottom");
      (Array.isArray(rowSpec) ? rowSpec : []).forEach((k) => row.appendChild(renderKey(k)));
      keysEl.appendChild(row);
    });
  }

  function keyBtn(label, cls, action, char, icon) {
    const b = el("button", "osk-key " + (cls || ""));
    b.type = "button";
    if (icon) {
      const span = el("span", "material-symbols-outlined", icon);
      span.setAttribute("aria-hidden", "true");
      b.appendChild(span);
      if (action && ACTION_ARIA[action]) b.setAttribute("aria-label", ACTION_ARIA[action]);
    } else if (label != null) {
      b.textContent = label;
    }
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

  /** Action key handlers — keep onKeyClick a thin dispatcher. */
  const ACTION_HANDLERS = {
    backspace() {
      doBackspace(isCtrl);
      consumeModifiers();
    },
    shift() {
      isShift = !isShift;
      renderKeys();
    },
    ctrl() {
      isCtrl = !isCtrl;
      renderKeys();
    },
    symbols() {
      isSymbol = !isSymbol;
      isShift = false;
      renderKeys();
    },
    space() {
      insert(" ");
      consumeModifiers();
    },
    arrowLeft() {
      moveCaret(-1);
    },
    arrowRight() {
      moveCaret(1);
    },
    enter() {
      insert("\n");
      consumeModifiers();
    }
  };

  function onKeyClick(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    if (action && ACTION_HANDLERS[action]) {
      ACTION_HANDLERS[action]();
      return;
    }
    const chVal = btn.dataset.char;
    if (chVal == null) return;
    if (isCtrl) {
      handleCtrlChord(chVal);
      consumeModifiers();
      return;
    }
    insert(chVal);
    consumeModifiers();
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

  /** Move caret by delta (collapses a selection to the near edge first). */
  function moveCaret(delta) {
    if (!opts || typeof opts.getText !== "function") return;
    const text = opts.getText();
    const caret = opts.getCaret ? opts.getCaret() : { start: text.length, end: text.length };
    let start = caret.start != null ? caret.start : text.length;
    let end = caret.end != null ? caret.end : start;
    let pos;
    if (start !== end) {
      pos = delta < 0 ? start : end;
    } else {
      pos = Math.max(0, Math.min(text.length, start + delta));
    }
    if (typeof opts.setCaret === "function") {
      opts.setCaret(pos);
    } else if (typeof opts.setText === "function") {
      opts.setText(text, pos);
    } else {
      return;
    }
    if (opts.onChange) opts.onChange();
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
    // Preference already set by bindCompose; apply without persisting.
    applyOskMode();
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

  /**
   * Apply allowed ∧ preference → DOM, soft-KB policy, chrome.
   * Never writes localStorage (preference is only persisted on explicit toggle).
   */
  function applyOskMode() {
    const allowed = oskAllowed();
    const on = allowed && !!userPrefersOsk;
    visible = on;

    if (root) {
      root.hidden = !on;
      root.classList.toggle("osk-open", on);
    }
    if (document.body) {
      document.body.classList.toggle("osk-visible", on);
      document.body.classList.toggle("osk-unavailable", !allowed);
    }

    const toggleBtn = opts && opts.toggleBtn;
    if (toggleBtn) {
      toggleBtn.hidden = !allowed;
      toggleBtn.setAttribute("aria-hidden", allowed ? "false" : "true");
      syncToggleUi(toggleBtn, on);
    }

    const displayInput = opts && opts.displayInput;
    applySoftKeyboardPolicy(on, displayInput);

    if (on) {
      try {
        if (navigator.virtualKeyboard && typeof navigator.virtualKeyboard.hide === "function") {
          navigator.virtualKeyboard.hide();
        }
      } catch (_) {}
      refresh();
    }

    if (opts && typeof opts.onLayout === "function") {
      opts.onLayout({ oskVisible: on });
    }
  }

  /** Public: set user preference and apply (persists when bindCompose supplied lsSet). */
  function setVisible(on) {
    userPrefersOsk = !!on;
    if (opts && typeof opts.persistPref === "function") opts.persistPref(userPrefersOsk);
    applyOskMode();
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

    // Default ON. Migrate once; then honor stored preference (phones never override storage).
    userPrefersOsk = true;
    if (lsGet && lsSet) {
      if (lsGet(LS_OSK_V2, null) !== "1") {
        lsSet(LS_OSK_V2, "1");
        lsSet(LS_OSK, "1");
        userPrefersOsk = true;
      } else {
        userPrefersOsk = lsGet(LS_OSK, "1") === "1";
      }
    }

    mountInternal({
      root: panel,
      toggleBtn,
      displayInput,
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
      },
      onChange,
      onLayout: optsIn.onLayout,
      persistPref: (pref) => {
        if (lsSet) lsSet(LS_OSK, pref ? "1" : "0");
      },
      selectAll,
      clipboard,
      undo,
      redo
    });

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        if (!oskAllowed()) return;
        const next = !userPrefersOsk;
        // Before hide: pin shell so the dock cannot drop under the rising iOS keyboard
        // during the button blur → field focus handoff.
        if (!next && typeof optsIn.onSystemKeyboard === "function") {
          optsIn.onSystemKeyboard();
        }
        setVisible(next);
        if (typeof focus === "function") focus();
      });
    }

    try {
      const mq = window.matchMedia(PHONE_OSK_MQ);
      const onPhoneMq = () => applyOskMode();
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", onPhoneMq);
      else if (typeof mq.addListener === "function") mq.addListener(onPhoneMq);
    } catch (_) {}

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
        });
      }
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
