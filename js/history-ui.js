/**
 * Speech items (canonical shape) + history list UI.
 * Exposes AacSpeechItems and AacHistoryUi.
 */

(function (global) {
  "use strict";

  /**
   * @param {{ trim: (v: any) => string, generateId: () => string }} deps
   */
  function create(deps) {
    const d = deps || {};
    if (typeof d.trim !== "function" || typeof d.generateId !== "function") {
      throw new Error("AacSpeechItems requires trim and generateId");
    }
    const trim = d.trim;
    const generateId = d.generateId;

    /**
     * Canonical speech/history item (history, assign, restore, lastGeneratedAudio).
     * utteranceText wins over audioData (live regen). effectsBaked only with a clip.
     */
    function makeSpeechItem({
      text = "",
      model = null,
      voiceId = null,
      audioData = null,
      utteranceText = null,
      effectsBaked = false,
      id = null,
      withTimestamp = false
    } = {}) {
      const phrase = trim(text);
      const utt = trim(utteranceText) || null;
      const clip = utt ? null : (audioData || null);
      const item = {
        id: id || generateId(),
        text: phrase,
        model: model || null,
        voiceId: voiceId || null,
        audioData: clip,
        utteranceText: utt,
        effectsBaked: !!(effectsBaked && clip)
      };
      if (withTimestamp) {
        item.timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return item;
    }

    function isUtteranceSource(item) {
      if (!item) return false;
      if (trim(item.utteranceText)) return true;
      return item.model === "browser_tts" && trim(item.text) && !item.audioData;
    }

    function getUtteranceText(item) {
      return item ? trim(item.utteranceText || item.text) : "";
    }

    function getButtonSourceText(btn) {
      return btn ? trim(btn.sourceText || btn.utteranceText || btn.text || btn.label) : "";
    }

    function canUseGeneratedActions(item) {
      return !!(item && (item.audioData || isUtteranceSource(item)));
    }

    /** True when last-generated clip matches the current display text. */
    function canReplay(item, displayText) {
      if (!canUseGeneratedActions(item)) return false;
      return trim(displayText) === trim((item && item.text) || "");
    }

    function canAssignFromDisplay(getText) {
      return trim(typeof getText === "function" ? getText() : getText).length > 0;
    }

    /**
     * @param {() => string} getText
     * @param {() => object|null} getLastGenerated
     */
    function getAssignSource(getText, getLastGenerated) {
      const text = trim(typeof getText === "function" ? getText() : "");
      if (!text) return null;
      const last = typeof getLastGenerated === "function" ? getLastGenerated() : null;
      if (canUseGeneratedActions(last) && trim(last.text) === text) {
        return last;
      }
      return makeSpeechItem({
        text,
        utteranceText: text,
        model: "browser_tts",
        effectsBaked: false
      });
    }

    return {
      makeSpeechItem,
      isUtteranceSource,
      getUtteranceText,
      getButtonSourceText,
      canUseGeneratedActions,
      canReplay,
      canAssignFromDisplay,
      getAssignSource
    };
  }

  global.AacSpeechItems = { create };
})(typeof window !== "undefined" ? window : globalThis);

(function (global) {
  "use strict";

  /**
   * @param {{
   *   $: (id: string) => HTMLElement|null,
   *   escapeHtml: (s: string) => string,
   *   lsSet: (k: string, v: string) => void,
   *   lsGetJson: (k: string, fallback: any) => any,
   *   asArray: (v: any) => any[],
   *   makeSpeechItem: (opts: object) => object,
   *   isUtteranceSource: (item: object) => boolean,
   *   canUseGeneratedActions: (item: object) => boolean,
   *   playSpeechSource: (item: object) => void,
   *   setText: (val: string, caret?: number) => void,
   *   focusDisplayInput: () => void,
   *   closeModals: () => void,
   *   onLastGenerated: (item: object|null) => void,
   *   storageKey?: string,
   *   maxItems?: number
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    for (const key of [
      "$", "escapeHtml", "lsSet", "lsGetJson", "asArray", "makeSpeechItem",
      "isUtteranceSource", "canUseGeneratedActions", "playSpeechSource",
      "setText", "focusDisplayInput", "closeModals", "onLastGenerated"
    ]) {
      if (typeof d[key] !== "function") {
        throw new Error(`AacHistoryUi missing required dep: ${key}`);
      }
    }

    const STORAGE_KEY = d.storageKey || "aac_history";
    const MAX_ITEMS = d.maxItems != null ? d.maxItems : 50;
    let audioHistory = d.asArray(d.lsGetJson(STORAGE_KEY, []));

    function saveHistory() {
      d.lsSet(STORAGE_KEY, JSON.stringify(audioHistory));
    }

    function getHistory() {
      return audioHistory;
    }

    /** Approximate stored size of history (JSON UTF-16 code units ≈ localStorage). */
    function estimateHistoryBytes() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw != null && raw !== "") {
          // localStorage is UTF-16: 2 bytes per code unit
          return raw.length * 2;
        }
      } catch (_) {}
      try {
        return JSON.stringify(audioHistory || []).length * 2;
      } catch (_) {
        return 0;
      }
    }

    function formatBytes(bytes) {
      const n = Math.max(0, Number(bytes) || 0);
      if (n < 1024) return `${Math.round(n)} B`;
      if (n < 1024 * 1024) {
        const kb = n / 1024;
        return kb < 10 ? `${kb.toFixed(1)} KB` : `${Math.round(kb)} KB`;
      }
      const mb = n / (1024 * 1024);
      return mb < 10 ? `${mb.toFixed(2)} MB` : `${mb.toFixed(1)} MB`;
    }

    function historySizeLabel() {
      return formatBytes(estimateHistoryBytes());
    }

    function syncClearHistoryButtons() {
      const size = historySizeLabel();
      const count = Array.isArray(audioHistory) ? audioHistory.length : 0;
      const sidebar = d.$("clear-history-btn");
      const modal = d.$("modal-clear-history-btn");
      if (sidebar) {
        sidebar.textContent = count
          ? `Clear All History (${size})`
          : "Clear All History";
        sidebar.title = count
          ? `Clear ${count} item${count === 1 ? "" : "s"} · about ${size} of saved history`
          : "No history to clear";
        sidebar.disabled = count === 0;
      }
      if (modal) {
        modal.textContent = count ? `Clear all (${size})` : "Clear all";
        modal.title = count
          ? `Clear ${count} item${count === 1 ? "" : "s"} · about ${size} of saved history`
          : "No history to clear";
        modal.disabled = count === 0;
      }
    }

    function confirmClearAll() {
      const count = Array.isArray(audioHistory) ? audioHistory.length : 0;
      if (!count) return false;
      const size = historySizeLabel();
      return confirm(
        `Clear all audio history?\n\n${count} item${count === 1 ? "" : "s"} · about ${size} of device storage will be freed.`
      );
    }

    function setGeneratedAudioActions(historyItem) {
      d.onLastGenerated(historyItem);
    }

    function restoreSpeechToDisplay(item) {
      if (!item) {
        d.focusDisplayInput();
        return;
      }
      const text = item.text || "";
      d.setText(text, text.length);
      setGeneratedAudioActions(item);
      d.focusDisplayInput();
    }

    function addToHistory(textSpoken, model, voiceId, audioBlob, extra = {}) {
      const isUtt = model === "browser_tts" && !audioBlob;
      const item = d.makeSpeechItem({
        text: textSpoken,
        model,
        voiceId,
        audioData: audioBlob || null,
        utteranceText: isUtt ? textSpoken : null,
        effectsBaked: !!(extra.effectsBaked && audioBlob),
        withTimestamp: true
      });
      try {
        if (!Array.isArray(audioHistory)) audioHistory = [];
        audioHistory.unshift(item);
        if (audioHistory.length > MAX_ITEMS) audioHistory.length = MAX_ITEMS;
        saveHistory();
        renderHistory();
        setGeneratedAudioActions(item);
        return item;
      } catch (_) {
        // History is best-effort - never fail speech because of storage/UI
        try {
          setGeneratedAudioActions(item);
        } catch (__) {}
        return null;
      }
    }

    function renderHistoryInto(container, searchInput) {
      if (!container) return;
      if (!Array.isArray(audioHistory)) audioHistory = [];
      const query = (searchInput?.value || "").toLowerCase().trim();
      const filtered = audioHistory.filter((item) => (item.text || "").toLowerCase().includes(query));
      container.innerHTML = "";

      if (filtered.length === 0) {
        container.innerHTML = `<div class="history-empty-notice">No speech history found</div>`;
        return;
      }

      filtered.forEach((item) => {
        const el = document.createElement("div");
        el.className = "history-item";
        const isUtt = d.isUtteranceSource(item);
        el.innerHTML = `
          <div class="history-item-header">
            <span class="history-item-text">${d.escapeHtml(item.text)}</span>
            <span class="history-item-meta">${d.escapeHtml(item.timestamp || "")}${isUtt ? " | live TTS" : ""}</span>
          </div>
          <div class="history-actions">
            <button class="history-btn replay-btn" type="button"><span class="material-symbols-outlined icon-small">play_arrow</span> Play</button>
            <button class="history-btn restore restore-btn" type="button"><span class="material-symbols-outlined icon-small">restore</span> Restore</button>
            <button class="history-btn delete delete-btn" type="button"><span class="material-symbols-outlined icon-small">delete</span></button>
          </div>
        `;

        el.querySelector(".replay-btn")?.addEventListener("click", () => d.playSpeechSource(item));
        el.querySelector(".restore-btn")?.addEventListener("click", () => {
          restoreSpeechToDisplay(item);
          d.closeModals();
        });
        el.querySelector(".delete-btn")?.addEventListener("click", () => {
          audioHistory = audioHistory.filter((h) => h.id !== item.id);
          saveHistory();
          renderHistory();
        });
        container.appendChild(el);
      });
    }

    function renderHistory() {
      renderHistoryInto(d.$("audio-history"), d.$("history-search-input"));
      renderHistoryInto(d.$("modal-audio-history"), d.$("modal-history-search-input"));
      syncClearHistoryButtons();
    }

    function clearAll() {
      audioHistory = [];
      saveHistory();
      renderHistory();
    }

    function bind() {
      document.getElementById("history-search-input")?.addEventListener("input", renderHistory);
      document.getElementById("modal-history-search-input")?.addEventListener("input", renderHistory);
      document.getElementById("clear-history-btn")?.addEventListener("click", () => {
        if (!confirmClearAll()) return;
        clearAll();
      });
      document.getElementById("modal-clear-history-btn")?.addEventListener("click", () => {
        if (!confirmClearAll()) return;
        clearAll();
      });
      syncClearHistoryButtons();
    }

    return {
      addToHistory,
      renderHistory,
      setGeneratedAudioActions,
      restoreSpeechToDisplay,
      getHistory,
      saveHistory,
      clearAll,
      estimateHistoryBytes,
      historySizeLabel,
      syncClearHistoryButtons,
      bind
    };
  }

  global.AacHistoryUi = { create };
})(typeof window !== "undefined" ? window : globalThis);

