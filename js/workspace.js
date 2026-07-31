/**
 * Workspace owner: topic chats (1–5), chat chips, header topic menu.
 * Topics module owns board model/edit; Workspace owns chat chrome.
 */
(function (global) {
  "use strict";

  const CHAT_MIN = 1;
  const CHAT_MAX = 5;
  const CHATS_STORAGE_KEY = "aac_chats";
  const ACTIVE_CHAT_KEY = "aac_active_chat";

  function create(deps) {
    const d = deps || {};
    if (!global.AacTopics) throw new Error("AacWorkspace requires AacTopics");

    const required = [
      "trim", "clamp", "lsGet", "lsSet", "lsGetJson", "getText", "setText",
      "focusDisplayInput", "syncComposeStrip", "syncGeneratedAudioActions",
      "autosizeDisplayInput", "escapeHtml", "topicsDeps"
    ];
    for (const key of required) {
      if (d[key] === undefined || d[key] === null) {
        throw new Error(`AacWorkspace missing required dep: ${key}`);
      }
    }

    const chatSlotsEl = document.getElementById("chat-slots");
    const headerShell = document.getElementById("workspace-header-shell");
    const workspaceHeader = document.getElementById("workspace-header");
    const headerTopicMenu = document.getElementById("header-topic-menu");

    let chats = [];
    let activeChat = 0;
    /** Slim = 50% bar height; never fully hidden. */
    let headerSlim = false;
    /** @type {ReturnType<typeof global.AacTopics.create>|null} */
    let Topics = null;

    function defaultTopicIdForChat(index) {
      const list = Topics.getTopicsList();
      const i = d.clamp(index, 0, Math.max(0, list.length - 1));
      return (list[i] && list[i].id) || (list[0] && list[0].id) || null;
    }

    function emptyChat(topicId = null) {
      return { text: "", topicId: topicId || defaultTopicIdForChat(0) };
    }

    function normalizeChat(raw, fallbackTopicId = null) {
      if (typeof raw === "string") {
        return { text: raw, topicId: fallbackTopicId || defaultTopicIdForChat(0) };
      }
      if (!raw || typeof raw !== "object") return emptyChat(fallbackTopicId);
      return {
        text: raw.text == null ? "" : String(raw.text),
        topicId: raw.topicId || fallbackTopicId || defaultTopicIdForChat(0)
      };
    }

    function reconcileChatsList(list) {
      const validIds = new Set(Topics.getTopicsList().map((t) => t.id));
      const seen = new Set();
      const out = [];
      (Array.isArray(list) ? list : []).forEach((raw) => {
        const c = normalizeChat(raw, null);
        if (!c.topicId || !validIds.has(c.topicId) || seen.has(c.topicId)) return;
        seen.add(c.topicId);
        out.push(c);
      });
      if (out.length > CHAT_MAX) out.length = CHAT_MAX;
      if (out.length === 0) {
        const tid = (Topics.getTopicsList()[0] && Topics.getTopicsList()[0].id)
          || Topics.getActiveTopicId();
        if (tid) out.push(emptyChat(tid));
      }
      return out;
    }

    function loadChatsFromStorage() {
      const raw = d.lsGetJson(CHATS_STORAGE_KEY, null);
      if (Array.isArray(raw) && raw.length) return reconcileChatsList(raw);
      const n = Math.min(CHAT_MAX, Math.max(CHAT_MIN, Topics.getTopicsList().length || 1));
      const starter = [];
      for (let i = 0; i < n; i++) {
        const tid = defaultTopicIdForChat(i);
        if (!tid || starter.some((c) => c.topicId === tid)) continue;
        starter.push(emptyChat(tid));
      }
      return reconcileChatsList(starter);
    }

    function persistChats() {
      try {
        d.lsSet(CHATS_STORAGE_KEY, JSON.stringify(chats));
        d.lsSet(ACTIVE_CHAT_KEY, String(activeChat));
      } catch (_) {}
    }

    function saveActiveChatSnapshot() {
      if (!chats || !chats[activeChat]) return;
      const topicId = chats[activeChat].topicId || Topics.getActiveTopicId();
      chats[activeChat] = { text: d.getText(), topicId };
      persistChats();
    }

    function previewSnippet(text, max = 36) {
      const t = String(text || "").replace(/\s+/g, " ").trim();
      if (!t) return "(empty)";
      return t.length > max ? `${t.slice(0, max)}…` : t;
    }

    function chatHasContent(chat) {
      return !!(chat && d.trim(chat.text));
    }

    function findChatIndexForTopic(topicId) {
      return chats.findIndex((c) => c && c.topicId === topicId);
    }

    // ---- header chrome + topic menu ----
    function getActiveChatChip() {
      if (!chatSlotsEl) return null;
      return chatSlotsEl.querySelector(`.chat-chip[data-chat="${activeChat}"]`)
        || chatSlotsEl.querySelector(".chat-chip.active");
    }

    function syncHeaderChrome() {
      if (!headerShell) return;
      headerShell.dataset.size = headerSlim ? "slim" : "normal";
      if (workspaceHeader) {
        workspaceHeader.title = headerSlim
          ? "Tap empty space to expand the top bar"
          : "Tap empty space to slim the top bar";
      }
    }

    /** True when the click should not toggle slim/normal (chips, menu, buttons). */
    function isHeaderInteractiveTarget(target) {
      if (!target || !(target instanceof Element)) return false;
      return !!target.closest(
        ".chat-chip, #header-topic-menu, .mobile-menu-btn, button, a, input, select, textarea, [role='option']"
      );
    }

    function isHeaderTopicMenuOpen() {
      return !!(headerTopicMenu && !headerTopicMenu.hidden);
    }

    function positionHeaderTopicMenu() {
      const anchor = getActiveChatChip();
      if (!headerTopicMenu || !anchor || headerTopicMenu.hidden) return;
      const FloatMenu = global.AacFloatMenu;
      if (!FloatMenu) return;
      const pad = 8;
      const menuW = Math.min(320, Math.max(200, window.innerWidth - pad * 2));
      FloatMenu.place(headerTopicMenu, anchor, {
        prefer: "below",
        overflow: "scroll",
        gap: 6,
        pad,
        width: menuW,
        maxHeight: 320,
        zIndex: 450
      });
    }

    function setHeaderSlim(slim) {
      headerSlim = !!slim;
      syncHeaderChrome();
      if (headerSlim) setHeaderTopicMenuOpen(false);
    }

    function renderHeaderTopicMenu() {
      if (!headerTopicMenu || !Topics) return;
      headerTopicMenu.innerHTML = "";
      const list = Topics.getTopicsList() || [];
      const openTopicIds = new Set(
        (Array.isArray(chats) ? chats : []).map((c) => c && c.topicId).filter(Boolean)
      );
      const activeTopicId = Topics.getActiveTopicId();

      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "mode-topic-empty";
        empty.textContent = "No topics yet";
        headerTopicMenu.appendChild(empty);
      } else {
        list.forEach((topic) => {
          const row = document.createElement("div");
          row.className = "mode-topic-item-row";
          const isActive = topic.id === activeTopicId;
          const isOpen = openTopicIds.has(topic.id);

          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = `mode-topic-item${isActive ? " active" : ""}`;
          btn.setAttribute("role", "option");
          btn.setAttribute("aria-selected", isActive ? "true" : "false");
          btn.dataset.topicId = topic.id;
          const openHint = isOpen && !isActive
            ? `<span class="mode-topic-open-badge">open</span>`
            : "";
          btn.innerHTML = `
            <span class="material-symbols-outlined" style="color: ${topic.color || "inherit"};">${topic.icon || "folder"}</span>
            <span class="mode-topic-item-name">${d.escapeHtml(topic.name || "Topic")}</span>
            ${openHint}
          `;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            setHeaderTopicMenuOpen(false);
            Topics.switchTopic(topic.id);
          });

          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "mode-topic-edit-btn";
          editBtn.title = "Edit topic";
          editBtn.setAttribute("aria-label", `Edit ${topic.name || "topic"}`);
          editBtn.innerHTML = `<span class="material-symbols-outlined icon-small">edit</span>`;
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setHeaderTopicMenuOpen(false);
            Topics.openTopicEditModal(topic.id);
          });

          row.appendChild(btn);
          row.appendChild(editBtn);
          headerTopicMenu.appendChild(row);
        });
      }

      const sep = document.createElement("div");
      sep.className = "mode-topic-sep";
      sep.setAttribute("role", "separator");
      headerTopicMenu.appendChild(sep);

      const createBtn = document.createElement("button");
      createBtn.type = "button";
      createBtn.className = "mode-topic-item mode-topic-create";
      createBtn.setAttribute("role", "option");
      createBtn.innerHTML = `
        <span class="material-symbols-outlined">add</span>
        <span class="mode-topic-item-name">New topic</span>
      `;
      createBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setHeaderTopicMenuOpen(false);
        Topics.openNewTopicFlow();
      });
      headerTopicMenu.appendChild(createBtn);

      if (Array.isArray(chats) && chats.length > 1) {
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "mode-topic-item";
        closeBtn.setAttribute("role", "option");
        closeBtn.innerHTML = `
          <span class="material-symbols-outlined">close</span>
          <span class="mode-topic-item-name">Close this chat</span>
        `;
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          setHeaderTopicMenuOpen(false);
          try { closeChat(activeChat); } catch (_) {}
          d.focusDisplayInput();
        });
        headerTopicMenu.appendChild(closeBtn);
      }
    }

    function setHeaderTopicMenuOpen(open) {
      if (!headerTopicMenu) return;
      headerTopicMenu.hidden = !open;
      const chip = getActiveChatChip();
      if (chip) chip.setAttribute("aria-expanded", open ? "true" : "false");
      headerShell?.classList.toggle("menu-open", !!open);
      if (open) {
        if (headerSlim) setHeaderSlim(false);
        renderHeaderTopicMenu();
        requestAnimationFrame(() => positionHeaderTopicMenu());
      } else if (global.AacFloatMenu) {
        global.AacFloatMenu.clear(headerTopicMenu);
      }
      syncChatUi();
    }

    function applyChatToWorkspace(chat) {
      const c = normalizeChat(chat, Topics.getActiveTopicId());
      d.setText(c.text || "", (c.text || "").length);

      const list = Topics.getTopicsList();
      const tid = c.topicId && list.some((t) => t.id === c.topicId)
        ? c.topicId
        : (list[0] && list[0].id) || Topics.getActiveTopicId();

      Topics.setActiveTopicId(tid || Topics.getActiveTopicId());
      d.lsSet("aac_active_tab", Topics.getActiveTopicId());
      Topics.expandTopic(tid);
      Topics.renderTopics();
      Topics.renderSoundButtons();
      d.syncComposeStrip();
      d.syncGeneratedAudioActions();
      d.autosizeDisplayInput();
    }

    function syncChatUi() {
      if (!chatSlotsEl || !Topics) return;
      const menuOpen = isHeaderTopicMenuOpen();
      const menuEl = headerTopicMenu;

      chatSlotsEl.querySelectorAll(".chat-chip[data-chat]").forEach((el) => el.remove());

      chats.forEach((chatRow, idx) => {
        const chat = idx === activeChat
          ? { text: d.getText(), topicId: chats[idx]?.topicId || Topics.getActiveTopicId() }
          : chatRow;
        const filled = chatHasContent(chat);
        const topic = Topics.getTopicsList().find((t) => t.id === chat?.topicId)
          || Topics.getTopicsList()[0]
          || null;
        const topicName = topic?.name || `Chat ${idx + 1}`;
        const icon = topic?.icon || "folder";
        const color = topic?.color || "";
        const isActive = idx === activeChat;

        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `chat-chip${isActive ? " active is-topic-dropdown" : ""}${filled ? " has-text" : ""}`;
        chip.dataset.chat = String(idx);
        chip.setAttribute("aria-pressed", isActive ? "true" : "false");
        if (isActive) {
          chip.setAttribute("aria-haspopup", "listbox");
          chip.setAttribute("aria-expanded", menuOpen ? "true" : "false");
          chip.title = `${topicName} (current) — tap for topics · ${previewSnippet(chat?.text)}`;
          chip.setAttribute(
            "aria-label",
            `${topicName}, current chat, topics menu${filled ? "" : ", empty"}`
          );
        } else {
          chip.setAttribute("aria-expanded", "false");
          chip.title = `${topicName}: ${previewSnippet(chat?.text)}`;
          chip.setAttribute("aria-label", `${topicName}${filled ? "" : ", empty"}`);
        }
        if (color) chip.style.setProperty("--chat-topic-color", color);

        const iconEl = document.createElement("span");
        iconEl.className = "material-symbols-outlined chat-chip-icon";
        iconEl.textContent = icon;
        iconEl.style.color = color || "";
        chip.appendChild(iconEl);

        if (isActive) {
          const nameEl = document.createElement("span");
          nameEl.className = "chat-chip-name";
          nameEl.textContent = topicName;
          chip.appendChild(nameEl);
          const caret = document.createElement("span");
          caret.className = "material-symbols-outlined chat-chip-caret";
          caret.setAttribute("aria-hidden", "true");
          caret.textContent = "expand_more";
          chip.appendChild(caret);
        }

        if (menuEl && menuEl.parentNode === chatSlotsEl) {
          chatSlotsEl.insertBefore(chip, menuEl);
        } else {
          chatSlotsEl.appendChild(chip);
        }
      });

      if (menuOpen) {
        renderHeaderTopicMenu();
        requestAnimationFrame(() => positionHeaderTopicMenu());
      }
    }

    /**
     * Canonical path: open or focus the chat for a topic and show its board.
     */
    function openTopic(topicId) {
      if (!topicId || !Topics.getTopicsList().some((t) => t.id === topicId)) return;
      const existing = findChatIndexForTopic(topicId);

      if (existing === activeChat) {
        Topics.setActiveTopicId(topicId);
        d.lsSet("aac_active_tab", Topics.getActiveTopicId());
        Topics.expandTopic(topicId);
        Topics.renderTopics();
        Topics.renderSoundButtons();
        syncChatUi();
        return;
      }

      saveActiveChatSnapshot();

      if (existing >= 0) {
        const a = activeChat;
        const tmp = chats[a];
        chats[a] = chats[existing];
        chats[existing] = tmp;
        applyChatToWorkspace(chats[a]);
        persistChats();
        syncChatUi();
        d.focusDisplayInput();
        return;
      }

      if (chats.length < CHAT_MAX) {
        const prev = {
          text: chats[activeChat]?.text || "",
          topicId: chats[activeChat]?.topicId
        };
        chats[activeChat] = emptyChat(topicId);
        if (prev.topicId && prev.topicId !== topicId) chats.push(normalizeChat(prev));
        applyChatToWorkspace(chats[activeChat]);
        persistChats();
        syncChatUi();
        d.focusDisplayInput();
        return;
      }

      chats[activeChat] = emptyChat(topicId);
      applyChatToWorkspace(chats[activeChat]);
      persistChats();
      syncChatUi();
      d.focusDisplayInput();
    }

    function closeChat(index) {
      if (!Array.isArray(chats) || chats.length <= CHAT_MIN) return;
      const i = d.clamp(index, 0, chats.length - 1);
      saveActiveChatSnapshot();
      chats.splice(i, 1);
      if (activeChat > i) activeChat -= 1;
      else if (activeChat >= chats.length) activeChat = chats.length - 1;
      activeChat = d.clamp(activeChat, 0, chats.length - 1);
      applyChatToWorkspace(chats[activeChat]);
      persistChats();
      syncChatUi();
      d.focusDisplayInput();
    }

    function reconcileChatsAfterTopicChange() {
      if (!Array.isArray(chats)) return;
      const prevActiveTopic = chats[activeChat]?.topicId || Topics.getActiveTopicId();
      chats = reconcileChatsList(chats);
      let idx = findChatIndexForTopic(prevActiveTopic);
      if (idx < 0) idx = 0;
      activeChat = d.clamp(idx, 0, chats.length - 1);
      if (chats[activeChat]) applyChatToWorkspace(chats[activeChat]);
      persistChats();
      syncChatUi();
    }

    function showChat(index) {
      const i = d.clamp(index, 0, Math.max(0, chats.length - 1));
      activeChat = i;
      applyChatToWorkspace(chats[i]);
      persistChats();
      syncChatUi();
      d.focusDisplayInput();
    }

    function selectChat(index) {
      const i = d.clamp(index, 0, Math.max(0, chats.length - 1));
      if (i === activeChat) {
        setHeaderTopicMenuOpen(!isHeaderTopicMenuOpen());
        return;
      }
      setHeaderTopicMenuOpen(false);
      saveActiveChatSnapshot();
      showChat(i);
    }

    function clearDisplayText() {
      d.setText("");
      if (chats[activeChat]) chats[activeChat].text = "";
      persistChats();
      syncChatUi();
      d.syncComposeStrip();
      d.syncGeneratedAudioActions();
      d.focusDisplayInput();
    }

    /**
     * Single chat mutation path when a topic is deleted.
     * Topics must not assign `chats` directly.
     */
    function onTopicDeleted(topicId) {
      if (!topicId) return;
      chats = (Array.isArray(chats) ? chats : []).filter((c) => c && c.topicId !== topicId);
      reconcileChatsAfterTopicChange();
      persistChats();
      syncChatUi();
    }

    // Topics: no chat list deps — only openTopic / onTopicDeleted / syncChatUi
    const td = d.topicsDeps;
    Topics = global.AacTopics.create({
      ...td,
      syncChatUi: () => syncChatUi(),
      openTopic: (id) => openTopic(id),
      onTopicDeleted: (id) => onTopicDeleted(id)
    });

    chats = loadChatsFromStorage();
    activeChat = (() => {
      const n = parseInt(d.lsGet(ACTIVE_CHAT_KEY, "0"), 10);
      const idx = Number.isFinite(n) ? n : 0;
      return d.clamp(idx, 0, Math.max(0, chats.length - 1));
    })();
    if (chats[activeChat]?.topicId) {
      Topics.setActiveTopicId(chats[activeChat].topicId);
      d.lsSet("aac_active_tab", Topics.getActiveTopicId());
    }
    applyChatToWorkspace(chats[activeChat]);

    // Header normal / slim: empty-space click or swipe
    headerShell?.addEventListener("click", (e) => {
      if (isHeaderInteractiveTarget(e.target)) return;
      setHeaderSlim(!headerSlim);
    });
    (function setupHeaderSwipe() {
      if (!headerShell) return;
      let startY = null;
      let startX = null;
      const THRESH = 40;
      headerShell.addEventListener("touchstart", (e) => {
        const t = e.touches?.[0];
        if (!t) return;
        startY = t.clientY;
        startX = t.clientX;
      }, { passive: true });
      headerShell.addEventListener("touchend", (e) => {
        if (startY == null) return;
        const t = e.changedTouches?.[0];
        if (!t) { startY = null; return; }
        const dy = t.clientY - startY;
        const dx = Math.abs(t.clientX - (startX || 0));
        startY = null;
        startX = null;
        if (dx > Math.abs(dy) || Math.abs(dy) < THRESH) return;
        // Swipe down → normal; swipe up → slim
        setHeaderSlim(dy < 0);
      }, { passive: true });
    })();
    syncHeaderChrome();

    document.addEventListener("click", (e) => {
      if (!isHeaderTopicMenuOpen()) return;
      const t = e.target;
      const slots = chatSlotsEl;
      const inSlots = slots && t instanceof Node && slots.contains(t);
      const inMenu = headerTopicMenu && t instanceof Node && headerTopicMenu.contains(t);
      const viaClosest = !!(t?.closest?.("#chat-slots, #header-topic-menu"));
      if (!inSlots && !inMenu && !viaClosest) setHeaderTopicMenuOpen(false);
    });
    window.addEventListener("resize", () => {
      if (isHeaderTopicMenuOpen()) positionHeaderTopicMenu();
    });
    window.addEventListener("scroll", () => {
      if (isHeaderTopicMenuOpen()) positionHeaderTopicMenu();
    }, true);

    chatSlotsEl?.addEventListener("click", (e) => {
      if (e.target.closest?.("#header-topic-menu")) return;
      const chip = e.target.closest(".chat-chip[data-chat]");
      if (!chip || !chatSlotsEl.contains(chip)) return;
      const idx = parseInt(chip.getAttribute("data-chat"), 10);
      if (!Number.isFinite(idx)) return;
      e.stopPropagation();
      selectChat(idx);
    });

    document.getElementById("new-message-btn")?.addEventListener("click", clearDisplayText);
    document.getElementById("compose-new-message-btn")?.addEventListener("click", clearDisplayText);

    syncChatUi();

    return {
      topics: Topics,
      getChats: () => chats,
      getActiveChat: () => activeChat,
      openTopic,
      closeChat,
      selectChat,
      showChat,
      syncChatUi,
      applyChatToWorkspace,
      reconcileChatsAfterTopicChange,
      saveActiveChatSnapshot,
      persistChats,
      clearDisplayText,
      onTopicDeleted,
      isHeaderTopicMenuOpen,
      setHeaderTopicMenuOpen,
      positionHeaderTopicMenu,
      setHeaderSlim,
      getActiveChatChip,
      /** Snapshot active chat text while typing (call from display input). */
      onDisplayInput() {
        if (chats[activeChat]) chats[activeChat].text = d.getText();
        persistChats();
        if (!isHeaderTopicMenuOpen()) syncChatUi();
        else {
          const chip = getActiveChatChip();
          const nameEl = chip?.querySelector(".chat-chip-name");
          const topic = Topics.getActiveTopic();
          if (nameEl && topic) nameEl.textContent = topic.name || nameEl.textContent;
        }
      },
      render() {
        Topics.renderTopics();
        Topics.renderSoundButtons();
        syncChatUi();
      }
    };
  }

  global.AacWorkspace = { create, CHAT_MIN, CHAT_MAX };
})(typeof window !== "undefined" ? window : globalThis);
