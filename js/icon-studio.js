/**
 * Google Fonts / Material Symbols icon studio (search, pick, style).
 */
(function (global) {
  "use strict";

  const DEFAULT_FALLBACK = [
      { ico: "chat", name: "chat message talk speech bubble communication", popularity: 1e6 },
      { ico: "folder", name: "folder topic category directory storage", popularity: 9e5 },
      { ico: "history", name: "time clock history watch schedule recent", popularity: 9e5 },
      { ico: "settings", name: "settings gear cog preferences options", popularity: 9e5 },
      { ico: "volume_up", name: "speaker audio sound volume play music", popularity: 9e5 },
      { ico: "home", name: "home house building living residence", popularity: 9e5 },
      { ico: "star", name: "star favorite rating important badge", popularity: 9e5 },
      { ico: "restaurant", name: "food burger eat dining restaurant meal", popularity: 8e5 },
      { ico: "local_pizza", name: "pizza slice Italian food dinner", popularity: 8e5 },
      { ico: "local_cafe", name: "coffee tea drink cup beverage morning", popularity: 8e5 },
      { ico: "directions_car", name: "car vehicle travel drive transport automobile", popularity: 8e5 },
      { ico: "flight", name: "airplane flight travel vacation fly", popularity: 8e5 },
      { ico: "sports_esports", name: "game play controller fun hobby entertainment", popularity: 8e5 },
      { ico: "medical_services", name: "doctor medical hospital stethoscope health illness", popularity: 8e5 },
      { ico: "medication", name: "pill medicine drug prescription pharmacy health", popularity: 8e5 },
      { ico: "shopping_cart", name: "shopping cart store groceries market buy", popularity: 8e5 },
      { ico: "music_note", name: "music note song audio melody rhythm", popularity: 8e5 },
      { ico: "lightbulb", name: "idea lightbulb bright thought electricity", popularity: 8e5 },
      { ico: "pets", name: "pets dog cat animal paw footprint", popularity: 8e5 },
      { ico: "call", name: "phone call contact telephone dial", popularity: 8e5 },
      { ico: "favorite", name: "heart love like care feeling emotion", popularity: 8e5 },
      { ico: "sentiment_satisfied", name: "happy smile face joy glad emotion good", popularity: 8e5 },
      { ico: "sentiment_dissatisfied", name: "sad cry tears upset unhappy feeling", popularity: 8e5 },
      { ico: "bed", name: "sleep tired nap rest bed exhausted", popularity: 8e5 },
      { ico: "priority_high", name: "exclamation alert attention warning important", popularity: 8e5 },
      { ico: "help", name: "question ask help query doubt what", popularity: 8e5 },
      { ico: "workspace_premium", name: "glowing star bright excellent winner", popularity: 8e5 },
      { ico: "celebration", name: "party celebration congrats birthday festive", popularity: 8e5 },
      { ico: "visibility", name: "eyes look see watch observe vision", popularity: 8e5 },
      { ico: "hearing", name: "ear listen hear sound deaf auditory", popularity: 8e5 },
      { ico: "psychology", name: "brain mind think psychology intelligence idea", popularity: 8e5 },
      { ico: "bolt", name: "lightning fast power energy electric speed", popularity: 8e5 },
      { ico: "trophy", name: "trophy win award achievement success goal", popularity: 8e5 },
      { ico: "edit", name: "note write pencil text edit document", popularity: 8e5 },
      { ico: "push_pin", name: "pin tack location assign fix remember", popularity: 8e5 },
      { ico: "delete", name: "trash garbage delete remove dispose clear", popularity: 8e5 },
      { ico: "key", name: "key lock password access security safe", popularity: 8e5 },
      { ico: "directions_walk", name: "walk pedestrian go step move exercise", popularity: 8e5 },
      { ico: "thumb_up", name: "thumbs up yes approve like good okay", popularity: 8e5 },
      { ico: "thumb_down", name: "thumbs down no disapprove bad reject", popularity: 8e5 },
      { ico: "recycling", name: "recycle reuse environment arrows", popularity: 8e5 }
    ];

  /**
   * @param {{
   *   fallbackCatalog: Array<{ico:string,name:string,popularity:number}>,
   *   mapSymbol: (raw: string, fallback?: string) => string,
   *   escapeHtml: (s: string) => string,
   *   openModal: (id: string) => void,
   *   closeModals: () => void,
   *   modalOverlay: HTMLElement|null,
   *   lsSet: (k: string, v: any) => void,
   *   getIconStyles: () => { fill: number, wght: number, grad: number, opsz: number },
   *   setIconStyles: (s: { fill: number, wght: number, grad: number, opsz: number }) => void,
   *   applyGlobalIconStyles: () => void
   * }} deps
   */
  function create(deps) {
    const d = deps || {};
    const ICON_DATABASE_FALLBACK = (d.fallbackCatalog && d.fallbackCatalog.length) ? d.fallbackCatalog : DEFAULT_FALLBACK.slice();
    const mapSymbol = d.mapSymbol;
    const escapeHtml = d.escapeHtml;
    const openModal = d.openModal;
    const closeModals = d.closeModals;
    const modalOverlay = d.modalOverlay;
    const lsSet = d.lsSet;

        let iconFill = d.getIconStyles().fill;
    let iconWght = d.getIconStyles().wght;
    let iconGrad = d.getIconStyles().grad;
    let iconOpsz = d.getIconStyles().opsz;
    let initialIconStyles = {};
    let targetStudioInputId = null;
    let selectedStudioIcon = null;

    function pullStyles() {
      const s = d.getIconStyles();
      iconFill = s.fill;
      iconWght = s.wght;
      iconGrad = s.grad;
      iconOpsz = s.opsz;
    }
    function pushStyles() {
      d.setIconStyles({ fill: iconFill, wght: iconWght, grad: iconGrad, opsz: iconOpsz });
      d.applyGlobalIconStyles();
    }
    function applyGlobalIconStyles() {
      pushStyles();
    }

/**
 * Catalog powering fonts.google.com/icons (Material Symbols + Icons).
 * Response is JSON with a )]}' anti-XSSI prefix.
 * incomplete=1 includes Material Symbols–only glyphs (e.g. recycling).
 */
const GOOGLE_ICONS_METADATA_URL = "https://fonts.google.com/metadata/icons?incomplete=1";
/** CORS-friendly name list if the Google metadata endpoint is blocked. */
const MATERIAL_SYMBOLS_NAMES_URL =
  "https://raw.githubusercontent.com/marella/material-symbols/main/material-symbols/index.d.ts";
const ICON_SEARCH_RESULT_LIMIT = 120;
const ICON_SEARCH_DEBOUNCE_MS = 220;

let iconStudioReturnModalId = null;
/** @type {Array<{ico:string,name:string,popularity:number}>|null} */
let iconCatalog = null;
let iconCatalogSource = "local"; // "google" | "github" | "local"
let iconCatalogLoadPromise = null;
let iconSearchTimer = null;
let iconSearchRequestId = 0;

function parseGoogleIconsMetadata(text) {
  let raw = String(text || "").trim();
  // Google Fonts prefixes JSON with )]}' to discourage naive XSSI
  if (raw.startsWith(")]}'")) {
    const brace = raw.indexOf("{");
    if (brace >= 0) raw = raw.slice(brace);
  }
  const data = JSON.parse(raw);
  const icons = Array.isArray(data.icons) ? data.icons : [];
  return icons.map((icon) => {
    const ico = String(icon.name || "").trim();
    const tags = Array.isArray(icon.tags) ? icon.tags : [];
    const cats = Array.isArray(icon.categories) ? icon.categories : [];
    const haystack = [ico, ...tags, ...cats].join(" ").toLowerCase();
    return {
      ico,
      name: haystack,
      popularity: Number(icon.popularity) || 0
    };
  }).filter((item) => item.ico);
}

function parseMaterialSymbolsNamesDts(text) {
  const names = [];
  const re = /"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    names.push(m[1]);
  }
  // de-dupe while preserving order
  const seen = new Set();
  const out = [];
  for (const ico of names) {
    if (seen.has(ico)) continue;
    seen.add(ico);
    out.push({ ico, name: ico, popularity: 0 });
  }
  return out;
}

async function loadIconCatalogFromGoogle() {
  const res = await fetch(GOOGLE_ICONS_METADATA_URL, {
    credentials: "omit",
    mode: "cors"
  });
  if (!res.ok) throw new Error(`Google icons metadata HTTP ${res.status}`);
  const text = await res.text();
  const list = parseGoogleIconsMetadata(text);
  if (!list.length) throw new Error("Google icons metadata empty");
  return { list, source: "google" };
}

async function loadIconCatalogFromGithubNames() {
  const res = await fetch(MATERIAL_SYMBOLS_NAMES_URL, {
    credentials: "omit",
    mode: "cors"
  });
  if (!res.ok) throw new Error(`Material Symbols names HTTP ${res.status}`);
  const text = await res.text();
  const list = parseMaterialSymbolsNamesDts(text);
  if (!list.length) throw new Error("Material Symbols names empty");
  return { list, source: "github" };
}

async function ensureIconCatalog() {
  if (iconCatalog && iconCatalog.length) {
    return { list: iconCatalog, source: iconCatalogSource };
  }
  if (iconCatalogLoadPromise) return iconCatalogLoadPromise;

  iconCatalogLoadPromise = (async () => {
    // 1) Official catalog used by fonts.google.com/icons
    try {
      const loaded = await loadIconCatalogFromGoogle();
      iconCatalog = loaded.list;
      iconCatalogSource = loaded.source;
      return loaded;
    } catch (_) { /* CORS / offline / file:// */ }

    // 2) CORS-friendly full Material Symbols name list
    try {
      const loaded = await loadIconCatalogFromGithubNames();
      iconCatalog = loaded.list;
      iconCatalogSource = loaded.source;
      return loaded;
    } catch (_) { /* network */ }

    // 3) Built-in short list
    iconCatalog = ICON_DATABASE_FALLBACK.slice();
    iconCatalogSource = "local";
    return { list: iconCatalog, source: iconCatalogSource };
  })();

  try {
    return await iconCatalogLoadPromise;
  } finally {
    iconCatalogLoadPromise = null;
  }
}

function filterIconCatalog(catalog, query) {
  const q = String(query || "").toLowerCase().trim();
  let list = catalog;
  if (q) {
    list = catalog.filter((item) =>
      item.ico.includes(q) || (item.name && item.name.includes(q))
    );
  }
  list = list.slice().sort((a, b) => {
    if (q) {
      const rank = (item) => {
        if (item.ico === q) return 0;
        if (item.ico.startsWith(q)) return 1;
        if (item.ico.includes(q)) return 2;
        return 3;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
    }
    return (b.popularity || 0) - (a.popularity || 0) || a.ico.localeCompare(b.ico);
  });
  return list.slice(0, ICON_SEARCH_RESULT_LIMIT);
}

function iconCatalogSourceLabel(source) {
  if (source === "google") return "fonts.google.com/icons";
  if (source === "github") return "Material Symbols (mirror)";
  return "offline favorites";
}

function paintIconStudioGrid(items, query, source) {
  const grid = document.getElementById("icon-studio-grid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!items.length) {
    grid.innerHTML = `<div class="icon-studio-empty">No matching icons for “${escapeHtml(query || "")}”</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = `icon-studio-item material-symbols-outlined ${item.ico === selectedStudioIcon ? "selected" : ""}`;
    el.textContent = item.ico;
    el.title = item.ico;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", item.ico);
    const select = () => {
      grid.querySelectorAll(".icon-studio-item").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      selectedStudioIcon = item.ico;
      const status = document.getElementById("icon-studio-status");
      if (status) status.textContent = `Selected: ${item.ico} · ${iconCatalogSourceLabel(source)}`;
    };
    el.addEventListener("click", select);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });
    frag.appendChild(el);
  });
  grid.appendChild(frag);

  const status = document.getElementById("icon-studio-status");
  if (status && selectedStudioIcon) {
    const qNote = query ? ` · “${query.trim()}”` : " · popular";
    status.textContent =
      `Selected: ${selectedStudioIcon}${qNote} · ${items.length} shown · ${iconCatalogSourceLabel(source)}`;
  }
}

async function renderIconStudioGrid(query) {
  const grid = document.getElementById("icon-studio-grid");
  if (!grid) return;
  const reqId = ++iconSearchRequestId;
  const q = String(query || "");

  if (!iconCatalog) {
    grid.innerHTML = `<div class="icon-studio-empty">Loading icons from fonts.google.com…</div>`;
  }

  try {
    const { list, source } = await ensureIconCatalog();
    if (reqId !== iconSearchRequestId) return; // stale search
    const filtered = filterIconCatalog(list, q);
    paintIconStudioGrid(filtered, q, source);
  } catch (_) {
    if (reqId !== iconSearchRequestId) return;
    paintIconStudioGrid(
      filterIconCatalog(ICON_DATABASE_FALLBACK, q),
      q,
      "local"
    );
  }
}

function scheduleIconStudioSearch(query) {
  clearTimeout(iconSearchTimer);
  iconSearchTimer = setTimeout(() => {
    renderIconStudioGrid(query);
  }, ICON_SEARCH_DEBOUNCE_MS);
}

function openIconStudio(targetInputId) {
  pullStyles();
  targetStudioInputId = targetInputId;
  const currentVal = document.getElementById(targetInputId)?.value || "chat";
  selectedStudioIcon = mapSymbol(currentVal, "chat");

  // Remember which edit modal to restore after picking an icon
  const openParent = document.querySelector(".modal.open:not(#icon-studio-modal)");
  iconStudioReturnModalId = openParent ? openParent.id : null;

  initialIconStyles = { fill: iconFill, wght: iconWght, grad: iconGrad, opsz: iconOpsz };
  const searchInput = document.getElementById("icon-search-input");
  if (searchInput) searchInput.value = "";
  document.getElementById("icon-studio-status").textContent = `Selected: ${selectedStudioIcon}`;
  applyGlobalIconStyles();
  renderIconStudioGrid("");
  openModal("icon-studio-modal");
  // Prefetch catalog as soon as studio opens
  ensureIconCatalog().catch(() => {});
}

function closeIconStudio(save) {
  if (!save) {
    iconFill = initialIconStyles.fill;
    iconWght = initialIconStyles.wght;
    iconGrad = initialIconStyles.grad;
    iconOpsz = initialIconStyles.opsz;
    applyGlobalIconStyles();
  }
  const returnTo = iconStudioReturnModalId;
  iconStudioReturnModalId = null;
  if (returnTo) {
    document.querySelectorAll(".modal").forEach(m => m.classList.remove("open"));
    document.getElementById(returnTo)?.classList.add("open");
    modalOverlay.classList.add("open");
    document.body.classList.add("modal-open");
  } else {
    closeModals();
  }
}

document.getElementById("icon-search-input").addEventListener("input", (e) => {
  scheduleIconStudioSearch(e.target.value);
});
document.getElementById("studio-fill-btn").addEventListener("click", () => { iconFill = iconFill ? 0 : 1; applyGlobalIconStyles(); });
document.getElementById("studio-wght-slider").addEventListener("input", (e) => { iconWght = parseInt(e.target.value, 10); applyGlobalIconStyles(); });
document.getElementById("studio-grad-slider").addEventListener("input", (e) => { iconGrad = parseInt(e.target.value, 10); applyGlobalIconStyles(); });
document.getElementById("studio-opsz-slider").addEventListener("input", (e) => { iconOpsz = parseInt(e.target.value, 10); applyGlobalIconStyles(); });

function setStudioIconSize(px, btnEl) {
  document.querySelectorAll(".icon-size-btns .size-btn").forEach(b => b.classList.remove("active"));
  btnEl.classList.add("active");
  document.querySelectorAll(".icon-studio-item").forEach(item => item.style.fontSize = `${px}px`);
}

document.getElementById("confirm-icon-studio-btn").addEventListener("click", () => {
  if (targetStudioInputId && selectedStudioIcon) {
    const input = document.getElementById(targetStudioInputId);
    if (input) input.value = selectedStudioIcon;
  }
  lsSet("aac_icon_fill", iconFill);
  lsSet("aac_icon_wght", iconWght);
  lsSet("aac_icon_grad", iconGrad);
  lsSet("aac_icon_opsz", iconOpsz);
  closeIconStudio(true);
});



    return {
      openIconStudio,
      closeIconStudio,
      setStudioIconSize
    };
  }

  global.AacIconStudio = { create, DEFAULT_FALLBACK };
})(typeof window !== "undefined" ? window : globalThis);