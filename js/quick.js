// Recherche rapide : « En trouver un maintenant » (adulte / enfant) et « Problème, en trouver un autre ».
// S'appuie sur les globales de app.js (map, dataset, loadedAeds, loadTile, esc, formatDistance, showUser…).

const REPORT_TTL_MS = 24 * 3600 * 1000;
const UNCERTAIN_PENALTY_M = 300;
const WINDOW_PENALTY_M = 100; // horaires connus mais sans jours, dans la plage : moins incertain qu'un DAE aux horaires inconnus
const WALK_M_PER_MIN = 5000 / 60 / 1.3; // 5 km/h, coefficient 1,3 pour passer de l'oiseau au trajet réel
const AV_OK = new Set(["sure", "likely"]);
const AV_LABEL = {
  sure: tr("av.sure"),
  likely: tr("av.likely"),
  window: tr("av.window"),
  uncertain: tr("av.uncertain"),
  closed: tr("av.closed"),
};

const formatTime = (d) => tr("time.hm", { h: String(d.getHours()).padStart(2, "0"), m: String(d.getMinutes()).padStart(2, "0") });

// ---------- Mode simulation (lancé depuis la page Guide) ----------
// Jour et heure sont transmis par le sessionStorage de l'onglet, lus une seule fois puis effacés :
// rien dans l'adresse (pas de lien ni de favori possible), et un rechargement ramène au mode normal.
const SIM_DAYS = [tr("day.Su"), tr("day.Mo"), tr("day.Tu"), tr("day.We"), tr("day.Th"), tr("day.Fr"), tr("day.Sa")];
function readSimulation() {
  try {
    const raw = sessionStorage.getItem("simulation");
    if (!raw) return null;
    sessionStorage.removeItem("simulation");
    const s = JSON.parse(raw);
    const ok = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;
    if (!ok(s.day, 6) || !ok(s.h, 23) || !ok(s.m, 59) || !(Date.now() - s.ts < 60000)) return null;
    return { ...s, holiday: s.holiday === true, vacation: s.vacation === true };
  } catch { return null; }
}
const sim = readSimulation();
const simStart = (() => {
  if (!sim) return null;
  const d = new Date();
  d.setDate(d.getDate() + (sim.day - d.getDay() + 7) % 7);
  d.setHours(sim.h, sim.m, 0, 0);
  return d;
})();
const currentTime = () => (sim ? new Date(simStart) : new Date());
const simParams = sim ? { day: SIM_DAYS[sim.day], time: formatTime(simStart) } : null;
const simLabel = !sim ? ""
  : sim.holiday && sim.vacation ? tr("sim.labelHolidayVacation", simParams)
  : sim.holiday ? tr("sim.labelHoliday", simParams)
  : sim.vacation ? tr("sim.labelVacation", simParams)
  : tr("sim.label", simParams);
// conflict : les horaires renseignés disent « fermé » et les précisions « ouvert » (voir availabilityDetail) : un libellé qui le dit
const avLabel = (a, conflict = false) => (conflict ? tr("av.conflict") : sim && a === "sure" ? tr("av.sureSim") : AV_LABEL[a]);

const sheet = document.getElementById("results");
const mapWrap = document.getElementById("map-wrap");
// Poignée en tête du panneau quand il est en bas d'écran (le CSS la masque quand il passe en colonne sur le côté)
const gripHtml = () => `<button type="button" class="sheet-grip" aria-label="${esc(tr("sheet.resize"))}" title="${esc(tr("sheet.resize"))}"></button>`;
const setSheet = (html) => { sheet.innerHTML = gripHtml() + html; };
// Taille du panneau en bas d'écran : réduit (en-tête seul), moyen (par défaut), grand ; le CSS suit l'attribut data-size
const SIZE_ORDER = ["min", "mid", "max"];
const TAP_ORDER = ["mid", "max", "min"];
const sheetSizeFor = (fraction) => (fraction < 0.2 ? "min" : fraction < 0.62 ? "mid" : "max");
const nextSheetSize = (size) => TAP_ORDER[(TAP_ORDER.indexOf(size) + 1) % TAP_ORDER.length];
function stepSheetSize(size, direction) {
  const i = SIZE_ORDER.indexOf(size) + direction;
  return SIZE_ORDER[Math.max(0, Math.min(SIZE_ORDER.length - 1, i))];
}
const resultLayer = L.layerGroup().addTo(map);
let lastMode = "adult";
let currentOptions = [];
let sortByDistance = false; // choix de l'utilisateur, valable tant que la page reste ouverte
let lastSearch = null;      // { ll, mode, result, origin } pour réafficher sans recalculer
let targetGid = null;
let reports = sim ? [] : loadReports(); // en simulation, on ne reprend pas les vrais signalements
let lastAccuracy = null; // précision du dernier relevé GPS, en mètres
let manualPos = null; // { ll, label } quand l'utilisateur a choisi sa position à la main
let chooserDone = null;
let geoResults = [];
let onMapPick = null;

const quickRuns = latestOnly(); // la garde « le dernier gagne » est dans app.js

// ---------- Défibrillateurs ignorés (« Un problème ? ») ----------
// Un signalement : { gid, name, place, ts, mode, fp }, gardé sur l'appareil seulement. mode : la durée choisie (day, week, month) ou « change » (jusqu'à ce que la
// fiche change dans les données sources, au plus un an) ; fp : l'empreinte de la fiche à la date du signalement ; ts : le début de la durée.
const REPORT_DURATIONS = { day: REPORT_TTL_MS, week: 7 * REPORT_TTL_MS, month: 30 * REPORT_TTL_MS, change: 365 * REPORT_TTL_MS };
const reportExpiry = (r) => r.ts + (REPORT_DURATIONS[r.mode] || REPORT_TTL_MS);

function loadReports() {
  try {
    const now = Date.now();
    return JSON.parse(localStorage.getItem("reports") || "[]").filter((r) => now < reportExpiry(r));
  } catch { return []; }
}
const saveReports = () => {
  if (sim) return; // en simulation, un signalement ne doit jamais toucher à la vraie vie
  try { localStorage.setItem("reports", JSON.stringify(reports)); } catch { /* ignoré */ }
};
// On garde le nom et la commune avec l'identifiant, pour pouvoir lister les défibrillateurs ignorés dans le menu « Données » ; 24 h au départ
function addReport(d) {
  const place = [d.cp, d.commune].filter(Boolean).join(" ");
  const now = Date.now();
  reports = [...reports.filter((r) => r.gid !== d.gid && now < reportExpiry(r)), { gid: d.gid, name: d.nom || d.exploitant || "", place, ts: now, mode: "day", fp: aedFingerprint(d) }];
  saveReports();
}
// Change la durée d'un défibrillateur ignoré (elle repart d'aujourd'hui) ; « jusqu'à modification » suppose une empreinte (absente des signalements anciens)
function setReportDuration(gid, mode) {
  const r = reports.find((x) => x.gid === gid);
  if (!r || !REPORT_DURATIONS[mode] || (mode === "change" && !r.fp)) return;
  r.mode = mode;
  r.ts = Date.now();
  saveReports();
}
let justIgnored = null; // { gid, name } : juste après « Ignorer », la liste propose d'annuler

function findLoadedAed(gid) {
  for (const list of loadedAeds.values()) {
    const d = list.find((x) => x.gid === gid);
    if (d) return d;
  }
  return null;
}
// « Jusqu'à modification » : la fiche a-t-elle changé dans les données sources depuis le signalement ? (inconnu tant que sa tuile n'est pas chargée : non)
const reportChanged = (r) => {
  if (r.mode !== "change" || !r.fp) return false;
  const d = findLoadedAed(r.gid);
  return Boolean(d) && aedFingerprint(d) !== r.fp;
};

// Les défibrillateurs ignorés (menu « Données ») : nom, commune et temps restant ; ceux dont la durée est écoulée ou la fiche modifiée n'en font plus partie
function ignoredList() {
  const now = Date.now();
  const kept = reports.filter((r) => now < reportExpiry(r) && !reportChanged(r));
  if (kept.length !== reports.length) { reports = kept; saveReports(); }
  return reports.map((r) => ({ ...r, left: reportExpiry(r) - now }));
}
function restoreIgnored(gid) {
  reports = reports.filter((r) => r.gid !== gid);
  saveReports();
}
function restoreAllIgnored() {
  reports = [];
  saveReports();
}
const ignoredEntry = (gid) => ignoredList().find((r) => r.gid === gid); // l'entrée de la liste des ignorés, ou rien
const ignoredLeftText = (r) => (r.mode === "change" ? tr("ignored.untilChange") : tr("ignored.left", { duration: remainingText(r.left) }));
const ignoredLinkText = (r) => tr("ignored.link", { left: ignoredLeftText(r) });
const undoHtml = () => justIgnored
  ? `<p class="sheet-undo">${esc(tr("ignore.done", { name: justIgnored.name }))} <button type="button" data-act="undo-ignore">${tr("ignore.undo")}</button></p>`
  : "";
// Les défibrillateurs ignorés qui auraient pu être proposés (voir searchAround) : un rappel avec un lien vers la liste
const hiddenIgnoredHtml = (n) => n
  ? `<p class="sheet-undo sheet-hidden">${trn("results.hiddenIgnored", n, { n })} <button type="button" data-act="open-ignored">${tr("results.hiddenIgnoredSee")}</button></p>`
  : "";
// Après un rétablissement dans « Données » : la liste de résultats ouverte est refaite, pour montrer ce qu'il change
function refreshResultsAfterRestore() {
  if (lastSearch && document.body.classList.contains("has-results")) runQuick(lastSearch.mode);
}

// ---------- Jours fériés ----------
// Calculés ici, sans service externe : onze jours nationaux (dont trois qui suivent Pâques), plus deux propres à
// l'Alsace-Moselle (57, 67, 68). Outre-mer (97x, 98x) : seuls les jours nationaux sont sûrs, chaque territoire ayant les siens.
const ALSACE_MOSELLE = new Set(["57", "67", "68"]);

// Dimanche de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien) -> { month: 1-12, day }
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

// Jours fériés d'une année, en « mois-jour » : { national, alsace } (calculés une fois par année)
const holidayCache = new Map();
function holidaysOf(year) {
  if (!holidayCache.has(year)) holidayCache.set(year, computeHolidays(year));
  return holidayCache.get(year);
}

function computeHolidays(year) {
  const e = easterSunday(year);
  const after = (n) => {
    const d = new Date(Date.UTC(year, e.month - 1, e.day + n));
    return `${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  };
  return {
    national: new Set(["1-1", after(1), "5-1", "5-8", after(39), after(50), "7-14", "8-15", "11-1", "11-11", "12-25"]),
    alsace: new Set([after(-2), "12-26"]),
  };
}

// true : jour férié ; false : pas un jour férié ; null : on ne peut pas savoir (code postal absent, outre-mer)
function holidayOn(date, cp) {
  const { national, alsace } = holidaysOf(date.getFullYear());
  const key = `${date.getMonth() + 1}-${date.getDate()}`;
  if (national.has(key)) return true;
  const dep = /^\d{5}$/.test(cp || "") ? cp.slice(0, 2) : null;
  if (dep === null) return alsace.has(key) ? null : false; // sans département : seuls les jours d'Alsace-Moselle restent incertains
  if (dep === "97" || dep === "98") return null;
  return ALSACE_MOSELLE.has(dep) && alsace.has(key);
}

// ---------- Vacances scolaires ----------
// Le calendrier officiel (data/vacances.json, construit par scripts/build_vacances.py) : les périodes de chaque zone A, B, C et le
// département -> zone. Sans calendrier, hors des années couvertes, ou pour la Corse, l'outre-mer et les codes postaux absents : on ne sait pas.
const VACATIONS_URL = "data/vacances.json";
let vacations = null;
const validVacations = (v) => Boolean(v && v.v === 1 && v.zones && v.dep && v.covered && v.covered.from && v.covered.to);
// Dernier calendrier reçu, gardé sur l'appareil : sans réseau (mode hors ligne), il sert encore
async function loadVacations() {
  if (vacations) return;
  try {
    const r = await fetch(VACATIONS_URL);
    if (r.ok) {
      const v = await r.json();
      if (validVacations(v)) {
        vacations = v;
        try { localStorage.setItem("vacances", JSON.stringify(v)); } catch { /* ignoré */ }
        return;
      }
    }
  } catch { /* hors ligne : on essaie la copie de l'appareil */ }
  try {
    const v = JSON.parse(localStorage.getItem("vacances"));
    if (validVacations(v)) vacations = v;
  } catch { /* ignoré */ }
}
const isoDay = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
// true : vacances scolaires ; false : pas de vacances ; null : on ne peut pas savoir
function vacationOn(date, cp, calendar = vacations) {
  if (!calendar) return null;
  const zone = /^\d{5}$/.test(cp || "") ? calendar.dep[cp.slice(0, 2)] : undefined;
  if (!zone || !calendar.zones[zone]) return null;
  const day = isoDay(date);
  if (day < calendar.covered.from || day >= calendar.covered.to) return null;
  return calendar.zones[zone].some(([start, end]) => day >= start && day < end);
}

const dayKey = (date) => `${date.getMonth() + 1}-${date.getDate()}`;
// Férié partout en France métropolitaine et outre-mer
const isNationalHoliday = (date) => holidaysOf(date.getFullYear()).national.has(dayKey(date));
// Jour férié seulement dans certains départements (Alsace-Moselle) : vrai pour la date elle-même, quel que soit le lieu
const isLocalHolidayDate = (date) => !isNationalHoliday(date) && holidaysOf(date.getFullYear()).alsace.has(dayKey(date));
// « lundi 11 novembre », dans la langue de la page
const dateLabel = (date) => new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(date);
// Le moment « maintenant » de l'en-tête : l'heure et la date ; un jour férié national le dit (un jour férié local non : cela dépend du lieu, chaque fiche le précise)
function whenNowLabel(now) {
  const params = { time: formatTime(now), date: dateLabel(now) };
  return isNationalHoliday(now) ? tr("results.whenNowHoliday", params) : tr("results.whenNowDate", params);
}

// ---------- Horaires d'ouverture (sous-ensemble du format OSM) ----------
const DAY_INDEX = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const DAY_ORDER = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// holiday : true / false / null (inconnu) ; seul le jeton « PH » (jours fériés) en dépend
function dayMatches(spec, day, holiday = false) {
  let any = false;
  for (const part of spec.split(",")) {
    if (part === "PH") {
      if (holiday === null) return null;
      if (holiday) any = true;
      continue;
    }
    const [a, b = a] = part.split("-");
    if (!(a in DAY_INDEX) || !(b in DAY_INDEX)) return null;
    let i = DAY_ORDER.indexOf(a);
    const end = DAY_ORDER.indexOf(b);
    for (let n = 0; n < 7; n++, i = (i + 1) % 7) {
      if (DAY_INDEX[DAY_ORDER[i]] === day) any = true;
      if (i === end) break;
    }
  }
  return any;
}

// "open" | "closed" | "unknown"
// Un jour férié sans règle « PH » : les horaires de la semaine ne disent pas si le lieu est fermé ce jour-là (mairies,
// écoles, bureaux le sont souvent). On peut conclure « fermé », jamais « ouvert ».
// prevHoliday : la veille était-elle fériée (pour la fin d'une plage de nuit qui déborde sur aujourd'hui)
function openState(hours, now, holiday = false, prevHoliday = false) {
  if (is247(hours)) return "open";
  if (!hours) return "unknown";
  const day = now.getDay();
  const prevDay = (day + 6) % 7;
  const mins = now.getHours() * 60 + now.getMinutes();
  let state = "closed"; // aucune règle pour ce jour = fermé
  let holidayRule = false;
  let offToday = false;
  let tail = false; // une plage de nuit commencée hier se prolonge-t-elle jusqu'à maintenant ?
  for (const rule of hours.split(";").map((r) => r.trim()).filter(Boolean)) {
    const parts = rule.split(/\s+/);
    let daySpec = "Mo-Su";
    let rest = parts.join(" ");
    if (/^(Mo|Tu|We|Th|Fr|Sa|Su|PH)/.test(parts[0])) { daySpec = parts[0]; rest = parts.slice(1).join(" "); }
    const applies = dayMatches(daySpec, day, holiday);
    const appliedYesterday = dayMatches(daySpec, prevDay, prevHoliday);
    if (daySpec.split(",").includes("PH")) holidayRule = true;
    if (applies === null || appliedYesterday === null || !rest) return "unknown";
    if (!applies && !appliedYesterday) continue;
    if (/^off$/i.test(rest)) {
      if (applies) { state = "closed"; offToday = true; }
      if (appliedYesterday) tail = false; // une règle plus tardive remplace celles d'hier
      continue;
    }
    let open = false;
    let ruleTail = false;
    for (const range of rest.split(",")) {
      const m = range.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if (!m) return "unknown";
      const start = +m[1] * 60 + +m[2];
      const end = +m[3] * 60 + +m[4];
      if (end === start) return "unknown"; // « 08:00-08:00 » : ouvert toute la journée ou jamais ? on ne devine pas
      // plage de nuit (fin avant le début) : le début est aujourd'hui, la fin appartient au lendemain
      if (applies && (end > start ? mins >= start && mins < end : mins >= start)) open = true;
      if (end < start && mins < end) ruleTail = true;
    }
    if (appliedYesterday) tail = ruleTail;
    if (applies) state = open ? "open" : "closed";
  }
  if (tail) {
    if (offToday) return "unknown"; // hier dit « ouvert jusqu'à maintenant », aujourd'hui dit « fermé » : on ne tranche pas
    state = "open";
  }
  if (holiday === true && state === "open" && !holidayRule) return "unknown";
  return state;
}

// Horaires en texte libre au format de la base (« L au V 8h30/17h », « 7j/7 10h/18h30 »), lus avec prudence.
// Un texte qui sort de ce format donne "unknown". Une précision restrictive (« hors vacances », « fermé en août »)
// ne peut que réduire l'ouverture : elle empêche de conclure "open", pas "closed".
const FR_DAY = { L: 1, Ma: 2, Me: 3, J: 4, V: 5, S: 6, D: 0 };
const FR_RANGE = "\\d{1,2}h(?:\\d{2})?\\s*[/–-]\\s*\\d{1,2}h(?:\\d{2})?"; // « 8h/17h » ou « 8h-17h » ; minutes : deux chiffres ou rien (« 8h3 » n'est pas lu)
// Jours : une lettre ou deux (L, Ma, Me, J, V, S, D), en plage (« L au V »), en liste (« L, Ma, J, V » ; « Me et S ») ou les deux
const FR_DAYTOK = "\\b(?:L|Ma|Me|J|V|S|D)\\b";
const FR_DAYS = `(?:${FR_DAYTOK}(?:(?:\\s+au\\s+|\\s*-\\s*)${FR_DAYTOK})?(?:\\s*,\\s*|\\s+et\\s+|\\s+)?)+`;
const FR_RULE = new RegExp(`\\s*(${FR_DAYS})?\\s*:?\\s*((?:${FR_RANGE}\\s*)+)`, "y");
const FR_START = new RegExp(`(?:7j/7|${FR_DAYTOK}(?:(?:\\s+au\\s+|\\s*-\\s*|\\s*,\\s*|\\s+et\\s+|\\s+)${FR_DAYTOK})*)\\s*:?\\s*\\d{1,2}h`);
const FR_QUALIFIER = /^(?:hors vacances scolaires|ferm[ée]e?\b.*)$/i;
// Mois, saisons et conditions avant l'horaire (« De mars à novembre 7j/7 9h/19h », « en cas d'occupation de la salle ») : l'horaire ne vaut pas toute l'année
const FR_SEASON_COND = /\b(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|ete|hiver|printemps|automne|saison|si|en cas|lorsque|lors|quand)\b/;
// Mots, avant l'horaire, qui réservent l'accès (« Réservé au personnel. L au V 8h/18h ») : on ne conclut pas « ouvert »
const FR_RESTRICTIVE = /r[ée]serv|personnel|rendez|sur demande|uniquement|exclusivement|seulement|sauf|clients?\b|r[ée]sidents?|adh[ée]rents?|membres|badge|\bcl[ée]s?\b|\bcode\b|restreint|digicode/i;

function frDayCovers(from, to, day) {
  for (let d = from; ; d = (d + 1) % 7) {
    if (d === day) return true;
    if (d === to) return false;
  }
}

// « L, Ma, J, V », « Me et S », « L au V » : le jour est-il couvert par cette liste ?
function frDaysCover(spec, day) {
  for (const m of spec.matchAll(/\b(L|Ma|Me|J|V|S|D)\b(?:(?:\s+au\s+|\s*-\s*)\b(L|Ma|Me|J|V|S|D)\b)?/g)) {
    const from = FR_DAY[m[1]];
    if (frDayCovers(from, m[2] === undefined ? from : FR_DAY[m[2]], day)) return true;
  }
  return false;
}

// Précisions qui ne peuvent que restreindre l'ouverture : on les retire de l'horaire et on s'en souvient.
// - « hors jours fériés » : restricted (jamais « ouvert », seulement « fermé » ou « incertain »)
// - « hors vacances scolaires », « fermé pendant les vacances » : vacation (voir vacationOn : fermé pendant les vacances, lu normalement
//   hors vacances ; sans calendrier utilisable, comme restricted)
// La base répète souvent le même horaire à la suite (« X ; X ») : une répétition identique compte pour un seul.
const FR_VACANCES = "vacances(?:\\s+scolaires?)?\\b(?!\\s+universitaires?)(?!\\s+(?:de|d['’])\\s*(?:la\\s+)?(?:no[eë]l|toussaint|hiver|printemps|p[aâ]ques|[eé]t[eé]|f[eé]vrier|avril|juillet|ao[uû]t|d[eé]cembre))";
const FR_HORS_ITEM = `(?:des\\s+)?(?:${FR_VACANCES}|jours?\\s+f[ée]ri[ée]s?)`;
// « hors vacances scolaires », « sauf vacances scolaires », « sauf pendant les vacances scolaires », « hors période de vacances scolaires »,
// « sauf jours fériés et vacances scolaires »
const FR_HORS_LEAD = "(?:hors|sauf)\\s+(?:(?:pendant|durant|en)\\s+)?(?:les?\\s+)?(?:p[ée]riodes?\\s+(?:de\\s+|des\\s+)?)?";
const FR_HORS = new RegExp(`\\s*[-–,]?\\s*(?:${FR_HORS_LEAD}${FR_HORS_ITEM}(?:\\s*(?:,|et)\\s+(?:${FR_HORS_LEAD})?${FR_HORS_ITEM})*|ferm[ée]e?s?\\s+(?:pendant|durant)\\s+les\\s+${FR_VACANCES})\\.?`, "gi");
// Une remarque qui dit seulement qu'il faut passer par quelqu'un (« (Interphone à l'entrée) », « Sonnette pour avertir et accéder au DAE »,
// « sonner à l'interphone ») ne change ni les horaires ni l'accessibilité : le DAE est accessible, mais il faut sonner. On la retire de l'horaire
// pour le lire (la fiche affiche toujours le texte complet). Une remarque qui contient un chiffre, un jour ou un moment (« après 21h », « le soir »)
// reste dans l'horaire : elle peut le modifier.
const FR_GATEWAY = /interphone|sonnette|sonner|visiophone/i;
const FR_TIMEY = /\d|apr[eè]s|avant|soir|nuit|matin|week|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|jours?\b|heures?\b|vacances|f[ée]ri/i;
function stripGatewayNotes(text) {
  const pieces = text.split(/([.;,()]|\s-\s)/); // proposition, séparateur, proposition, séparateur…
  const out = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const clause = pieces[i];
    const delimiter = pieces[i + 1];
    if (FR_GATEWAY.test(clause) && !FR_TIMEY.test(clause)) {
      const before = out.pop(); // la remarque disparaît avec le séparateur qui la précédait ; celui qui la suit reste
      if (!(before === "(" && delimiter === ")") && delimiter !== undefined) out.push(delimiter);
      continue;
    }
    out.push(clause);
    if (delimiter !== undefined) out.push(delimiter);
  }
  return out.join("");
}
function cleanHoursText(text) {
  let restricted = false;
  let vacation = false;
  const parts = text.split(";").map((x) => x.replace(FR_HORS, (m) => {
    if (/vacances/i.test(m)) vacation = true;
    if (/f[ée]ri[ée]/i.test(m)) restricted = true;
    return "";
  }).trim()).map(stripGatewayNotes).map((x) => x.trim()).filter(Boolean);
  return { text: [...new Set(parts)].join(" ; "), restricted, vacation };
}

// vac : vrai pendant les vacances scolaires, faux hors vacances, null quand on ne sait pas (voir vacationOn)
function textHours(raw, now, vac = null) {
  if (!raw) return "unknown";
  const { text, restricted: held, vacation } = cleanHoursText(raw);
  const restricted = held || (vacation && vac === null);
  const start = text.search(FR_START);
  if (start < 0) return "unknown";
  let pos = start;
  if (text.startsWith("7j/7", pos)) pos += 4; // « 7j/7 » = tous les jours, sauf si des jours précis suivent
  const first = start;
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const prevDay = (day + 6) % 7;
  let rules = 0;
  let open = false;
  const todaySpecs = new Set(); // plusieurs règles différentes pour le même jour (« L au V 8h-18h Me 8h-12h ») : exception ou ajout ? on ne devine pas
  for (;;) {
    FR_RULE.lastIndex = pos;
    const m = FR_RULE.exec(text);
    if (!m) break;
    rules++;
    pos = FR_RULE.lastIndex;
    const today = m[1] === undefined || frDaysCover(m[1], day);
    const yesterday = m[1] === undefined || frDaysCover(m[1], prevDay);
    if (today) todaySpecs.add(m[2].trim().replace(/\s+/g, " "));
    for (const r of m[2].matchAll(/(\d{1,2})h(\d{2})?\s*[/–-]\s*(\d{1,2})h(\d{2})?/g)) {
      const a = +r[1] * 60 + +(r[2] || 0);
      const b = +r[3] * 60 + +(r[4] || 0);
      if (today && (b > a ? mins >= a && mins < b : b < a && mins >= a)) open = true;
      if (yesterday && b < a && mins < b) open = true; // fin d'une plage de nuit commencée hier
    }
  }
  if (!rules || todaySpecs.size > 1) return "unknown";
  const schedule = text.slice(first, pos).trim();
  const leftovers = text.slice(pos).split(";").map((x) => x.trim()).filter((x) => x && x !== schedule);
  const real = leftovers.filter((x) => !isDescriptive(x));
  if (real.some((x) => !FR_QUALIFIER.test(x))) return "unknown";
  if (vacation && vac === true) return "closed"; // ces horaires ne valent pas pendant les vacances scolaires
  if (open) return real.length || restricted || FR_RESTRICTIVE.test(text.slice(0, first)) || FR_SEASON_COND.test(text.slice(0, first).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")) ? "unknown" : "open";
  return "closed";
}

// Horaires écrits en phrases (« du lundi au vendredi de 8h à 12h et de 14h à 18h », « tous les jours 9h-18h »).
// Même prudence : tout texte qui reste après lecture des règles (hors mots de liaison) donne "unknown".
const PR_DAYS = { lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, dim: 0 };
const PR_DAY = "(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun|mar|mer|jeu|ven|sam|dim)s?\\.?";
const PR_HOUR = "\\d{1,2}\\s*(?:h|:)\\s*(?:\\d{2})?";
const PR_RANGE = `${PR_HOUR}\\s*(?:a|-|/)\\s*${PR_HOUR}`;
// Jours : un seul, une plage (« du lundi au vendredi ») ou une liste (« les lundis, mardis et jeudis »)
const PR_DAYS_SPEC = `${PR_DAY}(?:\\s*(?:au|a|-)\\s*${PR_DAY}|(?:\\s*(?:,|et)\\s*${PR_DAY})+)?`;
const PR_RULE = new RegExp(
  `(?:(?:du|le|les|de)\\s+)?(?:(tous les jours|7j/7|7 jours sur 7)|(${PR_DAYS_SPEC}))` +
  `\\s*[:,]?\\s*((?:de\\s+)?${PR_RANGE}(?:\\s*(?:et|,|;|puis|/)\\s*(?:de\\s+)?${PR_RANGE})*)`, "g");
const PR_FILLER = /\b(ouvert\w*|horaires?|d'ouverture|et|ou|du|de|le|les|a|au|dae|defibrillateur|acces|accessible)\b/g;

// Le jour est-il couvert par « du lundi au vendredi », « les lundis, mardis et jeudis », « le samedi » ?
function prDaysCover(spec, day) {
  const days = [...spec.matchAll(/(lun|mar|mer|jeu|ven|sam|dim)[a-z]*/g)].map((m) => PR_DAYS[m[1]]);
  if (days.length === 2 && /\b(?:au|a)\b|-/.test(spec)) return frDayCovers(days[0], days[1], day);
  return days.includes(day);
}

function proseHours(raw, now, vac = null) {
  if (!raw) return "unknown";
  const { text, restricted: held, vacation } = cleanHoursText(raw);
  const restricted = held || (vacation && vac === null);
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  let rules = 0;
  let open = false;
  let invalid = false;
  const rest = t.replace(PR_RULE, (all, every, spec, times) => {
    rules++;
    const today = Boolean(every) || prDaysCover(spec, day);
    const yesterday = Boolean(every) || prDaysCover(spec, (day + 6) % 7);
    for (const r of times.matchAll(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:a|-|\/)\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?/g)) {
      const a = +r[1] * 60 + +(r[2] || 0);
      const b = +r[3] * 60 + +(r[4] || 0);
      if (+r[1] > 24 || +r[3] > 24 || +(r[2] || 0) > 59 || +(r[4] || 0) > 59) invalid = true;
      if (today && (b > a ? mins >= a && mins < b : b < a && mins >= a)) open = true;
      if (yesterday && b < a && mins < b) open = true; // fin d'une plage de nuit commencée hier
    }
    return " ";
  });
  if (!rules || invalid) return "unknown";
  const blocking = rest.split(/[.;,:()/\-]/).map((x) => x.replace(PR_FILLER, " ").trim()).filter((x) => x && !isDescriptive(x));
  if (blocking.length) return "unknown";
  if (vacation && vac === true) return "closed"; // ces horaires ne valent pas pendant les vacances scolaires
  return open && !restricted ? "open" : open ? "unknown" : "closed";
}

// ---------- Lecture par groupes ----------
// Les formats d'horaires en texte libre sont trop variés pour un modèle par format. Ici on lit la phrase entière, comme une expression
// avec des parenthèses : on repère d'abord les JOURS (« lundi », « L au V », « Ma, Me », « L-V », « tous les jours ») et les HEURES (« 8h »,
// « 8h30 », « 08:00 »), puis on en fait des groupes « jours + plages d'heures », jours d'abord (« L au V 8h-12h ») ou heures d'abord
// (« 8h-12h 14h-18h L/V »). Les séparateurs (espace, « - », « / », « et », « , », « ; », « : ») ne décident de rien par eux-mêmes :
// - les heures d'un groupe se prennent deux par deux, dans l'ordre (début, fin, début, fin) : « 8h-12h/14h-18h », « 8h/12h 14h/17h »
//   et « 8h30-12h - 13h30-16h30 » donnent les mêmes deux plages, et « 12h/14h » n'est jamais lu comme une plage ;
// - entre deux jours, « au » fait une plage ; « - » ou « / » en font une s'il n'y a que deux jours (« L-V », « L/V »), une liste s'il y en a trois ou
//   plus (« lundi-mercredi-vendredi ») ; « , », « et » ou l'espace font une liste.
// On ne conclut que si tout est lu : un nombre d'heures impair, un groupe sans jours, un mot qui modifie l'horaire (sauf, selon, mois, « ou »…),
// un chiffre qui n'est pas une heure, une lettre « M » seule (mardi ou mercredi ?) : « inconnu ».
const SH_DAYS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 };
const SH_ABBREV = { lun: 1, mar: 2, mer: 3, jeu: 4, ven: 5, sam: 6, dim: 0 }; // « aire de jeu », « la mer » : à confirmer par ce qui les entoure
const SH_LETTERS = { L: 1, Lu: 1, Ma: 2, Me: 3, J: 4, Je: 4, V: 5, Ve: 5, S: 6, Sa: 6, D: 0, Di: 0 };
const SH_FILLER = new Set(["du", "de", "des", "le", "les", "la", "aux", "ouvert", "ouverts", "ouverte", "ouvertes", "ouverture", "ouvertures", "horaire", "horaires",
  "heure", "heures", "accessible", "accessibles", "accessibilite", "disponible", "disponibles", "dae", "defibrillateur", "acces", "est", "sont", "d", "l"]);
const SH_CONNECTOR = new Set(["au", "a", "et", "puis"]);
const SH_TOKEN = /(\d{1,2}\s*(?:h|:)(?:\s*\d{2}(?!\d|\s*[h:]))?)|([A-Za-zÀ-ÿ]+)|(\d+)|(\S)/gi;
const SH_ALL = [0, 1, 2, 3, 4, 5, 6];

function shTokens(text) {
  const s = text
    .replace(/\b(L|J|V|S|D|Ma|Me)(au)\b/g, "$1 au") // « Lau J » : faute de frappe courante pour « L au J »
    .replace(/tous\s+les\s+jours|\btlj\b|7\s*j?\s*(?:\/|sur)\s*7\s*j?/gi, " ALLDAYS ")
    .replace(/week-?end/gi, " WEEKEND ")
    .replace(/en\s+semaine/gi, " WEEKDAYS ");
  const raw = [];
  for (const m of s.matchAll(SH_TOKEN)) {
    const at = m.index, next = s[at + m[0].length] || "";
    if (m[1] !== undefined) {
      const t = m[1].match(/(\d{1,2})\s*(?:h|:)(?:\s*(\d{2}))?/i);
      raw.push({ t: "T", h: +t[1], m: +(t[2] || 0) });
    } else if (m[2] !== undefined) {
      const w = m[2];
      const lw = w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (w === "ALLDAYS") raw.push({ t: "S", set: SH_ALL });
      else if (w === "WEEKEND") raw.push({ t: "S", set: [6, 0] });
      else if (w === "WEEKDAYS") raw.push({ t: "S", set: [1, 2, 3, 4, 5] });
      else if (lw in SH_DAYS || (lw.endsWith("s") && lw.slice(0, -1) in SH_DAYS && lw.length > 3)) raw.push({ t: "D", d: SH_DAYS[lw] ?? SH_DAYS[lw.slice(0, -1)] });
      else if (w === "M") raw.push({ t: "X" }); // mardi ou mercredi : on ne devine pas
      else if (lw in SH_ABBREV && !/['’]/.test(next)) raw.push({ t: "DL", d: SH_ABBREV[lw] }); // à confirmer par ce qui l'entoure
      else if (w in SH_LETTERS && !/['’]/.test(next)) raw.push({ t: "DL", d: SH_LETTERS[w] }); // idem
      else if (SH_CONNECTOR.has(lw)) raw.push({ t: "C", w: lw });
      else if (SH_FILLER.has(lw)) raw.push({ t: "F" });
      else raw.push({ t: "W", w: lw });
    } else if (m[3] !== undefined) raw.push({ t: "N", n: +m[3], len: m[3].length });
    else raw.push({ t: "P", p: m[4] });
  }
  // « 8h30-12 », « de 8h a 12 » : une heure sans « h » après une heure et « - », « / » ou « a »
  for (let i = 2; i < raw.length; i++) {
    const op = raw[i - 1];
    if (raw[i].t === "N" && raw[i].len <= 2 && raw[i].n <= 24 && raw[i - 2].t === "T" && ((op.t === "P" && /[-–/]/.test(op.p)) || (op.t === "C" && op.w === "a"))) raw[i] = { t: "T", h: raw[i].n, m: 0 };
  }
  // une lettre ou une abréviation de jour ne compte que si elle est dans un contexte d'horaires : à côté d'une heure ou d'un autre jour
  const dayish = (x) => x && (x.t === "D" || x.t === "DL");
  const sig = (i, step) => { for (i += step; i >= 0 && i < raw.length; i += step) if (raw[i].t !== "P" && raw[i].t !== "F") return raw[i]; return null; };
  const sigAt = (i, step) => { for (i += step; i >= 0 && i < raw.length; i += step) if (raw[i].t !== "P" && raw[i].t !== "F") return i; return -1; };
  for (let changed = true; changed;) {
    changed = false;
    raw.forEach((x, i) => {
      if (x.t !== "DL" || x.ok) return;
      const n = sig(i, 1), p = sig(i, -1);
      const nn = n && n.t === "C" ? sig(sigAt(i, 1), 1) : null;
      if ((n && (n.t === "T" || (dayish(n) && (n.t !== "DL" || n.ok)))) || (nn && dayish(nn) && (nn.t !== "DL" || nn.ok)) || (p && (p.t === "T" || (dayish(p) && (p.t !== "DL" || p.ok))))) { x.ok = true; changed = true; }
    });
  }
  return raw.map((x) => (x.t === "DL" ? (x.ok ? { t: "D", d: x.d } : { t: "W", w: "l" }) : x));
}

// Les jours de `from` à `to` (en bouclant sur la semaine : « samedi au lundi »)
function shSpan(from, to) {
  const out = [];
  for (let k = 0; k < 7; k++) { out.push((from + k) % 7); if ((from + k) % 7 === to) break; }
  return out;
}

// Jours d'un groupe : « au » → plage ; « - » ou « / » → plage s'il n'y a que deux jours reliés ainsi, liste sinon ; le reste → liste
function shDays(toks) {
  const items = [];
  let pending = [];
  for (const x of toks) {
    if (x.t === "D" || x.t === "S") { if (items.length) items[items.length - 1].after = pending; items.push({ x, after: [] }); pending = []; }
    else pending.push(x);
  }
  const link = (i) => { const c = items[i].after; return c.some((y) => y.t === "C" && (y.w === "a" || y.w === "au")) ? "au" : c.some((y) => y.t === "P" && /[-–]/.test(y.p)) ? "-" : c.some((y) => y.t === "P" && y.p === "/") ? "/" : "list"; };
  const set = new Set();
  const used = new Set();
  for (let i = 0; i < items.length - 1; i++) {
    if (link(i) === "au") {
      if (items[i].x.t !== "D" || items[i + 1].x.t !== "D") return null;
      shSpan(items[i].x.d, items[i + 1].x.d).forEach((d) => set.add(d));
      used.add(i); used.add(i + 1);
    }
  }
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const joined = (k) => k >= 0 && k < items.length - 1 && !used.has(k) && !used.has(k + 1) && (link(k) === "-" || link(k) === "/");
    let a = i; while (joined(a - 1)) a--;
    let b = i; while (joined(b)) b++;
    const x = items[i].x;
    if (x.t === "S") { x.set.forEach((d) => set.add(d)); continue; }
    if (b - a === 1 && i === a && joined(i)) { // deux jours seulement reliés par « - » ou « / » : une plage
      if (items[i + 1].x.t !== "D") return null;
      shSpan(x.d, items[i + 1].x.d).forEach((d) => set.add(d));
      used.add(i + 1);
    } else set.add(x.d);
  }
  return set;
}

function shGroups(text) {
  const toks = shTokens(text);
  const runs = [];
  for (const x of toks) {
    if (x.t === "D" || x.t === "S" || x.t === "T") {
      const type = x.t === "T" ? "T" : "D";
      if (!runs.length || runs[runs.length - 1].type !== type) runs.push({ type, toks: [] });
    }
    if (!runs.length) { // avant la première heure ou le premier jour : du texte descriptif seulement
      if (x.t === "W" && !isDescriptive(x.w)) return null;
      if (x.t === "N" || x.t === "X") return null;
      continue;
    }
    if (x.t === "N" || x.t === "X") return null; // un chiffre qui n'est pas une heure, ou « M »
    if (x.t === "W" && !isDescriptive(x.w)) return null;
    if (x.t === "W" && x.w === "ou") return null;
    runs[runs.length - 1].toks.push(x);
  }
  if (runs.length < 2 || runs.length % 2) return null;
  const daysFirst = runs[0].type === "D";
  const groups = [];
  for (let i = 0; i < runs.length; i += 2) {
    const [dr, tr_] = daysFirst ? [runs[i], runs[i + 1]] : [runs[i + 1], runs[i]];
    if (dr.type !== "D" || tr_.type !== "T") return null;
    const days = shDays(dr.toks);
    const times = tr_.toks.filter((x) => x.t === "T");
    if (!days || !days.size || times.length < 2 || times.length % 2) return null;
    const ranges = [];
    for (let k = 0; k < times.length; k += 2) {
      const [a, b] = [times[k], times[k + 1]];
      if (a.h > 24 || b.h > 24 || a.m > 59 || b.m > 59) return null;
      const from = a.h * 60 + a.m;
      let to = b.h * 60 + b.m;
      if (to === 0) to = 1440;
      if (from === to) return null;
      ranges.push([from, to]);
    }
    groups.push({ days, ranges });
  }
  return groups;
}

function scheduleHours(raw, now, vac = null) {
  if (!raw) return "unknown";
  const { text, restricted: held, vacation } = cleanHoursText(raw);
  const restricted = held || (vacation && vac === null);
  const groups = shGroups(text);
  if (!groups) return "unknown";
  const day = now.getDay();
  const prev = (day + 6) % 7;
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = groups.filter((g) => g.days.has(day));
  if (new Set(today.map((g) => JSON.stringify(g.ranges))).size > 1) return "unknown"; // deux règles différentes pour le même jour : exception ou ajout ?
  let open = false;
  for (const g of today) for (const [a, b] of g.ranges) if (b > a ? mins >= a && mins < b : mins >= a) open = true;
  for (const g of groups) if (g.days.has(prev)) for (const [a, b] of g.ranges) if (b < a && mins < b) open = true; // fin d'une plage de nuit commencée hier
  if (vacation && vac === true) return "closed"; // ces horaires ne valent pas pendant les vacances scolaires
  return open && !restricted ? "open" : open ? "unknown" : "closed";
}

// Des heures sans jour (« 8h-12h 14h-18h », « 06:00 - 22:00 ») : on ne sait pas quels jours, mais en dehors de ces heures c'est
// fermé quel que soit le jour. Dedans, on ne conclut pas. Jamais « ouvert ». Un texte qui parle de 24h/24, de permanence ou de nuit
// n'est pas lu (il peut décrire un accès hors de ces heures).
// (la deuxième moitié : le texte décrit peut-être un autre accès en dehors de ces heures : gardien, code, appel…)
const TIME_ONLY_SKIP = /24\s*h\s*(?:\/|sur)\s*24|\bh24\b|24\s*heures|permanen|toute la journee|nuit|jour et nuit|en continu|en dehors|hors horaire|apres|week-?end|astreinte|gardien|securite|interphone|digicode|sonner|appeler|sur demande/;
// Le texte nomme-t-il des jours (« L au V », « lundi », « tous les jours », « 7j/7 ») ? Une lettre de jour isolée, mal lue, ne fait que rendre la lecture plus prudente.
const FR_DAYWORDS = /lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine|jours?\b|\b7\s*j|\b(?:lu|ma|me|je|ve|sa|di|lun|mar|mer|jeu|ven|sam|dim)\b/i;
const FR_DAYLETTER = "(?<![\\w'’])(?:L|Ma|Me|M|J|V|S|D)(?![\\w'’])";
const hasDays = (text) => FR_DAYWORDS.test(text) || new RegExp(`${FR_DAYLETTER}\\s*(?:au|et|,|-|/)?\\s*(?:${FR_DAYLETTER}|\\d)`, "i").test(text);
// Un morceau de texte purement descriptif (« DAE à gauche dans le hall », « Réfectoire ») : ni chiffre, ni jour, ni mot qui modifie l'accès ou les
// horaires (sauf, hors, fermé, selon, gardien, badge, vacances, week-end…). Il ne change rien à des horaires bien lus, qu'il les précède ou les suive.
const FR_MODIFIER = /\b(?:sauf|hors|ferm\w*|uniquement|seulement|exclusivement|sinon|selon|suivant|apres|avant|jusque?\w*|vacances|conges|ete|hiver|periodes?|scolaires?|week\w*|nuit|soir|matin|midi|demande|reserv\w*|rendez\w*|badge|codes?|cles?|clefs?|personnel|agents?|gardien\w*|surveillant\w*|astreinte|securite|evenements?|manifestations?|saison\w*|jours?|feries?|pas|non|sans|plus|dehors|exception|compris|permanen\w*|24h|digicode|sonn\w*|interphone|appel\w*|telephone|tel|ouverture|ouvert\w*|horaires?|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|printemps|automne|si|cas|lorsque|lors|quand|occupation|activit\w*|association|club|adherents?|membres?|abonnes?|clients?|residents?|usagers?|eleves?|enseignants?|locataires?|aleatoire\w*|irregulier\w*|variables?|parfois|souvent|environ|theorique\w*|normalement|principe|susceptible|peut|possible|mais)\b/;
const isDescriptive = (clause) => {
  const c = clause.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return !/\d/.test(c) && !FR_MODIFIER.test(c) && !hasDays(clause) && !FR_DAYWORDS.test(c);
};
// Conditions, saisons, mois et publics réservés : des heures qui s'y rattachent ne valent pas tous les jours de l'année pour tout le monde
const FR_CONDITIONAL = /\b(?:selon|saison\w*|si|cas|lorsque|lors|quand|activit\w*|evenements?|manifestations?|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|printemps|automne|ete|hiver|vacances|conges|sauf|hors|ferm\w*|uniquement|seulement|exclusivement|reserv\w*|adherents?|membres?|abonnes?|clients?|residents?|badge|codes?|cles?)\b/;
const TIME_ONLY_RANGE = /(\d{1,2})\s*(?:h|:)(\d{2})?\s*(?:-|\/|a|au|et|jusqu'a)?\s*(\d{1,2})\s*(?:h|:)(\d{2})?/g; // les minutes se collent à l'heure : « 12h 14h » n'est pas « 12h14 »
function timeOnlyHours(text, now) {
  if (!text) return "unknown";
  text = stripGatewayNotes(text);
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[–—]/g, "-"); // « sonner à l'interphone » : voir stripGatewayNotes
  if (TIME_ONLY_SKIP.test(t) || FR_CONDITIONAL.test(t)) return "unknown";
  const mins = now.getHours() * 60 + now.getMinutes();
  let ranges = 0;
  for (const m of t.matchAll(TIME_ONLY_RANGE)) {
    if (+m[1] > 24 || +m[3] > 24 || +(m[2] || 0) > 59 || +(m[4] || 0) > 59) return "unknown";
    const a = +m[1] * 60 + +(m[2] || 0);
    const b = +m[3] * 60 + +(m[4] || 0);
    if (a === b) return "unknown";
    ranges++;
    if (b > a ? mins >= a && mins < b : mins >= a || mins < b) return hasDays(text) ? "unknown" : "window"; // dans une plage : ouvert à cette heure-là, mais les jours ne sont pas précisés (s'ils le sont, on n'a pas su les lire)
  }
  // « fermé en dehors » seulement si chaque heure écrite fait partie d'une plage lue (« 8h30-12 / 13h30-16h30 » ou « 8h-12h (17h le vendredi) » : une heure reste)
  if ((t.match(/\d{1,2}\s*(?:h|:)/g) || []).length !== ranges * 2) return "unknown";
  return ranges ? "closed" : "unknown";
}

// "sure" | "likely" | "window" (heures connues, jours non précisés) | "uncertain" | "closed"
// holidayOverride : en simulation, le jour est férié ou non selon le choix de l'utilisateur, pas selon le calendrier
// vacationOverride : de même pour les vacances scolaires
// L'état d'ouverture lu dans le texte des précisions, quand il nomme des jours (« L au V 8h/17h S 9h/12h ») ; « unknown » si aucune lecture n'est sûre
function complementState(d, now, holiday, vacation) {
  let state = textIs247(d.complement) ? "open" : textHours(d.complement, now, vacation);
  if (state === "unknown") state = proseHours(d.complement, now, vacation);
  if (state === "unknown") state = scheduleHours(d.complement, now, vacation); // lecture par groupes, pour les formats que les deux précédentes n'ont pas reconnus
  if (holiday === true && state === "open" && !textIs247(d.complement)) state = "unknown"; // ces textes ne disent rien des jours fériés
  return state;
}

// { avail, conflict } : conflict est vrai quand les horaires renseignés disent « fermé » mais que les précisions, lisibles, disent « ouvert » (par exemple le samedi,
// absent des horaires renseignés mais écrit dans les précisions) : la base se contredit, on ne tranche pas (incertain) plutôt que de cacher le défibrillateur
function availabilityDetail(d, now, holidayOverride, vacationOverride) {
  if (d.flags & 2) return { avail: "uncertain", conflict: false }; // signalé absent momentanément
  const holiday = holidayOverride === undefined ? holidayOn(now, d.cp) : holidayOverride;
  const vacation = vacationOverride === undefined ? vacationOn(now, d.cp) : vacationOverride;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let state = openState(d.horaires, now, holiday, holidayOverride === undefined ? holidayOn(yesterday, d.cp) : false);
  if (state === "unknown" && !d.horaires) { // horaires écrits dans les précisions
    state = complementState(d, now, holiday, vacation);
    if (state === "unknown") state = timeOnlyHours(d.complement, now); // heures sans jour : fermé en dehors, incertain dedans
  }
  if (state === "closed" && d.horaires && d.complement && complementState(d, now, holiday, vacation) === "open") return { avail: "uncertain", conflict: true };
  if (state === "open") return { avail: "sure", conflict: false };
  if (state === "closed") return { avail: "closed", conflict: false };
  if (state === "window") return { avail: d.acces === 0 ? "likely" : "window", conflict: false }; // dehors c'est fermé quel que soit le jour ; dedans, à l'extérieur c'est probable
  return { avail: d.acces === 0 ? "likely" : "uncertain", conflict: false };
}
const availability = (d, now, holidayOverride, vacationOverride) => availabilityDetail(d, now, holidayOverride, vacationOverride).avail;

// Un DAE dont l'accès est à demander (interphone, badge, code, « sur demande »…) et dont l'ouverture est incertaine
const accessRestricted = (d) => FR_RESTRICTIVE.test(d.complement || "");
const isUncertain = (c) => c.avail === "uncertain" || c.avail === "window";
const askAccess = (c) => isUncertain(c) && c.limited;

// ---------- Sélection ----------
// Chaque emplacement est une liste de choix tentés dans l'ordre : le premier qui trouve un DAE l'emporte.
const PICKS = {
  adult: [
    [[tr("pick.adult.best"), (c) => AV_OK.has(c.avail) && c.d.maint === "ok"]],
    [[tr("pick.adult.nearestOpen"), (c) => AV_OK.has(c.avail)]],
    [
      [tr("pick.adult.uncertain"), (c) => isUncertain(c) && !c.limited],
      [tr("pick.adult.other"), (c) => c.avail !== "closed" && !askAccess(c)],
    ],
    // avant un DAE a priori fermé : un DAE dont il faut demander l'accès (interphone, badge…). Un DAE d'intérieur fermé d'après les horaires
    // n'est jamais proposé (on perdrait du temps) ; un DAE à l'extérieur peut rester accessible quand son lieu est fermé.
    [[tr("pick.lastResortAsk"), (c) => askAccess(c)], [tr("pick.lastResort"), (c) => c.avail === "closed" && c.d.acces === 0], [tr("pick.lastResortAbsent"), (c) => c.unavailable, true]],
  ],
  child: [
    [[tr("pick.child.best"), (c) => AV_OK.has(c.avail) && c.d.ped === 1 && c.d.maint === "ok"]],
    [[tr("pick.child.nearestOpen"), (c) => AV_OK.has(c.avail) && c.d.ped === 1]],
    [[tr("pick.child.uncertain"), (c) => isUncertain(c) && c.d.ped === 1 && !c.limited]],
    [[tr("pick.child.other"), (c) => AV_OK.has(c.avail)]],
    [[tr("pick.lastResortAsk"), (c) => askAccess(c) && c.d.ped === 1], [tr("pick.lastResort"), (c) => c.avail === "closed" && c.d.acces === 0], [tr("pick.lastResortAbsent"), (c) => c.unavailable, true]],
  ],
};

function bestMatch(cands, pred, seen) {
  let best = null;
  let bestScore = Infinity;
  for (const c of cands) {
    if (seen.has(c.d.gid) || !pred(c)) continue;
    const score = c.dist + (c.avail === "uncertain" ? UNCERTAIN_PENALTY_M : c.avail === "window" ? WINDOW_PENALTY_M : 0);
    if (score < bestScore) { best = c; bestScore = score; }
  }
  return best;
}

function select(cands, mode) {
  const seen = new Set();
  const options = [];
  let hasBest = false;
  PICKS[mode].forEach((choices, rank) => {
    for (const [title, pred, allowUnavailable] of choices) {
      // un appareil que les précisions disent absent (en stock, non installé…) n'est proposé qu'en tout dernier recours : choix marqué allowUnavailable, et seulement quand rien d'autre n'a été trouvé
      if (allowUnavailable && options.length) continue;
      const best = bestMatch(cands, allowUnavailable ? pred : (c) => !c.unavailable && pred(c), seen);
      if (!best) continue;
      seen.add(best.d.gid);
      options.push({ ...best, title, rank });
      if (rank === 0) hasBest = true;
      return;
    }
  });
  return { options, hasBest };
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("indisponible")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { lastAccuracy = p.coords.accuracy; resolve([p.coords.latitude, p.coords.longitude]); },
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

// includeIgnored : garde aussi les défibrillateurs ignorés, marqués (ignored: true), pour savoir ce que l'ignorance change
function candidatesAround(ll, radius, now, includeIgnored = false) {
  const active = new Map(reports.filter((r) => Date.now() < reportExpiry(r)).map((r) => [r.gid, r]));
  const changed = new Set(); // « jusqu'à modification » : la fiche a changé dans les données, elle n'est plus ignorée
  const out = [];
  for (const list of loadedAeds.values()) {
    for (const d of list) {
      const r = active.get(d.gid);
      let ignored = false;
      if (r) {
        if (r.mode === "change" && r.fp && aedFingerprint(d) !== r.fp) changed.add(d.gid);
        else ignored = true;
      }
      if (ignored && !includeIgnored) continue;
      const dist = map.distance(ll, [d.lat, d.lon]);
      if (dist > radius) continue;
      const a = availabilityDetail(d, now, sim ? sim.holiday : undefined, sim ? sim.vacation : undefined);
      out.push({ d, dist, avail: a.avail, conflict: a.conflict, limited: accessRestricted(d), unavailable: hasUnavailableText(d.complement), ignored });
    }
  }
  if (changed.size) { reports = reports.filter((r) => !changed.has(r.gid)); saveReports(); }
  return out;
}

// La recherche d'urgence : de plus en plus loin jusqu'à trouver. includeIgnored : sans écarter les défibrillateurs ignorés (ils sont marqués dans les options)
async function searchAround(ll, mode, now, includeIgnored = false) {
  let result = { options: [], hasBest: false };
  for (const radius of SEARCH_RADII) {
    await loadAround(ll, radius);
    result = select(candidatesAround(ll, radius, now, includeIgnored), mode);
    if (result.hasBest || (radius >= 5000 && result.options.some((o) => o.avail !== "closed"))) break;
  }
  return result;
}

// Vue de la carte juste avant la première recherche : « Fermer » y revient (la recherche recadre la carte, parfois très loin)
let viewBeforeSearch = null;

async function runQuick(mode) {
  const run = quickRuns.start();
  if (!viewBeforeSearch) viewBeforeSearch = { center: map.getCenter(), zoom: map.getZoom() };
  lastMode = mode;
  targetGid = null;
  document.body.classList.add("has-results");
  setSheetSize("mid");
  layer.clearLayers();
  setSheet(`<p class="sheet-msg">${tr("geo.searching")}</p>`);
  await loadVacations(); // le calendrier des vacances scolaires, pour les horaires « hors vacances scolaires » (déjà chargé aux recherches suivantes)
  // Simulation après un lien direct (ex. préparer un séjour) : la recherche part du centre de la carte, pas du GPS ; sous le zoom minimal, rien n'est affiché : GPS
  // tant que la position vient du centre de la carte, elle suit la carte à chaque recherche (après un défilement, par exemple)
  if (sim && (manualPos ? manualPos.kind === "center" : placeLinkActive())) {
    if (map.getZoom() >= MIN_ZOOM) {
      const c = map.getCenter();
      manualPos = { ll: [c.lat, c.lng], label: tr("pos.centerLabel"), kind: "center" };
      updatePosLine();
    } else if (!manualPos) showSimPosition(false);
  }
  let ll;
  try { ll = manualPos ? manualPos.ll : await getPosition(); } catch {
    if (quickRuns.isCurrent(run)) showPositionChooser(tr("quick.noGps"), () => runQuick(mode));
    return;
  }
  if (!quickRuns.isCurrent(run)) return;
  showUser(ll, manualPos ? 0 : lastAccuracy || 0);
  setSheet(`<p class="sheet-msg">${tr("quick.searching")}</p>`);
  const now = currentTime();
  let result;
  try {
    result = await searchAround(ll, mode, now);
    // Des défibrillateurs ignorés auraient-ils fait partie des propositions ? On refait la même recherche sans les écarter, et on compte ceux qui y figurent
    result.hiddenIgnored = 0;
    if (ignoredList().length) {
      const proposed = new Set(result.options.map((o) => o.d.gid));
      result.hiddenIgnored = (await searchAround(ll, mode, now, true)).options.filter((o) => o.ignored && !proposed.has(o.d.gid) && !(justIgnored && justIgnored.gid === o.d.gid)).length; // celui qu'on vient d'ignorer a déjà sa ligne « Annuler »
    }
  } catch {
    if (quickRuns.isCurrent(run)) setSheet(`<p class="sheet-msg">${tr("quick.loadError")}</p>` + closeButton());
    return;
  }
  if (!quickRuns.isCurrent(run)) return;
  const origin = !manualPos
    ? (lastAccuracy ? tr("quick.originGpsAccuracy", { dist: formatDistance(lastAccuracy) }) : tr("quick.originGps"))
    : manualPos.kind === "map" ? tr("quick.originMap")
    : manualPos.kind === "center" ? tr("quick.originCenter")
    : tr("quick.originAddress", { label: manualPos.label });
  renderResults(ll, mode, result, origin);
}

// ---------- Affichage ----------
const closeButton = () => `<button type="button" class="sheet-close" data-act="close">${tr("common.close")}</button>`;


// Ordre d'affichage : par priorité (fiabilité d'abord) ou, au choix, du plus proche au plus loin
const orderOptions = (options, byDistance) => (byDistance ? [...options].sort((a, b) => a.dist - b.dist) : options);

function cardHtml(o, i, all) {
  const d = o.d;
  const lieu = [d.adresse, [d.cp, d.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const minutes = Math.max(1, Math.round(o.dist / WALK_M_PER_MIN));
  const ped = d.ped === 1 ? tr("ped.yes.card") : d.ped === 0 ? tr("ped.no") : tr("ped.unknown");
  const isNearest = all.length > 1 && o === all.reduce((a, b) => (b.dist < a.dist ? b : a)); // une seule pastille, même à égalité
  const notes = [];
  if (d.flags & 2) notes.push(tr("note.absent"));
  if (d.flags & 1) notes.push(tr("note.mobile.card"));
  if (d.validation === 1) notes.push(tr("note.pending"));
  if (d.validation === 2) notes.push(tr("note.doubted"));
  const localHoliday = !sim && isLocalHolidayDate(new Date()) && holidayOn(new Date(), d.cp) === true; // Alsace-Moselle : férié ici, pas partout
  return `<article class="card${d.gid === targetGid ? " target" : ""}">
    <div class="card-head">
      <h3><span class="badge">${i + 1}</span> ${esc(o.title)}</h3>
      <button type="button" class="card-problem" data-act="problem" data-i="${i}">${tr("card.problem")}</button>
    </div>
    <p class="name">${esc(d.nom || d.exploitant || tr("aed.fallbackName"))}</p>
    ${lieu ? `<p>${esc(lieu)}</p>` : ""}
    <p>${isNearest ? `<span class="near">${tr("card.nearest")}</span> ` : ""}${tr("card.distance", { dist: formatDistance(o.dist), min: minutes })}</p>
    <p class="av av-${o.avail}">${avLabel(o.avail, o.conflict)}${d.horaires && !is247(d.horaires) ? ` (${esc(frHours(d.horaires) || d.horaires)})` : ""}</p>
    <p class="maint maint-${d.maint}">${maintText(d)}</p>
    ${localHoliday ? `<p>${tr("card.localHoliday")}</p>` : ""}
    <p>${ped}</p>
    ${d.etage ? `<p>${esc(tr("aed.floor", { floor: d.etage }))}</p>` : ""}
    ${d.complement ? `<p>${esc(d.complement)}</p>` : ""}
    ${hasUnavailableText(d.complement) ? `<p class="note">⚠ ${tr("note.maybeAbsent", { text: esc(unavailableSnippet(d.complement)) })}</p>` : ""}
    ${notes.map((n) => `<p class="note">⚠ ${n}</p>`).join("")}
    <div class="card-actions">
      <a class="primary" href="${routeUrl(d)}" target="_blank" rel="noopener" data-act="go" data-i="${i}">${tr("card.go")}</a>
      <button type="button" data-act="show" data-i="${i}">${tr("card.show")}</button>
      ${shareButtonHtml(d)}
    </div>
  </article>`;
}

function renderResults(ll, mode, result, origin) {
  lastSearch = { ll, mode, result, origin };
  const options = orderOptions(result.options, sortByDistance);
  currentOptions = options;
  resultLayer.clearLayers();
  const who = tr(mode === "child" ? "results.whoChild" : "results.whoAdult");
  if (!options.length) {
    setSheet(undoHtml() + hiddenIgnoredHtml(result.hiddenIgnored) + `<p class="sheet-msg">${tr("results.none", { km: MAX_RADIUS_KM })}</p>` + closeButton());
    return;
  }
  options.forEach((o, i) => {
    L.marker([o.d.lat, o.d.lon], {
      icon: L.divIcon({ className: "result-pin", html: `<span>${i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
      title: tr("results.pinTitle", { n: i + 1 }), keyboard: false,
    }).on("click", () => focusCard(i)).addTo(resultLayer);
  });
  const noBest = result.options[0].rank !== 0; // la meilleure option par priorité, quel que soit l'ordre affiché
  // l'en-tête reste fixe en haut de la liste : on peut fermer sans remonter
  setSheet(`<div class="sheet-top"><header><b>${tr("results.header", { who, when: sim ? tr("results.whenSim", { time: simLabel }) : whenNowLabel(new Date()) })}</b>${closeButton()}</header>` +
    `<p class="sheet-origin">${esc(origin)}</p>` +
    `<p class="sheet-note">${tr("results.estimate")}</p>` +
    (options.length > 1 ? `<label class="sort"><input type="checkbox" id="sort-dist"${sortByDistance ? " checked" : ""}> ${tr("results.sort")}</label>` : "") + '</div>' +
    undoHtml() + hiddenIgnoredHtml(result.hiddenIgnored) +
    (noBest ? `<p class="sheet-msg warn">${tr("results.noBest")}</p>` : "") +
    options.map(cardHtml).join(""));
  map.fitBounds([ll, ...options.map((o) => [o.d.lat, o.d.lon])], {
    ...sheetPadding(), maxZoom: 17,
  });
}

// Fait défiler la liste pour amener la fiche juste sous l'en-tête fixe
function scrollCardToTop(card) {
  const top = sheet.querySelector(".sheet-top");
  const grip = sheet.querySelector(".sheet-grip");
  // position de la fiche dans le contenu défilant, moins la hauteur de la poignée et de l'en-tête fixes, moins sa marge du haut :
  // la première fiche, déjà à sa place au chargement, ne bouge pas
  const y = sheet.scrollTop + card.getBoundingClientRect().top - sheet.getBoundingClientRect().top - (top ? top.offsetHeight : 0) - (grip ? grip.offsetHeight : 0) - (parseFloat(getComputedStyle(card).marginTop) || 0);
  sheet.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}

// Fait défiler la liste jusqu'à la fiche choisie et la met brièvement en évidence
function focusCard(i) {
  const card = sheet.querySelectorAll(".card")[i];
  if (!card) return;
  scrollCardToTop(card);
  card.classList.remove("flash");
  void card.offsetWidth; // relance l'animation
  card.classList.add("flash");
}

// Le panneau est en bas (téléphone, écran étroit) ou en colonne à gauche (écran large en paysage) : de quel côté masque-t-il la carte ?
const sheetOnSide = () => sheet.offsetWidth < mapWrap.clientWidth * 0.9;
function sheetPadding() {
  return sheetOnSide()
    ? { paddingTopLeft: [sheet.offsetLeft + sheet.offsetWidth + 20, 30], paddingBottomRight: [30, 30] }
    : { paddingTopLeft: [30, 30], paddingBottomRight: [30, sheet.offsetHeight + 30] };
}

// Centre un point dans la partie de la carte non masquée par la liste de résultats
function centerAboveSheet(ll, zoom) {
  map.setView(ll, zoom, { animate: false });
  map.panBy(sheetOnSide() ? [-(sheet.offsetLeft + sheet.offsetWidth) / 2, 0] : [0, sheet.offsetHeight / 2], { animate: false });
}

const GUIDE_PROBLEM_ANCHOR = "#erreur"; // la partie du Guide qui explique à qui signaler une erreur

// Le menu « Un problème ? » recouvre la fiche, comme le calque « Partager » (mêmes styles) : rien ne bouge dans la liste. Il montre ce que dit la base,
// pour juger d'où vient l'erreur, puis propose de revenir ou d'ignorer ce défibrillateur ; la fiche garde sa taille et le texte défile s'il la dépasse.
// backAttrs / ignoreAttrs : les attributs data-* des deux liens du bas (la fiche de recherche et celle de la carte ne les traitent pas au même endroit)
// Le dernier lien du menu : « Ignorer… », ou, si l'appareil l'est déjà, « Ignoré (encore … h) » qui ouvre le panneau « Données » (ignoredAttrs : son attribut data-*)
function problemIgnoreButtonHtml(d, ignoreAttrs, ignoredAttrs = "") {
  const ignored = ignoredAttrs && ignoredEntry(d.gid);
  return ignored ? `<button type="button" class="share-close" ${ignoredAttrs}>${ignoredLinkText(ignored)}</button>`
    : `<button type="button" class="share-close" ${ignoreAttrs}>${tr("problem.ignore")}</button>`;
}

// backAttrs / ignoreAttrs / ignoredAttrs : les attributs data-* des liens du bas (la fiche de recherche et celle de la carte ne les traitent pas au même endroit)
function problemMenuHtml(d, backAttrs, ignoreAttrs, ignoredAttrs = "") {
  const guide = document.getElementById("guide-toggle");
  const label = tr("problem.learn");
  const link = guide ? `<a href="${esc(guide.getAttribute("href"))}${GUIDE_PROBLEM_ANCHOR}" target="_blank" rel="noopener">${label}</a>` : label;
  const rows = sourceRows(d).map(([name, value]) => `<p class="problem-row"><b>${esc(name)}</b> ${esc(value)}</p>`).join("");
  return `<div class="share-sheet problem-menu" role="dialog" aria-label="${esc(tr("card.problem"))}">` +
    `<div class="problem-scroll"><b>${tr("problem.title")}</b><p class="problem-intro">${tr("problem.intro", { link })}</p>${rows}</div>` +
    `<div class="problem-actions"><button type="button" class="share-close" ${backAttrs}>${tr("share.back")}</button>` +
    problemIgnoreButtonHtml(d, ignoreAttrs, ignoredAttrs) + "</div></div>";
}

// Le texte du menu s'estompe vers le blanc au bord où il continue (classes selon le défilement) ; le focus va sur le premier lien du bas
function wireProblemMenu(menu) {
  const scroller = menu.querySelector(".problem-scroll");
  const fade = () => {
    scroller.classList.toggle("fade-top", scroller.scrollTop > 1);
    scroller.classList.toggle("fade-bottom", scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
  };
  scroller.addEventListener("scroll", fade, { passive: true });
  fade();
  menu.querySelector(".problem-actions button").focus({ preventScroll: true });
}

// Dans une fiche de la carte, « Ignorer » ne relance pas de recherche : le menu se change en confirmation, avec « Annuler » et « Fermer »
function ignoredConfirmHtml(name) {
  return `<div class="share-sheet problem-menu" role="dialog" aria-label="${esc(tr("card.problem"))}">` +
    `<div class="problem-scroll"><b>${esc(tr("ignore.done", { name }))}</b><p class="problem-intro">${tr("ignore.mapStays")}</p></div>` +
    `<div class="problem-actions"><button type="button" class="share-close" data-pop="undo">${tr("ignore.undo")}</button>` +
    `<button type="button" class="share-close" data-pop="close">${tr("common.close")}</button></div></div>`;
}

function closeSheet() {
  quickRuns.cancel(); // une recherche encore en cours ne doit pas rouvrir la liste
  if (onMapPick) { map.off("click", onMapPick); onMapPick = null; }
  chooserDone = null;
  resultLayer.clearLayers();
  document.body.classList.remove("has-results");
  setSheetSize("mid");
  sheet.innerHTML = "";
  targetGid = null;
  viewBeforeSearch = null;
  justIgnored = null;
  refresh();
}

sheet.addEventListener("change", (e) => {
  if (e.target.id !== "sort-dist" || !lastSearch) return;
  sortByDistance = e.target.checked;
  renderResults(lastSearch.ll, lastSearch.mode, lastSearch.result, lastSearch.origin);
  sheet.scrollTop = 0;
});

function setSheetSize(size) {
  sheet.style.height = "";
  sheet.style.maxHeight = "";
  sheet.dataset.size = size;
}
const currentSheetSize = () => sheet.dataset.size || "mid";

// Glisser la poignée : le panneau suit le doigt, puis se cale sur la taille la plus proche (réduit, moyen, grand).
// Un simple appui change de taille. Au clavier : flèches haut et bas.
let gripDrag = null;
let gripMoved = false;
sheet.addEventListener("pointerdown", (e) => {
  const grip = e.target.closest(".sheet-grip");
  if (!grip) return;
  gripDrag = { id: e.pointerId, y: e.clientY, h: sheet.offsetHeight, moved: false };
  gripMoved = false;
  grip.setPointerCapture(e.pointerId);
});
sheet.addEventListener("pointermove", (e) => {
  if (!gripDrag || e.pointerId !== gripDrag.id) return;
  const dy = gripDrag.y - e.clientY;
  if (!gripDrag.moved && Math.abs(dy) < 6) return;
  if (!gripDrag.moved) {
    gripDrag.moved = true;
    gripMoved = true;
    sheet.dataset.size = "mid"; // sorti de l'état réduit, le contenu redevient visible
  }
  const h = Math.max(48, Math.min(mapWrap.clientHeight * 0.88, gripDrag.h + dy));
  sheet.style.height = sheet.style.maxHeight = `${h}px`;
});
const endGripDrag = (e) => {
  if (!gripDrag || e.pointerId !== gripDrag.id) return;
  const moved = gripDrag.moved;
  gripDrag = null;
  if (moved) setSheetSize(sheetSizeFor(sheet.offsetHeight / mapWrap.clientHeight));
};
sheet.addEventListener("pointerup", endGripDrag);
sheet.addEventListener("pointercancel", endGripDrag);
sheet.addEventListener("keydown", (e) => {
  if (!e.target.closest(".sheet-grip") || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
  e.preventDefault();
  setSheetSize(stepSheetSize(currentSheetSize(), e.key === "ArrowUp" ? 1 : -1));
});

sheet.addEventListener("click", (e) => {
  if (handleShareClick(e)) return;
  if (e.target.closest(".sheet-grip")) { if (!gripMoved) setSheetSize(nextSheetSize(currentSheetSize())); gripMoved = false; return; }
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const o = currentOptions[+el.dataset.i];
  if (act === "close") {
    const before = viewBeforeSearch;
    closeSheet();
    if (before) map.setView(before.center, before.zoom, { animate: false });
  }
  else if (act === "go" && o) {
    targetGid = o.d.gid;
    sheet.querySelectorAll(".card").forEach((c, i) => c.classList.toggle("target", i === +el.dataset.i));
  } else if (act === "show" && o) centerAboveSheet([o.d.lat, o.d.lon], 18);
  else if (act === "problem" && o) {
    const card = el.closest(".card");
    card.insertAdjacentHTML("beforeend", problemMenuHtml(o.d, `data-act="cancel-problem" data-i="${el.dataset.i}"`, `data-act="report" data-i="${el.dataset.i}"`));
    wireProblemMenu(card.querySelector(".problem-menu"));
    scrollCardToTop(card);
  } else if (act === "cancel-problem") {
    const card = el.closest(".card");
    card.querySelector(".problem-menu").remove();
    card.querySelector(".card-problem").focus({ preventScroll: true });
  }
  else if (act === "pick-map") startMapPick();
  else if (act === "use-gps") useGps();
  else if (act === "pick-result") setManualPosition(geoResults[+el.dataset.i].ll, geoResults[+el.dataset.i].label);
  else if (act === "report") {
    if (o) {
      addReport(o.d);
      justIgnored = { gid: o.d.gid, name: o.d.nom || o.d.exploitant || tr("aed.fallbackName") };
    }
    runQuick(lastMode);
  } else if (act === "open-ignored") openDataPanel(".ignored");
  else if (act === "undo-ignore") {
    if (justIgnored) restoreIgnored(justIgnored.gid);
    justIgnored = null;
    runQuick(lastMode);
  }
});

document.getElementById("quick-adult").addEventListener("click", () => { justIgnored = null; runQuick("adult"); });
document.getElementById("quick-child").addEventListener("click", () => { justIgnored = null; runQuick("child"); });

// ---------- Repli manuel de position ----------
function updatePosLine() {
  document.getElementById("posline").innerHTML = manualPos
    ? `${esc(tr("pos.chosen", { label: manualPos.label }))} <button type="button" data-pos="gps">${tr("pos.backToGps")}</button> <button type="button" data-pos="change">${tr("pos.change")}</button>`
    : `<button type="button" data-pos="change">${tr("pos.changeMine")}</button>`;
}

function showPositionChooser(message, onDone) {
  quickRuns.cancel(); // une recherche encore en cours ne doit pas remplacer ce formulaire
  chooserDone = onDone || null;
  document.body.classList.add("has-results");
  setSheetSize("mid");
  layer.clearLayers();
  setSheet(`<div class="sheet-top"><header><b>${esc(message)}</b>${closeButton()}</header></div>
    <form id="addr-form"><input id="addr" type="search" placeholder="${tr("chooser.placeholder")}" autocomplete="off"><button type="submit">${tr("chooser.search")}</button></form>
    <div id="addr-results"></div>
    <button type="button" class="choice" data-act="pick-map">${tr("chooser.pickMap")}</button>
    <button type="button" class="choice" data-act="use-gps">${tr("chooser.retryGps")}</button>`);
}

function setManualPosition(ll, label, kind = "address") {
  manualPos = { ll, label, kind };
  showUser(ll);
  updatePosLine();
  const done = chooserDone;
  chooserDone = null;
  if (done) { done(); return; }
  closeSheet();
  map.setView(ll, 16);
}

function useGps() {
  manualPos = null;
  updatePosLine();
  const done = chooserDone;
  chooserDone = null;
  if (done) done(); else { closeSheet(); locate(); }
}

function startMapPick() {
  quickRuns.cancel();
  const done = chooserDone;
  setSheet(`<div class="sheet-top"><header><b>${tr("chooser.tapMap")}</b>${closeButton()}</header></div>`);
  onMapPick = (e) => {
    map.off("click", onMapPick);
    onMapPick = null;
    chooserDone = done;
    setManualPosition([e.latlng.lat, e.latlng.lng], tr("chooser.mapPoint"), "map");
  };
  map.on("click", onMapPick);
}

sheet.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = document.getElementById("addr").value.trim();
  const box = document.getElementById("addr-results");
  if (!q) return;
  box.textContent = tr("chooser.searching");
  try {
    const r = await fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&limit=5`);
    const j = await r.json();
    geoResults = j.features.map((f) => ({ label: f.properties.label, ll: [f.geometry.coordinates[1], f.geometry.coordinates[0]] }));
  } catch {
    box.textContent = tr("chooser.searchFailed");
    return;
  }
  box.innerHTML = geoResults.length
    ? geoResults.map((g, i) => `<button type="button" class="choice" data-act="pick-result" data-i="${i}">${esc(g.label)}</button>`).join("")
    : tr("chooser.noAddress");
});

document.getElementById("posline").addEventListener("click", (e) => {
  const act = e.target.dataset.pos;
  if (act === "change") showPositionChooser(tr("chooser.where"));
  else if (act === "gps") useGps();
});
// Le bouton « Centrer sur ma position » : vrai (et la carte recentrée) quand une position a été choisie à la main, sans la remplacer ni toucher au GPS.
// « Revenir au GPS », dans la ligne de position, reste le seul moyen de la quitter.
function centerOnChosenPosition() {
  if (!manualPos) return false;
  map.setView(manualPos.ll, 16);
  return true;
}
updatePosLine();
const simPosEl = document.querySelector(".sim-pos");
const simPosGps = simPosEl ? simPosEl.textContent : ""; // texte d'origine : la position GPS est utilisée
const showSimPosition = (fromCenter) => { if (simPosEl) simPosEl.textContent = fromCenter ? tr("sim.positionCenter") : simPosGps; };
if (sim && placeLinkActive()) showSimPosition(true);
// une position réelle est affichée : le texte redevient celui du GPS, sauf si la recherche part du centre de la carte
onPlaceLinkForgotten = () => showSimPosition(Boolean(manualPos && manualPos.kind === "center") || placeLinkActive());

// Heure affichée dans l'encadré d'urgence, mise à jour en temps réel
const clockEl = document.getElementById("clock");
function tickClock() {
  const text = sim ? tr("clock.simulated", { time: simLabel }) : formatTime(new Date());
  if (clockEl.textContent !== text) clockEl.textContent = text;
}
tickClock();
setInterval(tickClock, 1000);

// ---------- Bandeau de simulation ----------
if (sim) {
  document.getElementById("sim-when").textContent = simLabel;
  document.getElementById("sim-banner").hidden = false;
  document.getElementById("sim-exit").addEventListener("click", () => location.reload()); // la simulation n'est lue qu'une fois : le rechargement revient au mode normal
}
