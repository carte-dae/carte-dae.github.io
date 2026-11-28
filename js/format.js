// Mise en forme partagée par la carte et la page « Guide ». Rien ne touche à la page au chargement (testé dans Node).
// Chargé après i18n.js.

// Un nombre écrit selon la langue (« 1,2 » en français, « 1.2 » en anglais) ; digits = nombre de décimales
const numberFormat = (n, digits = 0) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

// "2026-10-23" -> "23/10/2026" ; "2026-10-26-23" (heure UTC de la source) -> "27/10/2026 à 00h", heure de Paris
const fmtDay = (id) => {
  const [y, m, d, h] = id.split("-");
  if (h === undefined) return tr("date.dmy", { d, m, y });
  const t = new Date(Date.UTC(+y, +m - 1, +d, +h));
  const p = Object.fromEntries(new Intl.DateTimeFormat(LOCALE, { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(t).map((x) => [x.type, x.value]));
  return tr("date.dmyHour", { d: p.day, m: p.month, y: p.year, h: p.hour });
};

// Accessible tous les jours à toute heure : « 24/7 », ou « tous les jours de 0 h à 23 h 59 » comme certains exploitants l'écrivent
const is247 = (hours) => hours === "24/7" || hours === "Mo-Su 00:00-23:59";

// Une liste écrite selon la langue : « a, b et c » en français, « a, b, and c » en anglais
const listFormat = (items) => new Intl.ListFormat(LOCALE, { style: "long", type: "conjunction" }).format(items);

// Il y a des horaires écrits dans un texte (« 8h-12h », « 9h à 17h30 », « 08:00 - 18:00 », « 8h30 12h15/13h15 17h »),
// même si on ne sait pas les lire jour par jour. « 24h/24 » ou « 7j/7 » ne sont pas des plages et ne comptent pas.
const TEXT_TIME = "\\d{1,2}\\s*(?:h|:)\\s*(?:\\d{2})?";
const TEXT_RANGE = new RegExp(`${TEXT_TIME}\\s*(?:-|–|/|à|a|au|jusqu'à)?\\s*${TEXT_TIME}`, "i");
const hasHourRange = (text) => Boolean(text) && TEXT_RANGE.test(text);

// Texte qui dit seulement « 7j/7 24h/24 » (la base répète souvent la phrase, avec un repère de lieu devant) : accessible tout le temps.
// Toute condition (« lors de », « sauf », « durant », dates, personnel…) l'écarte.
const TEXT_247 = /(?:^|[-–:,.]\s*)7\s*j\s*\/\s*7\s*,?\s*24\s*h\s*(?:\/|sur)\s*24\s*$/i;
const TEXT_247_CONDITION = /lors|sauf|durant|pendant|hors|ferm|ouvert|r[ée]serv|personnel|rendez|apr[èe]s|avant|\d{2}\/\d{2}|[0-9]\s*(?:au|a)\s*[0-9]|badge|\bcode\b|uniquement|seulement|clients?\b|selon|si\b/i;
const textIs247 = (text) => {
  if (!text) return false;
  const parts = [...new Set(text.split(";").map((x) => x.trim()).filter(Boolean))];
  return parts.length > 0 && parts.every((x) => TEXT_247.test(x) && !TEXT_247_CONDITION.test(x.replace(TEXT_247, "")));
};

// Un texte qui dit que l'accès dépend des heures d'ouverture du lieu, de la présence du personnel, d'événements ou d'une saison :
// l'appareil n'est pas accessible en permanence, même si aucune heure précise n'est donnée (sans accents ni majuscules).
const LIMITED_TEXT = /(?:heures?|horaires?|jours?)(?: et (?:jours?|heures?))? d'?ouverture|(?:durant|lors de|pendant|aux) l'?ouverture|presence (?:du personnel|sur site)|heures? de bureau|selon (?:les )?(?:evenements|activites|manifestations|saisons?|periodes?)|en saison|hors saison|periode estivale|en periode|uniquement (?:durant|pendant)/;
const hasLimitedText = (text) => Boolean(text) && LIMITED_TEXT.test(text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

// Un nombre d'unités de temps écrit selon la langue : « 23 h », « 5 j », « 3 semaines », « 1 mois » (les unités viennent du navigateur, rien à traduire ; les
// semaines et les mois en toutes lettres : abrégés, « m. » se confondrait avec les minutes)
function unitText(n, unit) {
  try { return new Intl.NumberFormat(LOCALE, { style: "unit", unit, unitDisplay: unit === "week" || unit === "month" ? "long" : "short" }).format(n); } catch { return `${n} ${unit}`; }
}

// Un temps restant : en heures jusqu'à 48 h, puis en jours, en semaines, en mois
function remainingText(ms) {
  const hours = Math.ceil(ms / 3600000);
  const days = Math.ceil(ms / 86400000);
  const weeks = Math.ceil(days / 7);
  const [n, unit] = hours <= 48 ? [Math.max(1, hours), "hour"] : days < 14 ? [days, "day"] : weeks <= 8 ? [weeks, "week"] : [Math.ceil(days / 30), "month"];
  return unitText(n, unit);
}

// Les précisions disent que l'appareil n'est probablement pas en place (« en stock en attendant la réaffectation », « non installé », « hors service »…).
// Formulations nettes seulement, sans accents ni majuscules. Un texte qui parle de manifestations, de déplacements, de saisons ou d'horaires décrit un appareil
// mobile ou conditionnel : on n'en conclut rien. « Retrouvé » (volé puis retrouvé) annule aussi.
const UNAVAILABLE_TEXT = /\ben stock\b|\bstocke\b|\b(?:non|pas|n'est pas) install|\bdemonte\b|\bdesinstalle\b|\b(?:appareil|dae|dea|defibrillateur|dsa) retire\b|\bretire (?:definitivement|du service)\b|hors[\s-]*service|n'est plus (?:utilise|en place|installe)|\bplus (?:en place|installe)\b|reaffectation|\bremise\b|\bvole\b|\b(?:dae|dea|appareil) non accessible\b/;
const UNAVAILABLE_EXEMPT = /selon|deplacement|itinerant|manifestation|evenement|saison|periode|lorsque|quand\b|\bnuit\b|week|soir|horaire|ouverture|\bretrouve|\bdu \d{1,2}\/\d{1,2}|de (?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre) a/;
const plainText = (text) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const hasUnavailableText = (text) => {
  if (!text) return false;
  const t = plainText(text);
  return UNAVAILABLE_TEXT.test(t) && !UNAVAILABLE_EXEMPT.test(t);
};
// Le passage des précisions qui le dit, pour le citer tel qu'écrit (le plus long des segments qui le disent, sans le doublon que la base répète)
function unavailableSnippet(text) {
  const segments = [...new Set(text.split(/\s*;\s*/))].flatMap((part) => part.split(/\s+-\s+/)).filter((x) => UNAVAILABLE_TEXT.test(plainText(x)));
  const best = segments.sort((a, b) => b.length - a.length)[0] || text;
  return best.length > 140 ? `${best.slice(0, 137).trim()}…` : best.trim();
}
