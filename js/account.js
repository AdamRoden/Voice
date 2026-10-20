/**
 * Account sign-in and profile sync for Firebase project voice-1d8a8.
 * Local boards keep working offline. A signed-in profile is stored in Firestore
 * and merged back by per-key time so another device can open the same boards.
 */
(function (global) {
  "use strict";

  const Sync = global.AacAccountSync;
  const Google = global.AacGoogleSignIn;
  if (!Sync) return;

  const storage = installStorageHook();
  let session = null;
  let busy = false;
  let editGen = 0;
  let pushTimer = 0;
  let pollTimer = 0;
  let syncing = false;
  let syncQueued = false;
  let bannerAction = "";

  function installStorageHook() {
    const ls = global.localStorage;
    const origSet = ls.setItem.bind(ls);
    const origRemove = ls.removeItem.bind(ls);
    const origGet = ls.getItem.bind(ls);
    ls.setItem = function (key, value) {
      origSet(key, value);
      if (Sync.isSyncKey(key)) onLocalChange(String(key), value == null ? null : String(value));
    };
    ls.removeItem = function (key) {
      origRemove(key);
      if (Sync.isSyncKey(key)) onLocalChange(String(key), null);
    };
    return {
      get: origGet,
      set: origSet,
      remove: origRemove
    };
  }

  function makeId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function readMeta() {
    let raw = null;
    try {
      raw = JSON.parse(storage.get(Sync.META_KEY) || "null");
    } catch (_) {
      raw = null;
    }
    const meta = Sync.normalizeMeta(raw);
    if (!meta.deviceId) {
      meta.deviceId = makeId();
      writeMeta(meta);
    }
    return meta;
  }

  function writeMeta(meta) {
    try {
      storage.set(Sync.META_KEY, JSON.stringify(meta));
    } catch (_) {}
  }

  function readSession() {
    if (session) return session;
    try {
      const raw = JSON.parse(storage.get(Sync.SESSION_KEY) || "null");
      if (raw && raw.idToken && raw.refreshToken && raw.localId) session = raw;
    } catch (_) {
      session = null;
    }
    return session;
  }

  function writeSession(next) {
    session = next;
    try {
      if (!next) storage.remove(Sync.SESSION_KEY);
      else storage.set(Sync.SESSION_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function projectId() {
    const cfg = global.AacFirebaseConfig || {};
    return String(cfg.projectId || Sync.PROJECT_ID).trim() || Sync.PROJECT_ID;
  }

  function webApiKey() {
    const cfg = global.AacFirebaseConfig || {};
    const fromFile = String(cfg.apiKey || "").trim();
    if (fromFile.length >= 20) return fromFile;
    try {
      return String(storage.get(Sync.API_KEY_STORAGE) || "").trim();
    } catch (_) {
      return "";
    }
  }

  function onLocalChange(key, value) {
    const meta = readMeta();
    if (meta.keyHashes && meta.keyHashes[key] === Sync.hashValue(value)) return;
    editGen += 1;
    meta.times[key] = Date.now();
    writeMeta(meta);
    if (!readSession() || meta.pendingConflict) return;
    schedulePush(1500);
  }

  function schedulePush(ms) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = 0;
      sync({ reason: "edit" });
    }, ms == null ? 1500 : ms);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text, kind) {
    const el = $("account-status");
    if (!el) return;
    el.textContent = text || "";
    if (kind) el.dataset.kind = kind;
    else delete el.dataset.kind;
  }

  function show(id, on) {
    const el = $(id);
    if (el) el.hidden = !on;
  }

  function paint() {
    const current = readSession();
    const meta = readMeta();
    const signedIn = !!current;
    const conflict = signedIn && !!meta.pendingConflict;
    const needsKey = webApiKey().length < 20;
    show("account-setup", needsKey);
    show("account-signed-out", !signedIn && !needsKey);
    show("account-signed-in", signedIn && !conflict);
    show("account-conflict", conflict);
    const email = current && current.email ? String(current.email) : "";
    const label = email || "Signed in";
    const line = $("account-email-line");
    if (line) line.textContent = signedIn ? label : "";
    const avatar = $("account-avatar");
    if (avatar) avatar.textContent = email.trim().charAt(0).toUpperCase() || "?";
    const conflictLine = $("account-conflict-email");
    if (conflictLine) conflictLine.textContent = signedIn ? label : "";
  }

  function setBusy(on) {
    busy = !!on;
    [
      "account-google", "account-signin", "account-create", "account-forgot", "account-sync",
      "account-signout", "account-keep-device", "account-use-cloud",
      "account-combine", "account-api-key-save", "account-banner-action"
    ].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = !!on;
    });
  }

  function showBanner(text, action, buttonLabel) {
    const banner = $("account-banner");
    const label = $("account-banner-text");
    const button = $("account-banner-action");
    if (!banner) return;
    bannerAction = action || "";
    if (label) label.textContent = text || "";
    if (button) {
      button.hidden = !action;
      button.textContent = buttonLabel || "Apply";
    }
    banner.classList.add("open");
  }

  function hideBanner() {
    const banner = $("account-banner");
    bannerAction = "";
    if (!banner) return;
    banner.classList.remove("open");
  }

  /** Unsaved message text, or a dialog, would be wiped by a reload. */
  function composerIsDirty() {
    const box = $("display-input");
    if (!box) return false;
    const typed = String(box.value || "");
    let chats = null;
    try {
      const raw = storage.get("aac_chats");
      chats = raw ? JSON.parse(raw) : [];
    } catch (_) {
      return typed.length > 0;
    }
    if (!Array.isArray(chats) || !chats.length) return typed.length > 0;
    let index = parseInt(storage.get("aac_active_chat") || "0", 10);
    if (!Number.isFinite(index) || index < 0 || index >= chats.length) index = 0;
    const saved = chats[index] && chats[index].text != null ? String(chats[index].text) : "";
    return typed !== saved;
  }

  function dialogOpen() {
    if (document.querySelector(".modal.open")) return true;
    const overlay = $("modal-overlay");
    return !!(overlay && overlay.classList.contains("open"));
  }

  function canAutoReload() {
    return !dialogOpen() && !composerIsDirty();
  }

  function openSettings() {
    const nav = $("nav-settings");
    if (nav) nav.click();
  }

  function snapshot() {
    return Sync.snapshotFromStorage(storage.get);
  }

  function authUrl(method) {
    return "https://identitytoolkit.googleapis.com/v1/accounts:" + method + "?key=" + encodeURIComponent(webApiKey());
  }

  async function readBody(res) {
    try {
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function networkMessage(err) {
    if (err && err.userMessage) return err.userMessage;
    return "Could not reach the account service. Check your connection.";
  }

  async function authPost(method, body, action) {
    let res;
    try {
      res = await fetch(authUrl(method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (_) {
      const err = new Error("network");
      err.userMessage = networkMessage();
      throw err;
    }
    const data = await readBody(res);
    if (!res.ok) {
      const err = new Error("auth");
      const fallback = method === "signUp" ? "create" : "sign-in";
      err.userMessage = Sync.authErrorMessage(data && data.error && data.error.message, action || fallback);
      throw err;
    }
    return data;
  }

  function sessionFromAuth(data, fallbackEmail) {
    const seconds = parseInt(data.expiresIn, 10);
    return {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000,
      localId: data.localId,
      email: data.email || fallbackEmail || ""
    };
  }

  async function refresh(current) {
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", current.refreshToken);
    let res;
    try {
      res = await fetch("https://securetoken.googleapis.com/v1/token?key=" + encodeURIComponent(webApiKey()), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      });
    } catch (_) {
      const err = new Error("network");
      err.userMessage = networkMessage();
      throw err;
    }
    const data = await readBody(res);
    if (!res.ok) {
      const message = (data && (data.error_description || (data.error && data.error.message) || data.error)) || "";
      const err = new Error("refresh");
      if (/INVALID_REFRESH_TOKEN|TOKEN_EXPIRED|invalid_grant/i.test(String(message))) {
        err.userMessage = "Sign in again.";
        err.signedOut = true;
      } else {
        err.userMessage = Sync.authErrorMessage(message, "sign-in");
      }
      throw err;
    }
    const seconds = parseInt(data.expires_in, 10);
    return {
      idToken: data.id_token,
      refreshToken: data.refresh_token || current.refreshToken,
      expiresAt: Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000,
      localId: data.user_id || current.localId,
      email: current.email || ""
    };
  }

  async function ensureToken(force) {
    const current = readSession();
    if (!current) return "";
    if (!force && current.expiresAt - Date.now() > 60000) return current.idToken;
    const next = await refresh(current);
    writeSession(next);
    return next.idToken;
  }

  function profileUrl(uid) {
    return "https://firestore.googleapis.com/v1/projects/" + encodeURIComponent(projectId())
      + "/databases/(default)/documents/profiles/" + encodeURIComponent(uid);
  }

  async function fetchProfile(idToken, uid) {
    let res;
    try {
      res = await fetch(profileUrl(uid), {
        headers: { Authorization: "Bearer " + idToken }
      });
    } catch (_) {
      const err = new Error("network");
      err.userMessage = networkMessage();
      throw err;
    }
    const data = await readBody(res);
    if (res.status === 404) {
      const message = data && data.error && data.error.message || "";
      if (/database/i.test(message) && /does not exist|NOT_FOUND/i.test(message)) {
        const err = new Error("firestore");
        err.userMessage = Sync.firestoreErrorMessage(404, message);
        throw err;
      }
      return null;
    }
    if (res.status === 401) {
      const err = new Error("auth");
      err.unauthenticated = true;
      err.userMessage = "Sign in again.";
      throw err;
    }
    if (!res.ok) {
      const err = new Error("firestore");
      err.userMessage = Sync.firestoreErrorMessage(res.status, data && data.error && data.error.message);
      throw err;
    }
    const decoded = Sync.decodeProfileDoc(data);
    if (!decoded) {
      const err = new Error("firestore");
      err.userMessage = "The saved profile could not be read.";
      throw err;
    }
    return decoded;
  }

  async function putProfile(idToken, uid, plan, deviceId) {
    const url = new URL(profileUrl(uid));
    ["rev", "updatedAt", "deviceId", "payload"].forEach((field) => {
      url.searchParams.append("updateMask.fieldPaths", field);
    });
    if (plan.updateTime) url.searchParams.set("currentDocument.updateTime", plan.updateTime);
    else url.searchParams.set("currentDocument.exists", "false");
    const body = Sync.encodeProfileDoc({
      rev: plan.rev,
      updatedAt: new Date().toISOString(),
      deviceId,
      keys: plan.uploadKeys,
      times: plan.times
    });
    let res;
    try {
      res = await fetch(url.toString(), {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + idToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (_) {
      const err = new Error("network");
      err.userMessage = networkMessage();
      throw err;
    }
    const data = await readBody(res);
    if (!res.ok) {
      const message = data && data.error && data.error.message || "";
      const code = data && data.error && data.error.status || "";
      const err = new Error("firestore");
      err.conflict = res.status === 409 || res.status === 412 || code === "ABORTED" || code === "FAILED_PRECONDITION";
      err.unauthenticated = res.status === 401;
      err.userMessage = err.conflict
        ? "The account changed while saving. Trying again."
        : Sync.firestoreErrorMessage(res.status, message);
      throw err;
    }
    return Sync.decodeProfileDoc(data) || { rev: plan.rev, updateTime: data && data.updateTime || null };
  }

  function savedMessage(plan) {
    if (plan && plan.stripped && Object.keys(plan.stripped).length) {
      return "Saved to your account. Large audio stayed on this device.";
    }
    return "Saved to your account.";
  }

  function applyLocal(plan) {
    plan.applied.forEach((key) => {
      if (plan.keys[key] == null) storage.remove(key);
      else storage.set(key, plan.keys[key]);
    });
  }

  function commitMeta(meta, plan, deviceKeys) {
    meta.bootstrapped = true;
    meta.pendingConflict = false;
    meta.ackedRev = plan.rev;
    meta.times = plan.times || {};
    meta.keyHashes = Sync.hashAll(deviceKeys);
    meta.stripped = plan.stripped || {};
    meta.uid = readSession() ? readSession().localId : meta.uid;
    writeMeta(meta);
  }

  /**
   * Remember keys that were uploaded while a reload is waiting.
   * Leave clocks for keys that still need to come down from the account,
   * or the next sync would treat this device's older copy as the winner.
   */
  function noteUpload(meta, plan, localKeys) {
    if (!plan.dirty.length) return;
    const times = Sync.normalizeTimes(meta.times);
    plan.dirty.forEach((key) => {
      times[key] = plan.times[key] || times[key];
    });
    meta.times = times;
    meta.keyHashes = Sync.hashAll(localKeys);
    meta.stripped = plan.stripped || {};
    meta.bootstrapped = true;
    meta.pendingConflict = false;
    meta.uid = readSession() ? readSession().localId : meta.uid;
    writeMeta(meta);
  }

  function reloadApp() {
    try {
      global.location.reload();
    } catch (_) {}
  }

  async function sync(opts) {
    opts = opts || {};
    if (syncing) {
      syncQueued = true;
      return;
    }
    syncing = true;
    try {
      await syncBody(opts);
    } catch (err) {
      if (err && err.signedOut) {
        clearSession();
        paint();
      }
      setStatus(networkMessage(err), "error");
    } finally {
      syncing = false;
      if (syncQueued) {
        syncQueued = false;
        schedulePush(50);
      }
    }
  }

  async function syncBody(opts) {
    if (!readSession()) {
      paint();
      return;
    }
    if (global.location && global.location.protocol === "file:") {
      setStatus("Open this app from a web address to sign in.", "error");
      return;
    }
    if (webApiKey().length < 20) {
      paint();
      return;
    }
    if (global.navigator && global.navigator.onLine === false) {
      if (!opts.quiet) setStatus("Offline. This device keeps its copy until you are back online.");
      return;
    }

    let token;
    try {
      token = await ensureToken(false);
    } catch (err) {
      if (err && err.signedOut) {
        clearSession();
        paint();
      }
      throw err;
    }

    const current = readSession();
    let meta = Sync.scopeMetaToUser(readMeta(), current.localId);
    if (meta.pendingConflict && !opts.choice) {
      paint();
      showBanner("This device and your account both have boards. Open Settings to choose.", "settings", "Choose");
      return;
    }

    let remote = null;
    try {
      remote = await fetchProfile(token, current.localId);
    } catch (err) {
      if (err && err.unauthenticated) {
        token = await ensureToken(true);
        remote = await fetchProfile(token, current.localId);
      } else {
        throw err;
      }
    }

    const localKeys = snapshot();
    let plan;
    if (opts.choice) {
      plan = Sync.planFromChoice(opts.choice, localKeys, remote, Date.now());
    } else {
      plan = Sync.planSync({ localKeys, meta, remote, now: Date.now() });
    }

    if (plan.action === "ask") {
      meta.pendingConflict = true;
      meta.uid = current.localId;
      writeMeta(meta);
      paint();
      showBanner("This device and your account both have boards. Open Settings to choose.", "settings", "Choose");
      setStatus("Choose which boards to keep.");
      return;
    }

    if (plan.tooBig && plan.dirty.length) {
      setStatus("These boards are too large to save to the account. Export a backup, or remove large audio clips.", "error");
      return;
    }

    if (plan.action === "noop") {
      if (meta.ackedRev !== plan.rev || !meta.bootstrapped) {
        meta.bootstrapped = true;
        meta.ackedRev = plan.rev;
        meta.uid = current.localId;
        meta.pendingConflict = false;
        writeMeta(meta);
      }
      hideBanner();
      paint();
      if (!opts.quiet) setStatus("Saved to your account.");
      return;
    }

    const gen = editGen;
    if (plan.dirty.length) {
      try {
        const saved = await putProfile(token, current.localId, plan, meta.deviceId);
        if (saved && saved.rev) plan.rev = saved.rev;
      } catch (err) {
        if (err && err.conflict) {
          schedulePush(200);
          if (!opts.quiet) setStatus(err.userMessage);
          return;
        }
        if (err && err.unauthenticated) {
          token = await ensureToken(true);
          const saved = await putProfile(token, current.localId, plan, meta.deviceId);
          if (saved && saved.rev) plan.rev = saved.rev;
        } else {
          throw err;
        }
      }
    }

    if (editGen !== gen) {
      schedulePush(80);
      return;
    }

    if (plan.reload) {
      if (opts.forceReload || canAutoReload()) {
        applyLocal(plan);
        commitMeta(meta, plan, plan.keys);
        hideBanner();
        reloadApp();
        return;
      }
      noteUpload(meta, plan, localKeys);
      if (composerIsDirty()) {
        showBanner("Your account has newer boards.", "apply", "Apply");
        if (!opts.quiet) setStatus("Your account has newer boards. Apply them when you are ready.");
      } else {
        hideBanner();
      }
      paint();
      return;
    }

    commitMeta(meta, plan, localKeys);
    hideBanner();
    paint();
    setStatus(savedMessage(plan));
  }

  function clearSession() {
    if (pushTimer) clearTimeout(pushTimer);
    if (pollTimer) clearInterval(pollTimer);
    pushTimer = 0;
    pollTimer = 0;
    writeSession(null);
    const meta = readMeta();
    meta.pendingConflict = false;
    writeMeta(meta);
    hideBanner();
  }

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      sync({ reason: "poll", quiet: true });
    }, 20000);
  }

  function emailValue() {
    return String(($("account-email") && $("account-email").value) || "").trim().toLowerCase();
  }

  function passwordValue() {
    return String(($("account-password") && $("account-password").value) || "");
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function signInOrCreate(kind) {
    if (busy) return;
    if (global.location && global.location.protocol === "file:") {
      setStatus("Open this app from a web address to sign in.", "error");
      return;
    }
    const email = emailValue();
    const password = passwordValue();
    if (!validEmail(email)) {
      setStatus("Enter a valid email address.", "error");
      return;
    }
    if (!password) {
      setStatus("Enter a password.", "error");
      return;
    }
    if (kind === "create" && password.length < 6) {
      setStatus("Use at least 6 characters.", "error");
      return;
    }
    setBusy(true);
    setStatus(kind === "create" ? "Creating account…" : "Signing in…");
    try {
      const data = await authPost(kind === "create" ? "signUp" : "signInWithPassword", {
        email,
        password,
        returnSecureToken: true
      });
      writeSession(sessionFromAuth(data, email));
      const passwordInput = $("account-password");
      if (passwordInput) passwordInput.value = "";
      paint();
      startPoll();
      setStatus("Signed in. Syncing…");
      await sync({ reason: "sign-in" });
    } catch (err) {
      setStatus(networkMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (busy) return;
    const email = emailValue();
    if (!validEmail(email)) {
      setStatus("Enter a valid email address.", "error");
      return;
    }
    setBusy(true);
    setStatus("Sending reset message…");
    try {
      await authPost("sendOobCode", { requestType: "PASSWORD_RESET", email }, "reset");
      setStatus("If that email has an account, a reset message is on the way.");
    } catch (err) {
      const raw = networkMessage(err);
      if (raw.indexOf("If that email") === 0) setStatus(raw);
      else setStatus(raw || "Could not send a reset message.", "error");
    } finally {
      setBusy(false);
    }
  }

  function googleOptions() {
    return {
      apiKey: webApiKey(),
      projectId: projectId(),
      config: global.AacFirebaseConfig || {}
    };
  }

  async function signInWithGoogle() {
    if (busy) return;
    if (!Google) {
      setStatus("Google sign-in is not available in this copy of the app.", "error");
      return;
    }
    setBusy(true);
    setStatus("Opening Google…");
    try {
      await Google.start(googleOptions());
    } catch (err) {
      setStatus(err && err.userMessage || "Could not sign in with Google.", "error");
      setBusy(false);
    }
  }

  async function resumeGoogle() {
    if (!Google) return false;
    try {
      const back = await Google.resume(googleOptions());
      if (back && back.session) {
        writeSession(back.session);
        paint();
        setStatus("Signed in. Syncing…");
        return true;
      }
      if (back && back.cancelled && !readSession()) setStatus("Google sign-in was cancelled.");
      return false;
    } catch (err) {
      setStatus(err && err.userMessage || "Could not sign in with Google.", "error");
      return false;
    }
  }

  function signOut() {
    clearSession();
    paint();
    setStatus("Signed out. This device keeps its copy.");
  }

  function saveApiKey() {
    const input = $("account-api-key");
    const key = String(input && input.value || "").trim();
    if (key.length < 20) {
      setStatus("Paste the web API key from Firebase project " + projectId() + ".", "error");
      return;
    }
    try {
      storage.set(Sync.API_KEY_STORAGE, key);
    } catch (_) {
      setStatus("Could not store the API key on this device.", "error");
      return;
    }
    if (input) input.value = "";
    paint();
    setStatus("API key saved on this device.");
  }

  function activateBanner() {
    if (bannerAction === "settings") {
      openSettings();
      return;
    }
    if (bannerAction === "apply") {
      setStatus("Applying your account…");
      sync({ reason: "apply", forceReload: true });
    }
  }

  function bind() {
    $("account-google")?.addEventListener("click", () => signInWithGoogle());
    $("account-signin")?.addEventListener("click", () => signInOrCreate("sign-in"));
    $("account-create")?.addEventListener("click", () => signInOrCreate("create"));
    $("account-forgot")?.addEventListener("click", () => forgotPassword());
    $("account-signout")?.addEventListener("click", () => signOut());
    $("account-sync")?.addEventListener("click", () => {
      setStatus("Syncing…");
      sync({ reason: "manual" });
    });
    $("account-keep-device")?.addEventListener("click", () => {
      setStatus("Saving this device to your account…");
      sync({ reason: "choice", choice: "device", forceReload: true });
    });
    $("account-use-cloud")?.addEventListener("click", () => {
      setStatus("Opening the account copy…");
      sync({ reason: "choice", choice: "account", forceReload: true });
    });
    $("account-combine")?.addEventListener("click", () => {
      setStatus("Combining boards…");
      sync({ reason: "choice", choice: "merge", forceReload: true });
    });
    $("account-api-key-save")?.addEventListener("click", () => saveApiKey());
    ["account-email", "account-password"].forEach((id) => {
      $(id)?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          signInOrCreate("sign-in");
        }
      });
    });
    $("account-banner-action")?.addEventListener("click", (event) => {
      event.stopPropagation();
      activateBanner();
    });
    $("account-banner")?.addEventListener("click", () => activateBanner());
    document.addEventListener("visibilitychange", () => {
      if (!readSession()) return;
      if (document.visibilityState === "visible") sync({ reason: "show", quiet: true });
    });
    global.addEventListener("online", () => {
      if (readSession()) sync({ reason: "online" });
    });
    global.addEventListener("offline", () => {
      if (readSession()) setStatus("Offline. This device keeps its copy until you are back online.");
    });
  }

  function boot() {
    bind();
    paint();
    resumeGoogle().then((resumed) => {
      if (!readSession()) return;
      startPoll();
      // The message box and Help are painted by a later DOMContentLoaded
      // listener. Wait until that finishes before deciding to reload.
      setTimeout(() => {
        if (!readSession()) return;
        setStatus(resumed ? "Signed in. Syncing…" : "Syncing…");
        sync({ reason: resumed ? "sign-in" : "boot" });
      }, 0);
    });
  }

  // Defer scripts run at readyState "interactive", before the message box
  // is filled and before Help opens. Syncing then leaves the banner up.
  if (document.readyState === "complete") boot();
  else document.addEventListener("DOMContentLoaded", boot);

  global.AacAccount = {
    webApiKey,
    readMeta,
    snapshot
  };
})(typeof window !== "undefined" ? window : globalThis);
