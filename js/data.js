// Jeux de données datés : liste publiée, copies locales (Cache du navigateur), choix du jeu actif, menu « Données ».
// Chargé avant app.js : les fonctions n'utilisent les globales de app.js (dataset, setDataset…) qu'à l'appel.

const ACTIVE_KEY = "activeDataset"; // "latest" ou une date AAAA-MM-JJ
const INDEX_COPY_KEY = "indexCopy";
const LOCAL_INFO_KEY = "localInfo"; // date -> { count, bytes }, pour les jeux téléchargés
const HAS_CACHE = typeof caches !== "undefined";
const cacheName = (date) => `data-${date}`;

let publishedIndex = null; // { datasets: [{ date, count, bytes }], latest }
let localSets = [];        // dates des jeux complets présents sur l'appareil
let downloading = null;    // { date, pct }
let dataMessage = "";

const lsGet = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignoré */ } };
const fmtMo = (b) => tr("unit.mb", { n: numberFormat(b / 1e6, b < 1e7 ? 1 : 0) });
// fmtDay (date d'un jeu) : voir format.js

// ---------- Liste publiée et copies locales ----------
async function loadIndex() {
  try {
    const r = await fetch("data/index.json", { cache: "no-store" });
    if (!r.ok) throw new Error("index");
    publishedIndex = await r.json();
    lsSet(INDEX_COPY_KEY, publishedIndex);
  } catch {
    publishedIndex = lsGet(INDEX_COPY_KEY, null); // hors ligne : dernière liste connue
  }
}

async function refreshLocalSets() {
  localSets = [];
  if (!HAS_CACHE) return;
  for (const key of await caches.keys()) {
    if (!key.startsWith("data-")) continue;
    const date = key.slice(5);
    const cache = await caches.open(key);
    if (await cache.match(`data/${date}/meta.json`)) localSets.push(date);
  }
  localSets.sort().reverse();
}

async function fetchMeta(date, isLocal) {
  const url = `data/${date}/meta.json`;
  if (isLocal) {
    const hit = await (await caches.open(cacheName(date))).match(url);
    if (hit) return hit.json();
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error("meta");
  return r.json();
}

// Jeu à utiliser : le choix de l'utilisateur, sinon les dernières données, sinon la copie locale la plus récente
async function resolveDataset() {
  await loadIndex();
  await refreshLocalSets();
  const choice = lsGet(ACTIVE_KEY, "latest");
  const latest = publishedIndex && publishedIndex.latest;
  const candidates = [];
  for (const date of [choice === "latest" ? latest : choice, latest, ...localSets]) {
    if (date && !candidates.includes(date)) candidates.push(date);
  }
  for (const date of candidates) {
    const isLocal = localSets.includes(date);
    try {
      return { date, base: `data/${date}`, meta: await fetchMeta(date, isLocal), local: isLocal };
    } catch { /* essaie le suivant */ }
  }
  throw new Error("aucun jeu de données disponible");
}

// Lit un fichier du jeu actif : copie locale si elle existe, sinon réseau
async function dataFetch(url) {
  if (dataset.local) {
    const hit = await (await caches.open(cacheName(dataset.date))).match(url);
    if (hit) return hit;
  }
  return fetch(url);
}

// ---------- Téléchargement et suppression ----------
async function downloadDataset(date) {
  const base = `data/${date}`;
  const meta = await (await fetch(`${base}/meta.json`)).json();
  const cache = await caches.open(cacheName(date));
  const keys = Object.keys(meta.tiles);
  let next = 0;
  let done = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < keys.length) {
      const url = `${base}/tiles/${keys[next++]}.json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(url);
      await cache.put(url, r);
      done++;
      const pct = Math.floor((100 * done) / keys.length);
      if (pct !== downloading.pct) { downloading.pct = pct; renderDataPanel(); }
    }
  }
  try {
    await Promise.all(Array.from({ length: 6 }, worker));
    // meta.json en dernier : sa présence marque un jeu complet
    await cache.put(`${base}/meta.json`, new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json" } }));
  } catch (e) {
    failed = true;
    await caches.delete(cacheName(date));
    throw e;
  }
  const published = publishedIndex && publishedIndex.datasets.find((d) => d.date === date);
  const info = lsGet(LOCAL_INFO_KEY, {});
  info[date] = { count: meta.count, bytes: published ? published.bytes : 0 };
  lsSet(LOCAL_INFO_KEY, info);
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* ignoré */ }
}

async function startDownload(date) {
  if (downloading) return;
  downloading = { date, pct: 0 };
  dataMessage = "";
  renderDataPanel();
  try {
    await downloadDataset(date);
    dataMessage = tr("data.downloaded", { date: fmtDay(date) });
    // si ce jeu est celui utilisé, on lit désormais sa copie locale : c'est le même contenu, rien à recharger
    // (recharger fermerait la liste de résultats qu'on est peut-être en train de lire)
    if (dataset.date === date) dataset.local = true;
  } catch {
    dataMessage = tr("data.downloadFailed");
  }
  downloading = null;
  await refreshLocalSets();
  updateDataBadge();
  renderDataPanel();
}

async function deleteDataset(date) {
  const bytes = (lsGet(LOCAL_INFO_KEY, {})[date] || {}).bytes || 0;
  await caches.delete(cacheName(date));
  const info = lsGet(LOCAL_INFO_KEY, {});
  delete info[date];
  lsSet(LOCAL_INFO_KEY, info);
  await refreshLocalSets();
  dataMessage = tr("data.deleted", { date: fmtDay(date), freed: bytes ? tr("data.freed", { size: fmtMo(bytes) }) : "" });
  if (dataset.date === date) await applyChoice("latest");
  updateDataBadge();
  renderDataPanel();
}

async function applyChoice(choice) {
  lsSet(ACTIVE_KEY, choice);
  setDataset(await resolveDataset());
}

// ---------- Menu « Données » ----------
const panelEl = document.getElementById("data-panel");
const dataBtn = document.getElementById("data-toggle");

function hasUpdate() {
  return Boolean(publishedIndex && localSets.length && !localSets.includes(publishedIndex.latest));
}
function updateDataBadge() { dataBtn.classList.toggle("has-update", hasUpdate()); }

function allDatasets() {
  const info = lsGet(LOCAL_INFO_KEY, {});
  const map = new Map();
  (publishedIndex ? publishedIndex.datasets : []).forEach((d) => map.set(d.date, { ...d, published: true }));
  localSets.forEach((date) => {
    if (!map.has(date)) map.set(date, { date, count: (info[date] || {}).count, bytes: (info[date] || {}).bytes, published: false });
  });
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function renderDataPanel() {
  if (panelEl.hidden) return;
  const info = lsGet(LOCAL_INFO_KEY, {});
  const sets = allDatasets();
  const latest = publishedIndex && publishedIndex.latest;
  const choice = lsGet(ACTIVE_KEY, "latest");
  const usedBytes = localSets.reduce((n, d) => n + ((info[d] || {}).bytes || 0), 0);
  const newest = sets.find((s) => s.date === latest);
  const rows = sets.map((s) => {
    const isLocal = localSets.includes(s.date);
    const active = dataset && dataset.date === s.date;
    const isLatest = s.date === latest;
    const busy = downloading && downloading.date === s.date;
    const tags = [
      active ? `<span class="tag on">${tr("data.tag.used")}</span>` : "",
      isLatest ? `<span class="tag">${tr("data.tag.latest")}</span>` : "",
      isLocal ? `<span class="tag">${tr("data.tag.local")}</span>` : `<span class="tag off">${tr("data.tag.onlineOnly")}</span>`,
      s.published ? "" : `<span class="tag off">${tr("data.tag.unpublished")}</span>`,
    ].join("");
    const buttons = [
      active ? "" : `<button type="button" data-act="use" data-date="${s.date}">${tr("data.use")}</button>`,
      isLocal
        ? `<button type="button" class="del" data-act="delete" data-date="${s.date}">${tr("data.delete", { size: s.bytes ? ` (${fmtMo(s.bytes)})` : "" })}</button>`
        : `<button type="button" data-act="download" data-date="${s.date}" ${downloading || !HAS_CACHE ? "disabled" : ""}>${busy ? tr("data.downloading", { pct: downloading.pct }) : tr("data.download", { size: s.bytes ? ` (${fmtMo(s.bytes)})` : "" })}</button>`,
    ].join("");
    return `<article class="dset"><div class="dset-head"><b>${fmtDay(s.date)}</b> · ${tr("data.count", { count: s.count ? numberFormat(s.count) : "?" })}${s.bytes ? ` · ${fmtMo(s.bytes)}` : ""}</div>
      <div class="tags">${tags}</div><div class="dset-actions">${buttons}</div></article>`;
  }).join("");
  // L'encadré jaune du haut : la mise à jour ou l'invitation à télécharger, l'absence de cache éventuelle, puis l'espace occupé
  const bannerTexts = [
    hasUpdate() && newest ? tr("data.updateBanner", { date: fmtDay(latest), size: newest.bytes ? ` (${fmtMo(newest.bytes)})` : "" })
      : !localSets.length && HAS_CACHE ? tr("data.downloadBanner") : "",
    HAS_CACHE ? "" : tr("data.noCache"),
    tr("data.total", { size: fmtMo(usedBytes) }),
  ].filter(Boolean);
  const banner = `<div class="banner">${bannerTexts.map((text) => `<p>${text}</p>`).join("")}</div>`;
  panelEl.innerHTML = `<div class="data-card"><header><b>${tr("nav.data")}</b><button type="button" class="sheet-close" data-act="close-data">${tr("common.close")}</button></header>
    ${banner}${dataMessage ? `<p class="msg">${dataMessage}</p>` : ""}
    ${choice !== "latest" ? `<p class="note-line">${tr("data.manual", { button: `<button type="button" class="link" data-act="auto">${tr("data.backToLatest")}</button>` })}</p>`
      : dataset && dataset.date === latest ? `<p class="note-line">${tr("data.latestInUse")}</p>` : ""}
    ${rows || `<p>${tr("data.listUnavailable")}</p>`}
    ${ignoredSectionHtml()}</div>`;
}

// Les défibrillateurs ignorés avec « Un problème ? » (quick.js) : la liste, pour pouvoir les rétablir
function ignoredSectionHtml() {
  if (typeof ignoredList !== "function") return "";
  const list = ignoredList();
  const durations = [["day", unitText(24, "hour")], ["week", unitText(1, "week")], ["month", unitText(1, "month")], ["change", tr("ignored.d.change")]];
  const items = list.map((r) => `<article class="dset ignored-item"><div class="ignored-info"><b>${esc(r.name || tr("aed.fallbackName"))}</b>` +
    `${r.place ? `<span>${esc(r.place)}</span>` : ""}<span class="tag">${ignoredLeftText(r)}</span>` +
    `<label class="ignored-duration">${tr("ignored.duration")} <select data-gid="${r.gid}">${durations.map(([mode, text]) =>
      `<option value="${mode}"${(r.mode || "day") === mode ? " selected" : ""}${mode === "change" && !r.fp ? " disabled" : ""}>${esc(text)}</option>`).join("")}</select></label></div>` +
    `<button type="button" data-act="restore-ignored" data-gid="${r.gid}">${tr("ignored.restore")}</button></article>`).join("");
  // « tout rétablir » est un lien dans l'explication ; sans défibrillateur ignoré, il n'y a rien à rétablir : ce n'est que du texte
  const label = tr("ignored.restoreAll");
  const all = list.length ? `<a href="#" role="button" data-act="restore-all">${label}</a>` : label;
  return `<section class="ignored"><h3>${tr("ignored.title")}</h3><p class="note-line">${tr("ignored.help", { link: all })}</p>` +
    (list.length ? items : `<p>${tr("ignored.none")}</p>`) + "</section>";
}

panelEl.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) { if (e.target === panelEl) closeDataPanel(); return; }
  const date = el.dataset.date;
  switch (el.dataset.act) {
    case "close-data": closeDataPanel(); break;
    case "restore-ignored": restoreIgnored(+el.dataset.gid); renderDataPanel(); refreshPopupLinks(); refreshResultsAfterRestore(); break;
    case "restore-all": e.preventDefault(); restoreAllIgnored(); renderDataPanel(); refreshPopupLinks(); refreshResultsAfterRestore(); break;
    case "download": startDownload(date); break;
    case "delete":
      if (confirm(tr("data.confirmDelete", { date: fmtDay(date) }))) await deleteDataset(date);
      break;
    case "use": {
      await applyChoice(date === (publishedIndex && publishedIndex.latest) ? "latest" : date);
      dataMessage = tr("data.used", { date: fmtDay(date) });
      renderDataPanel();
      break;
    }
    case "auto":
      await applyChoice("latest");
      dataMessage = tr("data.backToLatestDone");
      renderDataPanel();
      break;
  }
});

// section : sélecteur de la partie du panneau à amener en vue (par exemple « .ignored »)
// La durée d'un défibrillateur ignoré, choisie dans sa liste déroulante : elle repart d'aujourd'hui
panelEl.addEventListener("change", (e) => {
  const select = e.target.closest(".ignored-duration select");
  if (!select) return;
  setReportDuration(+select.dataset.gid, select.value);
  renderDataPanel();
  refreshPopupLinks();
});

async function openDataPanel(section) {
  panelEl.hidden = false;
  dataMessage = "";
  renderDataPanel();
  const closeBtn = panelEl.querySelector(".sheet-close");
  if (closeBtn) closeBtn.focus();
  await loadIndex();
  await refreshLocalSets();
  updateDataBadge();
  renderDataPanel();
  const target = section && panelEl.querySelector(section);
  if (target) target.scrollIntoView({ block: "start" });
}
function closeDataPanel() { panelEl.hidden = true; dataBtn.focus(); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panelEl.hidden) closeDataPanel(); });

dataBtn.addEventListener("click", () => openDataPanel());
// Au démarrage, le badge de mise à jour est calculé après la résolution du jeu (voir init dans app.js)
