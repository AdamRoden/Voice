/**
 * Pure profile sync: which keys travel with an account, first-sign-in choice,
 * per-key timestamps, and Firestore document encode/decode.
 * Starter phrases live in js/starter-boards.js, the same list topics.js builds from.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AacAccountSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PROJECT_ID = "voice-1d8a8";
  const META_KEY = "aac_sync_meta";
  const SESSION_KEY = "aac_auth_session";
  const API_KEY_STORAGE = "aac_firebase_api_key";
  const CLOUD_LIMIT = 800000;
  const HISTORY_CAP = 50;
  const CHAT_CAP = 5;

  /**
   * Device-only keys stay off this list: speaker id, browser voice index
   * (the list differs per device), sync meta, and the auth session.
   */
  const SYNC_KEYS = [
    "aac_tabs",
    "aac_active_tab",
    "aac_chats",
    "aac_active_chat",
    "aac_history",
    "aac_nav_meta",
    "aac_font_size",
    "aac_theme",
    "aac_accent_color",
    "aac_icon_fill",
    "aac_icon_wght",
    "aac_icon_grad",
    "aac_icon_opsz",
    "aac_feat_message_words",
    "aac_feat_button_insert",
    "aac_feat_compose_new",
    "aac_feat_compose_pin",
    "aac_feat_compose_replay",
    "aac_feat_compose_tag",
    "aac_osk_visible",
    "aac_saved_tags",
    "aac_voice_model",
    "elevenlabs_model",
    "elevenlabs_voice",
    "elevenlabs_key",
    "elevenlabs_volume",
    "elevenlabs_speed",
    "aac_pitch",
    "aac_piper_voice",
    "aac_fav_browser_voices",
    "aac_fav_eleven_voices",
    "aac_fav_piper_voices",
    "aac_voice_language_filter",
    "aac_eleven_voice_tag",
    "aac_voice_styles",
    "voice_predict_personal_v1",
    "voice_predict_personal_text_v1"
  ];

  const SYNC_SET = new Set(SYNC_KEYS);

  function loadStarterBoards() {
    if (typeof module !== "undefined" && module.exports) {
      return require("./starter-boards.js");
    }
    return (typeof globalThis !== "undefined" && globalThis.AacStarterBoards) || [];
  }

  const STARTER_BOARDS = loadStarterBoards();

  function isSyncKey(key) {
    return SYNC_SET.has(key);
  }

  function hashString(value) {
    let h = 2166136261;
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function hashValue(value) {
    if (value == null) return "0";
    return "1" + hashString(String(value));
  }

  function hashAll(keys) {
    const out = {};
    for (let i = 0; i < SYNC_KEYS.length; i++) {
      const key = SYNC_KEYS[i];
      out[key] = hashValue(keys && keys[key] != null ? keys[key] : null);
    }
    return out;
  }

  function parseArray(raw) {
    if (raw == null || raw === "") return [];
    try {
      const value = JSON.parse(raw);
      if (value == null) return [];
      return Array.isArray(value) ? value : null;
    } catch (_) {
      return null;
    }
  }

  function isStarterTabsJson(raw) {
    if (raw == null || raw === "") return true;
    let tabs;
    try {
      tabs = JSON.parse(raw);
    } catch (_) {
      return false;
    }
    if (tabs == null) return true;
    if (!Array.isArray(tabs)) return false;
    if (tabs.length === 0) return true;
    if (tabs.length !== STARTER_BOARDS.length) return false;
    for (let i = 0; i < STARTER_BOARDS.length; i++) {
      const spec = STARTER_BOARDS[i];
      const topic = tabs[i];
      if (!topic || topic.id !== spec.id) return false;
      const phrases = Array.isArray(spec.phrases) ? spec.phrases : [];
      const buttons = Array.isArray(topic.buttons) ? topic.buttons : [];
      if (buttons.length !== phrases.length) return false;
      for (let b = 0; b < phrases.length; b++) {
        const btn = buttons[b];
        const phrase = phrases[b];
        if (!btn || !phrase || btn.label !== phrase.label) return false;
        if (btn.audioData) return false;
        if (btn.utteranceText && btn.utteranceText !== phrase.text) return false;
      }
    }
    return true;
  }

  function historyHasItems(raw) {
    if (raw == null || raw === "" || raw === "[]") return false;
    const items = parseArray(raw);
    if (items == null) return true;
    return items.length > 0;
  }

  function chatsHaveUserText(raw) {
    const chats = parseArray(raw);
    if (!chats) return false;
    return chats.some((chat) => chat && String(chat.text || "").trim().length > 0);
  }

  function predictHasLearning(raw) {
    if (raw == null || raw === "") return false;
    try {
      const value = JSON.parse(raw);
      const accept = value && value.accept;
      if (!accept || typeof accept !== "object") return false;
      return Object.keys(accept).length > 0;
    } catch (_) {
      return true;
    }
  }

  /**
   * Built-in boards and no personal speech, style list, or chosen style.
   * A missing style catalog is the local default and is not personal.
   * The catalog is one JSON value: styles, favorites, and whether none is starred.
   */
  function deviceLooksFresh(keys) {
    const src = keys || {};
    if (!isStarterTabsJson(src.aac_tabs)) return false;
    if (historyHasItems(src.aac_history)) return false;
    if (String(src.elevenlabs_key || "").trim()) return false;
    if (String(src.voice_predict_personal_text_v1 || "").trim()) return false;
    if (predictHasLearning(src.voice_predict_personal_v1)) return false;
    if (chatsHaveUserText(src.aac_chats)) return false;
    if (String(src.aac_voice_styles || "").trim()) return false;
    if (String(src.aac_eleven_voice_tag || "").trim()) return false;
    return true;
  }

  function normalizeKeys(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const keys = {};
    for (let i = 0; i < SYNC_KEYS.length; i++) {
      const key = SYNC_KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(src, key) || src[key] == null) keys[key] = null;
      else keys[key] = String(src[key]);
    }
    return keys;
  }

  function normalizeTimes(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const times = {};
    for (let i = 0; i < SYNC_KEYS.length; i++) {
      const key = SYNC_KEYS[i];
      const n = Number(src[key]);
      times[key] = Number.isFinite(n) && n > 0 ? n : 0;
    }
    return times;
  }

  function normalizeMeta(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    return {
      v: 1,
      deviceId: typeof src.deviceId === "string" ? src.deviceId : "",
      uid: typeof src.uid === "string" ? src.uid : "",
      bootstrapped: !!src.bootstrapped,
      ackedRev: Number(src.ackedRev) || 0,
      times: src.times && typeof src.times === "object" ? src.times : {},
      keyHashes: src.keyHashes && typeof src.keyHashes === "object" ? src.keyHashes : {},
      stripped: src.stripped && typeof src.stripped === "object" ? src.stripped : {},
      pendingConflict: !!src.pendingConflict
    };
  }

  /** Switching accounts must not reuse the previous account's sync clock. */
  function scopeMetaToUser(meta, uid) {
    const base = normalizeMeta(meta);
    if (base.uid && uid && base.uid !== uid) {
      return {
        v: 1,
        deviceId: base.deviceId,
        uid: uid,
        bootstrapped: false,
        ackedRev: 0,
        times: {},
        keyHashes: {},
        stripped: {},
        pendingConflict: false
      };
    }
    if (uid && !base.uid) base.uid = uid;
    return base;
  }

  function decideFirstSync(localKeys, remote) {
    if (!remote) return "upload";
    if (deviceLooksFresh(localKeys)) return "download";
    if (deviceLooksFresh(remote.keys)) return "upload";
    return "ask";
  }

  function valuesEquivalent(key, localVal, remoteVal, stripped) {
    if (localVal === remoteVal) return true;
    const note = stripped && stripped[key];
    if (!note) return false;
    return note.localHash === hashValue(localVal) && note.remoteHash === hashValue(remoteVal);
  }

  function touchUnsyncedTimes(keys, times, keyHashes, now) {
    const next = Object.assign({}, times || {});
    const hashes = keyHashes || {};
    for (let i = 0; i < SYNC_KEYS.length; i++) {
      const key = SYNC_KEYS[i];
      const hash = hashValue(keys[key]);
      if (!Object.prototype.hasOwnProperty.call(hashes, key)) {
        if (keys[key] != null) next[key] = now;
        continue;
      }
      if (hashes[key] !== hash) next[key] = now;
    }
    return next;
  }

  function mergeButtons(remoteButtons, localButtons) {
    const remote = Array.isArray(remoteButtons) ? remoteButtons : [];
    const local = Array.isArray(localButtons) ? localButtons : [];
    const map = new Map();
    remote.forEach((btn) => {
      if (btn && btn.id) map.set(btn.id, Object.assign({}, btn));
    });
    local.forEach((btn) => {
      if (!btn || !btn.id) return;
      if (!map.has(btn.id)) {
        map.set(btn.id, Object.assign({}, btn));
        return;
      }
      const dest = map.get(btn.id);
      const merged = Object.assign({}, dest, btn);
      if (!btn.audioData && dest.audioData) merged.audioData = dest.audioData;
      map.set(btn.id, merged);
    });
    const out = [];
    const seen = new Set();
    remote.forEach((btn) => {
      if (!btn || !btn.id || seen.has(btn.id) || !map.has(btn.id)) return;
      seen.add(btn.id);
      out.push(map.get(btn.id));
    });
    local.forEach((btn) => {
      if (!btn || !btn.id || seen.has(btn.id) || !map.has(btn.id)) return;
      seen.add(btn.id);
      out.push(map.get(btn.id));
    });
    return out;
  }

  function mergeTopicsJson(localRaw, remoteRaw) {
    if (localRaw == null && remoteRaw == null) return null;
    const local = parseArray(localRaw);
    const remote = parseArray(remoteRaw);
    if (local == null) return remoteRaw == null ? null : String(remoteRaw);
    if (remote == null) return localRaw == null ? null : String(localRaw);
    if (!local.length) return remoteRaw == null ? null : String(remoteRaw);
    if (!remote.length) return String(localRaw);
    const byId = new Map();
    remote.forEach((topic) => {
      if (topic && topic.id) byId.set(topic.id, Object.assign({}, topic));
    });
    local.forEach((topic) => {
      if (!topic || !topic.id) return;
      if (!byId.has(topic.id)) {
        byId.set(topic.id, Object.assign({}, topic));
        return;
      }
      const dest = byId.get(topic.id);
      dest.buttons = mergeButtons(dest.buttons, topic.buttons);
      if (topic.name) dest.name = topic.name;
      if (topic.icon) dest.icon = topic.icon;
      if (topic.color) dest.color = topic.color;
      dest.gridCols = Math.max(Number(dest.gridCols) || 1, Number(topic.gridCols) || 1);
      dest.gridRows = Math.max(Number(dest.gridRows) || 1, Number(topic.gridRows) || 1);
    });
    const order = [];
    const seen = new Set();
    remote.forEach((topic) => {
      if (!topic || !topic.id || seen.has(topic.id) || !byId.has(topic.id)) return;
      seen.add(topic.id);
      order.push(byId.get(topic.id));
    });
    local.forEach((topic) => {
      if (!topic || !topic.id || seen.has(topic.id) || !byId.has(topic.id)) return;
      seen.add(topic.id);
      order.push(byId.get(topic.id));
    });
    return JSON.stringify(order);
  }

  function historyKey(item, index, side) {
    if (item && item.id) return "id:" + item.id;
    return side + ":" + index + ":" + (item && item.text ? item.text : "");
  }

  function mergeHistoryJson(localRaw, remoteRaw) {
    const local = parseArray(localRaw);
    const remote = parseArray(remoteRaw);
    if (local == null) return remoteRaw == null ? null : String(remoteRaw);
    if (remote == null) return localRaw == null ? null : String(localRaw);
    const out = [];
    const seen = new Set();
    local.forEach((item, index) => {
      const key = historyKey(item, index, "l");
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    remote.forEach((item, index) => {
      const key = historyKey(item, index, "r");
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return JSON.stringify(out.slice(0, HISTORY_CAP));
  }

  function mergeChatsJson(localRaw, remoteRaw) {
    const local = parseArray(localRaw);
    const remote = parseArray(remoteRaw);
    if (local == null) return remoteRaw == null ? null : String(remoteRaw);
    if (remote == null) return localRaw == null ? null : String(localRaw);
    const remoteBy = new Map();
    remote.forEach((chat) => {
      if (chat && chat.topicId) remoteBy.set(chat.topicId, chat);
    });
    const out = [];
    const seen = new Set();
    local.forEach((chat) => {
      if (!chat || !chat.topicId || seen.has(chat.topicId)) return;
      const other = remoteBy.get(chat.topicId);
      const localText = String(chat.text || "");
      const text = localText.trim() ? localText : (other && other.text) || "";
      seen.add(chat.topicId);
      out.push({ text: text, topicId: chat.topicId });
    });
    remote.forEach((chat) => {
      if (!chat || !chat.topicId || seen.has(chat.topicId)) return;
      seen.add(chat.topicId);
      out.push({ text: chat.text || "", topicId: chat.topicId });
    });
    if (!out.length) return localRaw || remoteRaw || null;
    return JSON.stringify(out.slice(0, CHAT_CAP));
  }

  function combineProfiles(localKeys, remoteKeys) {
    const local = normalizeKeys(localKeys);
    const remote = normalizeKeys(remoteKeys);
    const keys = {};
    for (let i = 0; i < SYNC_KEYS.length; i++) {
      const key = SYNC_KEYS[i];
      if (key === "aac_tabs") keys[key] = mergeTopicsJson(local[key], remote[key]);
      else if (key === "aac_history") keys[key] = mergeHistoryJson(local[key], remote[key]);
      else if (key === "aac_chats") keys[key] = mergeChatsJson(local[key], remote[key]);
      else if (local[key] != null) keys[key] = local[key];
      else keys[key] = remote[key];
    }
    return normalizeKeys(keys);
  }

  function mergeByTime(localKeys, localTimes, remote, stripped) {
    const deviceKeys = {};
    const uploadKeys = {};
    const times = {};
    const applied = [];
    const dirty = [];
    const remoteKeys = normalizeKeys(remote && remote.keys);
    const remoteTimes = normalizeTimes(remote && remote.times);
    const local = normalizeKeys(localKeys);
    for (let i = 0; i < SYNC_KEYS.length; i++) {
      const key = SYNC_KEYS[i];
      const lv = local[key];
      const rv = remoteKeys[key];
      const lt = Number(localTimes && localTimes[key]) || 0;
      const rt = remoteTimes[key] || 0;
      if (valuesEquivalent(key, lv, rv, stripped)) {
        deviceKeys[key] = lv;
        uploadKeys[key] = lv === rv ? lv : rv;
        times[key] = Math.max(lt, rt);
        continue;
      }
      if (lt > rt) {
        deviceKeys[key] = lv;
        uploadKeys[key] = lv;
        times[key] = lt;
        dirty.push(key);
        continue;
      }
      if (rt > lt) {
        deviceKeys[key] = rv;
        uploadKeys[key] = rv;
        times[key] = rt;
        applied.push(key);
        continue;
      }
      if (lt === 0 && rt === 0) {
        deviceKeys[key] = rv;
        uploadKeys[key] = rv;
        times[key] = 0;
        if (lv !== rv) applied.push(key);
        continue;
      }
      deviceKeys[key] = lv;
      uploadKeys[key] = lv;
      times[key] = lt;
      dirty.push(key);
    }
    return { deviceKeys, uploadKeys, times, applied, dirty };
  }

  function payloadSize(keys) {
    try {
      return JSON.stringify(keys).length;
    } catch (_) {
      return CLOUD_LIMIT + 1;
    }
  }

  function stripDataUrls(value) {
    if (Array.isArray(value)) return value.map(stripDataUrls);
    if (!value || typeof value !== "object") return value;
    const out = {};
    Object.keys(value).forEach((key) => {
      const child = value[key];
      if (key === "audioData" && typeof child === "string" && child.indexOf("data:") === 0) out[key] = null;
      else out[key] = stripDataUrls(child);
    });
    return out;
  }

  function stripJsonKey(keys, key, notes, device) {
    if (keys[key] == null) return keys;
    let parsed;
    try {
      parsed = JSON.parse(keys[key]);
    } catch (_) {
      return keys;
    }
    const stripped = stripDataUrls(parsed);
    const next = JSON.stringify(stripped);
    if (next === keys[key]) return keys;
    const copy = Object.assign({}, keys);
    copy[key] = next;
    notes[key] = {
      localHash: hashValue(device[key]),
      remoteHash: hashValue(next)
    };
    return copy;
  }

  function trimHistory(keys, notes, device) {
    if (keys.aac_history == null) return keys;
    let items;
    try {
      items = JSON.parse(keys.aac_history);
    } catch (_) {
      return keys;
    }
    if (!Array.isArray(items) || items.length < 2) return keys;
    const copy = Object.assign({}, keys);
    let nextItems = items.slice();
    while (nextItems.length > 1 && payloadSize(copy) > CLOUD_LIMIT) {
      nextItems = nextItems.slice(0, nextItems.length - 1);
      copy.aac_history = JSON.stringify(nextItems);
    }
    notes.aac_history = {
      localHash: hashValue(device.aac_history),
      remoteHash: hashValue(copy.aac_history)
    };
    return copy;
  }

  /**
   * Keep a previous "cloud copy dropped audio" note when this upload still
   * matches that pair. Otherwise a later sync would pull the short copy
   * down over the full clip stored on this device.
   */
  function mergeStripNotes(previous, fittedNotes, deviceKeys, uploadKeys) {
    const out = Object.assign({}, fittedNotes || {});
    const prev = previous || {};
    for (let i = 0; i < SYNC_KEYS.length; i++) {
      const key = SYNC_KEYS[i];
      if (out[key]) continue;
      const note = prev[key];
      if (!note || !note.localHash) continue;
      const deviceVal = deviceKeys ? deviceKeys[key] : null;
      const uploadVal = uploadKeys ? uploadKeys[key] : null;
      if (note.localHash === hashValue(deviceVal) && note.remoteHash === hashValue(uploadVal)) {
        out[key] = note;
      }
    }
    return out;
  }

  /**
   * Firestore documents cap at 1 MiB. Drop stored clips before phrases.
   * deviceKeys is the on-device value (it may still hold audio the cloud copy drops).
   */
  function fitCloudPayload(keys, deviceKeys) {
    const original = normalizeKeys(keys);
    const device = deviceKeys ? normalizeKeys(deviceKeys) : original;
    const notes = {};
    let next = original;
    if (payloadSize(next) <= CLOUD_LIMIT) return { keys: next, notes, tooBig: false };
    next = stripJsonKey(next, "aac_history", notes, device);
    if (payloadSize(next) <= CLOUD_LIMIT) return { keys: next, notes, tooBig: false };
    next = stripJsonKey(next, "aac_tabs", notes, device);
    if (payloadSize(next) <= CLOUD_LIMIT) return { keys: next, notes, tooBig: false };
    next = trimHistory(next, notes, device);
    if (payloadSize(next) > CLOUD_LIMIT && next.voice_predict_personal_text_v1) {
      const copy = Object.assign({}, next);
      copy.voice_predict_personal_text_v1 = String(copy.voice_predict_personal_text_v1).slice(-4000);
      notes.voice_predict_personal_text_v1 = {
        localHash: hashValue(device.voice_predict_personal_text_v1),
        remoteHash: hashValue(copy.voice_predict_personal_text_v1)
      };
      next = copy;
    }
    return { keys: next, notes, tooBig: payloadSize(next) > CLOUD_LIMIT };
  }

  function stampTimes(now) {
    const times = {};
    for (let i = 0; i < SYNC_KEYS.length; i++) times[SYNC_KEYS[i]] = now;
    return times;
  }

  function planFromChoice(choice, localKeys, remote, now) {
    const local = normalizeKeys(localKeys);
    const hasRemote = !!(remote && remote.keys);
    let mode = choice;
    if (!hasRemote && mode !== "device") mode = "device";
    if (mode === "account") {
      const keys = normalizeKeys(remote.keys);
      return {
        action: "download",
        keys,
        uploadKeys: keys,
        times: normalizeTimes(remote.times),
        rev: remote.rev || 0,
        reload: true,
        applied: SYNC_KEYS.slice(),
        dirty: [],
        updateTime: remote.updateTime || null,
        stripped: {},
        tooBig: false
      };
    }
    const keys = mode === "merge" ? combineProfiles(local, hasRemote ? remote.keys : {}) : local;
    const fitted = fitCloudPayload(keys);
    return {
      action: "upload",
      keys,
      uploadKeys: fitted.keys,
      times: stampTimes(now),
      rev: ((hasRemote && remote.rev) || 0) + 1,
      reload: mode === "merge",
      applied: mode === "merge" ? SYNC_KEYS.slice() : [],
      dirty: SYNC_KEYS.slice(),
      updateTime: hasRemote ? remote.updateTime || null : null,
      stripped: fitted.notes,
      tooBig: fitted.tooBig
    };
  }

  function planSync(input) {
    const now = input && input.now ? input.now : Date.now();
    const meta = normalizeMeta(input && input.meta);
    const localKeys = normalizeKeys(input && input.localKeys);
    const remote = input && input.remote ? input.remote : null;
    if (!meta.bootstrapped) {
      const decision = decideFirstSync(localKeys, remote);
      if (decision === "ask") {
        return {
          action: "ask",
          keys: localKeys,
          uploadKeys: localKeys,
          times: normalizeTimes(meta.times),
          rev: remote ? remote.rev || 0 : 0,
          reload: false,
          applied: [],
          dirty: [],
          updateTime: remote && remote.updateTime || null,
          stripped: meta.stripped,
          tooBig: false
        };
      }
      if (decision === "download") {
        const keys = normalizeKeys(remote.keys);
        return {
          action: "download",
          keys,
          uploadKeys: keys,
          times: normalizeTimes(remote.times),
          rev: remote.rev || 0,
          reload: true,
          applied: SYNC_KEYS.slice(),
          dirty: [],
          updateTime: remote.updateTime || null,
          stripped: {},
          tooBig: false
        };
      }
      const fitted = fitCloudPayload(localKeys);
      return {
        action: "upload",
        keys: localKeys,
        uploadKeys: fitted.keys,
        times: stampTimes(now),
        rev: ((remote && remote.rev) || 0) + 1,
        reload: false,
        applied: [],
        dirty: SYNC_KEYS.slice(),
        updateTime: remote && remote.updateTime || null,
        stripped: fitted.notes,
        tooBig: fitted.tooBig
      };
    }

    const times = touchUnsyncedTimes(localKeys, meta.times, meta.keyHashes, now);
    if (!remote) {
      const fitted = fitCloudPayload(localKeys);
      return {
        action: "upload",
        keys: localKeys,
        uploadKeys: fitted.keys,
        times: stampTimes(now),
        rev: 1,
        reload: false,
        applied: [],
        dirty: SYNC_KEYS.slice(),
        updateTime: null,
        stripped: fitted.notes,
        tooBig: fitted.tooBig
      };
    }

    const merged = mergeByTime(localKeys, times, remote, meta.stripped);
    const upload = merged.dirty.length > 0;
    const reload = merged.applied.length > 0;
    let action = "noop";
    if (upload && reload) action = "merge";
    else if (upload) action = "upload";
    else if (reload) action = "download";
    const fitted = upload
      ? fitCloudPayload(merged.uploadKeys, merged.deviceKeys)
      : { keys: merged.uploadKeys, notes: {}, tooBig: false };
    const stripped = upload
      ? mergeStripNotes(meta.stripped, fitted.notes, merged.deviceKeys, fitted.keys)
      : (meta.stripped || {});
    return {
      action,
      keys: merged.deviceKeys,
      uploadKeys: fitted.keys,
      times: merged.times,
      rev: upload ? (remote.rev || 0) + 1 : (remote.rev || 0),
      reload,
      applied: merged.applied,
      dirty: merged.dirty,
      updateTime: remote.updateTime || null,
      stripped,
      tooBig: fitted.tooBig
    };
  }

  function encodeProfileDoc(profile) {
    const keys = normalizeKeys(profile && profile.keys);
    const times = normalizeTimes(profile && profile.times);
    return {
      fields: {
        rev: { integerValue: String(profile && profile.rev || 0) },
        updatedAt: { stringValue: profile && profile.updatedAt ? String(profile.updatedAt) : "" },
        deviceId: { stringValue: profile && profile.deviceId ? String(profile.deviceId) : "" },
        payload: { stringValue: JSON.stringify({ keys, times }) }
      }
    };
  }

  function decodeProfileDoc(doc) {
    if (!doc || !doc.fields || !doc.fields.payload) return null;
    const payloadField = doc.fields.payload.stringValue;
    if (typeof payloadField !== "string") return null;
    let parsed;
    try {
      parsed = JSON.parse(payloadField);
    } catch (_) {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const revField = doc.fields.rev || {};
    const rev = parseInt(revField.integerValue != null ? revField.integerValue : revField.doubleValue, 10);
    return {
      rev: Number.isFinite(rev) ? rev : 0,
      updatedAt: doc.fields.updatedAt && doc.fields.updatedAt.stringValue || "",
      deviceId: doc.fields.deviceId && doc.fields.deviceId.stringValue || "",
      updateTime: doc.updateTime || null,
      keys: normalizeKeys(parsed.keys),
      times: normalizeTimes(parsed.times)
    };
  }

  function authErrorMessage(raw, action) {
    const msg = String(raw || "");
    const code = msg.split(":")[0].trim();
    if (code === "EMAIL_EXISTS") return "That email already has an account. Sign in instead.";
    if (code === "INVALID_EMAIL" || code === "MISSING_EMAIL") return "Enter a valid email address.";
    if (code === "MISSING_PASSWORD") return "Enter a password.";
    if (code === "WEAK_PASSWORD" || msg.indexOf("WEAK_PASSWORD") !== -1) return "Use at least 6 characters.";
    if (action === "reset" && code === "EMAIL_NOT_FOUND") {
      return "If that email has an account, a reset message is on the way.";
    }
    if (code === "INVALID_LOGIN_CREDENTIALS" || code === "EMAIL_NOT_FOUND" || code === "INVALID_PASSWORD") {
      return "Email or password does not match.";
    }
    if (code === "USER_DISABLED") return "This account is disabled.";
    if (code === "TOO_MANY_ATTEMPTS_TRY_LATER" || msg.indexOf("TOO_MANY_ATTEMPTS") !== -1) {
      return "Too many tries. Wait a minute and try again.";
    }
    if (code === "OPERATION_NOT_ALLOWED" || msg.indexOf("OPERATION_NOT_ALLOWED") !== -1) {
      return "Turn on Email/Password sign-in for Firebase project " + PROJECT_ID + ".";
    }
    if (/API key not valid/i.test(msg) || code === "API_KEY_INVALID") {
      return "That Firebase web API key was rejected.";
    }
    if (action === "reset") return "Could not send a reset message.";
    if (action === "create") return "Could not create the account.";
    return "Could not sign in.";
  }

  function firestoreErrorMessage(status, message) {
    const msg = String(message || "");
    if (status === 403 || msg.indexOf("PERMISSION_DENIED") !== -1) {
      return "Cloud storage refused the save. Publish firestore.rules so a signed-in person can only read their own profile.";
    }
    if (/database/i.test(msg) && /does not exist|NOT_FOUND/i.test(msg)) {
      return "Create a Firestore database in Firebase project " + PROJECT_ID + ".";
    }
    if (/API key not valid/i.test(msg) || msg.indexOf("API_KEY_INVALID") !== -1) {
      return "That Firebase web API key was rejected.";
    }
    if (status === 401 || msg.indexOf("UNAUTHENTICATED") !== -1) return "Sign in again.";
    return "Could not sync with the account.";
  }

  function snapshotFromStorage(getItem) {
    const keys = {};
    for (let i = 0; i < SYNC_KEYS.length; i++) {
      const key = SYNC_KEYS[i];
      let value = null;
      try {
        value = getItem(key);
      } catch (_) {
        value = null;
      }
      keys[key] = value == null ? null : String(value);
    }
    return keys;
  }

  return {
    PROJECT_ID,
    META_KEY,
    SESSION_KEY,
    API_KEY_STORAGE,
    CLOUD_LIMIT,
    SYNC_KEYS,
    STARTER_BOARDS,
    isSyncKey,
    hashValue,
    hashAll,
    isStarterTabsJson,
    deviceLooksFresh,
    normalizeKeys,
    normalizeTimes,
    normalizeMeta,
    scopeMetaToUser,
    decideFirstSync,
    valuesEquivalent,
    touchUnsyncedTimes,
    mergeTopicsJson,
    mergeHistoryJson,
    mergeChatsJson,
    combineProfiles,
    mergeByTime,
    mergeStripNotes,
    fitCloudPayload,
    planFromChoice,
    planSync,
    encodeProfileDoc,
    decodeProfileDoc,
    authErrorMessage,
    firestoreErrorMessage,
    snapshotFromStorage
  };
});
