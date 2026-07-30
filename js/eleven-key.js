/**
 * ElevenLabs API key lifecycle: storage paint, modal open/save/cancel,
 * session tokens (dismiss vs in-flight validate), and revoke → browser fallback hooks.
 */
(function (global) {
  "use strict";

  const API_KEY_MODAL_ID = "api-key-modal";
  const KEY_STORAGE = "elevenlabs_key";

  /**
   * @param {{
   *   $: (id: string) => HTMLElement|null,
   *   lsGet: (k: string, fb?: any) => any,
   *   lsSet: (k: string, v: string) => void,
   *   Eleven: { validateApiKey: (key: string) => Promise<object> },
   *   openModal: (id: string) => void,
   *   closeModals: () => void,
   *   isElevenModelSelected?: () => boolean,
   *   onNeedBrowserFallback?: () => void,
   *   onRevertModel?: (modelId: string) => void,
   *   onCommitPendingModel?: (modelId: string) => void,
   *   onKeyStateChanged?: (state: {
   *     voices?: any[]|null,
   *     clearCache?: boolean,
   *     loadError?: boolean,
   *     refreshList?: boolean
   *   }) => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    const $ = d.$;
    const lsGet = d.lsGet;
    const lsSet = d.lsSet;
    const Eleven = d.Eleven;

    if (typeof $ !== "function" || typeof lsGet !== "function" || typeof lsSet !== "function") {
      throw new Error("AacElevenKey requires $, lsGet, lsSet");
    }
    if (!Eleven || typeof Eleven.validateApiKey !== "function") {
      throw new Error("AacElevenKey requires Eleven.validateApiKey");
    }

    const apiKeyBtn = $("api-key-btn");
    const apiKeyInput = $("api-key-input");

    /** @type {null | { id: number, returnToModal: string|null, previousModel: string|null, pendingModel: string|null, checking: boolean }} */
    let session = null;
    let sessionSeq = 0;
    let closingInternally = false;

    function hasApiKey() {
      return !!(lsGet(KEY_STORAGE, "") || "").trim();
    }

    function getApiKey() {
      return String(lsGet(KEY_STORAGE, "") || "").trim();
    }

    function paintApiKeyButton() {
      const key = getApiKey();
      const label = apiKeyBtn?.querySelector(".status-btn-text");
      const hasKey = !!key;
      if (label) {
        label.innerHTML = hasKey
          ? `<span class="material-symbols-outlined icon-small icon-btn-margin">key</span>API Key Saved (••••${key.slice(-4)})`
          : `<span class="material-symbols-outlined icon-small icon-btn-margin">key</span>Missing API Key (Click to Add)`;
      }
      if (apiKeyBtn) {
        apiKeyBtn.classList.toggle("missing", !hasKey);
        apiKeyBtn.classList.toggle("saved", hasKey);
      }
    }

    function isCoarsePointerUi() {
      try {
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
        if (window.matchMedia && window.matchMedia("(max-width: 900px)").matches) return true;
      } catch (_) {}
      return false;
    }

    function isSessionAlive(id) {
      return !!(session && session.id === id);
    }

    function takeSession() {
      const s = session;
      session = null;
      return s;
    }

    function notifyKeyState(state) {
      if (typeof d.onKeyStateChanged === "function") {
        try { d.onKeyStateChanged(state || {}); } catch (_) {}
      }
    }

    function applyCancelEffects(s) {
      if (s && s.previousModel != null && typeof d.onRevertModel === "function") {
        try { d.onRevertModel(s.previousModel); } catch (_) {}
      }
      // Never leave an Eleven model selected without a key (overlay/Escape/Cancel).
      if (typeof d.isElevenModelSelected === "function" && d.isElevenModelSelected() && !hasApiKey()) {
        if (typeof d.onNeedBrowserFallback === "function") {
          try { d.onNeedBrowserFallback(); } catch (_) {}
        }
      }
      paintApiKeyButton();
      notifyKeyState({ clearCache: !hasApiKey(), loadError: false, refreshList: true });
    }

    /**
     * Close the key modal. Optional returnToModal re-opens a real modal id;
     * sidebar tab / voices panel stay put without any return token.
     * @param {string|null|undefined} returnToModal
     */
    function finishModalUi(returnToModal) {
      closingInternally = true;
      try {
        if (returnToModal) d.openModal(returnToModal);
        else d.closeModals();
      } finally {
        closingInternally = false;
      }
    }

    /**
     * @param {{
     *   returnToModal?: string|null,
     *   previousModel?: string|null,
     *   pendingModel?: string|null
     * }} [opts]
     */
    function openApiKeyModal(opts) {
      const options = opts || {};
      // Sidebar tab / voices panel remain under this modal; only pass a modal id
      // when something must re-open after close.
      const returnToModal = options.returnToModal || null;

      session = {
        id: ++sessionSeq,
        returnToModal,
        previousModel: options.previousModel != null ? options.previousModel : null,
        pendingModel: options.pendingModel != null ? options.pendingModel : null,
        checking: false
      };

      if (apiKeyInput) apiKeyInput.value = getApiKey() || "";
      d.openModal(API_KEY_MODAL_ID);

      requestAnimationFrame(() => {
        try {
          if (!apiKeyInput || isCoarsePointerUi()) return;
          apiKeyInput.focus({ preventScroll: true });
          if (typeof apiKeyInput.select === "function" && apiKeyInput.value) {
            apiKeyInput.select();
          }
        } catch (_) {}
      });
    }

    /**
     * Shell closed modals (overlay / Escape / secondary). Run cancel if our session was live.
     */
    function onShellModalsClosed() {
      if (closingInternally) return;
      if (!session) return;
      const s = takeSession();
      applyCancelEffects(s);
    }

    async function closeApiKeyModal(saved) {
      if (!saved) {
        const s = takeSession();
        finishModalUi(s?.returnToModal ?? null);
        applyCancelEffects(s);
        return;
      }

      if (!session) {
        // Modal already dismissed; ignore late save.
        return;
      }

      const sid = session.id;
      const returnToModal = session.returnToModal;
      const pendingModel = session.pendingModel;
      const key = String(apiKeyInput?.value || "").trim();
      const saveBtn = $("save-api-key-btn");

      if (!key) {
        lsSet(KEY_STORAGE, "");
        if (apiKeyInput) apiKeyInput.value = "";
        const s = takeSession();
        finishModalUi(returnToModal);
        applyCancelEffects(s || { previousModel: null, pendingModel: null });
        paintApiKeyButton();
        return;
      }

      if (session) session.checking = true;
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Checking…";
      }

      try {
        const result = await Eleven.validateApiKey(key);
        if (!isSessionAlive(sid)) {
          // User dismissed while validating — do not apply key or reopen UI.
          return;
        }
        if (!result.ok) {
          if (result.reason === "invalid" || result.reason === "empty") {
            try {
              alert("That ElevenLabs API key is not valid. Please check and try again.");
            } catch (_) {}
            return;
          }
          if (result.reason === "network") {
            try {
              alert("Could not verify the API key (network error). Try again when online.");
            } catch (_) {}
            return;
          }
          try {
            alert("Could not verify the API key. Try again.");
          } catch (_) {}
          return;
        }

        takeSession();
        lsSet(KEY_STORAGE, key);
        paintApiKeyButton();
        notifyKeyState({
          voices: result.voices || [],
          loadError: false,
          clearCache: false,
          refreshList: true
        });
        if (pendingModel && typeof d.onCommitPendingModel === "function") {
          try { d.onCommitPendingModel(pendingModel); } catch (_) {}
        }
        finishModalUi(returnToModal);
      } finally {
        if (isSessionAlive(sid) && session) session.checking = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save key";
        }
      }
    }

    /**
     * Clear invalid/empty key and fall back to browser when on an Eleven model.
     * @param {{ clearKey?: boolean, silent?: boolean, message?: string, loadError?: boolean }} [opts]
     */
    function revokeAndFallback(opts) {
      const o = opts || {};
      if (o.clearKey !== false) {
        lsSet(KEY_STORAGE, "");
        if (apiKeyInput) apiKeyInput.value = "";
      }
      const loadError = o.loadError === true;
      paintApiKeyButton();
      notifyKeyState({
        clearCache: true,
        loadError,
        voices: [],
        refreshList: true
      });
      let wasEleven = false;
      if (typeof d.isElevenModelSelected === "function") {
        wasEleven = !!d.isElevenModelSelected();
      }
      if (wasEleven && typeof d.onNeedBrowserFallback === "function") {
        try { d.onNeedBrowserFallback(); } catch (_) {}
      }
      if (!o.silent) {
        const msg = o.message
          || "ElevenLabs API key is missing or invalid. Switched to browser voice.";
        try { alert(msg); } catch (_) {}
      }
      return wasEleven;
    }

    /** Alias kept for call sites that used Voices.handleInvalidElevenKey. */
    function handleInvalidElevenKey(opts) {
      return revokeAndFallback(opts);
    }

    function bind() {
      apiKeyBtn?.addEventListener("click", () => openApiKeyModal());
      $("save-api-key-btn")?.addEventListener("click", () => { closeApiKeyModal(true); });
      $("cancel-api-key-btn")?.addEventListener("click", () => { closeApiKeyModal(false); });
      apiKeyInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          closeApiKeyModal(true);
        }
      });
      paintApiKeyButton();
    }

    return {
      bind,
      hasApiKey,
      getApiKey,
      paintApiKeyButton,
      openApiKeyModal,
      closeApiKeyModal,
      onShellModalsClosed,
      revokeAndFallback,
      handleInvalidElevenKey,
      isSessionOpen: () => !!session,
      API_KEY_MODAL_ID
    };
  }

  global.AacElevenKey = {
    create,
    API_KEY_MODAL_ID,
    KEY_STORAGE
  };
})(typeof window !== "undefined" ? window : globalThis);
