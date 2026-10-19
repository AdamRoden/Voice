/**
 * ElevenLabs API key lifecycle: storage paint, modal open/save/cancel,
 * session tokens (dismiss vs in-flight validate), revoke → browser fallback,
 * and Link to ElevenLabs handoff (ElevenLabs copies a new key; this page saves it).
 */
(function (global) {
  "use strict";

  const API_KEY_MODAL_ID = "api-key-modal";
  const KEY_STORAGE = "elevenlabs_key";

  // Public PKCE client used by the ElevenLabs CLI. Authorize with
  // key_handoff=clipboard and the approval page copies a new sk_ key.
  const HANDOFF_CLIENT_ID = "c9c18126-5718-406a-8a12-21b69e5a888d";
  const HANDOFF_AUTHORIZE_URL = "https://elevenlabs.io/app/oauth/authorize";
  const HANDOFF_REDIRECT_URI = "http://localhost:8484/callback";
  const HANDOFF_SCOPES = ["text_to_speech", "voices_read", "user_read"];
  const QUICKSTART_URL = "https://elevenlabs.io/app/api/api-keys?quickstart=true";
  const HANDOFF_MARKERS = {
    "elevenlabs:not_permitted": "not_permitted",
    "elevenlabs:not_available": "not_available",
    "elevenlabs:failed": "failed"
  };

  function bytesToBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function rotr32(x, n) {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  /** @param {Uint8Array} bytes */
  function sha256(bytes) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);
    const bitLen = bytes.length * 8;
    let n = bytes.length + 1;
    while ((n % 64) !== 56) n++;
    n += 8;
    const buf = new Uint8Array(n);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    const view = new DataView(buf.buffer);
    view.setUint32(n - 8, Math.floor(bitLen / 0x100000000));
    view.setUint32(n - 4, bitLen >>> 0);
    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    const w = new Uint32Array(64);
    for (let i = 0; i < n; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (let t = 0; t < 64; t++) {
        const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        const ch = ((e & f) ^ ((~e) & g)) >>> 0;
        const temp1 = (h + s1 + ch + K[t] + w[t]) >>> 0;
        const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const temp2 = (s0 + maj) >>> 0;
        h = g; g = f; f = e;
        e = (d + temp1) >>> 0;
        d = c; c = b; b = a;
        a = (temp1 + temp2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    ov.setUint32(0, h0); ov.setUint32(4, h1); ov.setUint32(8, h2); ov.setUint32(12, h3);
    ov.setUint32(16, h4); ov.setUint32(20, h5); ov.setUint32(24, h6); ov.setUint32(28, h7);
    return out;
  }

  function codeChallengeForVerifier(verifier) {
    return bytesToBase64Url(sha256(new TextEncoder().encode(verifier)));
  }

  /**
   * Same shape the ElevenLabs CLI accepts from the approval-page clipboard.
   * @param {string} text
   */
  function isHandoffKey(text) {
    if (!text.startsWith("sk_")) return false;
    const rest = text.slice(3);
    let hex = 0;
    for (let i = 0; i < rest.length; i++) {
      const c = rest.charCodeAt(i);
      const digit = c >= 48 && c <= 57;
      const hexLetter = c >= 97 && c <= 102;
      if (!digit && !hexLetter) break;
      hex++;
    }
    if (hex < 20) return false;
    for (let i = 0; i < rest.length; i++) {
      const c = rest.charCodeAt(i);
      const ok = (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || c === 95;
      if (!ok) return false;
    }
    return true;
  }

  /**
   * @param {string} text
   * @returns {{ type: "key", key: string } | { type: "not_permitted" | "not_available" | "failed" | "nothing" }}
   */
  function classifyHandoffClip(text) {
    const value = String(text || "").trim();
    if (isHandoffKey(value)) return { type: "key", key: value };
    const marker = HANDOFF_MARKERS[value];
    if (marker === "not_permitted" || marker === "not_available" || marker === "failed") {
      return { type: marker };
    }
    return { type: "nothing" };
  }

  function buildHandoffAuthorizeUrl(challenge, state) {
    const url = new URL(HANDOFF_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", HANDOFF_CLIENT_ID);
    url.searchParams.set("redirect_uri", HANDOFF_REDIRECT_URI);
    url.searchParams.set("scope", HANDOFF_SCOPES.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("key_handoff", "clipboard");
    return url.toString();
  }

  function createHandoffUrl() {
    const cryptoObj = global.crypto;
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") return null;
    const verifier = bytesToBase64Url(cryptoObj.getRandomValues(new Uint8Array(32)));
    const challenge = codeChallengeForVerifier(verifier);
    const state = bytesToBase64Url(cryptoObj.getRandomValues(new Uint8Array(16)));
    return buildHandoffAuthorizeUrl(challenge, state);
  }

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
    /** @type {null | { popup: Window|null, onReturn: () => void, onPaste: (e: ClipboardEvent) => void }} */
    let handoff = null;
    let applyingHandoff = false;

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
        if (window.matchMedia && window.matchMedia("(orientation: portrait)").matches) return true;
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

      endHandoff();
      setHandoffStatus("");
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
      endHandoff();
      setHandoffStatus("");
      if (!session) return;
      const s = takeSession();
      applyCancelEffects(s);
    }

    function setHandoffStatus(text) {
      const el = $("api-key-handoff-status");
      if (!el) return;
      if (!text) {
        el.hidden = true;
        el.textContent = "";
        return;
      }
      el.hidden = false;
      el.textContent = text;
    }

    function setHandoffOpenLink(url) {
      const open = $("api-key-handoff-open");
      if (!open) return;
      if (!url) {
        open.hidden = true;
        open.removeAttribute("href");
        return;
      }
      open.href = url;
      open.hidden = false;
    }

    function setGetLabel(text) {
      const label = $("get-api-key-label");
      if (label) label.textContent = text;
      const btn = $("get-api-key-btn");
      if (btn) btn.disabled = false;
    }

    function endHandoff() {
      const current = handoff;
      handoff = null;
      if (current) {
        document.removeEventListener("visibilitychange", current.onReturn);
        window.removeEventListener("focus", current.onReturn);
        apiKeyInput?.removeEventListener("paste", current.onPaste);
      }
      setGetLabel("Link to ElevenLabs (Free)");
    }

    async function clearClipboardIf(key) {
      const clipboard = navigator.clipboard;
      if (!clipboard || !clipboard.readText || !clipboard.writeText) return;
      const current = await clipboard.readText();
      if (String(current || "").trim() !== key) return;
      await clipboard.writeText("");
    }

    async function acceptCreatedKey(key) {
      if (applyingHandoff || !session) return;
      applyingHandoff = true;
      const popup = handoff ? handoff.popup : null;
      if (apiKeyInput) apiKeyInput.value = key;
      setHandoffStatus("Checking the new key…");
      try {
        await closeApiKeyModal(true);
        if (getApiKey() === key) {
          if (popup) {
            try { popup.close(); } catch (_) {}
          }
          try { await clearClipboardIf(key); } catch (_) {}
        } else if (session) {
          setHandoffStatus("That key was not saved. Paste it below, or tap Link to ElevenLabs (Free) to try again.");
        }
      } finally {
        applyingHandoff = false;
      }
    }

    function explainHandoffMiss(type, popup) {
      endHandoff();
      setGetLabel("Link to ElevenLabs (Free)");
      if (type === "not_permitted") {
        setHandoffOpenLink("");
        setHandoffStatus("This ElevenLabs login can't create keys. Ask a workspace admin, or paste a key below.");
        return;
      }
      let opened = false;
      if (popup && !popup.closed) {
        try {
          popup.location.href = QUICKSTART_URL;
          opened = true;
        } catch (_) {}
      }
      if (!opened) setHandoffOpenLink(QUICKSTART_URL);
      if (session) armHandoff(opened ? popup : null);
      setHandoffStatus("ElevenLabs didn't copy a key. Create one on the key page and copy it. This app saves it when you come back, or tap Save the copied key.");
    }

    function applyHandoffClip(text) {
      const clip = classifyHandoffClip(text);
      if (clip.type === "key") {
        acceptCreatedKey(clip.key);
        return true;
      }
      if (clip.type === "not_permitted" || clip.type === "not_available" || clip.type === "failed") {
        const popup = handoff ? handoff.popup : null;
        explainHandoffMiss(clip.type, popup);
        return true;
      }
      return false;
    }

    async function pullHandoffClipboard() {
      if (!handoff || applyingHandoff) return false;
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch (_) {
        return false;
      }
      if (!handoff || applyingHandoff) return false;
      return applyHandoffClip(text);
    }

    function armHandoff(popup) {
      const onReturn = () => {
        if (!handoff || document.visibilityState === "hidden") return;
        pullHandoffClipboard();
      };
      const onPaste = (e) => {
        const text = e.clipboardData && e.clipboardData.getData("text");
        if (classifyHandoffClip(text).type !== "key") return;
        e.preventDefault();
        acceptCreatedKey(classifyHandoffClip(text).key);
      };
      handoff = { popup: popup || null, onReturn, onPaste };
      document.addEventListener("visibilitychange", onReturn);
      window.addEventListener("focus", onReturn);
      apiKeyInput?.addEventListener("paste", onPaste);
      setGetLabel("Save the copied key");
    }

    function beginHandoff() {
      if (!session) return;
      let target = QUICKSTART_URL;
      let oauth = false;
      try {
        const oauthUrl = createHandoffUrl();
        if (oauthUrl) {
          target = oauthUrl;
          oauth = true;
        }
      } catch (_) {}
      const popup = window.open(target, "aac-elevenlabs-key");
      if (popup && !popup.closed) {
        setHandoffOpenLink("");
        armHandoff(popup);
        setHandoffStatus(oauth
          ? "Sign in and tap Authorize. Come back here and the key is saved. If that tab cannot open localhost, close it. If the key is not saved, tap Save the copied key."
          : "Create the key in the ElevenLabs tab and copy it, then tap Save the copied key.");
        return;
      }
      setHandoffOpenLink(target);
      armHandoff(null);
      setHandoffStatus("The browser blocked the tab. Open ElevenLabs, approve the key, then tap Save the copied key.");
    }

    async function closeApiKeyModal(saved) {
      endHandoff();
      if (!saved) setHandoffStatus("");
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
      const getBtn = $("get-api-key-btn");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Checking…";
      }
      if (getBtn) getBtn.disabled = true;

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
        if (getBtn && !handoff) getBtn.disabled = false;
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

    /**
     * On each page load, open the link prompt unless a saved key is accepted
     * by ElevenLabs. A network failure leaves a saved key in place.
     */
    function promptOnLoad() {
      const key = getApiKey();
      if (!key) {
        openApiKeyModal();
        return;
      }
      const checked = key;
      Eleven.validateApiKey(checked).then((result) => {
        if (session) return;
        if (getApiKey() !== checked) return;
        if (document.querySelector(".modal.open")) return;
        if (result && result.ok) {
          notifyKeyState({
            voices: result.voices || [],
            loadError: false,
            clearCache: false,
            refreshList: true
          });
          return;
        }
        if (!result || (result.reason !== "invalid" && result.reason !== "empty")) return;
        lsSet(KEY_STORAGE, "");
        if (apiKeyInput) apiKeyInput.value = "";
        paintApiKeyButton();
        notifyKeyState({
          clearCache: true,
          voices: [],
          loadError: false,
          refreshList: true
        });
        openApiKeyModal();
      }).catch(() => {});
    }

    function bind() {
      apiKeyBtn?.addEventListener("click", () => openApiKeyModal());
      $("get-api-key-btn")?.addEventListener("click", () => {
        if (applyingHandoff) return;
        if (handoff) {
          setHandoffStatus("Looking for the copied key…");
          pullHandoffClipboard().then((found) => {
            if (!handoff) return;
            if (!found) {
              setHandoffStatus("No key on the clipboard yet. Finish Authorize on the ElevenLabs tab, then tap Save the copied key again.");
            }
          });
          return;
        }
        beginHandoff();
      });
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
      promptOnLoad,
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
    KEY_STORAGE,
    isHandoffKey,
    classifyHandoffClip,
    buildHandoffAuthorizeUrl,
    codeChallengeForVerifier,
    QUICKSTART_URL
  };
})(typeof window !== "undefined" ? window : globalThis);
