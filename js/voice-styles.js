/**
 * Voice style catalog: built-in names, favorites, and trash.
 * The side list shows favorites. The editor shows every remaining style.
 * Missing storage means the built-in styles, with begging, strict, flirt,
 * happy, indignant, and sing loud starred. "none" is not a favorite.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AacVoiceStyles = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NONE_STYLE = "none";
  const STYLE_NAME_MAX = 40;
  const BUILTIN_VOICE_STYLES = Object.freeze([
    "anxious",
    "begging",
    "strict",
    "dull",
    "excited",
    "flirt",
    "happy",
    "indignant",
    "sad",
    "sing",
    "sing loud",
    "whisper",
    "yell"
  ]);
  const DEFAULT_FAVORITE_STYLES = Object.freeze([
    "begging",
    "strict",
    "flirt",
    "happy",
    "indignant",
    "sing loud"
  ]);

  function keyOf(name) {
    return String(name == null ? "" : name).trim().toLowerCase();
  }

  /**
   * Trim, drop one wrapping [pair], drop leftover brackets.
   * "none" and an empty result are not style names.
   */
  function normalizeStyleName(raw) {
    let t = String(raw == null ? "" : raw).trim();
    if (t.length >= 2 && t.charAt(0) === "[" && t.charAt(t.length - 1) === "]") {
      t = t.slice(1, -1).trim();
    }
    t = t.replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
    if (!t || keyOf(t) === NONE_STYLE) return "";
    if (t.length > STYLE_NAME_MAX) t = t.slice(0, STYLE_NAME_MAX).trim();
    if (!t || keyOf(t) === NONE_STYLE) return "";
    return t;
  }

  function defaultCatalog() {
    const styles = BUILTIN_VOICE_STYLES.slice();
    const favKeys = new Set(DEFAULT_FAVORITE_STYLES.map(keyOf));
    return {
      styles,
      favorites: styles.filter((name) => favKeys.has(keyOf(name))),
      noneFavorite: false
    };
  }

  function cloneCatalog(catalog) {
    const source = catalog || defaultCatalog();
    return {
      styles: (source.styles || []).slice(),
      favorites: (source.favorites || []).slice(),
      noneFavorite: !!source.noneFavorite
    };
  }

  /** Null, or an object without a styles array, is the untouched default. */
  function parseCatalog(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.styles)) return defaultCatalog();
    const styles = [];
    const seen = new Set();
    raw.styles.forEach((item) => {
      const name = normalizeStyleName(item);
      const key = keyOf(name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      styles.push(name);
    });
    const favKeys = new Set();
    (Array.isArray(raw.favorites) ? raw.favorites : []).forEach((item) => {
      const key = keyOf(normalizeStyleName(item));
      if (key && seen.has(key)) favKeys.add(key);
    });
    return {
      styles,
      favorites: styles.filter((name) => favKeys.has(keyOf(name))),
      noneFavorite: raw.noneFavorite === true
    };
  }

  function serialize(catalog) {
    const next = cloneCatalog(catalog);
    return JSON.stringify({
      styles: next.styles,
      favorites: next.favorites,
      noneFavorite: next.noneFavorite
    });
  }

  /** New styles start starred so they show under the voice box. */
  function addStyle(catalog, raw) {
    const name = normalizeStyleName(raw);
    const current = cloneCatalog(catalog);
    if (!name) return { catalog: current, ok: false, reason: "empty" };
    if (current.styles.some((style) => keyOf(style) === keyOf(name))) {
      return { catalog: current, ok: false, reason: "duplicate", name };
    }
    current.styles.push(name);
    current.favorites.push(name);
    return { catalog: current, ok: true, name };
  }

  function toggleFavorite(catalog, name) {
    const current = cloneCatalog(catalog);
    const key = keyOf(name);
    if (!key || key === NONE_STYLE) {
      current.noneFavorite = !current.noneFavorite;
      return current;
    }
    const match = current.styles.find((style) => keyOf(style) === key);
    if (!match) return current;
    const favKeys = new Set(current.favorites.map(keyOf));
    if (favKeys.has(key)) favKeys.delete(key);
    else favKeys.add(key);
    current.favorites = current.styles.filter((style) => favKeys.has(keyOf(style)));
    return current;
  }

  function trashStyle(catalog, name) {
    const current = cloneCatalog(catalog);
    const key = keyOf(normalizeStyleName(name) || name);
    if (!key || key === NONE_STYLE) return { catalog: current, ok: false, reason: "none" };
    if (!current.styles.some((style) => keyOf(style) === key)) {
      return { catalog: current, ok: false, reason: "missing" };
    }
    current.styles = current.styles.filter((style) => keyOf(style) !== key);
    current.favorites = current.favorites.filter((style) => keyOf(style) !== key);
    return { catalog: current, ok: true };
  }

  function isFavorite(catalog, name) {
    const key = keyOf(name);
    if (!catalog) return false;
    if (!key || key === NONE_STYLE) return !!catalog.noneFavorite;
    return (catalog.favorites || []).some((style) => keyOf(style) === key);
  }

  /** Side-list order: none, then favorites in catalog order. */
  function sidebarNames(catalog) {
    const names = [];
    if (catalog && catalog.noneFavorite) names.push(NONE_STYLE);
    (catalog && catalog.favorites ? catalog.favorites : []).forEach((name) => {
      const key = keyOf(name);
      if (key && key !== NONE_STYLE) names.push(name);
    });
    return names;
  }

  return {
    NONE_STYLE,
    STYLE_NAME_MAX,
    BUILTIN_VOICE_STYLES,
    keyOf,
    normalizeStyleName,
    defaultCatalog,
    parseCatalog,
    serialize,
    addStyle,
    toggleFavorite,
    trashStyle,
    isFavorite,
    sidebarNames
  };
});
