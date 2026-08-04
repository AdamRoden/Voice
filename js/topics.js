/**
 * Topics: model + sound board + sidebar list + edit (AacTopicsEdit).
 * Topic chats (slots / mobile header chips) live in AacWorkspace.
 */
(function (global) {
  "use strict";

  const REQUIRED = [
    "$", "trim", "clamp", "generateId", "escapeHtml", "lsGet", "lsSet",
    "COLOR_PALETTE", "DEFAULT_GRID_ROWS", "getDefaultGridCols", "mapSymbol",
    "soundCanvas", "openModal", "closeModals", "focusDisplayInput", "announceLive",
    "playSpeechSource", "getText", "getAssignSource", "canAssignFromDisplay",
    "isUtteranceSource", "getUtteranceText", "getButtonSourceText",
    "isMobileLayout", "isFeatButtonInsert",
    "syncChatUi", "closeMobileSidebar", "openTopic", "onTopicDeleted",
    "insertTextAtDisplayCaret",
    "setColorField", "getColorField",
    "isLeftSidebarOpen", "setLeftSidebarOpen"
  ];

  function requireDeps(d) {
    if (!d || typeof d !== "object") throw new Error("AacTopics.create requires deps");
    if (!global.AacTopicsEdit) {
      throw new Error("AacTopics requires AacTopicsEdit");
    }
    for (const key of REQUIRED) {
      if (d[key] === undefined || d[key] === null) {
        throw new Error(`AacTopics missing required dep: ${key}`);
      }
    }
  }

  // ---- model: normalize, starters, pack ----
  function installModel(ctx) {
    function normalizeButton(btn, index = 0) {
      const defaultCols = ctx.getDefaultGridCols();
      const col = Number.isFinite(btn.col) ? btn.col : (Number.isFinite(btn.x) ? Math.max(0, Math.floor(btn.x / 100)) : (index % defaultCols));
      const row = Number.isFinite(btn.row) ? btn.row : (Number.isFinite(btn.y) ? Math.max(0, Math.floor(btn.y / 80)) : Math.floor(index / defaultCols));
      const utteranceText = ctx.trim(btn.utteranceText) || null;
      const sourceText = ctx.trim(btn.sourceText || utteranceText || btn.text || btn.label) || null;
      return {
        id: btn.id || ctx.generateId(),
        label: btn.label || "Button",
        symbol: ctx.mapSymbol(btn.symbol || btn.icon),
        color: btn.color || ctx.COLOR_PALETTE[index % ctx.COLOR_PALETTE.length],
        audioData: utteranceText ? null : (btn.audioData || null),
        utteranceText,
        sourceText,
        effectsBaked: !!btn.effectsBaked,
        col, row,
        colSpan: ctx.clamp(btn.colSpan || 1, 1, 12),
        rowSpan: ctx.clamp(btn.rowSpan || 1, 1, 8)
      };
    }

    function createStarterTopicsRaw() {
      const cols = ctx.getDefaultGridCols();
      const makeButtons = (phrases, idPrefix) => phrases.map((p, i) => ({
        id: `${idPrefix}-${i}`,
        label: p.label,
        symbol: p.symbol,
        color: ctx.COLOR_PALETTE[i % ctx.COLOR_PALETTE.length],
        utteranceText: p.text,
        sourceText: p.text,
        audioData: null,
        effectsBaked: false,
        col: i % cols,
        row: Math.floor(i / cols),
        colSpan: 1,
        rowSpan: 1
      }));

      const everydayPhrases = [
        { label: "Hello", symbol: "waving_hand", text: "Hello" },
        { label: "How are you?", symbol: "chat", text: "How are you?" },
        { label: "Yes", symbol: "thumb_up", text: "Yes" },
        { label: "No", symbol: "thumb_down", text: "No" },
        { label: "Please", symbol: "front_hand", text: "Please" },
        { label: "Thank you", symbol: "favorite", text: "Thank you" },
        { label: "You're welcome", symbol: "volunteer_activism", text: "You're welcome" },
        { label: "Sorry", symbol: "sentiment_dissatisfied", text: "I'm sorry" },
        { label: "Wait", symbol: "hourglass_empty", text: "Please wait" },
        { label: "More", symbol: "add", text: "More please" },
        { label: "Stop", symbol: "stop_circle", text: "Stop" },
        { label: "Don't know", symbol: "help", text: "I don't know" }
      ];

      const needsPhrases = [
        { label: "Help", symbol: "emergency_home", text: "I need help" },
        { label: "I'm OK", symbol: "sentiment_satisfied", text: "I'm okay" },
        { label: "Bathroom", symbol: "wc", text: "I need the bathroom" },
        { label: "Water", symbol: "water_drop", text: "I would like some water" },
        { label: "Hungry", symbol: "restaurant", text: "I'm hungry" },
        { label: "Thirsty", symbol: "local_cafe", text: "I'm thirsty" },
        { label: "Pain", symbol: "healing", text: "I'm in pain" },
        { label: "Tired", symbol: "bed", text: "I'm tired" },
        { label: "Cold", symbol: "ac_unit", text: "I'm cold" },
        { label: "Hot", symbol: "thermometer", text: "I'm hot" },
        { label: "Medicine", symbol: "medication", text: "I need my medicine" },
        { label: "Break", symbol: "pause_circle", text: "I need a break" }
      ];

      const feelingsPhrases = [
        { label: "Happy", symbol: "sentiment_satisfied", text: "I'm happy" },
        { label: "Sad", symbol: "sentiment_dissatisfied", text: "I'm sad" },
        { label: "Angry", symbol: "priority_high", text: "I'm angry" },
        { label: "Scared", symbol: "visibility", text: "I'm scared" },
        { label: "Worried", symbol: "psychology", text: "I'm worried" },
        { label: "Excited", symbol: "celebration", text: "I'm excited" },
        { label: "Frustrated", symbol: "bolt", text: "I'm frustrated" },
        { label: "Bored", symbol: "hourglass_empty", text: "I'm bored" },
        { label: "Lonely", symbol: "person", text: "I feel lonely" },
        { label: "Love you", symbol: "favorite", text: "I love you" },
        { label: "Confused", symbol: "help", text: "I'm confused" },
        { label: "Calm", symbol: "spa", text: "I feel calm" }
      ];

      return [
        {
          id: "starter-everyday",
          name: "Everyday",
          icon: "chat",
          color: "#8ab4f8",
          gridCols: cols,
          gridRows: Math.ceil(everydayPhrases.length / cols),
          buttons: makeButtons(everydayPhrases, "starter-everyday")
        },
        {
          id: "starter-needs",
          name: "Needs",
          icon: "medical_services",
          color: "#f2b8b5",
          gridCols: cols,
          gridRows: Math.ceil(needsPhrases.length / cols),
          buttons: makeButtons(needsPhrases, "starter-needs")
        },
        {
          id: "starter-feelings",
          name: "Feelings",
          icon: "sentiment_satisfied",
          color: "#81c784",
          gridCols: cols,
          gridRows: Math.ceil(feelingsPhrases.length / cols),
          buttons: makeButtons(feelingsPhrases, "starter-feelings")
        }
      ];
    }

    function normalizeTopicsList(rawList) {
      if (!Array.isArray(rawList) || rawList.length === 0) {
        return normalizeTopicsList(createStarterTopicsRaw());
      }
      return rawList.map((topic, idx) => ({
        id: topic.id || ctx.generateId(),
        name: topic.name || `Topic ${idx + 1}`,
        icon: ctx.mapSymbol(topic.icon, "folder"),
        color: topic.color || ctx.COLOR_PALETTE[idx % ctx.COLOR_PALETTE.length],
        gridCols: ctx.clamp(parseInt(topic.gridCols, 10) || ctx.getDefaultGridCols(), 1, 12),
        gridRows: ctx.clamp(parseInt(topic.gridRows, 10) || ctx.DEFAULT_GRID_ROWS, 1, 8),
        buttons: Array.isArray(topic.buttons)
          ? topic.buttons.map((btn, bIdx) => normalizeButton(btn, bIdx))
          : []
      }));
    }

    function getActiveTopic() {
      return ctx.topicsList.find((t) => t.id === ctx.activeTopicId);
    }

    /** Fill the active empty topic with the everyday starter board. */
    function loadStarterPhrasesIntoActiveTopic() {
      const tab = getActiveTopic();
      if (!tab) return;
      const starter = createStarterTopicsRaw()[0];
      if (!starter) return;
      tab.name = tab.name || starter.name;
      tab.gridCols = starter.gridCols;
      tab.gridRows = starter.gridRows;
      tab.buttons = (starter.buttons || []).map((b, i) =>
        normalizeButton({ ...b, id: ctx.generateId() }, i)
      );
      ctx.commitTopicsUi();
      ctx.focusDisplayInput();
    }

    function saveTopicsList() {
      ctx.lsSet("aac_tabs", JSON.stringify(ctx.topicsList));
    }

    function repackSequentialGrid(tab) {
      if (!tab || !Array.isArray(tab.buttons)) return;
      let col = 0;
      let row = 0;
      tab.buttons.forEach((btn) => {
        btn.col = col;
        btn.row = row;
        col += btn.colSpan;
        if (col >= tab.gridCols) {
          col = 0;
          row++;
        }
      });
    }

    return {
      normalizeButton,
      createStarterTopicsRaw,
      normalizeTopicsList,
      repackSequentialGrid,
      getActiveTopic,
      loadStarterPhrasesIntoActiveTopic,
      saveTopicsList
    };
  }

  // ---- sound board grid, assign, overwrite ----
  function installBoard(ctx) {
    function autosizeSoundCanvas(activeTab) {
      if (!ctx.soundCanvas || !activeTab) return;
      const cols = Math.max(1, activeTab.gridCols || 1);
      let contentRows = 0;
      (activeTab.buttons || []).forEach((b) => {
        contentRows = Math.max(contentRows, (b.row || 0) + (b.rowSpan || 1));
      });
      const rows = Math.max(1, activeTab.gridRows || 1, contentRows);
      const rowHCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sound-row-height"));
      const rowH = Number.isFinite(rowHCss) && rowHCss > 0 ? rowHCss : 48;
      const styles = getComputedStyle(ctx.soundCanvas);
      const gap = parseFloat(styles.rowGap || styles.gap) || 4;
      const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
      const borderY = (parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.borderBottomWidth) || 0);
      const height = padY + borderY + rows * rowH + Math.max(0, rows - 1) * gap;

      ctx.soundCanvas.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      ctx.soundCanvas.style.gridTemplateRows = `repeat(${rows}, ${rowH}px)`;
      ctx.soundCanvas.style.gridAutoRows = `${rowH}px`;
      ctx.soundCanvas.style.height = `${height}px`;
    }

    function fillSoundButtonInner(inner, btnData) {
      if (btnData.symbol) {
        const sym = document.createElement("span");
        sym.className = "material-symbols-outlined sound-button-symbol";
        sym.textContent = btnData.symbol;
        inner.appendChild(sym);
      }
      const labelEl = document.createElement("div");
      labelEl.className = "sound-button-label";
      labelEl.textContent = btnData.label || "Button";
      inner.appendChild(labelEl);
    }

    /**
     * Canonical sound-button chrome (canvas grid + topic sidebar list).
     * @param {object} btnData
     * @param {{
     *   mode?: "overwrite" | "speak" | "speak-insert",
     *   layout?: "canvas" | "list",
     *   onOverwrite?: (btnId: string) => void
     * }} [opts]
     * List: speak / speak-insert only (no overwrite). Canvas: all modes.
     */
    function createSoundButtonEl(btnData, opts) {
      const o = opts || {};
      const mode = o.mode || "speak";
      const layout = o.layout || "canvas";
      const isUtteranceBtn = !!(btnData.utteranceText || "").trim();
      const btnColor = btnData.color || "#3f3f4e";
      const label = btnData.label || "Button";
      const insertText = ctx.getButtonSourceText(btnData) || ctx.trim(btnData.label) || "";

      const btnEl = document.createElement("div");
      const classes = ["sound-button"];
      if (layout === "list") classes.push("topic-list-sound-button");
      if (mode === "overwrite") classes.push("overwrite-target");
      if (isUtteranceBtn) classes.push("utterance-button");
      if (mode === "speak-insert") classes.push("speak-layout");
      btnEl.className = classes.join(" ");

      if (layout === "canvas") {
        btnEl.id = `btn-${btnData.id}`;
        btnEl.style.gridColumn = `${btnData.col + 1} / span ${btnData.colSpan}`;
        btnEl.style.gridRow = `${btnData.row + 1} / span ${btnData.rowSpan}`;
      }

      if (isUtteranceBtn) {
        btnEl.style.backgroundColor = "transparent";
        btnEl.style.borderColor = btnColor;
        btnEl.style.color = btnColor;
      } else {
        btnEl.style.backgroundColor = btnColor;
      }

      if (mode === "overwrite") {
        const inner = document.createElement("div");
        inner.className = "sound-button-inner";
        inner.style.width = "100%";
        inner.style.padding = "0 8px";
        fillSoundButtonInner(inner, btnData);
        btnEl.appendChild(inner);
        btnEl.addEventListener("click", () => {
          if (typeof o.onOverwrite === "function") o.onOverwrite(btnData.id);
        });
        return btnEl;
      }

      const main = document.createElement("button");
      main.type = "button";
      main.className = "sound-button-main";
      main.title = "Speak";
      main.setAttribute("aria-label", `Speak ${label}`);
      if (mode === "speak") main.style.padding = "0 8px";
      const inner = document.createElement("div");
      inner.className = "sound-button-inner";
      fillSoundButtonInner(inner, btnData);
      main.appendChild(inner);
      main.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.playSpeechSource(btnData);
      });
      btnEl.appendChild(main);

      if (mode === "speak-insert") {
        const insertBtn = document.createElement("button");
        insertBtn.type = "button";
        insertBtn.className = "sound-button-insert";
        insertBtn.title = "Insert into message";
        insertBtn.setAttribute("aria-label", `Insert ${label} into message`);
        insertBtn.innerHTML = `<span class="material-symbols-outlined">add</span>`;
        insertBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          ctx.insertTextAtDisplayCaret(insertText);
          ctx.announceLive(`Inserted ${label}`);
        });
        btnEl.appendChild(insertBtn);
      }

      return btnEl;
    }

    function canvasButtonMode() {
      if (ctx.isOverwriteMode) return "overwrite";
      if (ctx.isFeatButtonInsert()) return "speak-insert";
      return "speak";
    }

    function renderSoundButtons() {
      const activeTab = ctx.getActiveTopic();
      if (!activeTab) return;
      ctx.soundCanvas.innerHTML = "";

      if (!Array.isArray(activeTab.buttons) || activeTab.buttons.length === 0) {
        ctx.soundCanvas.style.gridTemplateColumns = "1fr";
        ctx.soundCanvas.style.gridTemplateRows = "auto";
        ctx.soundCanvas.style.gridAutoRows = "auto";
        ctx.soundCanvas.style.height = "auto";
        ctx.soundCanvas.style.minHeight = "120px";
        const empty = document.createElement("div");
        empty.className = "sound-canvas-empty";
        empty.innerHTML = `
          <div class="sound-canvas-empty-title">No sound buttons yet</div>
          <div class="sound-canvas-empty-text">
            Type a phrase below, speak it, then use <strong>Assign to Button</strong> —
            or load starter everyday phrases.
          </div>
          <div class="sound-canvas-empty-actions">
            <button type="button" class="status-btn" id="empty-load-starters-btn">
              <span class="material-symbols-outlined icon-small icon-btn-margin">auto_awesome</span>
              Load starter phrases
            </button>
            <button type="button" class="status-btn" id="empty-focus-display-btn">
              <span class="material-symbols-outlined icon-small icon-btn-margin">edit</span>
              Type a phrase
            </button>
          </div>
        `;
        empty.querySelector("#empty-load-starters-btn")?.addEventListener("click", () => {
          ctx.loadStarterPhrasesIntoActiveTopic();
        });
        empty.querySelector("#empty-focus-display-btn")?.addEventListener("click", () => {
          ctx.focusDisplayInput();
        });
        ctx.soundCanvas.appendChild(empty);
        return;
      }

      ctx.soundCanvas.style.minHeight = "";
      autosizeSoundCanvas(activeTab);

      const mode = canvasButtonMode();
      activeTab.buttons.forEach((btnData) => {
        ctx.soundCanvas.appendChild(createSoundButtonEl(btnData, {
          mode,
          layout: "canvas",
          onOverwrite: (id) => executeOverwrite(id)
        }));
      });
    }

    function startAssignFromDisplay() {
      if (!ctx.canAssignFromDisplay()) return;
      ctx.openModal("modal-assign-choice");
    }

    function applyGeneratedSpeechToButton(btn, source) {
      if (!btn || !source) return;
      const phrase = ctx.trim(source.text || ctx.getUtteranceText(source));
      btn.label = phrase.substring(0, 24) || "Speech";
      btn.sourceText = phrase || null;
      if (ctx.isUtteranceSource(source)) {
        btn.utteranceText = phrase;
        btn.audioData = null;
        btn.effectsBaked = false;
      } else {
        btn.audioData = source.audioData || null;
        btn.utteranceText = null;
        btn.effectsBaked = !!(source.effectsBaked && btn.audioData);
      }
    }

    document.getElementById("compose-pin-btn")?.addEventListener("click", () => startAssignFromDisplay());
    document.getElementById("textarea-assign-btn")?.addEventListener("click", () => startAssignFromDisplay());

    ctx.$("choice-create-new-btn")?.addEventListener("click", () => {
      const source = ctx.getAssignSource();
      if (!source) return;
      const activeTab = ctx.getActiveTopic();
      if (!activeTab) return;
      const btn = ctx.normalizeButton({
        id: ctx.generateId(),
        col: activeTab.buttons.length % activeTab.gridCols,
        row: Math.floor(activeTab.buttons.length / activeTab.gridCols)
      }, activeTab.buttons.length);
      applyGeneratedSpeechToButton(btn, source);
      activeTab.buttons.push(btn);
      ctx.repackSequentialGrid(activeTab);
      ctx.commitTopicsUi();
      ctx.closeModals();
    });

    ctx.$("choice-overwrite-btn")?.addEventListener("click", () => {
      ctx.closeModals();
      setOverwriteMode(true);
    });

    function setOverwriteMode(enabled) {
      ctx.isOverwriteMode = enabled;
      ctx.$("overwrite-banner")?.classList.toggle("active", enabled);
      renderSoundButtons();
    }

    document.getElementById("cancel-overwrite-btn")?.addEventListener("click", () => {
      setOverwriteMode(false);
      ctx.focusDisplayInput();
    });

    function executeOverwrite(btnId) {
      const source = ctx.getAssignSource();
      if (!source) return;
      const tab = ctx.getActiveTopic();
      const btn = tab?.buttons.find((b) => b.id === btnId);
      if (!btn) return;
      applyGeneratedSpeechToButton(btn, source);
      setOverwriteMode(false);
      ctx.commitTopicsUi();
      ctx.focusDisplayInput();
    }

    return {
      autosizeSoundCanvas,
      createSoundButtonEl,
      renderSoundButtons,
      applyGeneratedSpeechToButton,
      startAssignFromDisplay,
      setOverwriteMode,
      executeOverwrite
    };
  }

  // ---- sidebar topic list ----
  function installSidebar(ctx) {
    function expandTopic(id) {
      if (id) ctx.expandedTopicIds.add(id);
    }

    /** List row: same sound-button as canvas (+ insert when feat on) and edit to the right. */
    function createTopicListSoundRow(btn, topicId) {
      const row = document.createElement("div");
      row.className = "topic-sound-row";
      const mode = ctx.isFeatButtonInsert() ? "speak-insert" : "speak";
      const btnEl = ctx.createSoundButtonEl(btn, { mode, layout: "list" });
      const label = btn.label || "Button";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "topic-sound-edit-btn";
      editBtn.title = "Edit button";
      editBtn.setAttribute("aria-label", `Edit ${label}`);
      editBtn.innerHTML = `<span class="material-symbols-outlined icon-small">edit</span>`;
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        ctx.openButtonEditModal(btn.id, topicId);
      });

      row.appendChild(btnEl);
      row.appendChild(editBtn);
      return row;
    }

    /**
     * Desktop: active + left collapsed → expand left; active + open → accordion;
     * inactive → switch topic only. Mobile: accordion + switch (legacy).
     */
    function onTopicRowClick(topicId) {
      if (ctx.isMobileLayout()) {
        toggleTopicExpanded(topicId);
        return;
      }
      if (topicId === ctx.activeTopicId) {
        if (!ctx.isLeftSidebarOpen()) {
          ctx.setLeftSidebarOpen(true, { restoreFocus: false });
          return;
        }
        toggleTopicExpanded(topicId);
        return;
      }
      ctx.openTopic(topicId);
      ctx.focusDisplayInput();
    }

    function renderTopicsRail() {
      const rail = document.getElementById("topics-rail");
      if (!rail) return;
      // Desktop-only chrome (CSS hides on mobile). Do not clear — content must
      // survive mobile→desktop so a collapsed left rail is not empty.
      if (ctx.isMobileLayout()) return;
      rail.innerHTML = "";

      ctx.topicsList.forEach((topic) => {
        const isActive = topic.id === ctx.activeTopicId;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `topic-rail-btn${isActive ? " active" : ""}`;
        btn.dataset.topicId = topic.id;
        btn.title = topic.name || "Topic";
        btn.setAttribute("aria-label", topic.name || "Topic");
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        const icon = document.createElement("span");
        icon.className = "material-symbols-outlined";
        icon.textContent = topic.icon || "folder";
        if (topic.color) icon.style.color = topic.color;
        btn.appendChild(icon);
        btn.addEventListener("click", () => onTopicRowClick(topic.id));
        rail.appendChild(btn);
      });

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "topic-rail-btn topic-rail-add";
      addBtn.title = "New topic";
      addBtn.setAttribute("aria-label", "New topic");
      const addIcon = document.createElement("span");
      addIcon.className = "material-symbols-outlined";
      addIcon.textContent = "add";
      addBtn.appendChild(addIcon);
      addBtn.addEventListener("click", () => {
        ctx.setLeftSidebarOpen(true, { restoreFocus: false });
        ctx.openNewTopicFlow?.();
      });
      rail.appendChild(addBtn);
    }

    function renderTopics() {
      const listEl = document.getElementById("topics-list");
      if (!listEl) return;
      listEl.innerHTML = "";
      if (typeof ctx.syncChatUi === "function") ctx.syncChatUi();

      ctx.expandedTopicIds = new Set(
        [...ctx.expandedTopicIds].filter((id) => ctx.topicsList.some((t) => t.id === id))
      );

      ctx.topicsList.forEach((topic) => {
        const isActive = topic.id === ctx.activeTopicId;
        const isExpanded = ctx.expandedTopicIds.has(topic.id);
        const item = document.createElement("div");
        item.className = `topic-item${isActive ? " active" : ""}${isExpanded ? " expanded" : ""}`;

        const header = document.createElement("div");
        header.className = "topic-item-header";
        header.setAttribute("role", "button");
        header.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        header.innerHTML = `
          <div class="topic-item-content">
            <span class="material-symbols-outlined topic-expand-icon icon-small">${isExpanded ? "expand_more" : "chevron_right"}</span>
            <span class="material-symbols-outlined icon-medium" style="color: ${topic.color};">${topic.icon || "folder"}</span>
            <span class="topic-item-name"></span>
          </div>
          <div class="topic-actions">
            <button class="nav-action-btn edit-topic-btn" type="button" title="Edit Topic Settings">
              <span class="material-symbols-outlined icon-small">edit</span>
            </button>
          </div>
        `;
        const nameNode = header.querySelector(".topic-item-name");
        if (nameNode) nameNode.textContent = topic.name;
        header.addEventListener("click", (e) => {
          if (e.target.closest(".edit-topic-btn")) {
            e.stopPropagation();
            ctx.openTopicEditModal(topic.id);
            return;
          }
          onTopicRowClick(topic.id);
        });
        item.appendChild(header);

        if (isExpanded) {
          const buttonsList = document.createElement("div");
          buttonsList.className = "topic-buttons-list";
          const buttons = Array.isArray(topic.buttons) ? topic.buttons : [];
          if (buttons.length === 0) {
            buttonsList.innerHTML = `<div class="topic-buttons-empty">No sound buttons yet</div>`;
          } else {
            buttons.forEach((btn) => {
              buttonsList.appendChild(createTopicListSoundRow(btn, topic.id));
            });
          }
          item.appendChild(buttonsList);
        }

        listEl.appendChild(item);
      });

      renderTopicsRail();
    }

    function toggleTopicExpanded(id) {
      if (ctx.expandedTopicIds.has(id)) {
        ctx.expandedTopicIds.delete(id);
        renderTopics();
        return;
      }
      expandTopic(id);
      if (ctx.activeTopicId !== id) {
        ctx.openTopic(id);
      } else {
        renderTopics();
      }
    }

    function switchTopic(id) {
      ctx.openTopic(id);
      ctx.closeMobileSidebar();
      ctx.focusDisplayInput();
    }

    return {
      expandTopic,
      renderTopics,
      toggleTopicExpanded,
      switchTopic
    };
  }

  function create(d) {
    requireDeps(d);

    const ctx = Object.assign({}, d, {
      topicsList: [],
      activeTopicId: null,
      expandedTopicIds: new Set(),
      isOverwriteMode: false,
      editingButtonId: null,
      editingButtonTopicId: null,
      modalButtonIndex: 1,
      modalButtonIndexMax: 1,
      modalTopicIndex: 1,
      modalTopicIndexMax: 1,
      editingTopicId: null,
      pendingNewTopic: null,
      modalButtonsDraft: null,
      modalGridCols: d.getDefaultGridCols(),
      modalGridRows: d.DEFAULT_GRID_ROWS,
      liveGridColsBackup: null,
      liveGridTopicId: null,
      topicEditResumeId: null,
      topicEditFormSnapshot: null
    });

    Object.assign(ctx, installModel(ctx));

    ctx.topicsList = ctx.normalizeTopicsList(
      d.initialTopicsRaw !== undefined ? d.initialTopicsRaw : null
    );
    if (d.initialTopicsRaw == null) ctx.saveTopicsList();
    ctx.activeTopicId = d.lsGet("aac_active_tab") || ctx.topicsList[0].id;
    if (!ctx.topicsList.find((t) => t.id === ctx.activeTopicId)) {
      ctx.activeTopicId = ctx.topicsList[0].id;
    }
    ctx.expandedTopicIds = new Set([ctx.activeTopicId]);

    ctx.commitTopicsUi = function commitTopicsUi() {
      ctx.saveTopicsList();
      ctx.renderTopics();
      ctx.renderSoundButtons();
      ctx.syncChatUi();
    };

    Object.assign(ctx, installBoard(ctx));
    Object.assign(ctx, global.AacTopicsEdit.install(ctx));
    Object.assign(ctx, installSidebar(ctx));

    function resetEditState() {
      ctx.editingButtonId = null;
      ctx.editingButtonTopicId = null;
      ctx.editingTopicId = null;
      ctx.pendingNewTopic = null;
      ctx.modalButtonsDraft = null;
      ctx.topicEditResumeId = null;
      ctx.topicEditFormSnapshot = null;
      if (ctx.liveGridColsBackup != null) {
        ctx.clearLiveGridColsPreview(true);
      }
    }

    return {
      getTopicsList: () => ctx.topicsList,
      setTopicsList: (list) => { ctx.topicsList = list; },
      getActiveTopicId: () => ctx.activeTopicId,
      setActiveTopicId: (id) => { ctx.activeTopicId = id; },
      getActiveTopic: () => ctx.getActiveTopic(),
      expandTopic: (id) => ctx.expandTopic(id),
      setExpandedTopicIds: (s) => { ctx.expandedTopicIds = s; },
      normalizeButton: (...a) => ctx.normalizeButton(...a),
      normalizeTopicsList: (...a) => ctx.normalizeTopicsList(...a),
      repackSequentialGrid: (...a) => ctx.repackSequentialGrid(...a),
      saveTopicsList: () => ctx.saveTopicsList(),
      commitTopicsUi: () => ctx.commitTopicsUi(),
      renderTopics: () => ctx.renderTopics(),
      renderSoundButtons: () => ctx.renderSoundButtons(),
      autosizeSoundCanvas: (...a) => ctx.autosizeSoundCanvas(...a),
      openTopicEditModal: (...a) => ctx.openTopicEditModal(...a),
      openCreateTopicModal: (...a) => ctx.openCreateTopicModal(...a),
      openNewTopicFlow: (...a) => ctx.openNewTopicFlow(...a),
      openButtonEditModal: (...a) => ctx.openButtonEditModal(...a),
      loadStarterPhrasesIntoActiveTopic: () => ctx.loadStarterPhrasesIntoActiveTopic(),
      setOverwriteMode: (...a) => ctx.setOverwriteMode(...a),
      executeOverwrite: (...a) => ctx.executeOverwrite(...a),
      startAssignFromDisplay: () => ctx.startAssignFromDisplay(),
      switchTopic: (...a) => ctx.switchTopic(...a),
      resetEditState,
      stepModalGrid: (...a) => ctx.stepModalGrid(...a),
      stepModalButtonIndex: (...a) => ctx.stepModalButtonIndex(...a),
      stepModalTopicIndex: (...a) => ctx.stepModalTopicIndex(...a),
      get isOverwriteMode() { return ctx.isOverwriteMode; },
      get editingTopicId() { return ctx.editingTopicId; }
    };
  }

  global.AacTopics = { create };
})(typeof window !== "undefined" ? window : globalThis);
