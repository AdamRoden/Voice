/**
 * Unified Cmd/Ctrl hotkeys for shell keyboard + OSK command key.
 * One COMMANDS catalog drives dispatch, help modal, and button titles.
 *
 * Public: AacHotkeys.create(deps) → { run, bind, chordForComposeAction, formatChord }
 */
(function (global) {
  "use strict";

  /**
   * @typedef {{
   *   label: string,
   *   group: "edit"|"app",
   *   textEdit?: boolean,
   *   action: string,
   *   composeAction?: string,
   *   buttons?: { id: string, base: string, disabledTitle?: string }[]
   * }} HotkeyCommand
   */

  /** @type {Record<string, HotkeyCommand>} */
  const COMMANDS = {
    a: { label: "Select all", group: "edit", textEdit: true, action: "selectAll" },
    z: { label: "Undo", group: "edit", textEdit: true, action: "undo" },
    y: { label: "Redo (also Shift+Z)", group: "edit", textEdit: true, action: "redo" },
    x: { label: "Cut", group: "edit", textEdit: true, action: "cut" },
    c: { label: "Copy", group: "edit", textEdit: true, action: "copy" },
    v: { label: "Paste", group: "edit", textEdit: true, action: "paste" },
    backspace: {
      label: "Delete previous word",
      group: "edit",
      textEdit: true,
      action: "backword"
    },
    n: {
      label: "Clear message",
      group: "app",
      action: "clearMessage",
      composeAction: "new",
      buttons: [{ id: "compose-new-message-btn", base: "Clear message" }]
    },
    b: {
      label: "Open voice settings",
      group: "app",
      action: "voiceSettings",
      buttons: [{ id: "nav-voice", base: "Voice settings" }]
    },
    m: {
      label: "Open voice selector",
      group: "app",
      action: "voiceSelector",
      buttons: [{ id: "open-voices", base: "Select voice model and voice" }]
    },
    h: {
      label: "Open history",
      group: "app",
      action: "history",
      composeAction: "history",
      buttons: [{ id: "compose-history-btn", base: "View history" }]
    },
    i: {
      label: "Insert tag",
      group: "app",
      action: "insertTag",
      composeAction: "tag",
      buttons: [{ id: "insert-tag-btn", base: "Insert tag" }]
    },
    p: {
      label: "Pin message to button",
      group: "app",
      action: "pin",
      composeAction: "pin",
      buttons: [{
        id: "compose-pin-btn",
        base: "Pin message to button",
        disabledTitle: "Type something to pin"
      }]
    },
    r: {
      label: "Replay audio",
      group: "app",
      action: "replay",
      composeAction: "replay",
      buttons: [
        {
          id: "compose-replay-btn",
          base: "Replay message",
          disabledTitle: "Speak first to enable replay"
        },
        { id: "textarea-replay-btn", base: "Replay audio" }
      ]
    },
    q: { label: "Previous topic", group: "app", action: "prevTopic" },
    w: { label: "Next topic", group: "app", action: "nextTopic" }
  };

  const GROUP_ORDER = [
    { id: "edit", title: "Editing" },
    { id: "app", title: "Message & app" }
  ];

  /** compose action id → command key */
  const COMPOSE_ACTION_KEY = {};
  Object.keys(COMMANDS).forEach((key) => {
    const ca = COMMANDS[key].composeAction;
    if (ca) COMPOSE_ACTION_KEY[ca] = key;
  });

  function isApplePlatform() {
    try {
      const p = navigator.userAgentData && navigator.userAgentData.platform;
      if (p) return /mac|iphone|ipad|ipod/i.test(p);
    } catch (_) {}
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
  }

  function modLabel() {
    return isApplePlatform() ? "⌘" : "Ctrl";
  }

  /**
   * @param {string} key letter or "backspace"
   * @returns {string}
   */
  function formatChord(key) {
    const k = String(key || "").toLowerCase();
    const apple = isApplePlatform();
    const mod = modLabel();
    if (k === "backspace") return apple ? `${mod}⌫` : `${mod}+Backspace`;
    const letter = k.length === 1 ? k.toUpperCase() : k;
    return apple ? `${mod}${letter}` : `${mod}+${letter}`;
  }

  function titleWithChord(base, key) {
    return `${base} (${formatChord(key)})`;
  }

  function isForeignTextField(el, composeInput) {
    if (!el || el === composeInput) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") {
      const type = String(el.type || "text").toLowerCase();
      return !/^(button|submit|reset|checkbox|radio|file|image|range|color|hidden)$/.test(type);
    }
    return !!el.isContentEditable;
  }

  /**
   * @param {{
   *   displayInput: HTMLTextAreaElement,
   *   actions: Record<string, () => void|boolean|Promise<void>>,
   *   openNestedModal?: (id: string) => string|null,
   *   closeNestedModal?: (returnId: string|null) => void,
   *   closeModals?: () => void,
   *   openModal?: (id: string) => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    const displayInput = d.displayInput;
    const actions = d.actions || {};
    let nestedReturnId = null;

    function run(rawKey) {
      const key = String(rawKey || "").toLowerCase();
      const cmd = COMMANDS[key];
      if (!cmd) return false;
      const fn = actions[cmd.action];
      if (typeof fn !== "function") return false;
      try {
        const result = fn();
        if (result && typeof result.then === "function") {
          Promise.resolve(result).catch(() => {});
        }
      } catch (_) {}
      return true;
    }

    function applyButtonTitles() {
      Object.keys(COMMANDS).forEach((key) => {
        const cmd = COMMANDS[key];
        (cmd.buttons || []).forEach((btn) => {
          const el = document.getElementById(btn.id);
          if (!el) return;
          if (btn.disabledTitle && el.disabled) {
            el.title = btn.disabledTitle;
            el.setAttribute("aria-label", btn.disabledTitle);
            return;
          }
          const t = titleWithChord(btn.base, key);
          el.title = t;
          el.setAttribute("aria-label", t);
        });
      });
    }

    /** Refresh only buttons whose enabled title depends on disabled state. */
    function refreshDynamicTitles() {
      ["p", "r"].forEach((key) => {
        const cmd = COMMANDS[key];
        (cmd.buttons || []).forEach((btn) => {
          if (!btn.disabledTitle) return;
          const el = document.getElementById(btn.id);
          if (!el) return;
          if (el.disabled) {
            el.title = btn.disabledTitle;
            el.setAttribute("aria-label", btn.disabledTitle);
          } else {
            const t = titleWithChord(btn.base, key);
            el.title = t;
            el.setAttribute("aria-label", t);
          }
        });
      });
    }

    function renderHelpModal() {
      const root = document.getElementById("hotkeys-list");
      if (!root) return;
      const blurb = document.getElementById("hotkeys-blurb");
      if (blurb) {
        const mod = modLabel();
        blurb.textContent = "";
        const lead = document.createElement("span");
        lead.appendChild(document.createTextNode("Press "));
        const strong = document.createElement("strong");
        strong.textContent = mod;
        lead.appendChild(strong);
        lead.appendChild(document.createTextNode(
          isApplePlatform()
            ? " plus a key. On the on-screen keyboard, tap ⌘ then a key."
            : " plus a key. On the on-screen keyboard, tap the ⌘ key then a letter."
        ));
        blurb.appendChild(lead);
      }
      root.innerHTML = "";
      GROUP_ORDER.forEach((group) => {
        const items = Object.keys(COMMANDS)
          .filter((k) => COMMANDS[k].group === group.id)
          .map((k) => ({ key: k, label: COMMANDS[k].label }));
        if (!items.length) return;
        const section = document.createElement("section");
        section.className = "hotkeys-group";
        const h = document.createElement("h3");
        h.className = "hotkeys-group-title";
        h.textContent = group.title;
        section.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "hotkeys-rows";
        items.forEach((item) => {
          const li = document.createElement("li");
          li.className = "hotkeys-row";
          const name = document.createElement("span");
          name.className = "hotkeys-row-label";
          name.textContent = item.label;
          const kbd = document.createElement("kbd");
          kbd.className = "hotkeys-chord";
          kbd.textContent = formatChord(item.key);
          li.appendChild(name);
          li.appendChild(kbd);
          ul.appendChild(li);
        });
        section.appendChild(ul);
        root.appendChild(section);
      });
    }

    function openHelpFromHelp() {
      renderHelpModal();
      if (typeof d.openNestedModal === "function") {
        nestedReturnId = d.openNestedModal("modal-hotkeys");
      } else if (typeof d.openModal === "function") {
        nestedReturnId = null;
        d.openModal("modal-hotkeys");
      }
    }

    function backToHelp() {
      if (typeof d.closeNestedModal === "function") {
        d.closeNestedModal(nestedReturnId || "modal-help");
      } else if (typeof d.closeModals === "function") {
        d.closeModals();
      }
      nestedReturnId = null;
    }

    function closeAll() {
      if (typeof d.closeModals === "function") d.closeModals();
      nestedReturnId = null;
    }

    function chordForComposeAction(actionId) {
      const key = COMPOSE_ACTION_KEY[actionId];
      return key ? formatChord(key) : null;
    }

    function bindKeyboard() {
      document.addEventListener("keydown", (e) => {
        if (e.isComposing || e.defaultPrevented) return;
        if (!(e.metaKey || e.ctrlKey)) return;
        if (e.ctrlKey && e.altKey) return; // AltGr

        // Never steal chords from other form fields (settings, modals, search).
        if (isForeignTextField(document.activeElement, displayInput)) return;

        let key = e.key;
        if (key === "Backspace") key = "backspace";
        else if (typeof key === "string" && key.length === 1) key = key.toLowerCase();
        else return;

        // Standard redo chord: Cmd/Ctrl+Shift+Z (in addition to Cmd/Ctrl+Y).
        if (key === "z" && e.shiftKey) key = "y";

        const cmd = COMMANDS[key];
        if (!cmd) return;

        // In the compose field, let the browser own cut/copy/paste (reliable,
        // no Clipboard API permission). Native input hooks still track undo.
        if (
          cmd.textEdit
          && (key === "c" || key === "x" || key === "v")
          && document.activeElement === displayInput
        ) {
          return;
        }

        if (run(key)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, true);
    }

    function bindUi() {
      applyButtonTitles();
      document.getElementById("help-hotkeys-btn")?.addEventListener("click", openHelpFromHelp);
      document.getElementById("hotkeys-back-btn")?.addEventListener("click", backToHelp);
      document.getElementById("hotkeys-close-btn")?.addEventListener("click", closeAll);
    }

    function bind() {
      bindKeyboard();
      bindUi();
    }

    return {
      run,
      bind,
      formatChord,
      chordForComposeAction,
      applyButtonTitles,
      refreshDynamicTitles,
      COMMANDS
    };
  }

  global.AacHotkeys = {
    create,
    formatChord,
    COMMANDS,
    COMPOSE_ACTION_KEY
  };
})(typeof window !== "undefined" ? window : globalThis);
