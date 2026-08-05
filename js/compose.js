/**
 * Compose surface: display field (caret, chips, tags) + overflow menu.
 * Primary export: AacCompose.createDisplay / AacCompose.createActions.
 */
(function (global) {
  "use strict";

  const DEFAULT_SAVED_TAGS = [
    "laugh", "cry", "burp", "loud", "soft", "sing",
    "english accent", "irish accent", "pirate accent"
  ];
  const SAVED_TAGS_STORAGE_KEY = "aac_saved_tags";

  /**
   * Display field helpers: caret, chips, tags, insert/delete, undo/redo history.
   * d.setText is the raw paint path (no history). Use commitText for tracked edits.
   * @param {{
   *   displayInput: HTMLTextAreaElement,
   *   getText: () => string,
   *   setText: (val: string, caret?: number) => void,
   *   focusDisplayInput: () => void,
   *   announceLive: (msg: string) => void,
   *   openModal: (id: string) => void,
   *   closeModals: () => void,
   *   isFeatMessageWords: () => boolean,
   *   getSavedSelection: () => { start: number|null, end: number|null },
   *   setSavedSelection: (sel: { start: number|null, end: number|null }) => void,
   *   scheduleKeyboardAlign?: () => void,
   *   getCurrentFontSize?: () => number,
   *   onAfterAutosize?: () => void,
   *   insertChunk?: (chunk: string) => void,
   *   canInsertTag?: () => boolean
   * }} deps
   */
  function createDisplay(deps) {
    const d = deps || {};
    for (const key of [
      "displayInput", "getText", "setText", "focusDisplayInput", "announceLive",
      "openModal", "closeModals", "isFeatMessageWords",
      "getSavedSelection", "setSavedSelection"
    ]) {
      if (d[key] === undefined || d[key] === null) {
        throw new Error(`AacCompose.createDisplay missing required dep: ${key}`);
      }
    }

    const displayInput = d.displayInput;
    let savedTagsList = loadSavedTags();
    let savedTagsInputTimer = null;

    // ---- Undo / redo (owns history; raw paint stays d.setText) ----
    const HISTORY_LIMIT = 80;
    /** @type {{ text: string, caret: number }[]} */
    let undoStack = [];
    /** @type {{ text: string, caret: number }[]} */
    let redoStack = [];
    let knownText = displayInput ? String(displayInput.value || "") : "";
    let caretBeforeNative = 0;
    let applyQuiet = false;
    /** Coalesce rapid native typing into one undo step. */
    let lastNativeKind = "";
    let lastNativeAt = 0;
    const NATIVE_COALESCE_MS = 800;

    function readCaret() {
      try {
        if (typeof displayInput.selectionStart === "number") return displayInput.selectionStart;
      } catch (_) {}
      const saved = d.getSavedSelection() || {};
      if (saved.start != null && Number.isFinite(saved.start)) return saved.start;
      return d.getText().length;
    }

    function pushUndo(prev) {
      if (!prev) return;
      const last = undoStack[undoStack.length - 1];
      if (last && last.text === prev.text) return;
      undoStack.push(prev);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack = [];
    }

    function saveNativeSelection() {
      try {
        d.setSavedSelection({
          start: displayInput.selectionStart,
          end: displayInput.selectionEnd
        });
      } catch (_) {}
    }

    /**
     * Tracked text mutation. Prefer this over d.setText for user edits.
     * @param {string} val
     * @param {number} [caret]
     * @param {{ skipHistory?: boolean }} [opts]
     */
    function commitText(val, caret, opts) {
      const next = val == null ? "" : String(val);
      const skip = !!(opts && opts.skipHistory);
      if (!skip && knownText !== next) {
        pushUndo({ text: knownText, caret: readCaret() });
        lastNativeKind = "";
      }
      applyQuiet = true;
      try {
        const pos = caret == null ? next.length : caret;
        d.setText(next, pos);
        knownText = next;
      } finally {
        applyQuiet = false;
      }
    }

    function resetHistory() {
      undoStack = [];
      redoStack = [];
      knownText = d.getText();
      lastNativeKind = "";
    }

    function noteNativeBeforeEdit() {
      caretBeforeNative = readCaret();
    }

    /**
     * @param {InputEvent|Event} [e]
     */
    function onNativeInput(e) {
      if (applyQuiet) return;
      // Mid-IME: wait for compositionend / final input.
      if (e && e.isComposing) return;
      try {
        if (displayInput && displayInput.composing) return;
      } catch (_) {}

      const next = d.getText();
      if (next === knownText) return;

      const now = Date.now();
      const grew =
        next.length > knownText.length
        && next.slice(0, knownText.length) === knownText;
      const shrunk =
        next.length < knownText.length
        && knownText.slice(0, next.length) === next;

      // Coalesce rapid insert bursts (one undo for a word typed quickly).
      if (
        grew
        && lastNativeKind === "insert"
        && now - lastNativeAt < NATIVE_COALESCE_MS
      ) {
        knownText = next;
        lastNativeAt = now;
        saveNativeSelection();
        return;
      }

      pushUndo({ text: knownText, caret: caretBeforeNative });
      if (grew) lastNativeKind = "insert";
      else if (shrunk) lastNativeKind = "delete";
      else lastNativeKind = "other";
      lastNativeAt = now;
      knownText = next;
      saveNativeSelection();
    }

    function undo() {
      if (!undoStack.length) return false;
      const cur = { text: d.getText(), caret: readCaret() };
      const prev = undoStack.pop();
      redoStack.push(cur);
      commitText(prev.text, prev.caret, { skipHistory: true });
      d.focusDisplayInput();
      return true;
    }

    function redo() {
      if (!redoStack.length) return false;
      const cur = { text: d.getText(), caret: readCaret() };
      const next = redoStack.pop();
      undoStack.push(cur);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      commitText(next.text, next.caret, { skipHistory: true });
      d.focusDisplayInput();
      return true;
    }

    function selectAll() {
      try {
        displayInput.focus({ preventScroll: true });
        const len = d.getText().length;
        displayInput.setSelectionRange(0, len);
        d.setSavedSelection({ start: 0, end: len });
      } catch (_) {
        try {
          displayInput.focus();
          displayInput.select();
        } catch (__) {}
      }
    }

    async function clipboard(op) {
      const text = d.getText();
      const { start, end } = getDisplayCaretRange();
      const a = Math.min(start, end);
      const b = Math.max(start, end);
      if (op === "copy" || op === "cut") {
        const slice = a !== b ? text.slice(a, b) : text;
        if (slice && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(slice).catch(() => {});
        }
        if (op === "cut" && a !== b) commitText(text.slice(0, a) + text.slice(b), a);
      } else if (op === "paste" && navigator.clipboard?.readText) {
        const clip = await navigator.clipboard.readText().catch(() => "");
        if (!clip) return;
        if (typeof d.insertChunk === "function") d.insertChunk(clip);
        else {
          const next = text.slice(0, a) + clip + text.slice(b);
          commitText(next, a + clip.length);
        }
      }
    }

    function tokenizeDisplayWords(text) {
      const tokens = [];
      const re = /\S+/g;
      let m;
      while ((m = re.exec(String(text || ""))) !== null) {
        tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      return tokens;
    }

    function removeDisplayWordAt(index) {
      const text = d.getText();
      const tokens = tokenizeDisplayWords(text);
      if (index < 0 || index >= tokens.length) return;
      const t = tokens[index];
      let start = t.start;
      let end = t.end;
      if (end < text.length && /\s/.test(text[end])) end += 1;
      else if (start > 0 && /\s/.test(text[start - 1])) start -= 1;
      const next = text.slice(0, start) + text.slice(end);
      commitText(next, Math.min(start, next.length));
      d.announceLive(`Removed ${t.text}`);
      d.focusDisplayInput();
    }

    function syncComposeStrip() {
      const strip = document.getElementById("compose-strip");
      const chips = document.getElementById("compose-chips");
      if (!strip || !chips) return;
      chips.innerHTML = "";
      if (!d.isFeatMessageWords()) {
        strip.classList.remove("has-items");
        strip.classList.remove("has-audio");
        return;
      }
      const tokens = tokenizeDisplayWords(d.getText());
      if (!tokens.length) {
        strip.classList.remove("has-items");
        return;
      }
      strip.classList.add("has-items");
      tokens.forEach((tok, i) => {
        const chip = document.createElement("div");
        chip.className = "compose-chip";
        chip.setAttribute("role", "listitem");
        chip.innerHTML = `
          <span class="compose-chip-text"></span>
          <button type="button" class="compose-chip-remove" title="Remove word" aria-label="Remove ${tok.text}">
            <span class="material-symbols-outlined">close</span>
          </button>
        `;
        chip.querySelector(".compose-chip-text").textContent = tok.text;
        chip.querySelector(".compose-chip-remove")?.addEventListener("click", (e) => {
          e.stopPropagation();
          removeDisplayWordAt(i);
        });
        chips.appendChild(chip);
      });
    }

    function getDisplayCaretRange() {
      const len = d.getText().length;
      if (document.activeElement === displayInput && typeof displayInput.selectionStart === "number") {
        return {
          start: displayInput.selectionStart,
          end: typeof displayInput.selectionEnd === "number"
            ? displayInput.selectionEnd
            : displayInput.selectionStart
        };
      }
      const saved = d.getSavedSelection() || {};
      let start = saved.start;
      let end = saved.end;
      if (start == null || !Number.isFinite(start)) start = len;
      if (end == null || !Number.isFinite(end)) end = start;
      start = Math.max(0, Math.min(start, len));
      end = Math.max(0, Math.min(end, len));
      return { start, end };
    }

    function padInsertAgainstNeighbors(text, start, end, insert) {
      let piece = insert == null ? "" : String(insert);
      if (!piece) return piece;
      const before = start > 0 ? text[start - 1] : "";
      const after = end < text.length ? text[end] : "";
      if (before && !/\s/.test(before) && !/^\s/.test(piece)) piece = ` ${piece}`;
      if (after && !/\s/.test(after) && !/\s$/.test(piece)) piece = `${piece} `;
      return piece;
    }

    function insertTextAtDisplayCaret(raw) {
      const insert = raw == null ? "" : String(raw);
      if (!insert) {
        d.focusDisplayInput();
        return;
      }
      const text = d.getText();
      const { start, end } = getDisplayCaretRange();
      const padded = padInsertAgainstNeighbors(text, start, end, insert);
      const next = text.substring(0, start) + padded + text.substring(end);
      const newCaret = start + padded.length;
      commitText(next, newCaret);
      d.focusDisplayInput();
    }

    function deleteWholeWordBeforeCaret() {
      const text = d.getText();
      const { start, end } = getDisplayCaretRange();
      if (start !== end) {
        commitText(text.substring(0, start) + text.substring(end), start);
        d.focusDisplayInput();
        return;
      }
      if (start <= 0) {
        d.focusDisplayInput();
        return;
      }
      let i = start;
      while (i > 0 && /\s/.test(text[i - 1])) i--;
      while (i > 0 && !/\s/.test(text[i - 1])) i--;
      commitText(text.substring(0, i) + text.substring(start), i);
      d.focusDisplayInput();
    }

    function moveDisplayCaretLeft() {
      const { start, end } = getDisplayCaretRange();
      const pos = start !== end ? start : Math.max(0, start - 1);
      try {
        displayInput.focus({ preventScroll: true });
        displayInput.setSelectionRange(pos, pos);
      } catch (_) {
        try { displayInput.focus(); } catch (__) {}
      }
      d.setSavedSelection({ start: pos, end: pos });
    }

    function parseTagsList(str) {
      return String(str || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    function loadSavedTags() {
      try {
        const raw = localStorage.getItem(SAVED_TAGS_STORAGE_KEY);
        if (raw == null || raw === "") return [...DEFAULT_SAVED_TAGS];
        const parsed = parseTagsList(raw);
        return parsed.length ? parsed : [...DEFAULT_SAVED_TAGS];
      } catch (_) {
        return [...DEFAULT_SAVED_TAGS];
      }
    }

    function persistSavedTags(tags) {
      savedTagsList = Array.isArray(tags) ? tags.slice() : [];
      try {
        localStorage.setItem(SAVED_TAGS_STORAGE_KEY, savedTagsList.join(", "));
      } catch (_) {}
    }

    function tagsListToText(tags) {
      return (tags || []).join(", ");
    }

    function renderTagInsertGrid(tags) {
      const grid = document.getElementById("tag-insert-grid");
      if (!grid) return;
      grid.innerHTML = "";
      const list = Array.isArray(tags) ? tags : [];
      if (list.length === 0) {
        grid.innerHTML = `<div class="tag-insert-empty">No saved tags. Add some below (comma-separated).</div>`;
        return;
      }
      list.forEach((tag) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tag-insert-btn";
        btn.textContent = tag;
        btn.title = `Insert [${tag}]`;
        btn.addEventListener("click", () => {
          insertBracketTag(tag);
          d.closeModals();
        });
        grid.appendChild(btn);
      });
    }

    function openTagInsertModal() {
      if (typeof d.canInsertTag === "function" && !d.canInsertTag()) return;
      savedTagsList = loadSavedTags();
      const savedInput = document.getElementById("saved-tags-input");
      if (savedInput) savedInput.value = tagsListToText(savedTagsList);
      renderTagInsertGrid(savedTagsList);
      const customInput = document.getElementById("insert-tag-input");
      if (customInput) customInput.value = "";
      d.openModal("tag-insert-modal");
      requestAnimationFrame(() => {
        const el = document.getElementById("insert-tag-input");
        if (!el) return;
        try {
          el.focus({ preventScroll: true });
          el.select();
        } catch (_) {
          try { el.focus(); } catch (__) {}
        }
      });
    }

    function onSavedTagsInputChange() {
      const input = document.getElementById("saved-tags-input");
      if (!input) return;
      const tags = parseTagsList(input.value);
      renderTagInsertGrid(tags);
      clearTimeout(savedTagsInputTimer);
      savedTagsInputTimer = setTimeout(() => {
        persistSavedTags(tags);
      }, 250);
    }

    function insertBracketTag(rawOverride) {
      const insertInput = document.getElementById("insert-tag-input");
      const raw = (rawOverride != null ? String(rawOverride) : (insertInput?.value || "")).trim();
      if (!raw) return;
      insertTextAtDisplayCaret(`[${raw}]`);
    }

    function syncSpeakClearToDisplayHeight() {
      if (!displayInput) return;
      const styles = getComputedStyle(displayInput);
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      let lineH = parseFloat(styles.lineHeight);
      if (!Number.isFinite(lineH) || styles.lineHeight === "normal") {
        const fontSize = typeof d.getCurrentFontSize === "function" ? d.getCurrentFontSize() : 28;
        lineH = fontSize * 1.35;
      }
      const size = Math.max(36, Math.min(52, Math.ceil(lineH + padY)));
      document.documentElement.style.setProperty("--display-ctrl-size", `${size}px`);
    }

    function autosizeDisplayInput() {
      if (!displayInput) return;
      syncSpeakClearToDisplayHeight();
      displayInput.style.height = "auto";
      displayInput.style.height = `${displayInput.scrollHeight}px`;
      if (document.activeElement === displayInput && typeof d.scheduleKeyboardAlign === "function") {
        d.scheduleKeyboardAlign();
      }
      if (typeof d.onAfterAutosize === "function") d.onAfterAutosize();
    }

    function bind() {
      // Native hardware typing / delete that bypasses commitText
      displayInput.addEventListener("beforeinput", () => noteNativeBeforeEdit());
      displayInput.addEventListener("input", (e) => onNativeInput(e));
      displayInput.addEventListener("compositionend", () => {
        // Final composed string may not re-fire a meaningful history step if we skipped mid-IME.
        noteNativeBeforeEdit();
        onNativeInput({ isComposing: false });
      });
      displayInput.addEventListener("keydown", (e) => {
        if (!e.metaKey && !e.ctrlKey && (e.key === "Backspace" || e.key === "Delete")) {
          noteNativeBeforeEdit();
        }
      });

      document.getElementById("saved-tags-input")?.addEventListener("input", onSavedTagsInputChange);
      document.getElementById("saved-tags-input")?.addEventListener("change", () => {
        const input = document.getElementById("saved-tags-input");
        if (!input) return;
        persistSavedTags(parseTagsList(input.value));
        renderTagInsertGrid(savedTagsList);
      });
      document.getElementById("insert-tag-btn")?.addEventListener("click", () => openTagInsertModal());
      document.getElementById("insert-tag-input")?.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const raw = (document.getElementById("insert-tag-input")?.value || "").trim();
        if (!raw) return;
        insertBracketTag(raw);
        const customInput = document.getElementById("insert-tag-input");
        if (customInput) customInput.value = "";
        d.closeModals();
      });
    }

    return {
      tokenizeDisplayWords,
      removeDisplayWordAt,
      syncComposeStrip,
      getDisplayCaretRange,
      padInsertAgainstNeighbors,
      insertTextAtDisplayCaret,
      deleteWholeWordBeforeCaret,
      moveDisplayCaretLeft,
      openTagInsertModal,
      insertBracketTag,
      syncSpeakClearToDisplayHeight,
      autosizeDisplayInput,
      commitText,
      resetHistory,
      undo,
      redo,
      selectAll,
      clipboard,
      bind
    };
  }

  /**
   * Compose overflow menu (clear / pin / replay / tag).
   */
  function createActions(deps) {
    const d = deps || {};
    const required = [
      "canAssignFromDisplay", "getText", "canReplay", "canUseGeneratedActions",
      "getLastGeneratedAudio", "clearDisplayText", "startAssignFromDisplay",
      "playSpeechSource", "openTagInsertModal", "canInsertTag"
    ];
    for (const key of required) {
      if (typeof d[key] !== "function") {
        throw new Error(`AacCompose.createActions missing required dep: ${key}`);
      }
    }

    const composeActionsBtn = document.getElementById("compose-actions-btn");
    const composeActionsMenu = document.getElementById("compose-actions-menu");

    function isOpen() {
      return !!(composeActionsMenu && !composeActionsMenu.hidden);
    }

    function render() {
      if (!composeActionsMenu) return;
      const hasText = d.canAssignFromDisplay();
      const last = d.getLastGeneratedAudio();
      const replayOk = d.canReplay(last, d.getText());
      const items = [
        { id: "new", icon: "close", label: "Clear message", disabled: false },
        { id: "pin", icon: "push_pin", label: "Pin to button", disabled: !hasText },
        { id: "replay", icon: "replay", label: "Replay message", disabled: !replayOk }
      ];
      if (d.canInsertTag()) {
        items.push({ id: "tag", icon: "add", label: "Insert tag", disabled: false });
      }
      composeActionsMenu.innerHTML = "";
      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `compose-actions-item${item.disabled ? " is-disabled" : ""}`;
        btn.setAttribute("role", "menuitem");
        btn.disabled = !!item.disabled;
        const chord = typeof d.actionHotkeyChord === "function"
          ? (d.actionHotkeyChord(item.id) || "")
          : "";
        btn.innerHTML = "";
        const icon = document.createElement("span");
        icon.className = "material-symbols-outlined";
        icon.textContent = item.icon;
        const label = document.createElement("span");
        label.className = "compose-actions-label";
        label.textContent = item.label;
        btn.appendChild(icon);
        btn.appendChild(label);
        if (chord) {
          const kbd = document.createElement("kbd");
          kbd.className = "compose-actions-shortcut";
          kbd.textContent = chord;
          btn.appendChild(kbd);
          btn.title = `${item.label} (${chord})`;
        } else {
          btn.title = item.label;
        }
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (item.disabled) return;
          setOpen(false);
          run(item.id);
        });
        composeActionsMenu.appendChild(btn);
      });
    }

    function fitMenuToViewport() {
      if (!composeActionsMenu || !composeActionsBtn || composeActionsMenu.hidden) return;
      const FloatMenu = global.AacFloatMenu;
      if (!FloatMenu) return;
      // Short fixed action list: shift into view, no scrollbar (must fit viewport).
      // Above OSK (--z-osk: 110); keep in sync with css --z-compose-menu.
      FloatMenu.place(composeActionsMenu, composeActionsBtn, {
        prefer: "above",
        overflow: "shift",
        gap: 8,
        pad: 8,
        zIndex: 120
      });
    }

    function setOpen(open) {
      if (!composeActionsMenu || !composeActionsBtn) return;
      composeActionsMenu.hidden = !open;
      composeActionsBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        render();
        requestAnimationFrame(() => fitMenuToViewport());
      } else if (global.AacFloatMenu) {
        global.AacFloatMenu.clear(composeActionsMenu);
      }
    }

    function replayLastGenerated() {
      const last = d.getLastGeneratedAudio();
      if (d.canUseGeneratedActions(last)) d.playSpeechSource(last);
    }

    function run(id) {
      if (id === "new") d.clearDisplayText();
      else if (id === "pin") d.startAssignFromDisplay();
      else if (id === "replay") replayLastGenerated();
      else if (id === "tag") d.openTagInsertModal();
    }

    function bind() {
      composeActionsBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        setOpen(!isOpen());
      });
      document.addEventListener("click", (e) => {
        if (!isOpen()) return;
        const wrap = e.target.closest?.("#compose-actions-wrap");
        if (!wrap) setOpen(false);
      });
      // Re-fit when viewport/OSK size changes while the menu is open
      const onViewportChange = () => {
        if (isOpen()) fitMenuToViewport();
      };
      window.addEventListener("resize", onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", onViewportChange);
        window.visualViewport.addEventListener("scroll", onViewportChange);
      }
      document.getElementById("compose-replay-btn")?.addEventListener("click", () => replayLastGenerated());
    }

    return {
      bind,
      isOpen,
      setOpen,
      render,
      run,
      replayLastGenerated
    };
  }

  global.AacCompose = { createDisplay, createActions };
})(typeof window !== "undefined" ? window : globalThis);
