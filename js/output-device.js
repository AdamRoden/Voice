/**
 * Speaker list and sink. Chrome hides output names and rejects setSinkId
 * until microphone permission; tracks are stopped immediately.
 */
(function (global) {
  "use strict";

  const DEVICE_KEY = "aac_output_device";
  const LABEL_KEY = "aac_output_device_label";

  function create(deps) {
    const d = deps || {};
    const lsGet = typeof d.lsGet === "function" ? d.lsGet : () => null;
    const lsSet = typeof d.lsSet === "function" ? d.lsSet : () => {};
    const lsDel = typeof d.lsDel === "function" ? d.lsDel : () => {};

    let devices = [];
    let selectedId = normalizeSinkId(lsGet(DEVICE_KEY, "") || "");
    let selectedLabel = selectedId ? (lsGet(LABEL_KEY, "") || "") : "";
    if ((lsGet(DEVICE_KEY, "") || "") !== selectedId) {
      lsDel(DEVICE_KEY);
      lsDel(LABEL_KEY);
    }

    /** Mic prompt was dismissed. Later reveals use selectAudioOutput when it exists. */
    let micDenied = false;
    /** A grant happened, so an empty enumerate is a missing device rather than a hidden list. */
    let accessGranted = false;
    let unlockPromise = null;
    let refreshGen = 0;
    let bound = false;
    /** HTML audio currently playing outside the Web Audio graph. */
    let liveElement = null;
    /**
     * Graph output. The context destination stays on the system device, so
     * playback connects to this element and setSinkId picks the speaker.
     */
    let bridgeCtx = null;
    let bridgeDest = null;
    let bridgeEl = null;
    /** Id whose element setSinkId promise resolved. Not read from the element. */
    let bridgeSink = null;
    let routePromise = null;
    let routeId = null;

    function normalizeSinkId(deviceId) {
      const id = deviceId || "";
      if (id === "default" || id === "communications") return "";
      return id;
    }

    function supported() {
      const md = navigator.mediaDevices;
      if (!md || typeof md.enumerateDevices !== "function") return false;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      return typeof Audio === "function"
        && typeof HTMLMediaElement !== "undefined"
        && typeof HTMLMediaElement.prototype.setSinkId === "function"
        && !!(Ctx && typeof Ctx.prototype.createMediaStreamDestination === "function");
    }

    function canPick() {
      const md = navigator.mediaDevices;
      return !!(md && typeof md.selectAudioOutput === "function");
    }

    function isPermissionError(err) {
      const name = err && err.name;
      return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
    }

    function selectable(list) {
      return (list || []).filter((dev) =>
        dev && dev.kind === "audiooutput" && dev.deviceId && dev.deviceId !== "communications"
      );
    }

    function namedList(list) {
      return (list || []).some((dev) => (dev.label || "").trim());
    }

    function persist(deviceId, label) {
      selectedId = normalizeSinkId(deviceId);
      selectedLabel = selectedId ? (label || selectedLabel || "") : "";
      if (selectedId) {
        lsSet(DEVICE_KEY, selectedId);
        if (selectedLabel) lsSet(LABEL_KEY, selectedLabel);
        else lsDel(LABEL_KEY);
      } else {
        lsDel(DEVICE_KEY);
        lsDel(LABEL_KEY);
      }
    }

    function resolvePreferred(list) {
      const preferredId = selectedId;
      const preferredLabel = (selectedLabel || "").trim().toLowerCase();
      if (!preferredId && !preferredLabel) {
        return { id: "", label: "", matched: true, persist: false };
      }
      if (preferredId) {
        const byId = list.find((dev) => normalizeSinkId(dev.deviceId) === preferredId);
        if (byId) {
          const id = normalizeSinkId(byId.deviceId);
          const label = id ? (byId.label || selectedLabel || "") : "";
          return {
            id,
            label,
            matched: true,
            persist: !!(id && label && label !== selectedLabel)
          };
        }
      }
      if (preferredLabel) {
        const byLabel = list.find((dev) =>
          (dev.label || "").trim().toLowerCase() === preferredLabel
        );
        if (byLabel && byLabel.deviceId) {
          const id = normalizeSinkId(byLabel.deviceId);
          const label = id ? (byLabel.label || selectedLabel || "") : "";
          return {
            id,
            label,
            matched: true,
            persist: id !== preferredId || !!(id && label && label !== selectedLabel)
          };
        }
      }
      return { id: preferredId, label: selectedLabel || "", matched: false, persist: false };
    }

    function systemDefaultLabel(list) {
      const def = (list || []).find((dev) => dev.deviceId === "default");
      const raw = def && (def.label || "").trim();
      if (!raw) return "System default";
      const suffix = raw.replace(/^\s*default\s*[-–—:]\s*/i, "").trim();
      return suffix && suffix !== raw ? `System default — ${suffix}` : "System default";
    }

    function fill(select, list) {
      select.innerHTML = "";
      const defOpt = document.createElement("option");
      defOpt.value = "";
      defOpt.textContent = systemDefaultLabel(list);
      select.appendChild(defOpt);
      (list || []).filter((dev) => dev.deviceId !== "default").forEach((device, index) => {
        const opt = document.createElement("option");
        opt.value = device.deviceId;
        opt.textContent = (device.label || "").trim() || `Speaker ${index + 1}`;
        select.appendChild(opt);
      });
    }

    function addSavedOption(select) {
      if (!selectedId) {
        select.value = "";
        return;
      }
      const opt = document.createElement("option");
      opt.value = selectedId;
      opt.textContent = selectedLabel || "Saved speaker";
      select.appendChild(opt);
      select.value = selectedId;
    }

    function labelFor(id) {
      if (!id) return "";
      const select = document.getElementById("output-device-select");
      const opt = select && [...select.options].find((item) => item.value === id);
      if (opt) {
        return (opt.textContent || "").replace(/\s*\(unavailable\)\s*$/i, "").trim();
      }
      const dev = devices.find((item) => normalizeSinkId(item.deviceId) === id);
      if (dev && (dev.label || "").trim()) return dev.label.trim();
      return selectedLabel || "";
    }

    function setHint(status) {
      const hint = document.getElementById("output-device-hint");
      if (!hint) return;
      if (!supported() || status === "unsupported") {
        hint.textContent = "This browser cannot switch speakers. Change the output in system sound settings.";
        return;
      }
      if (status === "denied") {
        hint.textContent = canPick()
          ? "Microphone access is blocked. Tap Choose speaker to pick a device in the browser prompt."
          : "Microphone access is blocked. Allow the microphone for this site in the address bar, then tap List speakers. Nothing is recorded.";
        return;
      }
      if (status === "hidden") {
        hint.textContent = "Tap List speakers and allow microphone access. The browser hides speaker names until then. Nothing is recorded.";
        return;
      }
      if (status === "gesture") {
        hint.textContent = "Tap List speakers again to open the browser speaker list.";
        return;
      }
      if (status === "picker-cancel") {
        hint.textContent = "No speaker chosen. Tap Choose speaker to try again.";
        return;
      }
      if (status === "unavailable") {
        hint.textContent = "Saved speaker is offline. Using the system default until it is back.";
        return;
      }
      if (status === "list-error") {
        hint.textContent = selectedId
          ? "Could not list speakers. Saved speaker kept."
          : "Could not list speakers.";
        return;
      }
      if (status === "apply-error") {
        hint.textContent = "Could not switch to that speaker. Allow microphone access for this site, then choose it again.";
        return;
      }
      if (status === "missing") {
        hint.textContent = "That speaker is disconnected. Pick another, or use the system default.";
        return;
      }
      if (status === "empty") {
        hint.textContent = "No speakers found. Connect one, or use the system default.";
        return;
      }
      if (status === "no-mic") {
        hint.textContent = "No microphone was found, so this browser cannot list speakers. Use system sound settings.";
        return;
      }
      hint.textContent = selectedLabel
        ? `Speech and sound buttons play through ${selectedLabel}. Browser read-aloud stays on the system speaker.`
        : "Speech and sound buttons use the system default speaker. Browser read-aloud stays there too.";
    }

    function unnamedStatus() {
      if (accessGranted && !devices.length) return selectedId ? "unavailable" : "empty";
      if (selectedId) return "ok";
      if (micDenied) return "denied";
      return "hidden";
    }

    function hintForApply(result) {
      if (!result || result.ok || result.pending) return "ok";
      if (result.error && result.error.name === "NotFoundError") return "missing";
      return "apply-error";
    }

    function syncButton(named) {
      const btn = document.getElementById("output-device-unlock");
      if (!btn) return;
      btn.hidden = !!named;
      if (named) return;
      btn.textContent = micDenied && canPick() ? "Choose speaker" : "List speakers";
    }

    /** Paint the select, the button, and the steady hint from devices + selection. */
    function paint() {
      const select = document.getElementById("output-device-select");
      if (!select) return;
      if (!supported()) {
        select.innerHTML = `<option value="">Not supported</option>`;
        select.disabled = true;
        syncButton(true);
        setHint("unsupported");
        return;
      }
      const named = namedList(devices);
      syncButton(named);
      select.disabled = false;
      if (!named) {
        fill(select, []);
        addSavedOption(select);
        setHint(unnamedStatus());
        return;
      }
      const resolved = resolvePreferred(devices);
      if (resolved.persist) persist(resolved.id, resolved.label);
      fill(select, devices);
      if (!resolved.matched && selectedId) {
        const opt = document.createElement("option");
        opt.value = selectedId;
        opt.textContent = `${selectedLabel || "Saved speaker"} (unavailable)`;
        select.appendChild(opt);
        select.value = selectedId;
        setHint("unavailable");
        return;
      }
      select.value = resolved.matched ? (resolved.id || "") : "";
      setHint("ok");
    }

    function context() {
      const existing = window.sharedAudioContext;
      if (existing && existing.state !== "closed") return existing;
      if (bridgeEl) dropBridge();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        const ctx = new Ctx();
        window.sharedAudioContext = ctx;
        return ctx;
      } catch (_) {
        return null;
      }
    }

    function dropBridge() {
      if (bridgeEl) {
        try { bridgeEl.pause(); } catch (_) {}
        try { bridgeEl.srcObject = null; } catch (_) {}
        try { if (typeof bridgeEl.remove === "function") bridgeEl.remove(); } catch (_) {}
      }
      bridgeCtx = null;
      bridgeDest = null;
      bridgeEl = null;
      bridgeSink = null;
    }

    function mount(ctx) {
      if (bridgeCtx === ctx && bridgeEl && bridgeDest) return;
      dropBridge();
      bridgeCtx = ctx;
      bridgeDest = ctx.createMediaStreamDestination();
      bridgeEl = new Audio();
      bridgeEl.srcObject = bridgeDest.stream;
      bridgeEl.volume = 1;
      try { bridgeEl.setAttribute("playsinline", ""); } catch (_) {}
      try { bridgeEl.setAttribute("aria-hidden", "true"); } catch (_) {}
      if (bridgeEl.style) {
        bridgeEl.style.position = "fixed";
        bridgeEl.style.width = "0";
        bridgeEl.style.height = "0";
        bridgeEl.style.opacity = "0";
        bridgeEl.style.pointerEvents = "none";
      }
      try {
        if (document.body && typeof document.body.appendChild === "function") {
          document.body.appendChild(bridgeEl);
        }
      } catch (_) {}
    }

    /** @returns {Promise<boolean>} false when a chosen speaker could not be applied. */
    async function applyElement(el) {
      if (!selectedId) return true;
      if (!el || typeof el.setSinkId !== "function") return false;
      if ((el.sinkId || "") === selectedId) return true;
      try {
        await el.setSinkId(selectedId);
        return true;
      } catch (_) {
        return false;
      }
    }

    async function route(id) {
      const ctx = context();
      if (!ctx) {
        const error = new Error("no audio context");
        error.name = "NotSupportedError";
        return fail(error);
      }
      if (!supported()) {
        if (!id) return { ok: true, ctx, node: ctx.destination };
        const error = new Error("setSinkId unavailable");
        error.name = "NotSupportedError";
        return fail(error);
      }
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch (_) {}
      }
      try {
        mount(ctx);
      } catch (error) {
        return fail(error);
      }
      try {
        if (bridgeSink !== id) {
          await bridgeEl.setSinkId(id);
          bridgeSink = id;
        }
        if (bridgeEl.paused !== false) await bridgeEl.play();
      } catch (error) {
        bridgeSink = null;
        try { bridgeEl.pause(); } catch (_) {}
        return fail(error);
      }
      await applyElement(liveElement);
      return { ok: true, ctx, node: bridgeDest };
    }

    function fail(error) {
      const result = { ok: false, error };
      setHint(hintForApply(result));
      return result;
    }

    /** Route the current speaker. One in-flight promise; a new id waits its turn. */
    function prepare() {
      const id = selectedId;
      if (routePromise && routeId === id) return routePromise;
      const run = () => route(id);
      const prev = routePromise;
      let pending;
      pending = (prev ? prev.then(run, run) : run()).finally(() => {
        if (routePromise === pending) routePromise = null;
      });
      routeId = id;
      routePromise = pending;
      return pending;
    }

    function stopTracks(stream) {
      if (!stream || typeof stream.getTracks !== "function") return;
      stream.getTracks().forEach((track) => {
        try { track.stop(); } catch (_) {}
      });
    }

    function unlockMic() {
      if (unlockPromise) return unlockPromise;
      const md = navigator.mediaDevices;
      if (!md || typeof md.getUserMedia !== "function") {
        const err = new Error("Microphone access is unavailable.");
        err.name = "NotSupportedError";
        return Promise.reject(err);
      }
      unlockPromise = (async () => {
        const stream = await md.getUserMedia({ audio: true });
        stopTracks(stream);
        micDenied = false;
        accessGranted = true;
      })().finally(() => {
        unlockPromise = null;
      });
      return unlockPromise;
    }

    async function refresh() {
      const select = document.getElementById("output-device-select");
      if (!select) return;
      const gen = ++refreshGen;

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function" || !supported()) {
        paint();
        return;
      }

      let listed;
      try {
        listed = await navigator.mediaDevices.enumerateDevices();
      } catch (_) {
        if (gen !== refreshGen) return;
        devices = [];
        paint();
        setHint("list-error");
        return;
      }
      if (gen !== refreshGen) return;

      devices = selectable(listed);
      paint();
    }

    async function adopt(info) {
      const id = normalizeSinkId(info && info.deviceId);
      const label = ((info && info.label) || "").trim() || (id ? "Speaker" : "");
      persist(id, label);
      paint();
      const status = hintForApply(await prepare());
      if (status !== "ok") setHint(status);
    }

    async function reveal() {
      let listed = false;
      try {
        if (!micDenied) {
          try {
            await unlockMic();
            listed = true;
          } catch (err) {
            if (err && err.name === "NotAllowedError") micDenied = true;
            else if (!err || err.name !== "NotFoundError") throw err;
          }
        }
        if (listed) {
          await refresh();
          return;
        }
        if (canPick()) {
          await adopt(await navigator.mediaDevices.selectAudioOutput());
          return;
        }
        paint();
        setHint(micDenied ? "denied" : "no-mic");
      } catch (err) {
        paint();
        if (err && err.name === "InvalidStateError") setHint("gesture");
        else if (err && err.name === "NotAllowedError") setHint(micDenied && canPick() ? "picker-cancel" : "denied");
        else if (err && err.name === "NotFoundError") setHint("no-mic");
        else setHint("list-error");
      }
    }

    async function setActive(deviceId) {
      refreshGen += 1;
      persist(normalizeSinkId(deviceId), labelFor(normalizeSinkId(deviceId)));
      let result = await prepare();
      if (!result.ok && isPermissionError(result.error)) {
        try {
          await unlockMic();
        } catch (err) {
          if (isPermissionError(err)) {
            micDenied = true;
            paint();
            setHint("denied");
            return;
          }
          setHint("apply-error");
          return;
        }
        await refresh();
        result = await prepare();
      }
      setHint(hintForApply(result));
    }

    function bind() {
      if (bound) return;
      const select = document.getElementById("output-device-select");
      const btn = document.getElementById("output-device-unlock");
      if (!select && !btn) return;
      bound = true;
      if (select) {
        select.addEventListener("change", (event) => {
          setActive(event.target.value).catch(() => setHint("apply-error"));
        });
      }
      if (btn) {
        btn.addEventListener("click", () => {
          reveal().catch(() => setHint("list-error"));
        });
      }
    }

    return {
      bind,
      refresh,
      sinkId: () => selectedId,
      context,
      prepare,
      applyElement,
      watch(el) { liveElement = el || null; }
    };
  }

  global.AacOutputDevice = { create };
})(typeof window !== "undefined" ? window : globalThis);
