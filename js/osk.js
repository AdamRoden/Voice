/**
 * VoiceOsk — on-screen keyboard + prediction chips.
 * Orthography lives in composeInsert (app); this module never calls applyInsert.
 *
 * Public API:
 *   VoiceOsk.bindCompose({ ... onCommand? })
 *   VoiceOsk.setVisible(bool) / isVisible() / schedulePredict() / refresh()
 *
 * Command key (⌘): host onCommand(key) — same table as hardware Cmd/Ctrl (AacHotkeys).
 *
 * Chip refresh ownership: schedulePredict only when
 *   (a) host setText runs while OSK is visible, or
 *   (b) caret moves without a text mutation (click/select/keyup), or
 *   (c) host undo/redo that does not go through setText.
 * Keystrokes do not schedule here — they go through setText via composeInsert.
 *
 * Layout: 3 chrome rows shared by alpha / sym; faces plug mid-key strings.
 * Design budget ~12u per row (W.* + letter faces). Per-row --row-units from JS.
 * Dual-home (intentional): `!` on shift+. and on symbols digit-shift / r2.
 */
(function (global) {
  "use strict";

  /* ---- key descriptors: { ch, u? } | { action, label|icon, u? } ---- */
  /** Shared chrome widths (letter unit = 1). Rows target sum ≈ 12. */
  const W = {
    tab: 0.85,
    bksp: 1.15,
    shift: 1.3,
    cmd: 0.85,
    sym: 0.85,
    space: 1.15,
    punct: 0.85, // , '
    period: 1,
    enter: 1.15
  };

  /** @param {number} [u] width in letter units (default 1) */
  function ch(c, u) {
    const k = { ch: c };
    if (u != null && u !== 1) k.u = u;
    return k;
  }
  function act(action, label, u) {
    const k = { action: action, label: label };
    if (u != null && u !== 1) k.u = u;
    return k;
  }
  function actIcon(action, icon, u) {
    const k = { action: action, icon: icon };
    if (u != null && u !== 1) k.u = u;
    return k;
  }
  function chars(s) {
    return String(s).split("").map((c) => ch(c));
  }
  function face(keys) {
    return { keys: keys || [] };
  }
  function keyU(k) {
    return typeof k.u === "number" ? k.u : 1;
  }

  /**
   * Shared 3-row frame. faces: { mid1, mid2, left3, right3, symLabel }.
   * Punct shift maps (both layers): ,→?  '→"  .→!
   */
  function chromeRows(shift, faces) {
    return [
      face([
        actIcon("tab", "keyboard_tab", W.tab),
        ...faces.mid1,
        actIcon("backspace", "backspace", W.bksp)
      ]),
      face([
        actIcon("shift", "shift", W.shift),
        ...faces.mid2,
        ch(shift ? "?" : ",", W.punct),
        ch(shift ? "\"" : "'", W.punct)
      ]),
      face([
        actIcon("ctrl", "keyboard_command_key", W.cmd),
        act("symbols", faces.symLabel, W.sym),
        ...faces.left3,
        actIcon("space", "space_bar", W.space),
        ...faces.right3,
        ch(shift ? "!" : ".", W.period),
        actIcon("enter", "keyboard_return", W.enter)
      ])
    ];
  }

  function layoutAlpha(shift) {
    const letter = (s) => chars(shift ? s.toUpperCase() : s);
    return chromeRows(shift, {
      mid1: letter("qwertyuiop"),
      mid2: letter("asdfghjkl"),
      left3: letter("zxcv"),
      right3: letter("bnm"),
      symLabel: "123?"
    });
  }

  function layoutSym(shift) {
    /*
     * Digits → US top-row punct. r2: ( ) → < > ; & * → ± §.
     * r3: [ ] → { }. Shared punct slots from chromeRows.
     */
    return chromeRows(shift, {
      mid1: chars(shift ? "!@#$%^&*()" : "1234567890"),
      mid2: chars(shift ? "`~^|\\±§<>" : "!@#$%&*()"),
      left3: chars(shift ? "·°{}" : "_=[]"),
      right3: chars(shift ? "—¿¡" : "-+/"),
      symLabel: "ABC"
    });
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
    return parts.join(" ");
  }

  /** Face row: --row-units / --gaps / --u for CSS unit grid. */
  function appendFaceRow(parent, rowSpec) {
    const keys = (rowSpec && rowSpec.keys) || [];
    const row = el("div", "osk-row");
    const units = keys.map(keyU);
    const totalU = units.reduce((a, b) => a + b, 0) || 1;
    const gaps = Math.max(0, keys.length - 1);
    row.style.setProperty("--row-units", String(totalU));
    row.style.setProperty("--gaps", String(gaps));
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
    tab: "Tab"
  };

  function renderKey(k) {
    if (k.action) return keyBtn(k.label, keyClass(k), k.action, null, k.icon);
    return keyBtn(k.ch, keyClass(k), null, k.ch);
  }

  function renderKeys() {
    if (!keysEl) return;
    keysEl.innerHTML = "";
    currentLayout().forEach((rowSpec) => appendFaceRow(keysEl, rowSpec));
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
      if (isCtrl && typeof opts.onCommand === "function") {
        opts.onCommand("backspace");
        consumeModifiers();
        return;
      }
      doBackspace(false);
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
    tab() {
      insert("\t");
      consumeModifiers();
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

  /** Command-key chords (⌘ then letter) → host onCommand (AacHotkeys). */
  function handleCtrlChord(chVal) {
    if (typeof opts.onCommand !== "function") return;
    const lower = String(chVal).toLowerCase();
    const handled = opts.onCommand(lower);
    // Host setText already schedules chips; only force refresh when undo/redo ran.
    if (handled !== false && (lower === "z" || lower === "y")) schedulePredict();
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

  function chipLabel(chip) {
    if (chip == null) return "";
    if (typeof chip === "string") return chip;
    return chip.text != null ? String(chip.text) : "";
  }

  function chipAction(chip) {
    if (chip && typeof chip === "object" && chip.action) return chip.action;
    return "append";
  }

  function applyPrediction(chip) {
    if (!opts || !chip) return;
    const label = chipLabel(chip);
    if (!label) return;
    const action = chipAction(chip);
    const text = opts.getText ? opts.getText() : "";
    const caret = opts.getCaret ? opts.getCaret() : { start: text.length, end: text.length };
    const upTo = text.slice(0, caret.start);
    const end = caret.end;
    const replacePrev = action === "replacePrev";

    let start = caret.start;
    let piece = label + " ";

    if (replacePrev) {
      // Fail closed: only rewrite when a completed prior word is at the caret.
      const m = upTo.match(/([a-zA-Z']+)(\s*)$/i);
      if (!m) return;
      start = caret.start - m[0].length;
      const trail = m[2] && m[2].length ? m[2] : " ";
      piece = label + trail;
    } else {
      const match = upTo.match(/([a-zA-Z']+)$/i);
      if (match) start = caret.start - match[1].length;
    }

    if (typeof opts.setText === "function") {
      opts.setText(text.slice(0, start) + piece + text.slice(end), start + piece.length);
    }
    if (global.VoicePredict && typeof VoicePredict.recordAccept === "function") {
      const ctx = replacePrev
        ? (lastSnap.ctxWords || []).slice(0, -1)
        : lastSnap.ctxWords || [];
      VoicePredict.recordAccept(ctx, label);
    }
    if (opts.onChange) opts.onChange();
  }

  function makePredChip(chip) {
    const label = chipLabel(chip);
    const b = el("button", "osk-pred-chip", label);
    b.type = "button";
    if (chipAction(chip) === "replacePrev") {
      b.classList.add("osk-pred-chip--correct");
      b.title = "Did you mean " + label + "?";
    }
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", () => applyPrediction(chip));
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
      const b = makePredChip(list[i]); // {text, action} or string
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
      chips = ["I", "I'm", "You", "What", "How", "Can", "Yes", "No", "Thanks"].map(
        (t) => ({ text: t, action: "append" })
      );
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
        const warm =
          typeof VoicePredict.loadModels === "function"
            ? VoicePredict.loadModels()
            : typeof VoicePredict.loadFrequencyList === "function"
              ? VoicePredict.loadFrequencyList()
              : null;
        if (warm && typeof warm.then === "function") {
          warm.then(() => {
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
      onCommand
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
      onCommand
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
