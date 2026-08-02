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
   * Display field helpers: caret, word chips, tag insert, insert/delete navigation.
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
   *   onAfterAutosize?: () => void
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
      d.setText(next, Math.min(start, next.length));
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
      d.setText(next, newCaret);
      d.focusDisplayInput();
    }

    function deleteWholeWordBeforeCaret() {
      const text = d.getText();
      const { start, end } = getDisplayCaretRange();
      if (start !== end) {
        d.setText(text.substring(0, start) + text.substring(end), start);
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
      d.setText(text.substring(0, i) + text.substring(start), i);
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
      bind
    };
  }

  /**
   * Compose overflow menu (clear / pin / replay / tag / history).
   */
  function createActions(deps) {
    const d = deps || {};
    const required = [
      "canAssignFromDisplay", "getText", "canReplay", "canUseGeneratedActions",
      "getLastGeneratedAudio", "clearDisplayText", "startAssignFromDisplay",
      "playSpeechSource", "openTagInsertModal", "openModal", "renderHistory",
      "setHeaderTopicMenuOpen"
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
        { id: "replay", icon: "replay", label: "Replay message", disabled: !replayOk },
        { id: "tag", icon: "add", label: "Insert tag", disabled: false },
        { id: "history", icon: "history", label: "View history", disabled: false }
      ];
      composeActionsMenu.innerHTML = "";
      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `compose-actions-item${item.disabled ? " is-disabled" : ""}`;
        btn.setAttribute("role", "menuitem");
        btn.disabled = !!item.disabled;
        btn.innerHTML = `
          <span class="material-symbols-outlined">${item.icon}</span>
          <span>${item.label}</span>
        `;
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
        d.setHeaderTopicMenuOpen(false);
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

    function openHistoryModal() {
      d.openModal("modal-history");
      d.renderHistory();
      requestAnimationFrame(() => {
        try {
          document.getElementById("modal-history-search-input")?.focus({ preventScroll: true });
        } catch (_) {}
      });
    }

    function run(id) {
      if (id === "new") d.clearDisplayText();
      else if (id === "pin") d.startAssignFromDisplay();
      else if (id === "replay") replayLastGenerated();
      else if (id === "tag") d.openTagInsertModal();
      else if (id === "history") openHistoryModal();
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
      document.getElementById("compose-history-btn")?.addEventListener("click", () => openHistoryModal());
    }

    return {
      bind,
      isOpen,
      setOpen,
      render,
      run,
      replayLastGenerated,
      openHistoryModal
    };
  }

  global.AacCompose = { createDisplay, createActions };
})(typeof window !== "undefined" ? window : globalThis);
