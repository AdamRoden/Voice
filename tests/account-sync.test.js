"use strict";

const assert = require("assert");
const Sync = require("../js/account-sync.js");

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("ok  " + name);
  } catch (err) {
    failed += 1;
    console.error("FAIL " + name);
    console.error(err && err.stack || err);
  }
}

function starterTabs() {
  return JSON.stringify(Sync.STARTER_BOARDS.map((board) => ({
    id: board.id,
    name: board.name,
    icon: board.icon,
    color: board.color,
    buttons: board.phrases.map((phrase, index) => ({
      id: board.id + "-" + index,
      label: phrase.label,
      symbol: phrase.symbol,
      utteranceText: phrase.text,
      sourceText: phrase.text,
      audioData: null
    }))
  })));
}

function customTabs() {
  return JSON.stringify([
    { id: "home", name: "Home", buttons: [{ id: "b1", label: "Hi", utteranceText: "Hi" }] },
    { id: "food", name: "Food", buttons: [{ id: "b2", label: "Water", audioData: "data:audio/mp3;base64,QQ" }] }
  ]);
}

function keys(extra) {
  const base = {};
  Sync.SYNC_KEYS.forEach((key) => { base[key] = null; });
  base.aac_tabs = starterTabs();
  return Object.assign(base, extra || {});
}

function remoteFrom(keyMap, rev, times) {
  return {
    rev: rev || 1,
    updateTime: "2026-01-01T00:00:00.000000Z",
    keys: keyMap,
    times: times || {}
  };
}

test("starter boards count as a fresh device", () => {
  assert.strictEqual(Sync.isStarterTabsJson(starterTabs()), true);
  assert.strictEqual(Sync.deviceLooksFresh(keys()), true);
  assert.strictEqual(Sync.isStarterTabsJson(customTabs()), false);
  assert.strictEqual(Sync.deviceLooksFresh(keys({ aac_tabs: customTabs() })), false);
});

test("renamed starter button is not fresh", () => {
  const tabs = JSON.parse(starterTabs());
  tabs[0].buttons[0].label = "Hey";
  assert.strictEqual(Sync.deviceLooksFresh(keys({ aac_tabs: JSON.stringify(tabs) })), false);
});

test("first sign-in downloads when this device is still fresh", () => {
  const local = keys();
  const remote = remoteFrom(keys({ aac_tabs: customTabs(), elevenlabs_key: "sk_test" }), 4);
  assert.strictEqual(Sync.decideFirstSync(local, remote), "download");
  const plan = Sync.planSync({ localKeys: local, meta: { bootstrapped: false }, remote, now: 100 });
  assert.strictEqual(plan.action, "download");
  assert.strictEqual(plan.reload, true);
  assert.strictEqual(plan.keys.aac_tabs, customTabs());
  assert.strictEqual(plan.dirty.length, 0);
});

test("first sign-in uploads when the account is empty", () => {
  const local = keys({ aac_tabs: customTabs() });
  const plan = Sync.planSync({ localKeys: local, meta: { bootstrapped: false }, remote: null, now: 100 });
  assert.strictEqual(plan.action, "upload");
  assert.strictEqual(plan.reload, false);
  assert.strictEqual(plan.uploadKeys.aac_tabs, customTabs());
  assert.strictEqual(plan.rev, 1);
});

test("first sign-in asks when both sides have boards", () => {
  const local = keys({ aac_tabs: customTabs() });
  const remote = remoteFrom(keys({
    aac_tabs: JSON.stringify([{ id: "other", name: "Other", buttons: [{ id: "x", label: "Bye" }] }])
  }), 2);
  const plan = Sync.planSync({ localKeys: local, meta: { bootstrapped: false }, remote, now: 50 });
  assert.strictEqual(plan.action, "ask");
  assert.strictEqual(plan.reload, false);
});

test("combine keeps topics and buttons from both sides", () => {
  const local = JSON.stringify([
    { id: "home", name: "Home", buttons: [{ id: "b1", label: "Hi" }, { id: "b3", label: "Local" }] }
  ]);
  const remote = JSON.stringify([
    { id: "home", name: "House", buttons: [{ id: "b1", label: "Hello", audioData: "data:audio/mp3;base64,QQ" }] },
    { id: "food", name: "Food", buttons: [{ id: "b2", label: "Water" }] }
  ]);
  const merged = JSON.parse(Sync.mergeTopicsJson(local, remote));
  assert.deepStrictEqual(merged.map((topic) => topic.id), ["home", "food"]);
  const home = merged[0];
  assert.strictEqual(home.name, "Home");
  assert.deepStrictEqual(home.buttons.map((btn) => btn.id), ["b1", "b3"]);
  assert.strictEqual(home.buttons[0].label, "Hi");
  assert.strictEqual(home.buttons[0].audioData, "data:audio/mp3;base64,QQ");
});

test("history union prefers this device and caps at 50", () => {
  const local = JSON.stringify([{ id: "a", text: "one" }, { id: "b", text: "two" }]);
  const remoteItems = [{ id: "b", text: "two-old" }];
  for (let i = 0; i < 60; i++) remoteItems.push({ id: "r" + i, text: "r" });
  const merged = JSON.parse(Sync.mergeHistoryJson(local, JSON.stringify(remoteItems)));
  assert.strictEqual(merged.length, 50);
  assert.strictEqual(merged[0].id, "a");
  assert.strictEqual(merged[1].text, "two");
});

test("later edits win per key", () => {
  const local = keys({ aac_tabs: customTabs(), aac_history: JSON.stringify([{ id: "h", text: "local" }]) });
  const remoteKeys = keys({
    aac_tabs: JSON.stringify([{ id: "cloud", name: "Cloud", buttons: [] }]),
    aac_history: JSON.stringify([{ id: "h", text: "cloud" }])
  });
  const remote = remoteFrom(remoteKeys, 3, { aac_tabs: 500, aac_history: 100 });
  const meta = {
    bootstrapped: true,
    ackedRev: 3,
    times: { aac_tabs: 100, aac_history: 800 },
    keyHashes: Sync.hashAll(local),
    stripped: {}
  };
  const plan = Sync.planSync({ localKeys: local, meta, remote, now: 900 });
  assert.strictEqual(plan.action, "merge");
  assert.strictEqual(plan.keys.aac_tabs, remoteKeys.aac_tabs);
  assert.strictEqual(plan.keys.aac_history, local.aac_history);
  assert.ok(plan.applied.indexOf("aac_tabs") !== -1);
  assert.ok(plan.dirty.indexOf("aac_history") !== -1);
});

test("unchanged local copy does not overwrite a newer cloud board", () => {
  const local = keys({ aac_tabs: customTabs() });
  const remoteKeys = keys({ aac_tabs: JSON.stringify([{ id: "new", name: "New", buttons: [] }]) });
  const remote = remoteFrom(remoteKeys, 5, { aac_tabs: 200 });
  const meta = {
    bootstrapped: true,
    ackedRev: 4,
    times: { aac_tabs: 100 },
    keyHashes: Sync.hashAll(local),
    stripped: {}
  };
  const plan = Sync.planSync({ localKeys: local, meta, remote, now: 999 });
  assert.strictEqual(plan.action, "download");
  assert.strictEqual(plan.keys.aac_tabs, remoteKeys.aac_tabs);
  assert.strictEqual(plan.dirty.length, 0);
});

test("stripped audio stays on the device", () => {
  const full = JSON.stringify([{ id: "h", text: "clip", audioData: "data:audio/mp3;base64,AAAA" }]);
  const short = JSON.stringify([{ id: "h", text: "clip", audioData: null }]);
  const note = { localHash: Sync.hashValue(full), remoteHash: Sync.hashValue(short) };
  assert.strictEqual(Sync.valuesEquivalent("aac_history", full, short, { aac_history: note }), true);
  const local = keys({ aac_history: full, aac_theme: "dark" });
  const remote = remoteFrom(keys({ aac_history: short, aac_theme: "light" }), 2, {
    aac_history: 100,
    aac_theme: 100
  });
  const meta = {
    bootstrapped: true,
    times: { aac_history: 100, aac_theme: 300 },
    keyHashes: Sync.hashAll(local),
    stripped: { aac_history: note }
  };
  const plan = Sync.planSync({ localKeys: local, meta, remote, now: 400 });
  assert.strictEqual(plan.keys.aac_history, full);
  assert.ok(plan.applied.indexOf("aac_history") === -1);
  assert.ok(plan.dirty.indexOf("aac_history") === -1);
  assert.strictEqual(plan.keys.aac_theme, "dark");
  assert.strictEqual(plan.stripped.aac_history.localHash, note.localHash);
});

test("oversized history drops audio before phrases", () => {
  const clip = "data:audio/mp3;base64," + "A".repeat(Sync.CLOUD_LIMIT);
  const history = JSON.stringify([{ id: "h", text: "hello", audioData: clip }]);
  const fitted = Sync.fitCloudPayload(keys({ aac_history: history }));
  assert.strictEqual(fitted.tooBig, false);
  const stored = JSON.parse(fitted.keys.aac_history);
  assert.strictEqual(stored[0].text, "hello");
  assert.strictEqual(stored[0].audioData, null);
  assert.ok(fitted.notes.aac_history);
});

test("firestore payload round-trips", () => {
  const doc = Sync.encodeProfileDoc({
    rev: 7,
    updatedAt: "2026-10-20T00:00:00.000Z",
    deviceId: "dev",
    keys: keys({ aac_theme: "dark", elevenlabs_key: "secret" }),
    times: { aac_theme: 12 }
  });
  doc.updateTime = "2026-10-20T00:00:01.000000Z";
  const decoded = Sync.decodeProfileDoc(doc);
  assert.strictEqual(decoded.rev, 7);
  assert.strictEqual(decoded.keys.aac_theme, "dark");
  assert.strictEqual(decoded.keys.elevenlabs_key, "secret");
  assert.strictEqual(decoded.times.aac_theme, 12);
  assert.strictEqual(decoded.updateTime, doc.updateTime);
});

test("a different account does not reuse the previous sync clock", () => {
  const next = Sync.scopeMetaToUser({
    uid: "user-a",
    bootstrapped: true,
    ackedRev: 9,
    deviceId: "dev",
    keyHashes: { aac_tabs: "abc" }
  }, "user-b");
  assert.strictEqual(next.bootstrapped, false);
  assert.strictEqual(next.ackedRev, 0);
  assert.strictEqual(next.uid, "user-b");
  assert.strictEqual(next.deviceId, "dev");
  assert.deepStrictEqual(next.keyHashes, {});
});

test("auth and firestore errors stay readable", () => {
  assert.strictEqual(Sync.authErrorMessage("EMAIL_EXISTS", "create"), "That email already has an account. Sign in instead.");
  assert.strictEqual(Sync.authErrorMessage("INVALID_LOGIN_CREDENTIALS", "sign-in"), "Email or password does not match.");
  assert.strictEqual(
    Sync.authErrorMessage("OPERATION_NOT_ALLOWED", "sign-in"),
    "Turn on Email/Password sign-in for Firebase project voice-1d8a8."
  );
  assert.strictEqual(
    Sync.authErrorMessage("EMAIL_NOT_FOUND", "reset"),
    "If that email has an account, a reset message is on the way."
  );
  assert.ok(Sync.firestoreErrorMessage(403, "PERMISSION_DENIED").indexOf("firestore.rules") !== -1);
});

test("speaker and browser voice index are not synced", () => {
  assert.strictEqual(Sync.isSyncKey("aac_output_device"), false);
  assert.strictEqual(Sync.isSyncKey("aac_browser_voice_index"), false);
  assert.strictEqual(Sync.isSyncKey("aac_tabs"), true);
  assert.strictEqual(Sync.isSyncKey("elevenlabs_key"), true);
});

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all passed");
