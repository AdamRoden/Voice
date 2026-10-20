/**
 * Google sign-in for Firebase project voice-1d8a8.
 * The Firebase Auth scripts load on the first Continue with Google click,
 * and again only when the browser is returning from that redirect.
 * Email sign-in stays on the Identity Toolkit REST API in account.js.
 */
(function (global) {
  "use strict";

  const PENDING_KEY = "aac_sso_pending";
  const FIREBASE_JS_VERSION = "10.14.1";
  const scriptLoads = new Map();

  function fail(message) {
    const err = new Error(message);
    err.userMessage = message;
    return err;
  }

  function loadScript(src) {
    const pending = scriptLoads.get(src);
    if (pending) return pending;
    const promise = new Promise((resolve, reject) => {
      const found = document.querySelector('script[data-aac-src="' + src + '"]');
      if (found && found.dataset.loaded === "1") {
        resolve();
        return;
      }
      const script = found || document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.aacSrc = src;
      script.addEventListener("load", () => {
        script.dataset.loaded = "1";
        resolve();
      });
      script.addEventListener("error", () => {
        scriptLoads.delete(src);
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(fail("Could not load Google sign-in. Check your connection."));
      });
      if (!found) document.head.appendChild(script);
    });
    scriptLoads.set(src, promise);
    return promise;
  }

  async function firebaseAuth(apiKey, config, projectId) {
    const base = "https://www.gstatic.com/firebasejs/" + FIREBASE_JS_VERSION + "/";
    await loadScript(base + "firebase-app-compat.js");
    await loadScript(base + "firebase-auth-compat.js");
    if (!global.firebase || typeof global.firebase.auth !== "function") {
      throw fail("Could not load Google sign-in. Check your connection.");
    }
    const cfg = config || {};
    const options = {
      apiKey: apiKey,
      authDomain: cfg.authDomain || (projectId + ".firebaseapp.com"),
      projectId: projectId
    };
    if (cfg.appId) options.appId = cfg.appId;
    if (!global.firebase.apps || !global.firebase.apps.length) global.firebase.initializeApp(options);
    return global.firebase.auth();
  }

  function errorMessage(err) {
    if (err && err.userMessage) return err.userMessage;
    const code = String(err && err.code || "");
    const raw = String(err && err.message || "");
    if (code === "auth/operation-not-allowed" || raw.indexOf("OPERATION_NOT_ALLOWED") !== -1) {
      return "Google sign-in is not turned on for this app yet.";
    }
    if (code === "auth/account-exists-with-different-credential") {
      return "That email already uses a password. Sign in with email instead.";
    }
    if (code === "auth/unauthorized-domain") {
      return "This web address is not allowed to sign in. Open the app from localhost.";
    }
    if (code === "auth/web-storage-unsupported" || code === "auth/operation-not-supported-in-this-environment") {
      return "This browser blocked Google sign-in. Allow cookies for this site and try again.";
    }
    if (code === "auth/invalid-api-key" || /API key not valid/i.test(raw)) {
      return "That Firebase web API key was rejected.";
    }
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || code === "auth/user-cancelled") {
      return "Google sign-in was cancelled.";
    }
    return "Could not sign in with Google.";
  }

  function remember(on) {
    try {
      if (on) sessionStorage.setItem(PENDING_KEY, "1");
      else sessionStorage.removeItem(PENDING_KEY);
      return true;
    } catch (_) {
      return false;
    }
  }

  function isPending() {
    try {
      return sessionStorage.getItem(PENDING_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function assertWeb(apiKey) {
    if (global.location && global.location.protocol === "file:") {
      throw fail("Open this app from a web address to sign in.");
    }
    if (String(apiKey || "").trim().length < 20) {
      throw fail("Add the Firebase web API key before signing in.");
    }
  }

  async function sessionFromUser(user) {
    const tokenResult = await user.getIdTokenResult();
    const expiresAt = Date.parse(tokenResult && tokenResult.expirationTime);
    const email = user.email || (tokenResult && tokenResult.claims && tokenResult.claims.email) || "";
    if (!tokenResult || !tokenResult.token || !user.refreshToken || !user.uid) {
      throw fail("Could not sign in with Google.");
    }
    return {
      idToken: tokenResult.token,
      refreshToken: user.refreshToken,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 3600 * 1000,
      localId: user.uid,
      email: email
    };
  }

  async function start(opts) {
    const options = opts || {};
    assertWeb(options.apiKey);
    if (!remember(true)) throw fail("This browser blocked Google sign-in. Allow cookies for this site and try again.");
    try {
      const auth = await firebaseAuth(options.apiKey, options.config, options.projectId);
      const provider = new global.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await auth.signInWithRedirect(provider);
    } catch (err) {
      remember(false);
      if (err && err.userMessage) throw err;
      throw fail(errorMessage(err));
    }
  }

  async function resume(opts) {
    if (!isPending()) return null;
    const options = opts || {};
    if (String(options.apiKey || "").trim().length < 20) {
      remember(false);
      return null;
    }
    try {
      const auth = await firebaseAuth(options.apiKey, options.config, options.projectId);
      const result = await auth.getRedirectResult();
      remember(false);
      if (!result || !result.user) return { cancelled: true };
      return { session: await sessionFromUser(result.user) };
    } catch (err) {
      remember(false);
      if (err && err.userMessage) throw err;
      throw fail(errorMessage(err));
    }
  }

  global.AacGoogleSignIn = { start, resume };
})(typeof window !== "undefined" ? window : globalThis);
