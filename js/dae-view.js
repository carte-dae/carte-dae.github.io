// Ce qui fait lire un défibrillateur, partagé par la carte (js/app.js) et la page « Guide » : libellés d'accès et de maintenance, couleurs et
// formes des points, horaires lisibles, niveau de maintenance et contenu de la fiche. Rien ne touche à la page au chargement (testé dans Node),
// ni à la carte, ni à l'adresse de la page. Chargé après i18n.js et format.js.

const MAINT_MAX_YEARS = 5;
const COLORS = { h24: "#1b873f", limited: "#e07b00", unknown: "#1a6fd1" };
const ACCESS_LABEL = {
  h24: tr("access.h24"),
  limited: tr("access.limited"),
  unknown: tr("access.unknown"),
};
const MAINT_LABEL = {
  ok: tr("maint.ok"),
};
const MAINT_PART_LABEL = {
  adultPads: tr("maint.part.adultPads"),
  childPads: tr("maint.part.childPads"),
  battery: tr("maint.part.battery"),
};

const MAINT_COLORS = { ok: "#1b873f", doubt: "#d0021b", unknown: "#8a8a8a" };
// La forme de l'anneau redouble sa couleur : trait plein = à jour, trois arcs = non confirmée, huit tirets = ancienne ou périmée
// (longueurs en pixels, pour un anneau de rayon RING_RADIUS : trois arcs et leurs vides, ou huit tirets et leurs vides, font le tour exact)
const RING_RADIUS = 9.9;
const MAINT_DASH = { ok: null, unknown: "16.53 4.2", doubt: "4.2 3.575" };

// Visage de bébé des défibrillateurs pédiatriques, dessiné sur 24 × 24 (la carte le trace sur son canevas, la page « Guide » dans un SVG)
const BABY_FACE_PATH = "M12 4.6a8.6 8.6 0 1 0 0 17.2 8.6 8.6 0 0 0 0-17.2zM8.6 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM15.4 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM8.3 15.9Q12 20.1 15.7 15.9Q12 18 8.3 15.9z";
const BABY_EARS_PATH = "M6 14a1.9 1.9 0 1 0-3.8 0 1.9 1.9 0 0 0 3.8 0zM21.8 14a1.9 1.9 0 1 0-3.8 0 1.9 1.9 0 0 0 3.8 0z";
const BABY_CURL_PATH = "M12 5.2c-.2-2.2 2.6-3.4 4-1.8 1 1.2-.1 2.6-1.4 2.2";
const BABY_PX = 13;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// « AAAA-MM-JJ » est lu à minuit UTC : on l'affiche en UTC, sinon la date recule d'un jour à l'ouest de Greenwich (Antilles, Guyane)
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(LOCALE, { timeZone: "UTC" }) : "");

// ---------- Horaires lisibles ----------
// Traduit « Mo-Fr 08:00-12:00,14:00-18:00; Sa-Su off; PH off » en français. Rend null au moindre doute :
// l'appelant affiche alors le texte brut, on n'invente rien.
const DAY_FR = { Mo: tr("day.Mo"), Tu: tr("day.Tu"), We: tr("day.We"), Th: tr("day.Th"), Fr: tr("day.Fr"), Sa: tr("day.Sa"), Su: tr("day.Su") };
const WEEK = Object.keys(DAY_FR);

function frDaySpec(spec, closed) {
  if (spec === null || spec === "Mo-Su") return tr("hours.allDays");
  if (spec === "PH") return tr("hours.holidays");
  if (spec === "Sa-Su") return tr("hours.weekend");
  const parts = [];
  for (const token of spec.split(",")) {
    const [a, b = null] = token.split("-");
    if (!(a in DAY_FR) || (b !== null && !(b in DAY_FR)) || token.split("-").length > 2) return null;
    parts.push(b === null || a === b
      ? (closed ? tr("hours.onDay", { day: DAY_FR[a] }) : DAY_FR[a])
      : tr(closed ? "hours.dayRangeFrom" : "hours.dayRange", { a: DAY_FR[a], b: DAY_FR[b] }));
  }
  const last = parts.pop();
  return parts.length ? `${parts.join(", ")}${tr("hours.and")}${last}` : last;
}

function frTime(h, m) { return +m ? tr("time.hm", { h: +h, m }) : tr("time.h", { h: +h }); }

// Les jours d'une règle d'horaires simple (« Mo-Fr », « Sa,Su », « Mo,We-Fr,PH », ou aucun jour = toute la semaine) : { days: indices dans WEEK, ph } ; null si on ne sait pas
function ruleDays(spec) {
  if (spec === null) return { days: new Set(WEEK.keys()), ph: false };
  const days = new Set();
  let ph = false;
  for (const token of spec.split(",")) {
    if (token === "PH") { ph = true; continue; }
    const [a, b = a] = token.split("-");
    const i = WEEK.indexOf(a);
    const j = WEEK.indexOf(b);
    if (i < 0 || j < i || token.split("-").length > 2) return null; // un jour inconnu, ou une plage qui passe par la fin de semaine : on ne regroupe pas
    for (let k = i; k <= j; k++) days.add(k);
  }
  return { days, ph };
}

// Le nom de plusieurs jours réunis : « lundi au jeudi », « samedi, dimanche et les jours fériés », « le week-end et les jours fériés », « tous les jours »
function daysLabel({ days, ph }) {
  const sorted = [...days].sort((x, y) => x - y);
  const parts = [];
  if (sorted.length === 7) parts.push(tr("hours.allDays"));
  else if (sorted.length === 2 && sorted[0] === 5) parts.push(tr("hours.weekend"));
  else {
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      if (j - i >= 2) parts.push(tr("hours.dayRange", { a: DAY_FR[WEEK[sorted[i]]], b: DAY_FR[WEEK[sorted[j]]] })); // trois jours de suite ou plus : « lundi au jeudi »
      else for (let k = i; k <= j; k++) parts.push(DAY_FR[WEEK[sorted[k]]]);
      i = j + 1;
    }
  }
  if (ph) parts.push(tr("hours.holidays"));
  const last = parts.pop();
  return parts.length ? `${parts.join(", ")}${tr("hours.and")}${last}` : last;
}

// Les jours qui ont exactement les mêmes horaires sont réunis sur une ligne (« Lundi au jeudi : 6h30 à 11h… ») au lieu d'une ligne par jour ;
// une ligne qui n'a qu'une règle garde son écriture d'origine. Rend [{ label, ranges }] dans l'ordre de la première apparition.
function mergeRules(rules) {
  const groups = new Map();
  rules.forEach((r) => {
    if (!groups.has(r.ranges)) groups.set(r.ranges, []);
    groups.get(r.ranges).push(r);
  });
  return [...groups].map(([ranges, list]) => {
    if (list.length === 1) return { label: frDaySpec(list[0].spec, false), ranges };
    const days = new Set(list.flatMap((r) => [...r.parsed.days]));
    return { label: daysLabel({ days, ph: list.some((r) => r.parsed.ph) }), ranges };
  });
}

function frHours(hours) {
  if (!hours || is247(hours)) return null;
  const rules = [];
  const off = [];
  for (const rule of hours.split(";").map((r) => r.trim()).filter(Boolean)) {
    const parts = rule.split(/\s+/);
    const hasDay = /^(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?![A-Za-z])/.test(parts[0]);
    const spec = hasDay ? parts[0] : null;
    const rest = (hasDay ? parts.slice(1) : parts).join(" ");
    if (!rest) return null;
    if (/^off$/i.test(rest)) {
      const phrase = frDaySpec(spec, true);
      if (!phrase) return null;
      off.push(phrase);
      continue;
    }
    const ranges = [];
    for (const range of rest.split(",")) {
      const m = range.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
      if (!m || +m[1] > 24 || +m[3] > 24 || +m[2] > 59 || +m[4] > 59) return null;
      ranges.push(+m[1] === 0 && +m[2] === 0 && +m[3] === 24 && +m[4] === 0 ? tr("hours.h24") : tr("hours.timeRange", { from: frTime(m[1], m[2]), to: frTime(m[3], m[4]) }));
    }
    if (!frDaySpec(spec, false)) return null;
    rules.push({ spec, parsed: ruleDays(spec), ranges: ranges.join(tr("hours.and")) });
  }
  // on ne réunit les jours que si toutes les règles sont simples ; sinon, une ligne par règle, comme dans la source
  const lines = rules.every((r) => r.parsed)
    ? mergeRules(rules)
    : rules.map((r) => ({ label: frDaySpec(r.spec, false), ranges: r.ranges }));
  const open = lines.map(({ label, ranges }) => tr("hours.rule", { days: `${label.charAt(0).toUpperCase()}${label.slice(1)}`, ranges }));
  if (off.length) {
    const closedText = tr("hours.closed", { days: off.join(tr("hours.and")) });
    open.push(open.length ? closedText : `${closedText.charAt(0).toUpperCase()}${closedText.slice(1)}`);
  }
  return open.length ? open.join(tr("hours.sep")) : null;
}

// Pièces dont on attend une date de péremption (les électrodes enfant seulement si l'appareil est pédiatrique)
const MAINT_PARTS = [["adultPads", "dtLcad"], ["childPads", "dtLcped"], ["battery", "dtBat"]];

// Ce qui est périmé, ce qui manque (péremptions non renseignées, ou maintenance sans date) et si la dernière maintenance est trop ancienne
function maintenanceIssues(d, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const expired = MAINT_PARTS.filter(([, field]) => d[field] && d[field] < today).map(([part]) => part);
  const missing = MAINT_PARTS.filter(([part, field]) => !d[field] && (part !== "childPads" || d.ped === 1)).map(([part]) => part);
  if (!d.dtMaint) missing.push("maintenance");
  const old = Boolean(d.dtMaint) && (now - new Date(d.dtMaint)) / 31557600000 > MAINT_MAX_YEARS;
  return { expired, missing, old };
}

// « à jour » : toutes les péremptions utiles sont connues, aucune n'est dépassée et la maintenance n'est pas ancienne
function maintenanceLevel(d, now = new Date()) {
  const { expired, missing, old } = maintenanceIssues(d, now);
  if (expired.length || old) return "doubt";
  return missing.length ? "unknown" : "ok";
}

// Ce que dit la fiche : à jour, ou précisément ce qui est périmé, ancien ou sans date renseignée
function maintText(d) {
  if (d.maint === "ok") return MAINT_LABEL.ok;
  const { expired, missing, old } = maintenanceIssues(d);
  const names = (keys) => listFormat(keys.map((key) => MAINT_PART_LABEL[key]));
  const undated = missing.filter((key) => key !== "maintenance");
  return [
    expired.length ? tr("maint.expired", { items: names(expired) }) : "",
    old ? tr("maint.old", { years: MAINT_MAX_YEARS }) : "",
    undated.length ? tr("maint.undatedParts", { items: names(undated) }) : "",
    missing.includes("maintenance") ? tr("maint.noMaintDate") : "",
  ].filter(Boolean).join("<br>");
}

// actions : boutons du bas de la fiche (« Y aller », « Partager »), above : ce qui vient juste au-dessus d'eux (le lien « Un problème ? ») ; fournis par la carte,
// la page « Guide » les laisse de côté
function popupHtml(d, actions = "", above = "") {
  const lieu = [d.adresse, [d.cp, d.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const rows = [];
  if (d.dtLcad) rows.push(tr("popup.adultPads", { date: fmtDate(d.dtLcad) }));
  if (d.dtLcped) rows.push(tr("popup.childPads", { date: fmtDate(d.dtLcped) }));
  if (d.dtBat) rows.push(tr("popup.battery", { date: fmtDate(d.dtBat) }));
  if (d.dtMaint) rows.push(tr("popup.lastMaint", { date: fmtDate(d.dtMaint) }));
  const ped = d.ped === 1 ? tr("ped.yes.popup") : d.ped === 0 ? tr("ped.no") : tr("ped.unknown");
  const notes = [];
  if (d.flags & 2) notes.push(tr("note.absent"));
  if (d.flags & 1) notes.push(tr("note.mobile.popup"));
  if (hasUnavailableText(d.complement)) notes.push(tr("note.maybeAbsent", { text: esc(unavailableSnippet(d.complement)) }));
  if (d.validation === 1) notes.push(tr("note.pending"));
  if (d.validation === 2) notes.push(tr("note.doubted"));
  return `<div class="popup"><h3>${esc(d.nom || d.exploitant || tr("aed.fallbackName"))}</h3>` +
    (lieu ? `<p>${esc(lieu)}</p>` : "") +
    `<p><b>${ACCESS_LABEL[d.accessClass]}</b> (${d.acces === 0 ? tr("access.out") : tr("access.in")})</p>` +
    (d.horaires && !is247(d.horaires) ? `<p>${esc(tr("aed.hours", { hours: frHours(d.horaires) || d.horaires }))}</p>` : "") +
    (d.etage ? `<p>${esc(tr("aed.floor", { floor: d.etage }))}</p>` : "") +
    (d.complement ? `<p>${esc(d.complement)}</p>` : "") +
    `<p>${ped}</p>` +
    `<p class="maint maint-${d.maint}">${maintText(d)}</p>` +
    rows.map((r) => `<p class="detail">${r}</p>`).join("") +
    notes.map((n) => `<p class="note">⚠ ${n}</p>`).join("") +
    above +
    `<div class="card-actions">${actions}</div></div>`;
}

// Ce que dit la base pour ce défibrillateur, champ par champ et sans interprétation (les seuls champs renseignés) : des paires [libellé, valeur]
function sourceRows(d) {
  const rows = [];
  const label = (text) => text.trim(); // le gabarit rendu sans sa valeur : « Nom : », « Name: »
  if (d.nom) rows.push([label(tr("problem.f.name", { value: "" })), d.nom]);
  if (d.exploitant) rows.push([label(tr("problem.f.operator", { value: "" })), d.exploitant]);
  const place = [d.adresse, [d.cp, d.commune].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (place) rows.push([label(tr("problem.f.address", { value: "" })), place]);
  if (Number.isFinite(d.lat) && Number.isFinite(d.lon)) rows.push([label(tr("problem.f.coords", { value: "" })), `${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}`]);
  rows.push([label(tr("problem.f.access", { value: "" })), tr(d.acces === 0 ? "access.out" : "access.in")]);
  if (d.horaires) rows.push([label(tr("aed.hours", { hours: "" })), d.horaires]);
  if (d.complement) rows.push([label(tr("problem.f.details", { value: "" })), d.complement]);
  if (d.etage) rows.push([label(tr("aed.floor", { floor: "" })), d.etage]);
  rows.push([label(tr("problem.f.ped", { value: "" })), tr(d.ped === 1 ? "problem.v.yes" : d.ped === 0 ? "problem.v.no" : "problem.v.unknown")]);
  if (d.dtLcad) rows.push([label(tr("popup.adultPads", { date: "" })), fmtDate(d.dtLcad)]);
  if (d.dtLcped) rows.push([label(tr("popup.childPads", { date: "" })), fmtDate(d.dtLcped)]);
  if (d.dtBat) rows.push([label(tr("popup.battery", { date: "" })), fmtDate(d.dtBat)]);
  if (d.dtMaint) rows.push([label(tr("popup.lastMaint", { date: "" })), fmtDate(d.dtMaint)]);
  if (d.flags & 2) rows.push([label(tr("problem.f.state", { value: "" })), tr("problem.v.absent")]);
  if (d.flags & 1) rows.push([label(tr("problem.f.mobile", { value: "" })), tr("problem.v.yes")]);
  if (d.validation === 0) rows.push([label(tr("problem.f.validation", { value: "" })), tr("problem.v.validated")]);
  if (d.validation === 1) rows.push([label(tr("problem.f.validation", { value: "" })), tr("problem.v.pending")]);
  if (d.validation === 2) rows.push([label(tr("problem.f.validation", { value: "" })), tr("problem.v.doubted")]);
  if (d.gid) rows.push([label(tr("problem.f.id", { value: "" })), String(d.gid)]);
  return rows;
}

// L'empreinte d'une fiche : un court résumé de ce que dit la base à son sujet (position, textes, dates, états). Elle change dès qu'un de ces champs change
// à une mise à jour des données ; « ignoré jusqu'à modification » (quick.js) s'arrête alors. Les valeurs calculées par le site n'en font pas partie.
const FINGERPRINT_FIELDS = ["lat", "lon", "exploitant", "nom", "adresse", "commune", "cp", "acces", "horaires", "ped", "validation", "flags", "etage", "complement", "dtLcad", "dtLcped", "dtBat", "dtMaint"];
function aedFingerprint(d) {
  const text = JSON.stringify(FINGERPRINT_FIELDS.map((k) => d[k] ?? null));
  let h = 0x811c9dc5; // FNV-1a, 32 bits
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// Le point de la carte (anneau = maintenance, disque = accès, visage = pédiatrique) en SVG, pour la page « Guide » ; d.accessClass et d.maint doivent être calculés
function aedMarkerSvg(d, size = 44) {
  const dash = MAINT_DASH[d.maint] ? ` stroke-dasharray="${MAINT_DASH[d.maint]}"` : "";
  const scale = BABY_PX / 24;
  const baby = d.ped === 1 ? `<g transform="translate(${-BABY_PX / 2} ${-BABY_PX / 2}) scale(${scale.toFixed(4)})" fill="#fff" stroke="#fff"><path stroke="none" fill-rule="evenodd" d="${BABY_FACE_PATH}"/><path stroke="none" d="${BABY_EARS_PATH}"/><path fill="none" stroke-width="1.9" stroke-linecap="round" d="${BABY_CURL_PATH}"/></g>` : "";
  return `<svg viewBox="-14 -14 28 28" width="${size}" height="${size}" aria-hidden="true" focusable="false"><circle r="${RING_RADIUS}" fill="none" stroke="${MAINT_COLORS[d.maint]}" stroke-width="2.4"${dash}/>` +
    `<circle r="8" fill="${COLORS[d.accessClass]}" stroke="#fff" stroke-width="1.5"/>${baby}</svg>`;
}
