/**
 * Link to ElevenLabs. The approval page copies a new sk_ key; this page reads
 * that clipboard when the user comes back. The OAuth code is never exchanged.
 * The PKCE challenge is only a ticket the approval page requires.
 */
(function (global) {
  "use strict";

  const HANDOFF_CLIENT_ID = "c9c18126-5718-406a-8a12-21b69e5a888d";
  const HANDOFF_AUTHORIZE_URL = "https://elevenlabs.io/app/oauth/authorize";
  // This public client only allows the localhost callback. eleven-callback/sw.js
  // answers it and closes the tab. Register that worker with tools/eleven-callback-install.js.
  const HANDOFF_REDIRECT_URI = "http://localhost:8484/callback";
  const HANDOFF_SCOPES = ["text_to_speech", "voices_read", "user_read"];
  const QUICKSTART_URL = "https://elevenlabs.io/app/api/api-keys?quickstart=true";
  const HANDOFF_MARKERS = {
    "elevenlabs:not_permitted": "not_permitted",
    "elevenlabs:not_available": "not_available",
    "elevenlabs:failed": "failed"
  };

  const STATUS_SIGN_IN = "Sign in and tap Authorize. This page saves the key when you come back. If a localhost page stays open, close it. If the key is not saved, tap Link to ElevenLabs (Free) again.";
  const STATUS_QUICKSTART = "Create the key in the ElevenLabs tab and copy it, then tap Link to ElevenLabs (Free) again.";
  const STATUS_BLOCKED = "The browser blocked the tab. Open ElevenLabs, approve the key, then tap Link to ElevenLabs (Free) again.";
  const STATUS_LOOKING = "Looking for the copied key…";
  const STATUS_MISSING = "No key on the clipboard yet. Finish Authorize on the ElevenLabs tab, then tap Link to ElevenLabs (Free) again.";
  const STATUS_NOT_PERMITTED = "This ElevenLabs login can't create keys. Ask a workspace admin, or paste a key below.";
  const STATUS_MISS = "ElevenLabs didn't copy a key. Create one on the key page and copy it. This app saves it when you come back, or tap Link to ElevenLabs (Free) again.";

  function bytesToBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  /** Clipboard shape the ElevenLabs approval page writes for a new key. */
  function isHandoffKey(text) {
    return /^sk_[0-9a-f]{20,}[0-9a-z_]*$/.test(text);
  }

  /**
   * @param {string} text
   * @returns {{ type: "key", key: string } | { type: "not_permitted" | "not_available" | "failed" | "nothing" }}
   */
  function classifyHandoffClip(text) {
    const value = String(text || "").trim();
    if (isHandoffKey(value)) return { type: "key", key: value };
    const marker = HANDOFF_MARKERS[value];
    if (marker) return { type: marker };
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

  async function createHandoffUrl() {
    const cryptoObj = global.crypto;
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") return null;
    const subtle = cryptoObj.subtle;
    if (!subtle || typeof subtle.digest !== "function") return null;
    const verifierBytes = cryptoObj.getRandomValues(new Uint8Array(32));
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(bytesToBase64Url(verifierBytes)));
    const challenge = bytesToBase64Url(new Uint8Array(digest));
    const state = bytesToBase64Url(cryptoObj.getRandomValues(new Uint8Array(16)));
    return buildHandoffAuthorizeUrl(challenge, state);
  }

  /**
   * @param {{
   *   $: (id: string) => HTMLElement|null,
   *   onKey: (key: string) => void|Promise<void>
   * }} deps
   */
  function create(deps) {
    const $ = deps && deps.$;
    const onKey = deps && deps.onKey;
    if (typeof $ !== "function" || typeof onKey !== "function") {
      throw new Error("AacElevenHandoff requires $ and onKey");
    }

    /** @type {null | { popup: Window|null, onReturn: () => void, onPaste: (e: ClipboardEvent) => void }} */
    let armed = null;
    let busy = false;
    let opening = false;

    function setStatus(text) {
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

    function setOpenLink(url) {
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

    function detach(current) {
      document.removeEventListener("visibilitychange", current.onReturn);
      window.removeEventListener("focus", current.onReturn);
      $("api-key-input")?.removeEventListener("paste", current.onPaste);
    }

    function stop() {
      const current = armed;
      armed = null;
      if (current) detach(current);
      setOpenLink("");
    }

    function arm(popup) {
      const previous = armed;
      if (previous) detach(previous);
      const onReturn = () => {
        if (!armed || document.visibilityState === "hidden") return;
        pull();
      };
      const onPaste = (e) => {
        const text = e.clipboardData && e.clipboardData.getData("text");
        const clip = classifyHandoffClip(text);
        if (clip.type !== "key") return;
        e.preventDefault();
        deliverKey(clip.key);
      };
      armed = { popup: popup || null, onReturn, onPaste };
      document.addEventListener("visibilitychange", onReturn);
      window.addEventListener("focus", onReturn);
      $("api-key-input")?.addEventListener("paste", onPaste);
    }

    async function readClipboard() {
      try {
        return await navigator.clipboard.readText();
      } catch (_) {
        return null;
      }
    }

    async function clearClipboard(key) {
      if (!key) return;
      const clipboard = navigator.clipboard;
      if (!clipboard || !clipboard.readText || !clipboard.writeText) return;
      const current = await clipboard.readText();
      if (String(current || "").trim() !== key) return;
      await clipboard.writeText("");
    }

    async function deliverKey(key) {
      if (busy) return;
      busy = true;
      try {
        await onKey(key);
      } finally {
        busy = false;
      }
    }

    function explainMiss(type, popup) {
      const live = popup && !popup.closed ? popup : null;
      stop();
      if (type === "not_permitted") {
        setStatus(STATUS_NOT_PERMITTED);
        return;
      }
      let opened = false;
      if (live) {
        try {
          live.location.href = QUICKSTART_URL;
          opened = true;
        } catch (_) {}
      }
      if (!opened) setOpenLink(QUICKSTART_URL);
      arm(opened ? live : null);
      setStatus(STATUS_MISS);
    }

    async function pull() {
      if (!armed || busy) return false;
      const text = await readClipboard();
      if (text == null || !armed || busy) return false;
      const clip = classifyHandoffClip(text);
      if (clip.type === "key") {
        await deliverKey(clip.key);
        return true;
      }
      if (clip.type === "nothing") return false;
      const popup = armed ? armed.popup : null;
      explainMiss(clip.type, popup);
      return true;
    }

    async function openTab() {
      let target = QUICKSTART_URL;
      let oauth = false;
      try {
        const oauthUrl = await createHandoffUrl();
        if (oauthUrl) {
          target = oauthUrl;
          oauth = true;
        }
      } catch (_) {}
      const popup = window.open(target, "aac-elevenlabs-key");
      const opened = !!(popup && !popup.closed);
      arm(opened ? popup : null);
      if (opened) setOpenLink("");
      else setOpenLink(target);
      setStatus(!opened ? STATUS_BLOCKED : (oauth ? STATUS_SIGN_IN : STATUS_QUICKSTART));
    }

    /**
     * Open the ElevenLabs tab when it is not already open, then read the clipboard.
     * Progress stays in the status line. The button label does not change.
     */
    async function activate() {
      if (busy || opening) return;
      opening = true;
      try {
        const already = !!(armed && armed.popup && !armed.popup.closed);
        if (already) setStatus(STATUS_LOOKING);
        else await openTab();
        const found = await pull();
        if (found || !armed || !already) return;
        setStatus(STATUS_MISSING);
      } finally {
        opening = false;
      }
    }

    async function finish(key) {
      const popup = armed && armed.popup;
      const wasArmed = !!armed;
      stop();
      if (popup && !popup.closed) {
        try { popup.close(); } catch (_) {}
      }
      if (!wasArmed) return;
      try { await clearClipboard(key); } catch (_) {}
    }

    return {
      activate,
      stop,
      finish,
      setStatus,
      clearClipboard
    };
  }

  global.AacElevenHandoff = { create };
})(typeof window !== "undefined" ? window : globalThis);
