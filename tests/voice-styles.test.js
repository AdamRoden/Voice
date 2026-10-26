"use strict";

const assert = require("assert");
const Styles = require("../js/voice-styles.js");

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

test("a missing catalog is the built-in favorites", () => {
  assert.deepStrictEqual(Styles.BUILTIN_VOICE_STYLES, [
    "anxious", "begging", "strict", "dull", "excited", "flirt", "happy",
    "indignant", "sad", "sing", "sing loud", "whisper", "yell"
  ]);
  const catalog = Styles.parseCatalog(null);
  assert.deepStrictEqual(catalog.styles, Styles.BUILTIN_VOICE_STYLES);
  assert.deepStrictEqual(catalog.favorites, [
    "begging", "strict", "flirt", "happy", "indignant", "sing loud"
  ]);
  assert.strictEqual(catalog.noneFavorite, false);
  assert.deepStrictEqual(Styles.sidebarNames(catalog), catalog.favorites);
});

test("an empty styles array is a real catalog", () => {
  const catalog = Styles.parseCatalog({ styles: [], favorites: ["happy"], noneFavorite: false });
  assert.deepStrictEqual(catalog.styles, []);
  assert.deepStrictEqual(catalog.favorites, []);
  assert.strictEqual(catalog.noneFavorite, false);
  assert.deepStrictEqual(Styles.sidebarNames(catalog), []);
});

test("names are cleaned and duplicates drop", () => {
  const catalog = Styles.parseCatalog({
    styles: ["  Happy ", "[happy]", "none", "", "soft  night"],
    favorites: ["HAPPY"]
  });
  assert.deepStrictEqual(catalog.styles, ["Happy", "soft night"]);
  assert.deepStrictEqual(catalog.favorites, ["Happy"]);
  assert.strictEqual(catalog.noneFavorite, false);
  const starredNone = Styles.parseCatalog({
    styles: ["happy"],
    favorites: [],
    noneFavorite: true
  });
  assert.strictEqual(starredNone.noneFavorite, true);
  assert.deepStrictEqual(Styles.sidebarNames(starredNone), ["none"]);
});

test("add stars the new style and rejects none and duplicates", () => {
  const start = Styles.defaultCatalog();
  const added = Styles.addStyle(start, " [soft] ");
  assert.strictEqual(added.ok, true);
  assert.strictEqual(added.name, "soft");
  assert.strictEqual(added.catalog.styles[added.catalog.styles.length - 1], "soft");
  assert.ok(Styles.isFavorite(added.catalog, "soft"));
  assert.strictEqual(Styles.addStyle(added.catalog, "SOFT").ok, false);
  assert.strictEqual(Styles.addStyle(start, "none").reason, "empty");
  assert.strictEqual(Styles.addStyle(start, "   ").reason, "empty");
  const long = Styles.addStyle(start, "x".repeat(50));
  assert.strictEqual(long.ok, true);
  assert.strictEqual(long.name.length, Styles.STYLE_NAME_MAX);
});

test("favorite and trash update both lists", () => {
  let catalog = Styles.defaultCatalog();
  catalog = Styles.toggleFavorite(catalog, "happy");
  assert.strictEqual(Styles.isFavorite(catalog, "happy"), false);
  assert.ok(Styles.sidebarNames(catalog).indexOf("happy") < 0);
  catalog = Styles.toggleFavorite(catalog, "happy");
  assert.strictEqual(Styles.isFavorite(catalog, "Happy"), true);
  catalog = Styles.toggleFavorite(catalog, "none");
  assert.strictEqual(catalog.noneFavorite, true);
  assert.strictEqual(Styles.sidebarNames(catalog)[0], "none");
  catalog = Styles.toggleFavorite(catalog, "none");
  assert.strictEqual(catalog.noneFavorite, false);
  const trashed = Styles.trashStyle(catalog, "whisper");
  assert.strictEqual(trashed.ok, true);
  assert.ok(trashed.catalog.styles.indexOf("whisper") < 0);
  assert.ok(trashed.catalog.favorites.indexOf("whisper") < 0);
  assert.strictEqual(Styles.trashStyle(trashed.catalog, "none").ok, false);
  assert.strictEqual(Styles.trashStyle(trashed.catalog, "missing").ok, false);
});

test("serialize round-trips a custom catalog", () => {
  const custom = Styles.parseCatalog({
    styles: ["calm", "happy"],
    favorites: ["calm"],
    noneFavorite: false
  });
  const again = Styles.parseCatalog(JSON.parse(Styles.serialize(custom)));
  assert.deepStrictEqual(again, custom);
});

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all ok");
