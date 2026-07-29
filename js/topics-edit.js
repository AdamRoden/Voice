/**
 * Topic and button edit modals / organizer.
 */
(function (global) {
  "use strict";

  function install(ctx) {
    function syncModalGridLabels() {
      const colsEl = document.getElementById("topic-cols-val");
      if (colsEl) colsEl.textContent = String(ctx.modalGridCols);
    }
    
    /** Backup for live board column preview while the topic modal is open. */
    
    function clearLiveGridColsPreview(restore) {
      if (ctx.liveGridColsBackup == null || !ctx.liveGridTopicId) {
        ctx.liveGridColsBackup = null;
        ctx.liveGridTopicId = null;
        return;
      }
      if (restore) {
        const topic = ctx.topicsList.find((t) => t.id === ctx.liveGridTopicId);
        if (topic) {
          topic.gridCols = ctx.liveGridColsBackup;
          ctx.repackSequentialGrid(topic);
          if (topic.id === ctx.activeTopicId) ctx.renderSoundButtons();
        }
      }
      ctx.liveGridColsBackup = null;
      ctx.liveGridTopicId = null;
    }
    
    /** Live-resize the main board when editing the active topic's column count. */
    function previewLiveGridColsFromModal() {
      const tid = ctx.editingTopicId;
      if (!tid) return;
      const topic = ctx.topicsList.find((t) => t.id === tid);
      if (!topic || topic.id !== ctx.activeTopicId) return;
      if (ctx.liveGridColsBackup == null || ctx.liveGridTopicId !== tid) {
        ctx.liveGridColsBackup = ctx.clamp(parseInt(topic.gridCols, 10) || ctx.getDefaultGridCols(), 1, 12);
        ctx.liveGridTopicId = tid;
      }
      topic.gridCols = ctx.clamp(ctx.modalGridCols, 1, 12);
      // Keep board layout packed to the preview column count
      ctx.repackSequentialGrid(topic);
      ctx.renderSoundButtons();
    }
    
    function stepModalGrid(deltaCols, deltaRows) {
      ctx.modalGridCols = ctx.clamp(ctx.modalGridCols + deltaCols, 1, 12);
      if (deltaRows) ctx.modalGridRows = ctx.clamp(ctx.modalGridRows + deltaRows, 1, 8);
      ctx.syncModalGridLabels();
      // Live-update organizer tiles (and board if this is the active topic)
      if (Array.isArray(ctx.modalButtonsDraft)) {
        ctx.repackSequentialGrid({ buttons: ctx.modalButtonsDraft, gridCols: ctx.modalGridCols });
      }
      ctx.renderTopicButtonOrganizer();
      ctx.previewLiveGridColsFromModal();
    }
    
    function fillTopicEditForm(topic, { isCreate = false } = {}) {
      const titleEl = document.getElementById("topic-edit-modal-title");
      if (titleEl) titleEl.textContent = isCreate ? "New Topic" : "Edit Topic Settings";
      const delBtn = document.getElementById("delete-topic-btn");
      if (delBtn) delBtn.style.display = isCreate ? "none" : "";
      ctx.$("topic-name-input").value = topic.name || "";
      ctx.$("topic-icon-input").value = topic.icon || "folder";
      ctx.modalGridCols = ctx.clamp(parseInt(topic.gridCols, 10) || ctx.getDefaultGridCols(), 1, 12);
      ctx.modalGridRows = ctx.clamp(parseInt(topic.gridRows, 10) || ctx.DEFAULT_GRID_ROWS, 1, 8);
      ctx.syncModalGridLabels();
      ctx.fillColorPicker(ctx.$("topic-color-picker"), topic.color);
      ctx.modalButtonsDraft = Array.isArray(topic.buttons)
        ? topic.buttons.map((b, i) => ctx.normalizeButton({ ...b }, i))
        : [];
      ctx.repackSequentialGrid({ buttons: ctx.modalButtonsDraft, gridCols: ctx.modalGridCols });
      ctx.renderTopicButtonOrganizer();
    }
    
    function cloneTopicAsTemplate(source) {
      const src = source || {};
      const buttons = (Array.isArray(src.buttons) ? src.buttons : []).map((b, i) => {
        const copy = ctx.normalizeButton({ ...b, id: ctx.generateId() }, i);
        // Deep-copy audio payload string if present
        if (b && b.audioData != null) copy.audioData = b.audioData;
        if (b && b.utteranceText != null) copy.utteranceText = b.utteranceText;
        if (b && b.sourceText != null) copy.sourceText = b.sourceText;
        if (b && b.effectsBaked != null) copy.effectsBaked = b.effectsBaked;
        copy.colSpan = b.colSpan || 1;
        copy.rowSpan = b.rowSpan || 1;
        return copy;
      });
      const baseName = ctx.trim(src.name) || "Topic";
      return {
        id: ctx.generateId(),
        name: `Copy of ${baseName}`.slice(0, 30),
        icon: src.icon || "folder",
        color: src.color || ctx.COLOR_PALETTE[ctx.topicsList.length % ctx.COLOR_PALETTE.length],
        gridCols: ctx.clamp(parseInt(src.gridCols, 10) || ctx.getDefaultGridCols(), 1, 12),
        gridRows: ctx.clamp(parseInt(src.gridRows, 10) || ctx.DEFAULT_GRID_ROWS, 1, 8),
        buttons
      };
    }
    
    function openCreateTopicModal(fromTemplate = null) {
      ctx.pendingNewTopic = fromTemplate
        ? ctx.cloneTopicAsTemplate(fromTemplate)
        : {
            id: ctx.generateId(),
            name: `Topic ${ctx.topicsList.length + 1}`,
            icon: "folder",
            color: ctx.COLOR_PALETTE[ctx.topicsList.length % ctx.COLOR_PALETTE.length],
            gridCols: ctx.getDefaultGridCols(),
            gridRows: ctx.DEFAULT_GRID_ROWS,
            buttons: []
          };
      if (fromTemplate) ctx.repackSequentialGrid(ctx.pendingNewTopic);
      ctx.editingTopicId = ctx.pendingNewTopic.id;
      ctx.fillTopicEditForm(ctx.pendingNewTopic, { isCreate: true });
      ctx.openModal("topic-edit-modal");
      requestAnimationFrame(() => {
        try {
          const el = ctx.$("topic-name-input");
          el?.focus({ preventScroll: true });
          el?.select();
        } catch (_) {}
      });
    }
    
    /** Entry: choice modal, or scratch if no topics exist yet. */
    function openNewTopicFlow() {
      if (!ctx.topicsList.length) {
        ctx.openCreateTopicModal(null);
        return;
      }
      ctx.openModal("modal-topic-create-choice");
    }
    
    function openTopicTemplatePicker() {
      const list = document.getElementById("topic-template-list");
      if (!list) return;
      list.innerHTML = "";
      ctx.topicsList.forEach((topic) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "status-btn";
        btn.innerHTML = `
          <span class="status-btn-text">
            <span class="material-symbols-outlined icon-medium icon-btn-margin" style="color:${topic.color || "inherit"}">${topic.icon || "folder"}</span>
            ${ctx.escapeHtml(topic.name || "Topic")}
            <span style="opacity:0.7;font-weight:400"> · ${(topic.buttons || []).length} buttons</span>
          </span>
          <span class="material-symbols-outlined icon-small">chevron_right</span>
        `;
        btn.addEventListener("click", () => ctx.openCreateTopicModal(topic));
        list.appendChild(btn);
      });
      ctx.openModal("modal-topic-template-pick");
    }
    
    document.getElementById("topic-create-scratch-btn")?.addEventListener("click", () => {
      ctx.openCreateTopicModal(null);
    });
    document.getElementById("topic-create-template-btn")?.addEventListener("click", () => {
      ctx.openTopicTemplatePicker();
    });
    document.getElementById("topic-template-back-btn")?.addEventListener("click", () => {
      ctx.openModal("modal-topic-create-choice");
    });
    
    document.getElementById("add-topic-sidebar-btn")?.addEventListener("click", () => {
      ctx.openNewTopicFlow();
    });
    
    /**
     * When set, button-edit was opened from the topic organizer.
     * Edits apply to modalButtonsDraft only; topic meta form fields stay in the inputs.
     * (topicEditResumeId / topicEditFormSnapshot declared with other module state above.)
     */
    
    function snapshotTopicEditForm() {
      ctx.topicEditFormSnapshot = {
        name: ctx.$("topic-name-input")?.value || "",
        icon: ctx.$("topic-icon-input")?.value || "folder",
        color: ctx.getSelectedPickerColor("topic-color-picker"),
        cols: ctx.modalGridCols,
        rows: ctx.modalGridRows,
        isCreate: !!(ctx.pendingNewTopic && ctx.pendingNewTopic.id === ctx.editingTopicId),
        topicId: ctx.editingTopicId,
        buttons: Array.isArray(ctx.modalButtonsDraft)
          ? ctx.modalButtonsDraft.map((b, i) => ctx.normalizeButton({ ...b }, i))
          : []
      };
    }
    
    function resumeTopicEditModal() {
      const resumeId = ctx.topicEditResumeId;
      const snap = ctx.topicEditFormSnapshot;
      ctx.topicEditResumeId = null;
      ctx.topicEditFormSnapshot = null;
      if (!resumeId && !snap) return;
    
      const isCreate = !!(snap?.isCreate || (ctx.pendingNewTopic && ctx.pendingNewTopic.id === resumeId));
      const topicId = resumeId || snap?.topicId;
      ctx.editingTopicId = topicId;
    
      if (isCreate && ctx.pendingNewTopic && ctx.pendingNewTopic.id === topicId) {
        // Restore draft buttons onto pending topic for form fill, then re-apply form snapshot
        if (snap) {
          ctx.pendingNewTopic.buttons = snap.buttons;
          ctx.pendingNewTopic.gridCols = snap.cols;
          ctx.pendingNewTopic.gridRows = snap.rows;
        }
        ctx.fillTopicEditForm(ctx.pendingNewTopic, { isCreate: true });
      } else {
        const topic = ctx.topicsList.find((t) => t.id === topicId);
        if (!topic) return;
        // Fill from live topic meta, then overlay in-progress form + draft buttons
        ctx.fillTopicEditForm(topic, { isCreate: false });
      }
    
      if (snap) {
        if (ctx.$("topic-name-input")) ctx.$("topic-name-input").value = snap.name;
        if (ctx.$("topic-icon-input")) ctx.$("topic-icon-input").value = snap.icon;
        ctx.modalGridCols = ctx.clamp(snap.cols, 1, 12);
        ctx.modalGridRows = ctx.clamp(snap.rows, 1, 8);
        ctx.syncModalGridLabels();
        if (snap.color) ctx.fillColorPicker(ctx.$("topic-color-picker"), snap.color);
        ctx.modalButtonsDraft = snap.buttons.map((b, i) => ctx.normalizeButton({ ...b }, i));
        ctx.repackSequentialGrid({ buttons: ctx.modalButtonsDraft, gridCols: ctx.modalGridCols });
        ctx.renderTopicButtonOrganizer();
      }
      ctx.openModal("topic-edit-modal");
    }
    
    function openOrganizerButtonEdit(btnId) {
      if (!btnId || !Array.isArray(ctx.modalButtonsDraft)) return;
      const btn = ctx.modalButtonsDraft.find((b) => b.id === btnId);
      if (!btn) return;
      ctx.snapshotTopicEditForm();
      ctx.topicEditResumeId = ctx.editingTopicId || ctx.topicEditFormSnapshot?.topicId;
      ctx.editingButtonId = btnId;
      ctx.editingButtonTopicId = ctx.topicEditResumeId;
      ctx.$("button-label-input").value = btn.label || "";
      ctx.$("button-symbol-input").value = btn.symbol || "";
      const currentIdx = ctx.modalButtonsDraft.findIndex((b) => b.id === btnId);
      ctx.modalButtonIndexMax = Math.max(1, ctx.modalButtonsDraft.length);
      ctx.modalButtonIndex = currentIdx >= 0 ? currentIdx + 1 : 1;
      ctx.syncModalButtonIndexLabels();
      ctx.fillColorPicker(ctx.$("button-color-picker"), btn.color);
      ctx.openModal("button-edit-modal");
    }
    
    function renderTopicButtonOrganizer() {
      const root = document.getElementById("topic-btn-organizer");
      const group = document.getElementById("topic-buttons-organizer-group");
      if (!root) return;
      if (group) group.style.display = "";
      root.innerHTML = "";
      const cols = ctx.clamp(ctx.modalGridCols, 1, 12);
      // Drive tile size from column count: more cols â†’ narrower (and shorter) tiles
      root.style.setProperty("--org-cols", String(cols));
      root.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      const gap = cols >= 8 ? "3px" : cols >= 6 ? "4px" : cols >= 4 ? "6px" : "8px";
      const fontPx = cols >= 8 ? "10px" : cols >= 6 ? "11px" : cols >= 4 ? "12px" : "13px";
      const iconPx = cols >= 8 ? "14px" : cols >= 6 ? "16px" : "18px";
      root.style.setProperty("--org-gap", gap);
      root.style.setProperty("--org-tile-font", fontPx);
      root.style.setProperty("--org-tile-icon", iconPx);
      root.dataset.cols = String(cols);
      const draft = Array.isArray(ctx.modalButtonsDraft) ? ctx.modalButtonsDraft : [];
      if (!draft.length) {
        root.innerHTML = `<div class="topic-btn-organizer-empty">No sound buttons yet</div>`;
        return;
      }
      draft.forEach((btn, index) => {
        const tile = document.createElement("div");
        tile.className = "topic-org-tile";
        tile.setAttribute("role", "listitem");
        tile.draggable = true;
        tile.dataset.index = String(index);
        tile.dataset.btnId = btn.id;
        tile.title = "Drag to reorder · Tap to edit";
        const bg = btn.color || "#3f3f4e";
        tile.style.backgroundColor = bg;
        const symbol = btn.symbol
          ? `<span class="material-symbols-outlined topic-org-symbol">${btn.symbol}</span>`
          : "";
        tile.innerHTML = `
          <button type="button" class="topic-org-remove" title="Remove" aria-label="Remove ${ctx.escapeHtml(btn.label || "button")}">
            <span class="material-symbols-outlined">close</span>
          </button>
          ${symbol}
          <span class="topic-org-label">${ctx.escapeHtml(btn.label || "Button")}</span>
        `;
        tile.querySelector(".topic-org-remove")?.addEventListener("click", (e) => {
          e.stopPropagation();
          ctx.modalButtonsDraft = ctx.modalButtonsDraft.filter((_, i) => i !== index);
          ctx.renderTopicButtonOrganizer();
        });
    
        // Click (no drag) opens button editor; drag reorders
        let ptrDown = false;
        let didDrag = false;
        let startX = 0;
        let startY = 0;
        let pointerId = null;
        let startIdx = index;
        const DRAG_PX = 10;
    
        tile.addEventListener("dragstart", (e) => {
          didDrag = true;
          tile.classList.add("dragging");
          try { e.dataTransfer.setData("text/plain", String(index)); e.dataTransfer.effectAllowed = "move"; } catch (_) {}
        });
        tile.addEventListener("dragend", () => {
          tile.classList.remove("dragging");
          root.querySelectorAll(".topic-org-tile.drag-over").forEach((el) => el.classList.remove("drag-over"));
          // Prevent the synthetic click after HTML5 drag
          setTimeout(() => { didDrag = false; }, 0);
        });
        tile.addEventListener("dragover", (e) => {
          e.preventDefault();
          tile.classList.add("drag-over");
        });
        tile.addEventListener("dragleave", () => tile.classList.remove("drag-over"));
        tile.addEventListener("drop", (e) => {
          e.preventDefault();
          tile.classList.remove("drag-over");
          let from = NaN;
          try { from = parseInt(e.dataTransfer.getData("text/plain"), 10); } catch (_) {}
          const to = index;
          if (!Number.isFinite(from) || from === to || !ctx.modalButtonsDraft) return;
          const next = ctx.modalButtonsDraft.slice();
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          ctx.modalButtonsDraft = next;
          ctx.repackSequentialGrid({ buttons: ctx.modalButtonsDraft, gridCols: ctx.modalGridCols });
          ctx.renderTopicButtonOrganizer();
        });
    
        tile.addEventListener("pointerdown", (e) => {
          if (e.button != null && e.button !== 0) return;
          if (e.target.closest?.(".topic-org-remove")) return;
          ptrDown = true;
          didDrag = false;
          startX = e.clientX;
          startY = e.clientY;
          startIdx = index;
          // Touch: pointer-based reorder (HTML5 DnD is weak on touch)
          if (e.pointerType !== "mouse") {
            pointerId = e.pointerId;
            try { tile.setPointerCapture(pointerId); } catch (_) {}
          }
        });
        tile.addEventListener("pointermove", (e) => {
          if (!ptrDown) return;
          if (Math.hypot(e.clientX - startX, e.clientY - startY) > DRAG_PX) {
            didDrag = true;
            if (pointerId != null) tile.classList.add("dragging");
          }
        });
        tile.addEventListener("pointerup", (e) => {
          if (!ptrDown) return;
          ptrDown = false;
          const wasDrag = didDrag;
          tile.classList.remove("dragging");
          if (pointerId != null && e.pointerId === pointerId) {
            pointerId = null;
            if (wasDrag) {
              const el = document.elementFromPoint(e.clientX, e.clientY);
              const target = el?.closest?.(".topic-org-tile");
              const to = target ? parseInt(target.dataset.index, 10) : NaN;
              if (Number.isFinite(to) && to !== startIdx && ctx.modalButtonsDraft) {
                const next = ctx.modalButtonsDraft.slice();
                const [moved] = next.splice(startIdx, 1);
                next.splice(to, 0, moved);
                ctx.modalButtonsDraft = next;
                ctx.repackSequentialGrid({ buttons: ctx.modalButtonsDraft, gridCols: ctx.modalGridCols });
                ctx.renderTopicButtonOrganizer();
              }
              return;
            }
          }
          // Click without drag â†’ edit button
          if (!wasDrag && !e.target.closest?.(".topic-org-remove")) {
            ctx.openOrganizerButtonEdit(btn.id);
          }
        });
        tile.addEventListener("pointercancel", () => {
          ptrDown = false;
          pointerId = null;
          tile.classList.remove("dragging");
        });
        // Keyboard: Enter/Space to edit
        tile.tabIndex = 0;
        tile.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            ctx.openOrganizerButtonEdit(btn.id);
          }
        });
        root.appendChild(tile);
      });
    }
    
    function normalizeToHex(col) {
      if (!col) return "";
      col = String(col).trim();
      if (col.startsWith("#")) return col;
      const m = col.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!m) return col;
      const toHex = n => ("0" + Number(n).toString(16)).slice(-2);
      return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
    }
    
    /** Build palette + custom color swatches into a picker container. */
    function fillColorPicker(picker, selectedColor, fallback = "#3f3f4e") {
      if (!picker) return;
      picker.innerHTML = "";
      const selectedHex = ctx.normalizeToHex(selectedColor);
      const clearSel = () => picker.querySelectorAll(".color-option").forEach((o) => o.classList.remove("selected"));
    
      ctx.COLOR_PALETTE.forEach(col => {
        const opt = document.createElement("div");
        opt.className = `color-option${selectedHex === ctx.normalizeToHex(col) ? " selected" : ""}`;
        opt.style.backgroundColor = col;
        opt.addEventListener("click", () => { clearSel(); opt.classList.add("selected"); });
        picker.appendChild(opt);
      });
    
      const customOpt = document.createElement("div");
      customOpt.className = "color-option custom";
      if (selectedHex && !ctx.COLOR_PALETTE.some(c => ctx.normalizeToHex(c) === selectedHex)) {
        customOpt.classList.add("selected");
      }
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "color-picker-input";
      colorInput.value = selectedHex || fallback;
      customOpt.style.backgroundColor = colorInput.value;
      colorInput.addEventListener("input", (e) => {
        customOpt.style.backgroundColor = e.target.value;
        clearSel();
        customOpt.classList.add("selected");
      });
      customOpt.addEventListener("click", () => {
        clearSel();
        customOpt.classList.add("selected");
        colorInput.focus();
      });
      customOpt.appendChild(colorInput);
      picker.appendChild(customOpt);
    }
    
    function getSelectedPickerColor(pickerId) {
      const sel = document.querySelector(`#${pickerId} .color-option.selected`);
      return sel ? sel.style.backgroundColor : null;
    }
    
    function openTopicEditModal(topicId) {
      const topic = ctx.topicsList.find(t => t.id === topicId);
      if (!topic) return;
      ctx.pendingNewTopic = null;
      ctx.editingTopicId = topicId;
      ctx.fillTopicEditForm(topic, { isCreate: false });
      ctx.openModal("topic-edit-modal");
    }
    
    function cancelTopicEditModal() {
      clearLiveGridColsPreview(true);
      ctx.pendingNewTopic = null;
      ctx.editingTopicId = null;
      ctx.modalButtonsDraft = null;
      ctx.closeModals();
    }
    
    ctx.$("save-topic-meta-btn").addEventListener("click", () => {
      const isCreate = !!(ctx.pendingNewTopic && ctx.pendingNewTopic.id === ctx.editingTopicId);
      let topic = isCreate
        ? ctx.pendingNewTopic
        : ctx.topicsList.find(t => t.id === ctx.editingTopicId);
      if (!topic) return;
      topic.name = ctx.trim(ctx.$("topic-name-input").value) || (isCreate ? "New Topic" : "Untitled");
      topic.icon = ctx.mapSymbol(ctx.$("topic-icon-input").value, "folder");
      const col = ctx.getSelectedPickerColor("topic-color-picker");
      if (col) topic.color = col;
      topic.gridCols = ctx.clamp(ctx.modalGridCols, 1, 12);
      // Rows grow with buttons; keep existing/default row count for storage
      topic.gridRows = ctx.clamp(ctx.modalGridRows, 1, 8);
      if (Array.isArray(ctx.modalButtonsDraft)) {
        topic.buttons = ctx.modalButtonsDraft.map((b, i) => ctx.normalizeButton({ ...b }, i));
      }
      ctx.repackSequentialGrid(topic);
      ctx.modalButtonsDraft = null;
      // Keep previewed columns; no restore on successful save
      ctx.clearLiveGridColsPreview(false);
      if (isCreate) {
        ctx.topicsList.push(topic);
        ctx.pendingNewTopic = null;
        ctx.saveTopicsList();
        // New topic opens as its own chat (if under max)
        ctx.switchTopic(topic.id);
      } else {
        ctx.commitTopicsUi();
        try { ctx.syncChatUi(); } catch (_) {}
      }
      ctx.closeModals();
    });
    
    ctx.$("delete-topic-btn").addEventListener("click", () => {
      if (ctx.pendingNewTopic) { cancelTopicEditModal(); return; }
      if (ctx.topicsList.length === 1) { alert("Cannot delete the last topic."); return; }
      if (!confirm("Are you sure you want to delete this topic and all its buttons?")) return;
      ctx.topicsList = ctx.topicsList.filter(t => t.id !== ctx.editingTopicId);
      if (!ctx.topicsList.find(t => t.id === ctx.activeTopicId)) ctx.activeTopicId = ctx.topicsList[0].id;
      // Workspace owns chats — single mutation path
      ctx.onTopicDeleted(ctx.editingTopicId);
      ctx.commitTopicsUi();
      ctx.syncChatUi();
      ctx.closeModals();
    });
    
    // Use local fn — ctx.cancelTopicEditModal is not assigned until install() returns
    document.getElementById("cancel-topic-edit-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      cancelTopicEditModal();
    });
    
    function syncModalButtonIndexLabels() {
      const valEl = document.getElementById("button-index-val");
      const hintEl = document.getElementById("button-index-hint");
      if (valEl) valEl.textContent = String(ctx.modalButtonIndex);
      if (hintEl) {
        hintEl.textContent = ctx.modalButtonIndexMax <= 0
          ? "No buttons"
          : `${ctx.modalButtonIndex} of ${ctx.modalButtonIndexMax} (1 = first)`;
      }
      const downBtn = document.getElementById("button-index-down");
      const upBtn = document.getElementById("button-index-up");
      if (downBtn) downBtn.disabled = ctx.modalButtonIndex <= 1;
      if (upBtn) upBtn.disabled = ctx.modalButtonIndex >= ctx.modalButtonIndexMax;
    }
    
    function stepModalButtonIndex(delta) {
      if (ctx.modalButtonIndexMax <= 0) return;
      ctx.modalButtonIndex = ctx.clamp(ctx.modalButtonIndex + delta, 1, ctx.modalButtonIndexMax);
      ctx.syncModalButtonIndexLabels();
    }
    
    function moveButtonToIndex(tab, btnId, zeroBasedIndex) {
      if (!tab || !Array.isArray(tab.buttons)) return;
      const from = tab.buttons.findIndex(b => b.id === btnId);
      if (from < 0) return;
      const to = ctx.clamp(zeroBasedIndex, 0, tab.buttons.length - 1);
      if (from === to) return;
      const [item] = tab.buttons.splice(from, 1);
      tab.buttons.splice(to, 0, item);
    }
    
    function findTopicForEdit(topicId) {
      if (topicId && ctx.pendingNewTopic && ctx.pendingNewTopic.id === topicId) return ctx.pendingNewTopic;
      if (topicId) {
        const found = ctx.topicsList.find((t) => t.id === topicId);
        if (found) return found;
      }
      if (ctx.pendingNewTopic && ctx.pendingNewTopic.id === ctx.editingTopicId) return ctx.pendingNewTopic;
      return ctx.getActiveTopic();
    }
    
    function openButtonEditModal(btnId, topicId = null) {
      const tab = ctx.findTopicForEdit(topicId);
      const btn = tab?.buttons?.find((b) => b.id === btnId);
      if (!btn || !tab) return;
      ctx.editingButtonId = btnId;
      ctx.editingButtonTopicId = tab.id;
      ctx.$("button-label-input").value = btn.label || "";
      ctx.$("button-symbol-input").value = btn.symbol || "";
      const currentIdx = tab.buttons.findIndex((b) => b.id === btnId);
      ctx.modalButtonIndexMax = Math.max(1, tab.buttons.length);
      ctx.modalButtonIndex = currentIdx >= 0 ? currentIdx + 1 : 1;
      ctx.syncModalButtonIndexLabels();
      ctx.fillColorPicker(ctx.$("button-color-picker"), btn.color);
      ctx.openModal("button-edit-modal");
    }
    
    ctx.$("button-index-down")?.addEventListener("click", () => ctx.stepModalButtonIndex(-1));
    ctx.$("button-index-up")?.addEventListener("click", () => ctx.stepModalButtonIndex(1));
    
    function finishButtonEditAndMaybeResume(didMutate) {
      if (ctx.topicEditResumeId) {
        // Draft-only path â€” do not commit topicsList until topic Save
        ctx.editingButtonId = null;
        ctx.editingButtonTopicId = null;
        ctx.resumeTopicEditModal();
        return;
      }
      if (didMutate) ctx.commitTopicsUi();
      ctx.closeModals();
    }
    
    ctx.$("save-button-edit").addEventListener("click", () => {
      // Organizer â†’ draft-only edit
      if (ctx.topicEditResumeId && Array.isArray(ctx.modalButtonsDraft) && ctx.topicEditFormSnapshot) {
        const btn = ctx.modalButtonsDraft.find((b) => b.id === ctx.editingButtonId);
        if (!btn) return;
        btn.label = ctx.trim(ctx.$("button-label-input").value) || "Button";
        btn.symbol = ctx.mapSymbol(ctx.$("button-symbol-input").value);
        const col = ctx.getSelectedPickerColor("button-color-picker");
        if (col) btn.color = col;
        // Reorder within draft
        const from = ctx.modalButtonsDraft.findIndex((b) => b.id === ctx.editingButtonId);
        const to = ctx.clamp(ctx.modalButtonIndex - 1, 0, ctx.modalButtonsDraft.length - 1);
        if (from >= 0 && from !== to) {
          const [item] = ctx.modalButtonsDraft.splice(from, 1);
          ctx.modalButtonsDraft.splice(to, 0, item);
        }
        ctx.repackSequentialGrid({ buttons: ctx.modalButtonsDraft, gridCols: ctx.modalGridCols });
        ctx.topicEditFormSnapshot.buttons = ctx.modalButtonsDraft.map((b, i) => ctx.normalizeButton({ ...b }, i));
        ctx.finishButtonEditAndMaybeResume(true);
        return;
      }
    
      const tab = ctx.findTopicForEdit(ctx.editingButtonTopicId);
      const btn = tab?.buttons?.find((b) => b.id === ctx.editingButtonId);
      if (!btn || !tab) return;
      btn.label = ctx.trim(ctx.$("button-label-input").value) || "Button";
      btn.symbol = ctx.mapSymbol(ctx.$("button-symbol-input").value);
      const col = ctx.getSelectedPickerColor("button-color-picker");
      if (col) btn.color = col;
      ctx.moveButtonToIndex(tab, ctx.editingButtonId, ctx.modalButtonIndex - 1);
      ctx.repackSequentialGrid(tab);
      ctx.finishButtonEditAndMaybeResume(true);
    });
    
    ctx.$("delete-button-edit").addEventListener("click", () => {
      if (ctx.topicEditResumeId && Array.isArray(ctx.modalButtonsDraft) && ctx.topicEditFormSnapshot) {
        ctx.modalButtonsDraft = ctx.modalButtonsDraft.filter((b) => b.id !== ctx.editingButtonId);
        ctx.repackSequentialGrid({ buttons: ctx.modalButtonsDraft, gridCols: ctx.modalGridCols });
        ctx.topicEditFormSnapshot.buttons = ctx.modalButtonsDraft.map((b, i) => ctx.normalizeButton({ ...b }, i));
        ctx.finishButtonEditAndMaybeResume(true);
        return;
      }
      const tab = ctx.findTopicForEdit(ctx.editingButtonTopicId);
      if (!tab) return;
      tab.buttons = (tab.buttons || []).filter((b) => b.id !== ctx.editingButtonId);
      ctx.repackSequentialGrid(tab);
      ctx.finishButtonEditAndMaybeResume(true);
    });
    
    // Cancel from button edit returns to topic edit when opened from organizer
    document.querySelector("#button-edit-modal .modal-btn.secondary")?.addEventListener("click", (e) => {
      if (!ctx.topicEditResumeId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      ctx.editingButtonId = null;
      ctx.editingButtonTopicId = null;
      // Discard button form changes â€” snapshot still has pre-open draft
      ctx.resumeTopicEditModal();
    }, true);
    
    

    return {
      syncModalGridLabels,
      clearLiveGridColsPreview,
      previewLiveGridColsFromModal,
      stepModalGrid,
      fillTopicEditForm,
      cloneTopicAsTemplate,
      openCreateTopicModal,
      openNewTopicFlow,
      openTopicTemplatePicker,
      snapshotTopicEditForm,
      resumeTopicEditModal,
      openOrganizerButtonEdit,
      renderTopicButtonOrganizer,
      normalizeToHex,
      fillColorPicker,
      getSelectedPickerColor,
      openTopicEditModal,
      cancelTopicEditModal,
      syncModalButtonIndexLabels,
      stepModalButtonIndex,
      moveButtonToIndex,
      findTopicForEdit,
      openButtonEditModal,
      finishButtonEditAndMaybeResume
    };
  }

  global.AacTopicsEdit = { install };
})(typeof window !== "undefined" ? window : globalThis);
