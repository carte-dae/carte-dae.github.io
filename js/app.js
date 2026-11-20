const MIN_ZOOM = 12;
// Zones denses (centre de Paris : plus de 8 000 DAE dans une vue de téléphone au niveau 12) : on ne charge ni ne dessine tout.
// Entre DENSE_ZOOM et la fin du zoom, c'est le nombre réel de points visibles qui décide (MAX_DRAWN), pas le poids d'une tuile entière :
// le zoom est libre (zoomSnap 0), on peut s'arrêter à 13,6 dans une banlieue où il n'y a que 400 points visibles.
const DENSE_ZOOM = 13;         // sous ce niveau, une vue très dense n'est même pas chargée
const DENSE_TILE_TOTAL = 8000; // nombre de DAE des tuiles d'une vue à partir duquel elle est « très dense »
const MAX_DRAWN = 2000;        // au-delà de ce nombre de points visibles, on n'en dessine aucun

// Visage de bébé (yeux et sourire évidés : la couleur du point apparaît à travers), dessiné dans le même canevas que les points, juste
// après son disque : un point voisin dessiné plus tard le recouvre aussi, comme il recouvre le disque (un visage posé dans le DOM
// resterait au-dessus de tous les points, et paraîtrait décalé par rapport au point visible). Dessin sur 24 × 24, affiché en 13 × 13.
const BABY_FACE = new Path2D(BABY_FACE_PATH); // les tracés et BABY_PX viennent de js/dae-view.js
const BABY_EARS = new Path2D(BABY_EARS_PATH);
const BABY_CURL = new Path2D(BABY_CURL_PATH);
const BabyMarker = L.CircleMarker.extend({
  _updatePath() {
    const r = this._renderer;
    if (!r._drawing || this._empty()) return;
    const ctx = r._ctx;
    ctx.save();
    ctx.translate(this._point.x - BABY_PX / 2, this._point.y - BABY_PX / 2);
    ctx.scale(BABY_PX / 24, BABY_PX / 24);
    ctx.globalAlpha = 1;
    ctx.fillStyle = ctx.strokeStyle = "#fff";
    ctx.fill(BABY_FACE, "evenodd");
    ctx.fill(BABY_EARS);
    ctx.lineWidth = 1.9;
    ctx.lineCap = "round";
    ctx.setLineDash([]);
    ctx.stroke(BABY_CURL);
    ctx.restore();
  },
});

// zoomSnap: 0 : le pincement des doigts s'arrête où on le lâche. Avec la valeur par défaut (1), la carte « revient » au niveau
// entier le plus proche : un petit pincement ne change rien, comme si la carte était aimantée.
const map = L.map("map", { preferCanvas: true, zoomControl: false, zoomSnap: 0 }).setView([46.6, 2.5], 6);
L.control.zoom({ position: "bottomright" }).addTo(map);

// Molette et pincement du pavé tactile d'un ordinateur (le navigateur envoie le pincement comme une molette avec Ctrl, par petits pas).
// Leaflet les traite en crans entiers, avec un délai et une animation : la carte zoome à peine ou lentement. On les convertit nous-mêmes, en continu.
// Comme le pincement des doigts de Leaflet (touchZoom), on déplace la vue sans recharger ni élaguer les tuiles pendant le geste (_move
// avec pinch) : les tuiles déjà affichées s'agrandissent, sans clignotement ; tout se met à jour une fois le geste fini (_moveEnd).
// Ces trois méthodes sont internes à Leaflet, qui est figé dans vendor/.
const PINCH_ZOOM_PER_PX = 0.03; // niveaux de zoom par pixel de défilement, pincement du pavé tactile
const WHEEL_ZOOM_PER_PX = 0.015; // idem pour la molette d'une souris (un cran ≈ 100 px) : un cran et demi de zoom, sans le délai ni l'animation de Leaflet
const PINCH_END_MS = 150;       // silence qui marque la fin du geste
let pinchActive = false, pinchDelta = 0, pinchFrame = 0, pinchPoint = null, pinchTimer = 0;
function pinchTo(zoom, point) {
  if (!pinchActive) { map._stop(); map._moveStart(true, false); pinchActive = true; }
  zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), zoom));
  const scale = map.getZoomScale(zoom);
  const half = map.getSize().divideBy(2);
  const center = map.containerPointToLatLng(half.add(point.subtract(half).multiplyBy(1 - 1 / scale)));
  map._move(center, zoom, { pinch: true, round: false });
}
function pinchEnd() {
  pinchTimer = 0;
  if (pinchActive) { pinchActive = false; map._moveEnd(true); }
}
function applyPinchZoom() {
  pinchFrame = 0;
  const zoom = map.getZoom() + pinchDelta;
  pinchDelta = 0;
  pinchTo(zoom, pinchPoint);
}
map.getContainer().addEventListener("wheel", (e) => {
  if (!e.ctrlKey && e.target.closest && e.target.closest(".problem-scroll")) return; // le texte du menu « Un problème ? » d'une fiche défile : la carte ne bouge pas
  e.preventDefault();
  e.stopImmediatePropagation();
  pinchPoint = map.mouseEventToContainerPoint(e);
  pinchDelta -= e.deltaY * (e.deltaMode === 1 ? 16 : 1) * (e.ctrlKey ? PINCH_ZOOM_PER_PX : WHEEL_ZOOM_PER_PX);
  if (!pinchFrame) pinchFrame = requestAnimationFrame(applyPinchZoom);
  clearTimeout(pinchTimer);
  pinchTimer = setTimeout(pinchEnd, PINCH_END_MS);
}, { capture: true, passive: false });

// Safari de bureau : « gesturechange » donne l'échelle totale depuis le début du pincement (pas sur téléphone ni tablette : Leaflet s'en charge)
if (!L.Browser.mobile) {
  let gestureStartZoom = 0;
  map.getContainer().addEventListener("gesturestart", (e) => { e.preventDefault(); gestureStartZoom = map.getZoom(); });
  map.getContainer().addEventListener("gesturechange", (e) => {
    e.preventDefault();
    if (e.scale && gestureStartZoom) pinchTo(gestureStartZoom + Math.log2(e.scale), map.mouseEventToContainerPoint(e));
  });
  map.getContainer().addEventListener("gestureend", (e) => { e.preventDefault(); gestureStartZoom = 0; pinchEnd(); });
}
// Le bouton de position rejoint la colonne de contrôles de Leaflet : empilé au-dessus du zoom, sans chevauchement
const LocateControl = L.Control.extend({
  onAdd() {
    const el = document.getElementById("locate");
    L.DomEvent.disableClickPropagation(el);
    return el;
  },
});
new LocateControl({ position: "bottomright" }).addTo(map);
// Le bouton de langue (absent tant qu'il n'y a pas assez de langues) rejoint la même colonne, au-dessus du bouton de position
const langControlEl = document.getElementById("lang-control");
if (langControlEl) {
  const LanguageControl = L.Control.extend({
    onAdd() {
      L.DomEvent.disableClickPropagation(langControlEl);
      L.DomEvent.disableScrollPropagation(langControlEl);
      return langControlEl;
    },
  });
  new LanguageControl({ position: "bottomright" }).addTo(map);
}
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);

const statusEl = document.getElementById("status");
// Un groupe « feature » : un seul gestionnaire de clic pour tous les points (la fenêtre est créée au clic, pas à l'avance)
const layer = L.featureGroup().addTo(map);
const POPUP_OPTIONS = { autoPanPaddingTopLeft: [10, 60], autoPanPaddingBottomRight: [70, 10], maxWidth: Math.min(300, innerWidth - 110) }; // le recadrage garde la fiche sous la pastille « N défibrillateurs affichés »
// La fiche s'ouvre sur le point lui-même, pas à l'endroit du clic (un clic peut tomber à 11 px du centre : à un autre zoom, la fiche serait ancrée sur rien)
function openAedPopup(d) {
  L.popup(POPUP_OPTIONS).setLatLng([d.lat, d.lon]).setContent(popupHtml(d, popupActionsHtml(d), popupProblemHtml(d))).openOn(map);
  popupAed = d; // après l'ouverture : la fiche précédente se ferme d'abord et remettrait la valeur à zéro
}
layer.on("click", (e) => {
  const d = e.propagatedFrom && e.propagatedFrom.options.aed;
  if (d) openAedPopup(d);
});
// Leaflet n'envoie pas les clics d'une fiche au document : le calque « Partager » s'y branche à l'ouverture
map.on("popupopen", (e) => {
  const el = e.popup.getElement();
  if (el) el.addEventListener("click", (ev) => { if (!handleShareClick(ev)) handleProblemClick(ev); });
});
// À la fermeture, la carte se réaffiche : un point gardé seulement pour sa fiche (vue très éloignée ou filtres qui l'écartent) disparaît aussitôt.
// Si une autre fiche s'ouvre dans la foulée (elle ferme d'abord la précédente), openAedPopup a déjà remis popupAed : rien à faire.
map.on("popupclose", () => {
  const closed = popupAed;
  popupAed = null;
  if (closed) setTimeout(() => { if (!popupAed) refresh(); });
});
const tiles = new Map(); // clé de tuile -> promesse
const loadedAeds = new Map(); // clé de tuile -> DAE (objets)
let dataset = null;
let userMarker = null;
// Le DAE dont la fiche est ouverte : son point reste dessiné même quand la vue n'affiche plus de points (zoom trop faible, zone trop dense)
let popupAed = null;

function setStatus(text, actions = []) {
  statusEl.textContent = text;
  statusEl.classList.toggle("actionable", actions.length > 0);
  actions.forEach(({ label, run }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", run);
    statusEl.append(b);
  });
}

// ---------- Filtres ----------
const DEFAULT_FILTERS = {
  access: ["h24", "limited", "unknown"],
  maint: ["ok", "doubt", "unknown"],
  ped: [],
};
let filters = loadFilters();

// Les filtres relus du texte enregistré dans l'appareil. Le filtre pédiatrique n'est jamais conservé d'une visite à l'autre :
// il part toujours décoché. Un réglage illisible ou ancien (accès « extérieur », « intérieur ») redevient « tout afficher ».
function parseFilters(raw) {
  try {
    const saved = JSON.parse(raw || "{}");
    for (const group of ["access", "maint"]) {
      if (!Array.isArray(saved[group]) || saved[group].some((v) => !DEFAULT_FILTERS[group].includes(v))) delete saved[group];
    }
    return { ...DEFAULT_FILTERS, ...saved, ped: [] };
  } catch { return { ...DEFAULT_FILTERS }; }
}
function loadFilters() {
  try { return parseFilters(localStorage.getItem("filters")); } catch { return { ...DEFAULT_FILTERS }; }
}
function saveFilters() {
  try { localStorage.setItem("filters", JSON.stringify(filters)); } catch { /* ignoré */ }
}

// ---------- Logique métier ----------
// Le champ « précisions » répète souvent le même texte (« X - L au V 8h/17h ; L au V 8h/17h ») : on garde la version complète
function dedupeComplement(text) {
  const parts = (text || "").split(" ; ");
  return parts.filter((p, i) => !parts.some((q, j) => j !== i && q.length > p.length && q.includes(p))).join(tr("hours.sep"));
}

// 24/7, horaires limités (connus, mais pas partout) ou horaires inconnus
// Les horaires écrits dans les précisions comptent quand le champ d'horaires est vide : un texte « 7j/7 24h/24 » seul est du 24/7, une plage horaire écrite ou un accès « aux heures d'ouverture », « selon évènements » fait des horaires limités. Ce classement ne change rien à l'estimation d'ouverture (quick.js).
const accessClassOf = (hours, text) => (is247(hours) || (!hours && textIs247(text)) ? "h24" : hours || hasHourRange(text) || hasLimitedText(text) ? "limited" : "unknown");

function toObject(rec) {
  const o = {};
  dataset.meta.fields.forEach((f, i) => { o[f] = rec[i]; });
  o.complement = dedupeComplement(o.complement);
  o.accessClass = accessClassOf(o.horaires, o.complement);
  o.maint = maintenanceLevel(o);
  return o;
}

function matches(d, f = filters) {
  if (!f.access.includes(d.accessClass)) return false;
  if (!f.maint.includes(d.maint)) return false;
  if (f.ped.length && !f.ped.includes(d.ped === 1 ? "yes" : d.ped === 0 ? "no" : "unknown")) return false;
  return true;
}

// ---------- Affichage ----------
// Coordonnées prêtes à coller dans n'importe quelle application de cartes : celles que « Y aller » transmet
const coordsText = (d) => `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`;

function routeUrl(d) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return ios
    ? `https://maps.apple.com/?daddr=${d.lat},${d.lon}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lon}&travelmode=walking`;
}

// Lien vers ce défibrillateur sur cette page, dans la langue courante (jamais la position de l'utilisateur : seulement celle de l'appareil)
const shareUrl = (d) => `${location.origin}${location.pathname}?gps_dae=${coordsText(d).replace(" ", "")}&id_dae=${d.gid}`;

// Le bouton « Partager » ouvre un calque qui recouvre la fiche de la carte ou celle des résultats (voir handleShareClick) : rien ne change de taille, la carte ne bouge pas
const shareButtonHtml = (d) => `<button type="button" class="share-btn" data-share data-coords="${coordsText(d)}" data-url="${esc(shareUrl(d))}" aria-expanded="false">${tr("share.button")}</button>`;

// Les boutons du bas d'une fiche : l'itinéraire et le partage
// Le lien « Un problème ? » (et « Ignoré », si c'est le cas), dernière ligne de la fiche au-dessus des boutons : le même menu que dans les fiches de recherche, par-dessus la fiche
const popupProblemHtml = (d) => {
  const ignored = ignoredEntry(d.gid); // ignoré par « Un problème ? » : le lien ouvre le panneau « Données »
  return `<p class="popup-problem"><button type="button" class="card-problem" data-popup-problem>${tr("card.problem")}</button>` +
    (ignored ? `<button type="button" class="card-problem" data-popup-ignored>${ignoredLinkText(ignored)}</button>` : "") + "</p>";
};
const popupActionsHtml = (d) => `<a class="primary" href="${routeUrl(d)}" target="_blank" rel="noopener">${tr("card.go")}</a>${shareButtonHtml(d)}`;

// Toujours : copier les coordonnées, copier le lien. Avec le partage du système (téléphone surtout) : partager les coordonnées, partager le lien
function shareSheetHtml() {
  const items = [["copy-gps", tr("share.copyGps")], ["copy-link", tr("share.copyLink")]];
  if (typeof navigator.share === "function") items.push(["share-gps", tr("share.shareGps")], ["share-link", tr("share.shareLink")]);
  return `<div class="share-sheet" role="dialog" aria-label="${esc(tr("share.sheetTitle"))}"><b>${tr("share.sheetTitle")}</b>${items.map(([act, label]) => `<button type="button" data-share-act="${act}">${label}</button>`).join("")}<button type="button" class="share-close" data-share-act="back">${tr("share.back")}</button></div>`;
}

// Repli quand le presse-papiers moderne n'est pas permis (page hors HTTPS, navigateur ancien)
function copyFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;opacity:0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { /* ignoré */ }
  ta.remove();
  return ok;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return copyFallback(text); }
}

function closeShareSheet(host) {
  const sheet = host.querySelector(".share-sheet");
  if (!sheet) return;
  sheet.remove();
  const problem = sheet.classList.contains("problem-menu");
  const button = host.querySelector(problem ? ".card-problem" : "[data-share]");
  if (!button) return;
  if (!problem) button.setAttribute("aria-expanded", "false");
  button.focus({ preventScroll: true });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const sheet = document.querySelector(".share-sheet");
  if (sheet) closeShareSheet(sheet.parentElement);
});

// Clic dans une fiche de la carte ou des résultats : vrai si c'était le bouton « Partager » ou une ligne de son calque
function handleShareClick(e) {
  const el = e.target.closest("[data-share], [data-share-act]");
  if (!el) return false;
  const host = el.closest(".leaflet-popup-content-wrapper, .card");
  const button = host && host.querySelector("[data-share]");
  if (!button) return false;
  if (el === button) {
    host.insertAdjacentHTML("beforeend", shareSheetHtml());
    button.setAttribute("aria-expanded", "true");
    host.querySelector(".share-sheet button").focus({ preventScroll: true });
    if (host.classList.contains("card")) scrollCardToTop(host); // le calque doit se voir en entier, pas à moitié sous l'en-tête fixe
  } else if (el.dataset.shareAct === "back") setTimeout(() => closeShareSheet(host)); // après le clic : une cible déjà retirée du DOM ferait fermer la fiche par Leaflet
  else runShareAction(el, button, host);
  return true;
}

// La fiche ouverte après un changement de la liste des ignorés (ignorer, annuler, rétablir dans « Données ») : sa ligne « Un problème ? / Ignoré » est refaite,
// et son menu, s'il est ouvert, aussi (dernier lien « Ignorer… » ou « Ignoré »), sans le fermer ni perdre le défilement du texte. Une confirmation
// « est ignoré » devenue fausse (rétabli dans « Données ») est retirée.
function refreshPopupLinks() {
  if (!popupAed) return;
  const line = document.querySelector(".leaflet-popup .popup-problem");
  if (line) line.outerHTML = popupProblemHtml(popupAed);
  const host = document.querySelector(".leaflet-popup-content-wrapper");
  if (!host) return;
  if (host.querySelector(".problem-menu [data-pop=undo]")) {
    if (!ignoredEntry(popupAed.gid)) closeShareSheet(host);
    return;
  }
  const last = host.querySelector(".problem-menu .problem-actions button:last-child");
  if (last) last.outerHTML = problemIgnoreButtonHtml(popupAed, 'data-pop="ignore"', "data-popup-ignored");
}

// Clic sur le lien « Un problème ? » d'une fiche ou dans son menu (voir problemMenuHtml dans quick.js) : vrai si le clic le concernait
function handleProblemClick(e) {
  const el = e.target.closest("[data-popup-problem], [data-popup-ignored], [data-pop]");
  const host = el && el.closest(".leaflet-popup-content-wrapper");
  if (!host || !popupAed) return false;
  const d = popupAed;
  if (el.hasAttribute("data-popup-ignored")) openDataPanel(".ignored");
  else if (el.hasAttribute("data-popup-problem")) {
    host.insertAdjacentHTML("beforeend", problemMenuHtml(d, 'data-pop="back"', 'data-pop="ignore"', 'data-popup-ignored'));
    const menu = host.querySelector(".problem-menu");
    L.DomEvent.disableScrollPropagation(menu); // la molette ne remonte pas jusqu'à la carte (qui zoomerait)
    wireProblemMenu(menu);
  } else if (el.dataset.pop === "ignore") {
    addReport(d);
    const name = d.nom || d.exploitant || tr("aed.fallbackName");
    setTimeout(() => { // après le clic : une cible retirée du DOM ferait fermer la fiche par Leaflet
      host.querySelector(".problem-menu").outerHTML = ignoredConfirmHtml(name);
      refreshPopupLinks();
    });
  } else if (el.dataset.pop === "undo") {
    restoreIgnored(d.gid);
    setTimeout(() => { closeShareSheet(host); refreshPopupLinks(); });
  } else if (el.dataset.pop === "close") map.closePopup();
  else setTimeout(() => closeShareSheet(host)); // « Retour »
  return true;
}

async function runShareAction(item, button, host) {
  const act = item.dataset.shareAct;
  if (act === "copy-gps" || act === "copy-link") {
    const text = act === "copy-gps" ? button.dataset.coords : button.dataset.url;
    const ok = await copyText(text);
    item.textContent = ok ? tr("card.copied") : text; // si rien ne marche, on montre le texte à recopier à la main
    setTimeout(() => closeShareSheet(host), ok ? 1200 : 6000);
    return;
  }
  try {
    await navigator.share(act === "share-gps" ? { text: button.dataset.coords } : { title: tr("share.title"), url: button.dataset.url });
    closeShareSheet(host);
  } catch { /* partage annulé ou refusé : le calque reste ouvert, sans message */ }
}

// anneau extérieur = maintenance, disque intérieur = accès, visage de bébé = adapté aux enfants ; le clic ouvre la fiche (voir `layer`)
function drawAed(d) {
  const ll = [d.lat, d.lon];
  L.circleMarker(ll, { radius: 11, stroke: false, fill: false, aed: d }).addTo(layer); // zone sensible au clic, invisible
  L.circleMarker(ll, { radius: RING_RADIUS, weight: 2.4, color: MAINT_COLORS[d.maint], fill: false, lineCap: "butt", dashArray: MAINT_DASH[d.maint], interactive: false }).addTo(layer);
  L.circleMarker(ll, { radius: 8, weight: 1.5, color: "#fff", fillColor: COLORS[d.accessClass], fillOpacity: 1, interactive: false }).addTo(layer);
  if (d.ped === 1) new BabyMarker(ll, { radius: BABY_PX / 2, stroke: false, fill: false, interactive: false }).addTo(layer);
}

// Jouer avec les filtres peut servir à dégager la carte sans changer de recherche : la fiche reste tant que son DAE correspond aux filtres
function closePopupIfFiltered() {
  if (popupAed && !matches(popupAed)) map.closePopup();
}

// Le point de la fiche ouverte, s'il n'est pas déjà dessiné (vue trop dense ou trop éloignée, ou filtres qui ne le retiennent plus)
function drawSelected(drawn = []) {
  if (popupAed && !drawn.includes(popupAed)) drawAed(popupAed);
}

function render() {
  layer.clearLayers();
  const view = map.getBounds();
  const padded = view.pad(0.15);
  const toDraw = [];
  let visible = 0;
  for (const list of loadedAeds.values()) {
    for (const d of list) {
      if (!matches(d)) continue;
      const ll = [d.lat, d.lon];
      if (!padded.contains(ll)) continue;
      if (view.contains(ll)) visible++;
      toDraw.push(d);
    }
  }
  if (visible > MAX_DRAWN) { drawSelected(); return { visible, tooMany: true }; } // trop pour être lisible et fluide : on n'en dessine aucun
  toDraw.forEach(drawAed);
  drawSelected(toDraw);
  return { visible };
}

// Clés des tuiles qui existent et recouvrent des bornes (en degrés)
function tileKeysFor(south, north, west, east, t, tiles) {
  const keys = [];
  for (let i = Math.floor(south / t); i <= Math.floor(north / t); i++) {
    for (let j = Math.floor(west / t); j <= Math.floor(east / t); j++) {
      const k = `${i}_${j}`;
      if (k in tiles) keys.push(k);
    }
  }
  return keys;
}

// Vue trop dense pour être chargée à ce niveau de zoom (d'après le nombre de DAE par tuile, connu sans rien télécharger)
function viewTooDense(keys, tiles, zoom) {
  return zoom < DENSE_ZOOM && keys.reduce((sum, k) => sum + tiles[k], 0) > DENSE_TILE_TOTAL;
}

function filtersActive(f = filters) {
  return Object.keys(DEFAULT_FILTERS).some((k) => JSON.stringify(f[k]) !== JSON.stringify(DEFAULT_FILTERS[k]));
}

function resetFilters() {
  filters = JSON.parse(JSON.stringify(DEFAULT_FILTERS));
  for (const group in subWanted) subWanted[group] = false;
  closePopupIfFiltered();
  saveFilters();
  syncPanel();
  refresh();
}

function formatDistance(m) {
  return m < 1000 ? tr("unit.m", { n: numberFormat(Math.round(m / 10) * 10) }) : tr("unit.km", { n: numberFormat(m / 1000, m < 10000 ? 1 : 0) });
}

function loadTile(key) {
  if (!tiles.has(key)) {
    const ds = dataset;
    tiles.set(key, dataFetch(`${ds.base}/tiles/${key}.json`).then((r) => r.json()).then((recs) => {
      if (ds === dataset) loadedAeds.set(key, recs.map(toObject)); // ignoré si le jeu a changé entre-temps
    }).catch((e) => { tiles.delete(key); throw e; }));
  }
  return tiles.get(key);
}

// Charge les tuiles qui couvrent un disque de `radius` mètres autour de ll ([lat, lon])
async function loadAround(ll, radius) {
  const t = dataset.meta.tileDeg;
  const dLat = radius / 111000;
  const dLon = radius / (111000 * Math.cos((ll[0] * Math.PI) / 180));
  const keys = [];
  for (let i = Math.floor((ll[0] - dLat) / t); i <= Math.floor((ll[0] + dLat) / t); i++) {
    for (let j = Math.floor((ll[1] - dLon) / t); j <= Math.floor((ll[1] + dLon) / t); j++) {
      const k = `${i}_${j}`;
      if (k in dataset.meta.tiles) keys.push(k);
    }
  }
  await Promise.all(keys.map(loadTile));
}

// Change de jeu de données : vide ce qui est chargé et redessine
function setDataset(ds) {
  dataset = ds;
  tiles.clear();
  loadedAeds.clear();
  layer.clearLayers();
  if (document.body.classList.contains("has-results")) closeSheet();
  refresh();
}

// « le plus proche » part de la position de l'utilisateur quand elle est connue, sinon du centre de la carte
function nearestAction() {
  return { label: tr(userMarker ? "status.nearestFromYou" : "status.nearestFromHere"), run: goToNearest };
}

// « Le dernier gagne » : une opération plus ancienne qui se termine après (chargement lent) ne doit pas écraser la plus récente.
// Sert à la recherche d'urgence (quick.js) et à l'affichage des points de la carte.
function latestOnly() {
  let current = 0;
  return { start: () => ++current, isCurrent: (id) => id === current, cancel: () => { current++; } };
}
const viewRuns = latestOnly();

async function refresh() {
  await refreshView();
  if (pendingDae && dataset) showSharedDae(); // après le message d'état de refreshView : il peut le remplacer
}

async function refreshView() {
  const run = viewRuns.start(); // un chargement de tuiles encore en cours pour une vue précédente ne doit pas redessiner la carte après
  if (!dataset) return;
  if (document.body.classList.contains("has-results")) { layer.clearLayers(); return; }
  if (map.getZoom() < MIN_ZOOM) {
    layer.clearLayers();
    drawSelected();
    setStatus(tr("status.zoom"));
    return;
  }
  const b = map.getBounds();
  const keys = tileKeysFor(b.getSouth(), b.getNorth(), b.getWest(), b.getEast(), dataset.meta.tileDeg, dataset.meta.tiles);
  if (viewTooDense(keys, dataset.meta.tiles, map.getZoom())) {
    layer.clearLayers();
    drawSelected();
    setStatus(tr("status.denseArea"), [nearestAction()]);
    return;
  }
  try { await Promise.all(keys.map(loadTile)); } catch { if (viewRuns.isCurrent(run)) setStatus(tr("status.loadError")); return; }
  if (!viewRuns.isCurrent(run)) return; // la carte a bougé pendant le chargement : un affichage plus récent a pris le relais
  const { visible, tooMany } = render();
  if (tooMany) {
    // le nombre dépend des filtres : on le dit, et on ouvre le panneau d'un geste s'il est fermé (affiner les filtres est une issue)
    const n = numberFormat(visible);
    const actions = [nearestAction()];
    if (!panel.classList.contains("open")) actions.push({ label: tr("nav.filters"), run: openFilters });
    setStatus(filtersActive() ? tr("status.tooManyFiltered", { n }) : tr("status.tooMany", { n }), actions);
    return;
  }
  if (visible) {
    setStatus(trn("status.count", visible, { n: numberFormat(visible) })); // la forme (un/autre) dépend du vrai nombre, l'affichage suit la langue
    return;
  }
  // « le plus proche » part de la position de l'utilisateur quand elle est connue, sinon du centre de la carte
  const actions = [nearestAction()];
  if (filtersActive()) actions.push({ label: tr("filters.reset"), run: resetFilters });
  setStatus(tr("status.none"), actions);
}

// Rayons explorés, du plus petit au plus grand, par « Voir le plus proche » et par la recherche d'urgence (quick.js)
const SEARCH_RADII = [2000, 5000, 15000, 30000];
const MAX_RADIUS_KM = SEARCH_RADII[SEARCH_RADII.length - 1] / 1000; // annoncé dans les messages « rien trouvé »

// Plus proche DAE correspondant aux filtres : on charge des tuiles de plus en plus loin, et on ne conclut que
// quand le disque exploré est entièrement chargé (un DAE plus proche ne peut pas se cacher).
async function findNearest(from) {
  for (const radius of SEARCH_RADII) {
    await loadAround(from, radius);
    let best = null;
    for (const list of loadedAeds.values()) {
      for (const d of list) {
        if (!matches(d)) continue;
        const dist = map.distance(from, [d.lat, d.lon]);
        if (dist <= radius && (!best || dist < best.dist)) best = { ll: [d.lat, d.lon], dist };
      }
    }
    if (best) return best;
  }
  return null;
}

async function goToNearest() {
  const origin = userMarker ? userMarker.getLatLng() : map.getCenter();
  setStatus(tr("status.searchingNearest"));
  let nearest;
  try { nearest = await findNearest([origin.lat, origin.lng]); } catch { setStatus(tr("status.loadError")); return; }
  if (!nearest) {
    setStatus(tr("status.noneWithin", { km: MAX_RADIUS_KM }), filtersActive() ? [{ label: tr("filters.reset"), run: resetFilters }] : []);
    return;
  }
  const bounds = L.latLngBounds([origin, nearest.ll]);
  // garde la position de l'utilisateur dans la vue si le zoom reste assez fort pour afficher les points
  if (userMarker && map.getBoundsZoom(bounds, false, L.point(100, 100)) >= MIN_ZOOM) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
  else map.setView(nearest.ll, Math.max(map.getZoom(), 15));
}

// ---------- Panneau de filtres ----------
const panel = document.getElementById("filters");

// Filtres « n'afficher que » (oui) avec une sous-case pour montrer aussi les incertains : groupe, case principale, sous-case
const SUB_FILTERS = [["ped", "f-ped", "f-ped-unknown"]];

// Choix de la sous-case mémorisé même quand elle est grisée (case principale décochée) : il ne compte pas dans les filtres, mais il revient au recochage
const subWanted = {};

function syncPanel() {
  panel.querySelectorAll("input[data-group]").forEach((input) => {
    input.checked = filters[input.dataset.group].includes(input.value);
  });
  SUB_FILTERS.forEach(([group, mainId, subId]) => {
    const main = document.getElementById(mainId);
    const sub = document.getElementById(subId);
    main.checked = filters[group].includes("yes");
    sub.disabled = !main.checked;
    if (main.checked) subWanted[group] = filters[group].includes("unknown");
    sub.checked = Boolean(subWanted[group]);
  });
}

// Le navigateur peut restaurer d'anciennes cases (retour arrière) après le chargement des données : on réaligne sur l'état réel,
// avec des écouteurs posés dès le départ pour ne pas manquer des évènements déjà passés quand les données arrivent
// (Safari iPhone le fait aussi après « pageshow » en retour arrière : d'où le second passage, et un autre à l'ouverture du panneau)
const resyncPanel = () => { syncPanel(); setTimeout(syncPanel, 1); };
window.addEventListener("pageshow", resyncPanel);
window.addEventListener("load", resyncPanel);

const filtersToggle = document.getElementById("filters-toggle");
const syncToggle = () => {
  filtersToggle.setAttribute("aria-expanded", panel.classList.contains("open"));
  if (panel.classList.contains("open")) syncPanel();
};
function openFilters() {
  panel.classList.add("open");
  syncToggle();
}

function setupFilterPanel() {
  if (window.matchMedia("(min-width: 640px)").matches) panel.classList.add("open");
  syncToggle();
  filtersToggle.addEventListener("click", () => { panel.classList.toggle("open"); syncToggle(); });
  const closeFilters = () => { panel.classList.remove("open"); syncToggle(); filtersToggle.focus(); };
  document.getElementById("filters-close").addEventListener("click", closeFilters);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open")) closeFilters(); });
  panel.querySelectorAll("input[data-group]").forEach((input) => {
    const group = input.dataset.group;
    input.addEventListener("change", () => {
      const set = new Set(filters[group]);
      input.checked ? set.add(input.value) : set.delete(input.value);
      filters[group] = [...set];
      closePopupIfFiltered();
      saveFilters();
      refresh();
    });
  });
  syncPanel();
  SUB_FILTERS.forEach(([group, mainId, subId]) => {
    const onChange = () => {
      const main = document.getElementById(mainId).checked;
      const sub = document.getElementById(subId).checked;
      if (main || !document.getElementById(subId).disabled) subWanted[group] = sub;
      filters[group] = main ? (sub ? ["yes", "unknown"] : ["yes"]) : [];
      closePopupIfFiltered();
      saveFilters();
      syncPanel();
      refresh();
    };
    document.getElementById(mainId).addEventListener("change", onChange);
    document.getElementById(subId).addEventListener("change", onChange);
  });
}

// Votre position : une épingle violette (couleur réservée à la position, forme qui n'est celle d'aucun point) dont la pointe est sur le lieu,
// et un halo de la précision du relevé quand on la connaît (pas pour une adresse saisie). Dans un calque sous les points : un défibrillateur
// voisin n'est jamais caché par l'épingle.
const ME_PIN = '<svg viewBox="-16 -40 32 44" width="32" height="44" aria-hidden="true"><ellipse rx="6" ry="2.2" fill="rgba(0,0,0,.25)"/><path d="M0 0C-3-9-13-16-13-26a13 13 0 0 1 26 0C13-16 3-9 0 0z" fill="#6f2dbd" stroke="#fff" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round"/><circle cy="-26" r="5" fill="#fff"/></svg>';
const ME_MAX_ACCURACY_M = 2000; // au-delà, le halo n'apprendrait plus rien et couvrirait l'écran
let userHalo = null;
map.createPane("me").style.zIndex = 350; // sous la couche des points (400), au-dessus du fond de carte (200)
const meRenderer = L.svg({ pane: "me" });

// accuracy : précision du relevé en mètres (0 : inconnue, pas de halo)
function showUser(ll, accuracy = 0) {
  forgetPlaceParams(); // une position est connue : le lieu du lien ne décrit plus la carte
  if (userMarker) userMarker.setLatLng(ll);
  else {
    userMarker = L.marker(ll, {
      icon: L.divIcon({ className: "me", html: ME_PIN, iconSize: [32, 44], iconAnchor: [16, 40] }),
      pane: "me", interactive: false, keyboard: false,
    }).addTo(map);
  }
  const radius = Math.min(accuracy, ME_MAX_ACCURACY_M);
  if (!(radius > 0)) {
    if (userHalo) { userHalo.remove(); userHalo = null; }
    return;
  }
  if (userHalo) userHalo.setLatLng(ll).setRadius(radius);
  else userHalo = L.circle(ll, { radius, pane: "me", renderer: meRenderer, interactive: false, color: "#6f2dbd", weight: 1, opacity: .35, fillColor: "#6f2dbd", fillOpacity: .12 }).addTo(map);
}

// recenter = false : on affiche seulement le point de position, sans déplacer la carte (vue restaurée)
function locate(recenter = true) {
  if (!navigator.geolocation) { setStatus(tr("geo.unavailable")); return; }
  setStatus(tr("geo.searching"));
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      showUser(ll, pos.coords.accuracy);
      if (recenter) {
        map.setView(ll, 16);
        setStatus("");
      } else refresh(); // pas de déplacement donc pas de « moveend » : on réaffiche l'état de la carte
    },
    () => setStatus(tr("geo.denied")),
    { enableHighAccuracy: true, timeout: 15000 },
  );
}

// ---------- Vue de la carte conservée d'une page à l'autre ----------
// La vue (centre et zoom) est gardée dans l'onglet pour être retrouvée au retour d'une autre page du site (« Guide »).
// Rien n'est gardé d'une visite à l'autre, ni envoyé ailleurs : sessionStorage disparaît avec l'onglet.
const VIEW_KEY = "mapView";
const VIEW_MAX_AGE_MS = 2 * 3600 * 1000;

// { lat, lng, zoom } ou null si la valeur est absente, abîmée, hors limites ou trop ancienne
function parseSavedView(raw, now = Date.now()) {
  try {
    const v = JSON.parse(raw);
    const ok = (x, lo, hi) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
    if (!v || !ok(v.lat, -90, 90) || !ok(v.lng, -180, 180) || !ok(v.zoom, 0, 22) || !(now - v.ts < VIEW_MAX_AGE_MS)) return null;
    return { lat: v.lat, lng: v.lng, zoom: v.zoom };
  } catch { return null; }
}

// Revient-on d'une autre page du site (lien « Retour à la carte » ou bouton Retour) et non d'un nouveau chargement ou d'un rechargement ?
function cameFromAnotherPage(navType, referrer, origin, pathname) {
  if (navType === "back_forward") return true;
  if (navType === "reload") return false; // un rechargement garde le même « referrer » : ce n'est pas un retour
  try {
    const r = new URL(referrer);
    return r.origin === origin && r.pathname !== pathname;
  } catch { return false; }
}

function saveView() {
  const c = map.getCenter();
  try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom(), ts: Date.now() })); } catch { /* ignoré */ }
}

function arrivedFromAnotherPage() {
  try {
    const nav = (performance.getEntriesByType("navigation")[0] || {}).type;
    return cameFromAnotherPage(nav, document.referrer, location.origin, location.pathname);
  } catch { return false; }
}

function restoreView() {
  let view = null;
  try {
    if (arrivedFromAnotherPage()) view = parseSavedView(sessionStorage.getItem(VIEW_KEY));
  } catch { /* ignoré */ }
  if (view) map.setView([view.lat, view.lng], view.zoom, { animate: false });
  return Boolean(view);
}

// ---------- Lien direct (?cp=, ?code_insee= ou ?gps_dae=) ----------
// Le lieu du lien est aussi gardé dans l'onglet (sessionStorage) : la page « Guide » et la simulation passent par une adresse sans paramètre.
// Il disparaît dès qu'une position de l'utilisateur est affichée, ou à la fermeture de l'onglet.
const PLACE_LINK_KEY = "placeLink";

// Même durée que la vue conservée (VIEW_MAX_AGE_MS)
function rememberedPlaceSearch() {
  try { return rememberedPlace(sessionStorage.getItem(PLACE_LINK_KEY), Date.now(), VIEW_MAX_AGE_MS); } catch { return null; }
}
const placeLinkActive = () => rememberedPlaceSearch() !== null;

// Lien ?gps_dae= : la fiche de l'appareil s'ouvre dès que sa zone est chargée (voir refresh). null quand il n'y a rien à ouvrir.
let pendingDae = null;
function showSharedDae() {
  const { lat, lon, id } = pendingDae;
  const key = `${Math.floor(lat / dataset.meta.tileDeg)}_${Math.floor(lon / dataset.meta.tileDeg)}`;
  if (key in dataset.meta.tiles && !loadedAeds.has(key)) return; // zone pas encore chargée : un prochain rafraîchissement reviendra ici
  pendingDae = null;
  const here = (loadedAeds.get(key) || []).filter((d) => Math.abs(d.lat - lat) < 2e-6 && Math.abs(d.lon - lon) < 2e-6);
  // plusieurs appareils à la même position : l'identifiant choisit ; sans lui, on ne devine pas
  const target = here.find((d) => d.gid === id) || (here.length === 1 ? here[0] : null);
  if (target) openAedPopup(target);
  else setStatus(tr(here.length ? "share.severalHere" : "share.noneHere"));
}

// Centre la carte sur le lieu de `search` ; une adresse sans paramètre reconnu, ou une table indisponible, ne change rien
async function showPlace(search) {
  const dae = parseDaeParams(search);
  if (dae.gps) { // un défibrillateur précis prime sur une commune
    map.setView(dae.gps, DAE_ZOOM, { animate: false });
    pendingDae = { lat: dae.gps[0], lon: dae.gps[1], id: dae.id };
    try { sessionStorage.setItem(PLACE_LINK_KEY, JSON.stringify({ gps: dae.gps, id: dae.id, ts: Date.now() })); } catch { /* ignoré */ }
    saveView();
    return true;
  }
  const q = parsePlaceParams(search);
  if (!q.cp && !q.insee) return false;
  try {
    const r = await fetch(PLACES_URL);
    if (!r.ok) return false;
    const points = resolvePlace(search, await r.json());
    if (!points) return false;
    if (points.length === 1) map.setView(points[0], PLACE_ZOOM, { animate: false });
    else {
      // plusieurs communes : on les cadre, mais jamais sous le zoom minimal (la carte n'afficherait aucun défibrillateur)
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { maxZoom: PLACE_ZOOM, padding: [30, 30], animate: false });
      if (map.getZoom() < MIN_ZOOM) map.setView(bounds.getCenter(), MIN_ZOOM, { animate: false });
    }
    try { sessionStorage.setItem(PLACE_LINK_KEY, JSON.stringify({ ...q, ts: Date.now() })); } catch { /* ignoré */ }
    saveView(); // la vue du lieu remplace celle d'une visite précédente (l'écouteur « moveend » n'est posé qu'après)
    return true;
  } catch { return false; }
}

let onPlaceLinkForgotten = null; // posé par quick.js : le texte de la bannière de simulation dépend de ce lieu
// Une position de l'utilisateur est affichée : le lieu du lien ne décrit plus la carte. On l'enlève de l'adresse
// (sans recharger ni ajouter d'entrée à l'historique) et de la mémoire de l'onglet.
function forgetPlaceParams() {
  pendingDae = null;
  try { sessionStorage.removeItem(PLACE_LINK_KEY); } catch { /* ignoré */ }
  try {
    const search = withoutPlaceParams(location.search);
    if (search !== location.search) history.replaceState(history.state, "", location.pathname + search + location.hash);
  } catch { /* ignoré */ }
  if (onPlaceLinkForgotten) onPlaceLinkForgotten();
}

// ---------- Menu des langues ----------
function setupLanguageMenu() {
  const button = document.getElementById("lang-button");
  const menu = document.getElementById("lang-menu");
  if (!button || !menu) return;
  const setOpen = (open) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", open);
    if (open) (menu.querySelector("[aria-current]") || menu.querySelector("a")).focus();
  };
  button.addEventListener("click", () => setOpen(menu.hidden));
  document.addEventListener("click", (e) => { if (!menu.hidden && !langControlEl.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) { setOpen(false); button.focus(); }
  });
}

async function init() {
  dataset = await resolveDataset();
  updateDataBadge();
  setupFilterPanel();
  setupLanguageMenu();
  const fromPage = arrivedFromAnotherPage();
  const restored = restoreView();
  const hasLink = Boolean(parsePlaceParams(location.search).cp || parsePlaceParams(location.search).insee || parseDaeParams(location.search).gps);
  if (!hasLink && !fromPage) { try { sessionStorage.removeItem(PLACE_LINK_KEY); } catch { /* ignoré */ } } // arrivée ordinaire : plus de lieu de lien
  if (!restored) {
    if (hasLink) {
      // un lien non reconnu n'hérite pas du lieu d'un lien précédent
      if (!(await showPlace(location.search))) { try { sessionStorage.removeItem(PLACE_LINK_KEY); } catch { /* ignoré */ } }
    }
    else if (fromPage && rememberedPlaceSearch()) await showPlace(rememberedPlaceSearch()); // vue expirée : on retrouve le lieu du lien
  }
  map.on("moveend", refresh);
  map.on("moveend", saveView);
  // Une position choisie à la main (adresse, point posé) est « ma position » : le bouton recentre dessus au lieu de revenir au GPS (voir quick.js)
  document.getElementById("locate").addEventListener("click", () => { if (!centerOnChosenPosition()) locate(); });
  refresh();
  if (!placeLinkActive()) locate(!restored); // un lien direct n'ouvre pas la demande de position : le bouton « Changer ma position » reste là
}

init().catch(() => setStatus(tr("status.initError")));
