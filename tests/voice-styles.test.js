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
  assert.strictEqual(Object.prototype.hasOwnProperty.call(catalog, "noneFavorite"), false);
});

test("an empty styles array is a real catalog", () => {
  const catalog = Styles.parseCatalog({ styles: [], favorites: ["happy"], noneFavorite: false });
  assert.deepStrictEqual(catalog.styles, []);
  assert.deepStrictEqual(catalog.favorites, []);
});

test("names are cleaned and duplicates drop", () => {
  const catalog = Styles.parseCatalog({
    styles: ["  Happy ", "[happy]", "none", "", "soft  night"],
    favorites: ["HAPPY"]
  });
  assert.deepStrictEqual(catalog.styles, ["Happy", "soft night"]);
  assert.deepStrictEqual(catalog.favorites, ["Happy"]);
  const oldNone = Styles.parseCatalog({
    styles: ["happy"],
    favorites: ["happy"],
    noneFavorite: true
  });
  assert.deepStrictEqual(oldNone, { styles: ["happy"], favorites: ["happy"] });
  assert.strictEqual(JSON.parse(Styles.serialize(oldNone)).noneFavorite, undefined);
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
  assert.ok(catalog.favorites.indexOf("happy") < 0);
  catalog = Styles.toggleFavorite(catalog, "happy");
  assert.strictEqual(Styles.isFavorite(catalog, "Happy"), true);
  const beforeNone = Styles.serialize(catalog);
  catalog = Styles.toggleFavorite(catalog, "none");
  assert.strictEqual(Styles.serialize(catalog), beforeNone);
  assert.strictEqual(Styles.isFavorite(catalog, "none"), false);
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
    favorites: ["calm"]
  });
  const again = Styles.parseCatalog(JSON.parse(Styles.serialize(custom)));
  assert.deepStrictEqual(again, custom);
});

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all ok");
