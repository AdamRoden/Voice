/**
 * Workspace owner: composer threads (1–5) and portrait header chips.
 * A topic's Thread setting picks All (keep the active thread), its own thread, or another topic's thread.
 * Topics module owns board model/edit; Workspace owns thread chrome.
 * Header is portrait-only (see .portrait-only on #workspace-header-shell).
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
      "autosizeDisplayInput", "topicsDeps"
    ];
    // Optional: resetComposeHistory — clear undo/redo when swapping threads.
    for (const key of required) {
      if (d[key] === undefined || d[key] === null) {
        throw new Error(`AacWorkspace missing required dep: ${key}`);
      }
    }

    const chatSlotsEl = document.getElementById("chat-slots");
    const headerShell = document.getElementById("workspace-header-shell");
    const workspaceHeader = document.getElementById("workspace-header");

    let chats = [];
    let activeChat = 0;
    /** Slim = 50% bar height; never fully hidden. */
    let headerSlim = false;
    /** @type {ReturnType<typeof global.AacTopics.create>|null} */
    let Topics = null;

    function ownerIds() {
      return new Set(
        Topics.getTopicsList().filter((topic) => topic.thread === topic.id).map((topic) => topic.id)
      );
    }

    /** Read threadId, or topicId left by older saves. */
    function normalizeChat(raw) {
      if (typeof raw === "string") return { text: raw, threadId: null };
      if (!raw || typeof raw !== "object") return { text: "", threadId: null };
      const threadId = raw.threadId || raw.topicId || null;
      return {
        text: raw.text == null ? "" : String(raw.text),
        threadId
      };
    }

    /** Keep one chat per topic that still owns a thread. Drops the no-owner buffer. */
    function pruneChats(list) {
      const owners = ownerIds();
      const seen = new Set();
      const out = [];
      (Array.isArray(list) ? list : []).forEach((raw) => {
        const chat = normalizeChat(raw);
        if (!chat.threadId || !owners.has(chat.threadId) || seen.has(chat.threadId)) return;
        seen.add(chat.threadId);
        out.push(chat);
      });
      if (out.length > CHAT_MAX) out.length = CHAT_MAX;
      return out;
    }

    function loadChatsFromStorage() {
      const raw = d.lsGetJson(CHATS_STORAGE_KEY, null);
      const loaded = pruneChats(Array.isArray(raw) ? raw : []);
      if (loaded.length) return loaded;
      const owner = Topics.getTopicsList().find((topic) => topic.thread === topic.id);
      return [{ text: "", threadId: owner ? owner.id : null }];
    }

    function persistChats() {
      try {
        const stored = chats.map((chat) => ({
          text: chat.text || "",
          threadId: chat.threadId || null
        }));
        d.lsSet(CHATS_STORAGE_KEY, JSON.stringify(stored));
        d.lsSet(ACTIVE_CHAT_KEY, String(activeChat));
      } catch (_) {}
    }

    function saveActiveChatSnapshot() {
      if (!chats || !chats[activeChat]) return;
      chats[activeChat] = {
        text: d.getText(),
        threadId: chats[activeChat].threadId || null
      };
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

    function findChatIndexForThread(threadId) {
      if (!threadId) return -1;
      return chats.findIndex((chat) => chat && chat.threadId === threadId);
    }

    // ---- portrait header chrome (slim/normal) ----
    function syncHeaderChrome() {
      if (!headerShell) return;
      headerShell.dataset.size = headerSlim ? "slim" : "normal";
      if (workspaceHeader) {
        workspaceHeader.title = headerSlim
          ? "Tap empty space to expand the top bar"
          : "Tap empty space to slim the top bar";
      }
    }

    /** True when the click should not toggle slim/normal (chips, buttons). */
    function isHeaderInteractiveTarget(target) {
      if (!target || !(target instanceof Element)) return false;
      return !!target.closest(
        ".chat-chip, .mobile-menu-btn, button, a, input, select, textarea"
      );
    }

    function setHeaderSlim(slim) {
      headerSlim = !!slim;
      syncHeaderChrome();
    }

    function applyComposer(chat) {
      const text = chat && chat.text != null ? String(chat.text) : "";
      if (typeof d.resetComposeHistory === "function") d.resetComposeHistory();
      d.setText(text, text.length, { skipHistory: true });
      d.syncComposeStrip();
      d.syncGeneratedAudioActions();
      d.autosizeDisplayInput();
    }

    function showTopicBoard(topicId) {
      Topics.setActiveTopicId(topicId);
      d.lsSet("aac_active_tab", topicId);
      Topics.renderTopics();
      Topics.renderSoundButtons();
      syncChatUi();
    }

    function syncChatUi() {
      if (!chatSlotsEl || !Topics) return;
      const topicsList = Topics.getTopicsList() || [];

      chatSlotsEl.innerHTML = "";

      // Display order only: left→right follows topicsList index.
      // chats[] storage order is independent (open/active slots); data-chat keeps chats[] idx.
      const activeTopic = topicsList.find((topic) => topic.id === Topics.getActiveTopicId()) || null;
      const chipOrder = chats.map((chatRow, idx) => {
        const threadId = idx === activeChat ? (chats[idx]?.threadId || null) : chatRow?.threadId;
        const topicIndex = threadId
          ? topicsList.findIndex((topic) => topic.id === threadId)
          : topicsList.findIndex((topic) => topic.id === activeTopic?.id);
        return {
          chatRow,
          idx,
          topicIndex: topicIndex < 0 ? Number.MAX_SAFE_INTEGER : topicIndex
        };
      }).sort((a, b) => a.topicIndex - b.topicIndex || a.idx - b.idx);

      chipOrder.forEach(({ chatRow, idx }) => {
        const chat = idx === activeChat
          ? { text: d.getText(), threadId: chats[idx]?.threadId || null }
          : chatRow;
        const filled = chatHasContent(chat);
        const owner = chat?.threadId
          ? topicsList.find((topic) => topic.id === chat.threadId)
          : null;
        const topic = owner || (idx === activeChat ? activeTopic : null);
        const topicName = topic?.name || "Thread";
        const icon = topic?.icon || "folder";
        const color = topic?.color || "";
        const isActive = idx === activeChat;

        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `chat-chip${isActive ? " active" : ""}${filled ? " has-text" : ""}`;
        chip.dataset.chat = String(idx);
        chip.setAttribute("aria-pressed", isActive ? "true" : "false");
        chip.title = isActive
          ? `${topicName} (current) · ${previewSnippet(chat?.text)}`
          : `${topicName}: ${previewSnippet(chat?.text)}`;
        chip.setAttribute(
          "aria-label",
          `${topicName}${isActive ? ", current thread" : ""}${filled ? "" : ", empty"}`
        );
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
        }

        chatSlotsEl.appendChild(chip);
      });
    }

    function snapshotActiveThread() {
      const threadId = chats[activeChat]?.threadId || null;
      if (!threadId) return;
      const chat = chats.find((item) => item && item.threadId === threadId);
      if (chat) chat.text = d.getText();
    }

    /**
     * Show the composer for an owner topic id.
     * confirm: false overwrites a full list without asking (startup and thread edits).
     * Returns false only when the user keeps the current thread.
     * Does not change the board.
     */
    function activateThread(threadId, opts) {
      if (!threadId) return true;
      const ask = !opts || opts.confirm !== false;
      const wasActive = chats[activeChat]?.threadId === threadId;
      snapshotActiveThread();
      chats = pruneChats(chats);
      let idx = chats.findIndex((chat) => chat.threadId === threadId);
      if (idx >= 0) {
        activeChat = idx;
        if (!wasActive) applyComposer(chats[idx]);
        persistChats();
        return true;
      }

      const slot = { text: "", threadId };
      if (chats.length < CHAT_MAX) {
        chats.push(slot);
        activeChat = chats.length - 1;
      } else {
        const emptyIdx = chats.findIndex((chat) => chat && !d.trim(chat.text));
        if (emptyIdx >= 0) {
          chats[emptyIdx] = slot;
          activeChat = emptyIdx;
        } else if (ask) {
          const replace = confirm("All five threads have text. Replace the current thread? Its message will be discarded.");
          if (!replace) {
            activeChat = d.clamp(activeChat, 0, Math.max(0, chats.length - 1));
            if (chats[activeChat]) applyComposer(chats[activeChat]);
            persistChats();
            return false;
          }
          activeChat = d.clamp(activeChat, 0, Math.max(0, chats.length - 1));
          chats[activeChat] = slot;
        } else {
          chats[0] = slot;
          activeChat = 0;
        }
      }
      applyComposer(chats[activeChat]);
      persistChats();
      return true;
    }

    /**
     * Show a topic board. All keeps the composer. Any other thread loads that composer.
     */
    function openTopic(topicId) {
      const topic = Topics.getTopicsList().find((item) => item.id === topicId);
      if (!topic) return;
      const threadId = Topics.resolveThreadId(topic);
      if (threadId && !activateThread(threadId)) return;
      showTopicBoard(topicId);
      d.focusDisplayInput();
    }

    function reconcileChatsAfterTopicChange() {
      if (!Array.isArray(chats)) return;
      const boardId = Topics.getActiveTopicId();
      const board = Topics.getTopicsList().find((topic) => topic.id === boardId);
      const wanted = board ? Topics.resolveThreadId(board) : null;
      const anyOwner = Topics.getTopicsList().some((topic) => topic.thread === topic.id);

      if (wanted) {
        activateThread(wanted, { confirm: false });
      } else if (!anyOwner) {
        chats = [{ text: d.getText(), threadId: null }];
        activeChat = 0;
        applyComposer(chats[0]);
        persistChats();
      } else {
        const liveThread = chats[activeChat]?.threadId || null;
        snapshotActiveThread();
        chats = pruneChats(chats);
        if (!chats.length) {
          const owner = Topics.getTopicsList().find((topic) => topic.thread === topic.id);
          chats = [{ text: "", threadId: owner ? owner.id : null }];
        }
        const survived = chats.findIndex((chat) => chat.threadId === liveThread);
        activeChat = survived >= 0 ? survived : 0;
        applyComposer(chats[activeChat]);
        persistChats();
      }

      if (boardId && Topics.getTopicsList().some((topic) => topic.id === boardId)) {
        Topics.setActiveTopicId(boardId);
        d.lsSet("aac_active_tab", boardId);
      }
      Topics.renderTopics();
      Topics.renderSoundButtons();
      syncChatUi();
    }

    function showChat(index) {
      const i = d.clamp(index, 0, Math.max(0, chats.length - 1));
      activeChat = i;
      applyComposer(chats[i]);
      const threadId = chats[i]?.threadId || null;
      const current = Topics.getActiveTopic();
      const currentThread = current ? Topics.resolveThreadId(current) : null;
      if (threadId && currentThread && currentThread !== threadId) showTopicBoard(threadId);
      else syncChatUi();
      persistChats();
      d.focusDisplayInput();
    }

    function selectChat(index) {
      const i = d.clamp(index, 0, Math.max(0, chats.length - 1));
      if (i === activeChat) return;
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
     * Single thread mutation path when a topic is deleted.
     * Topics must not assign `chats` directly.
     */
    function onTopicDeleted() {
      reconcileChatsAfterTopicChange();
    }

    // Topics: no thread list deps — only openTopic / onTopicDeleted / onTopicThreadsChanged / syncChatUi
    const td = d.topicsDeps;
    Topics = global.AacTopics.create({
      ...td,
      syncChatUi: () => syncChatUi(),
      openTopic: (id) => openTopic(id),
      onTopicDeleted: () => onTopicDeleted(),
      onTopicThreadsChanged: () => reconcileChatsAfterTopicChange()
    });

    chats = loadChatsFromStorage();
    activeChat = (() => {
      const n = parseInt(d.lsGet(ACTIVE_CHAT_KEY, "0"), 10);
      const idx = Number.isFinite(n) ? n : 0;
      return d.clamp(idx, 0, Math.max(0, chats.length - 1));
    })();
    (() => {
      const board = Topics.getTopicsList().find((topic) => topic.id === Topics.getActiveTopicId());
      const wanted = board ? Topics.resolveThreadId(board) : null;
      // The textarea is still empty. Load the stored chat before activateThread snapshots it.
      applyComposer(chats[activeChat]);
      if (wanted) {
        activateThread(wanted, { confirm: false });
        return;
      }
      persistChats();
    })();
    Topics.renderTopics();
    Topics.renderSoundButtons();

    // Header normal / slim: empty-space click or swipe (portrait only; shell is hidden in landscape)
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

    chatSlotsEl?.addEventListener("click", (e) => {
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
      syncChatUi,
      reconcileChatsAfterTopicChange,
      clearDisplayText,
      /** Snapshot active chat text while typing (call from display input). */
      onDisplayInput() {
        if (chats[activeChat]) chats[activeChat].text = d.getText();
        persistChats();
        syncChatUi();
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
