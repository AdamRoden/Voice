/**
 * Board export / import (AAC Workspace JSON).
 * Takes a Topics port + settings hooks — no getter/setter mirror layer.
 */
(function (global) {
  "use strict";

  const BOARD_EXPORT_FORMAT = "aac-workspace";
  const BOARD_EXPORT_VERSION = 1;

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
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `aac-workspace-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 1500);
      } catch (_) {
        alert("Could not export boards. Try removing large audio clips first.");
      }
    }

    function mergeTopicsFromImport(incomingList) {
      const topicsList = topics.getTopicsList();
      const incoming = topics.normalizeTopicsList(incomingList);
      incoming.forEach((inc) => {
        const existing = topicsList.find((t) => t.id === inc.id)
          || topicsList.find((t) => (t.name || "").toLowerCase() === (inc.name || "").toLowerCase());
        if (!existing) {
          if (topicsList.some((t) => t.id === inc.id)) {
            inc.id = d.generateId();
          }
          topicsList.push(inc);
          return;
        }
        const byId = new Map(existing.buttons.map((b) => [b.id, b]));
        (inc.buttons || []).forEach((btn) => {
          if (byId.has(btn.id)) {
            Object.assign(byId.get(btn.id), btn);
          } else {
            const copy = { ...btn, id: d.generateId() };
            existing.buttons.push(topics.normalizeButton(copy, existing.buttons.length));
          }
        });
        existing.gridCols = Math.max(existing.gridCols || 1, inc.gridCols || 1);
        existing.gridRows = Math.max(existing.gridRows || 1, inc.gridRows || 1);
        if (inc.icon) existing.icon = inc.icon;
        if (inc.color) existing.color = inc.color;
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

      if (importMode === "merge") {
        mergeTopicsFromImport(next);
      } else {
        topics.setTopicsList(next);
      }

      const topicsList = topics.getTopicsList();
      const preferred = data.activeTopicId;
      const activeTopicId = topicsList.find((t) => t.id === preferred)?.id || topicsList[0].id;
      topics.setActiveTopicId(activeTopicId);
      topics.setExpandedTopicIds(new Set([activeTopicId]));
      d.lsSet("aac_active_tab", activeTopicId);
      topics.saveTopicsList();

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
      document.getElementById("import-board-btn")?.addEventListener("click", () => {
        document.getElementById("import-board-file")?.click();
      });
      document.getElementById("import-board-file")?.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!file) return;
        try {
          pendingImportData = await parseImportFile(file);
          d.openModal("modal-import-choice");
        } catch (err) {
          pendingImportData = null;
          alert(err?.message || "Could not import boards.");
        }
      });
      document.getElementById("import-merge-btn")?.addEventListener("click", () => {
        if (!pendingImportData) return;
        try {
          importBoardFromObject(pendingImportData, "merge");
          pendingImportData = null;
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
          pendingImportData = null;
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
    exportButtonPayload,
    exportTopicPayload,
    create
  };
})(typeof window !== "undefined" ? window : globalThis);
