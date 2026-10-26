/**
 * Board export / import (AAC Workspace JSON).
 * Takes a Topics port + settings hooks — no getter/setter mirror layer.
 */
(function (global) {
  "use strict";

  const BOARD_EXPORT_FORMAT = "aac-workspace";
  const BOARD_EXPORT_VERSION = 1;

  /** Click-to-download a Blob (shared by board export + history audio). */
  function triggerBlobDownload(blob, filename) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }, 1500);
  }

  function exportButtonPayload(btn) {
    return {
      id: btn.id,
      label: btn.label,
      symbol: btn.symbol || "",
      color: btn.color,
      sourceText: btn.sourceText || null,
      utteranceText: btn.utteranceText || null,
      audioData: btn.audioData || null,
      effectsBaked: !!btn.effectsBaked,
      col: btn.col,
      row: btn.row,
      colSpan: btn.colSpan,
      rowSpan: btn.rowSpan
    };
  }

  function exportTopicPayload(topic) {
    return {
      id: topic.id,
      name: topic.name,
      icon: topic.icon,
      color: topic.color,
      thread: topic.thread || "all",
      gridCols: topic.gridCols,
      gridRows: topic.gridRows,
      buttons: (topic.buttons || []).map(exportButtonPayload)
    };
  }

  /**
   * @param {{
   *   topics: {
   *     getTopicsList: () => any[],
   *     setTopicsList: (list: any[]) => void,
   *     getActiveTopicId: () => string,
   *     setActiveTopicId: (id: string) => void,
   *     setExpandedTopicIds: (ids: Set<string>) => void,
   *     normalizeTopicsList: (raw: any) => any[],
   *     normalizeButton: (btn: any, index?: number) => any,
   *     repackSequentialGrid: (topic: any) => void,
   *     saveTopicsList: () => void,
   *     commitTopicsUi: () => void
   *   },
   *   generateId: () => string,
   *   lsSet: (k: string, v: any) => void,
   *   getSettings: () => object,
   *   applyImportedSettings: (settings: object) => void,
   *   onAfterImport: (mode: string) => void,
   *   openModal: (id: string) => void,
   *   closeModals: () => void,
   *   announceLive: (msg: string) => void,
   *   focusDisplayInput: () => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    const topics = d.topics;
    if (!topics || typeof topics.getTopicsList !== "function") {
      throw new Error("AacBoardIo requires topics port");
    }
    for (const key of [
      "generateId", "lsSet", "getSettings", "applyImportedSettings",
      "onAfterImport", "openModal", "closeModals", "announceLive", "focusDisplayInput"
    ]) {
      if (typeof d[key] !== "function" && key !== "lsSet") {
        if (d[key] === undefined || d[key] === null) {
          throw new Error(`AacBoardIo missing required dep: ${key}`);
        }
      }
    }

    let pendingImportData = null;

    function importFileInput() {
      return document.getElementById("import-board-file");
    }

    function importFileNameEl() {
      return document.getElementById("import-file-name");
    }

    function setImportActionsEnabled(on) {
      const mergeBtn = document.getElementById("import-merge-btn");
      const replaceBtn = document.getElementById("import-replace-btn");
      if (mergeBtn) mergeBtn.disabled = !on;
      if (replaceBtn) replaceBtn.disabled = !on;
    }

    function resetImportUi(message) {
      pendingImportData = null;
      setImportActionsEnabled(false);
      const nameEl = importFileNameEl();
      if (nameEl) nameEl.textContent = message || "No file selected";
      const input = importFileInput();
      if (input) input.value = "";
    }

    function buildBoardExport() {
      return {
        format: BOARD_EXPORT_FORMAT,
        version: BOARD_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        activeTopicId: topics.getActiveTopicId(),
        topics: (topics.getTopicsList() || []).map(exportTopicPayload),
        settings: d.getSettings() || {}
      };
    }

    function downloadBoardExport() {
      try {
        let payload = buildBoardExport();
        let json;
        try {
          json = JSON.stringify(payload, null, 2);
        } catch (_) {
          payload = buildBoardExport();
          payload.topics = (payload.topics || []).map((topic) => ({
            ...topic,
            buttons: (topic.buttons || []).map((b) => ({
              ...b,
              audioData: null,
              utteranceText: b.utteranceText || b.sourceText || b.label || null,
              sourceText: b.sourceText || b.utteranceText || b.label || null,
              effectsBaked: false
            }))
          }));
          payload.exportNote = "Audio clips omitted (file too large); phrases export as live text.";
          json = JSON.stringify(payload, null, 2);
        }
        const blob = new Blob([json], { type: "application/json" });
        const stamp = new Date().toISOString().slice(0, 10);
        triggerBlobDownload(blob, `aac-workspace-${stamp}.json`);
      } catch (_) {
        alert("Could not export boards. Try removing large audio clips first.");
      }
    }

    function mergeButtonFields(dest, raw, norm) {
      if (!raw || typeof raw !== "object" || !dest || !norm) return;
      if (raw.label != null) dest.label = norm.label;
      if (raw.symbol != null || raw.icon != null) dest.symbol = norm.symbol;
      if (raw.color != null) dest.color = norm.color;
      if (raw.utteranceText != null) dest.utteranceText = norm.utteranceText;
      if (raw.sourceText != null) dest.sourceText = norm.sourceText;
      if (raw.text != null && raw.utteranceText == null && raw.sourceText == null) {
        dest.sourceText = norm.sourceText;
        if (!dest.audioData) dest.utteranceText = norm.utteranceText;
      }
      if (raw.audioData != null) dest.audioData = norm.audioData;
      if (raw.effectsBaked != null) dest.effectsBaked = norm.effectsBaked;
      if (raw.col != null || raw.x != null) dest.col = norm.col;
      if (raw.row != null || raw.y != null) dest.row = norm.row;
      if (raw.colSpan != null) dest.colSpan = norm.colSpan;
      if (raw.rowSpan != null) dest.rowSpan = norm.rowSpan;
    }

    function mergeTopicsFromImport(rawList) {
      const topicsList = topics.getTopicsList();
      (Array.isArray(rawList) ? rawList : []).forEach((raw) => {
        if (!raw || typeof raw !== "object") return;
        const incoming = topics.normalizeTopicsList([raw])[0];
        if (!incoming) return;
        const existing = raw.id ? topicsList.find((t) => t.id === raw.id) : null;
        if (!existing) {
          if (topicsList.some((t) => t.id === incoming.id)) incoming.id = d.generateId();
          topicsList.push(incoming);
          return;
        }
        if (raw.name != null && String(raw.name) !== "") existing.name = incoming.name;
        if (raw.icon != null && raw.icon !== "") existing.icon = incoming.icon;
        if (raw.color != null && raw.color !== "") existing.color = incoming.color;
        if (raw.gridCols != null) existing.gridCols = Math.max(existing.gridCols || 1, incoming.gridCols || 1);
        if (raw.gridRows != null) existing.gridRows = Math.max(existing.gridRows || 1, incoming.gridRows || 1);
        const rawButtons = Array.isArray(raw.buttons) ? raw.buttons : [];
        const byId = new Map(existing.buttons.map((b) => [b.id, b]));
        rawButtons.forEach((rawBtn) => {
          if (!rawBtn || typeof rawBtn !== "object") return;
          const norm = topics.normalizeButton(rawBtn, existing.buttons.length);
          if (rawBtn.id && byId.has(rawBtn.id)) {
            mergeButtonFields(byId.get(rawBtn.id), rawBtn, norm);
            return;
          }
          if (!norm.id || byId.has(norm.id)) norm.id = d.generateId();
          existing.buttons.push(norm);
          byId.set(norm.id, norm);
        });
        topics.repackSequentialGrid(existing);
      });
    }

    /**
     * @param {object} data
     * @param {"replace"|"merge"} mode
     */
    function importBoardFromObject(data, mode) {
      const importMode = mode || "replace";
      if (!data || typeof data !== "object") throw new Error("Invalid file");
      if (data.format && data.format !== BOARD_EXPORT_FORMAT) {
        throw new Error("Not an AAC Workspace export file");
      }
      const rawTopics = Array.isArray(data.topics) ? data.topics : null;
      if (!rawTopics || !rawTopics.length) throw new Error("Export has no topics");

      const next = topics.normalizeTopicsList(rawTopics);
      if (!next.length) throw new Error("No valid topics in file");

      let backupList = null;
      try { backupList = JSON.parse(JSON.stringify(topics.getTopicsList())); } catch (_) {}
      const backupActive = topics.getActiveTopicId();

      if (importMode === "merge") {
        mergeTopicsFromImport(rawTopics);
      } else {
        topics.setTopicsList(next);
      }

      const topicsList = topics.getTopicsList();
      const preferred = data.activeTopicId;
      const activeTopicId = topicsList.find((t) => t.id === preferred)?.id || topicsList[0].id;
      topics.setActiveTopicId(activeTopicId);
      topics.setExpandedTopicIds(new Set([activeTopicId]));
      d.lsSet("aac_active_tab", activeTopicId);
      const saved = topics.saveTopicsList();

      if (!saved) {
        if (backupList) {
          topics.setTopicsList(backupList);
          topics.setActiveTopicId(backupActive);
          topics.setExpandedTopicIds(new Set([backupActive]));
          d.lsSet("aac_active_tab", backupActive);
          topics.commitTopicsUi();
        }
        d.announceLive("Board was not saved. Device storage is full.");
        alert("Could not store this board. Device storage is full. Free some space and try again.");
        d.focusDisplayInput();
        return;
      }

      if (data.settings && importMode === "replace") d.applyImportedSettings(data.settings);

      topics.commitTopicsUi();
      d.onAfterImport(importMode);
      d.focusDisplayInput();
      d.announceLive(importMode === "merge" ? "Boards merged" : "Boards replaced");
    }

    async function parseImportFile(file) {
      if (!file) return null;
      const text = await file.text();
      try {
        return JSON.parse(text);
      } catch (_) {
        throw new Error("File is not valid JSON");
      }
    }

    function bind() {
      document.getElementById("export-board-btn")?.addEventListener("click", () => {
        downloadBoardExport();
      });
      document.getElementById("import-board-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetImportUi();
        d.openModal("modal-import-choice");
      });
      const fileInput = importFileInput();
      if (fileInput) {
        fileInput.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        fileInput.addEventListener("change", async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) {
            resetImportUi();
            return;
          }
          const nameEl = importFileNameEl();
          if (nameEl) nameEl.textContent = file.name || "Selected file";
          try {
            pendingImportData = await parseImportFile(file);
            setImportActionsEnabled(true);
          } catch (err) {
            pendingImportData = null;
            setImportActionsEnabled(false);
            if (nameEl) nameEl.textContent = err?.message || "Could not read that file.";
          }
        });
      }
      document.getElementById("import-browse-btn")?.addEventListener("click", (e) => {
        e.stopPropagation();
      });
      document.getElementById("import-cancel-btn")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetImportUi();
        d.closeModals();
      });
      document.getElementById("import-merge-btn")?.addEventListener("click", () => {
        if (!pendingImportData) return;
        try {
          importBoardFromObject(pendingImportData, "merge");
          resetImportUi();
          d.closeModals();
        } catch (err) {
          alert(err?.message || "Could not merge boards.");
        }
      });
      document.getElementById("import-replace-btn")?.addEventListener("click", () => {
        if (!pendingImportData) return;
        if (!confirm("Replace will remove all current topics and buttons on this device. Continue?")) return;
        try {
          importBoardFromObject(pendingImportData, "replace");
          resetImportUi();
          d.closeModals();
        } catch (err) {
          alert(err?.message || "Could not replace boards.");
        }
      });
    }

    return {
      BOARD_EXPORT_FORMAT,
      BOARD_EXPORT_VERSION,
      buildBoardExport,
      downloadBoardExport,
      importBoardFromObject,
      parseImportFile,
      bind
    };
  }

  global.AacBoardIo = {
    BOARD_EXPORT_FORMAT,
    BOARD_EXPORT_VERSION,
    triggerBlobDownload,
    exportButtonPayload,
    exportTopicPayload,
    create
  };
})(typeof window !== "undefined" ? window : globalThis);
