// Tests de la logique d'interprétation des données côté navigateur (horaires, maintenance, sélection).
// Lancer : node tests/app.test.js   (rien à installer)
const assert = require("assert");
const { load } = require("./load");

let passed = 0;
const failures = [];
const pending = [];
function test(name, fn) {
  const fail = (e) => failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`);
  try {
    const r = fn();
    if (r && typeof r.then === "function") pending.push(r.then(() => { passed++; }, fail));
    else passed++;
  } catch (e) { fail(e); }
}
const eq = (actual, expected) => assert.strictEqual(actual, expected, `obtenu « ${actual} », attendu « ${expected} »`);

// Le 25/10/2026 est un dimanche : at(0, 10) = dimanche 10h, at(1, 10) = lundi 10h, etc.
const at = (dayOffset, h, m = 0) => new Date(2026, 9, 25 + dayOffset, h, m);
const SUN = 0, MON = 1, TUE = 2, WED = 3, FRI = 5, SAT = 6;

const Q = load("js/quick.js", [
  "dayMatches", "openState", "frDayCovers", "textHours", "proseHours", "complementState", "availabilityDetail", "availability",
  "bestMatch", "select", "orderOptions", "SIZE_ORDER", "TAP_ORDER", "sheetSizeFor", "nextSheetSize", "stepSheetSize",
  "DAY_INDEX", "DAY_ORDER", "FR_DAY", "FR_RANGE", "FR_DAYTOK", "FR_DAYS", "FR_RULE", "FR_START", "FR_QUALIFIER",
  "PR_DAYS", "PR_DAY", "PR_HOUR", "PR_RANGE", "PR_DAYS_SPEC", "PR_RULE", "PR_FILLER", "prDaysCover", "frDaysCover", "SH_DAYS", "SH_LETTERS", "SH_FILLER", "SH_CONNECTOR", "SH_TOKEN", "SH_ALL", "SH_ABBREV", "shTokens", "shSpan", "shDays", "shGroups", "scheduleHours", "FR_SEASON_COND", "FR_CONDITIONAL", "FR_DAYWORDS", "FR_DAYLETTER", "hasDays", "FR_MODIFIER", "isDescriptive", "FR_VACANCES", "FR_HORS_ITEM", "FR_HORS_LEAD", "FR_HORS", "FR_GATEWAY", "FR_TIMEY", "stripGatewayNotes", "cleanHoursText", "TIME_ONLY_SKIP", "TIME_ONLY_RANGE", "timeOnlyHours",
  "AV_OK", "isUncertain", "accessRestricted", "askAccess", "PICKS", "UNCERTAIN_PENALTY_M", "WINDOW_PENALTY_M", "ALSACE_MOSELLE", "easterSunday", "holidayCache", "computeHolidays", "holidaysOf", "holidayOn", "FR_RESTRICTIVE",
  "vacations", "isoDay", "validVacations", "vacationOn", "formatTime", "dayKey", "isNationalHoliday", "isLocalHolidayDate", "dateLabel", "whenNowLabel",
]);
const FMT = load("js/format.js", ["is247"]);
const A = { ...load("js/app.js", ["latestOnly", "coordsText", "accessClassOf", "DEFAULT_FILTERS", "parseFilters", "matches", "filtersActive", "dedupeComplement", "DENSE_ZOOM", "DENSE_TILE_TOTAL", "MAX_DRAWN", "tileKeysFor", "viewTooDense", "VIEW_MAX_AGE_MS", "parseSavedView", "cameFromAnotherPage", "formatDistance"], { URL }), ...load("js/dae-view.js", ["MAINT_MAX_YEARS", "COLORS", "ACCESS_LABEL", "MAINT_LABEL", "MAINT_PART_LABEL", "MAINT_COLORS", "RING_RADIUS", "MAINT_DASH", "esc", "fmtDate", "DAY_FR", "WEEK", "frDaySpec", "frTime", "ruleDays", "daysLabel", "mergeRules", "frHours", "MAINT_PARTS", "maintenanceIssues", "maintenanceLevel", "maintText", "popupHtml", "sourceRows", "FINGERPRINT_FIELDS", "aedFingerprint"], {}) };
const D = load("js/format.js", ["fmtDay"]);

// ---------- Horaires structurés (format OSM) ----------
test("coordonnées copiées : latitude puis longitude, 5 décimales", () => eq(A.coordsText({ lat: 43.601234, lon: 1.4334 }), "43.60123, 1.43340"));
test("coordonnées copiées : valeurs négatives (outre-mer)", () => eq(A.coordsText({ lat: 16.2411, lon: -61.5331 }), "16.24110, -61.53310"));
test("24/7 est toujours ouvert", () => eq(Q.openState("24/7", at(SUN, 3)), "open"));
test("horaires absents = inconnu", () => { eq(Q.openState("", at(MON, 10)), "unknown"); eq(Q.openState(undefined, at(MON, 10)), "unknown"); });
test("Mo-Fr 08:00-18:00 : lundi 10h ouvert", () => eq(Q.openState("Mo-Fr 08:00-18:00", at(MON, 10)), "open"));
test("Mo-Fr 08:00-18:00 : lundi 19h fermé", () => eq(Q.openState("Mo-Fr 08:00-18:00", at(MON, 19)), "closed"));
test("Mo-Fr 08:00-18:00 : dimanche fermé", () => eq(Q.openState("Mo-Fr 08:00-18:00", at(SUN, 10)), "closed"));
test("borne : ouvre à 08:00 pile, ferme à 18:00 pile", () => {
  eq(Q.openState("Mo-Fr 08:00-18:00", at(MON, 8, 0)), "open");
  eq(Q.openState("Mo-Fr 08:00-18:00", at(MON, 17, 59)), "open");
  eq(Q.openState("Mo-Fr 08:00-18:00", at(MON, 18, 0)), "closed");
});
test("pause méridienne : 13h fermé", () => eq(Q.openState("Mo-Fr 08:00-12:00,14:00-18:00", at(TUE, 13)), "closed"));
test("plusieurs règles : samedi couvert par la seconde", () => eq(Q.openState("Mo-Fr 08:00-18:00; Sa 09:00-12:00", at(SAT, 10)), "open"));
test("plage de nuit : 02h ouvert", () => eq(Q.openState("Mo-Su 22:00-06:00", at(WED, 2)), "open"));
test("liste de jours : Mo,We,Fr", () => { eq(Q.openState("Mo,We,Fr 09:00-17:00", at(WED, 10)), "open"); eq(Q.openState("Mo,We,Fr 09:00-17:00", at(TUE, 10)), "closed"); });
test("texte non reconnu = inconnu (jamais ouvert)", () => eq(Q.openState("sur rendez-vous", at(MON, 10)), "unknown"));

// ---------- Horaires en texte libre, format de la base ----------
test("« L au V 8h30/17h » lundi 10h ouvert", () => eq(Q.textHours("L au V 8h30/17h", at(MON, 10)), "open"));
test("« L au V 8h30/17h » lundi 18h fermé", () => eq(Q.textHours("L au V 8h30/17h", at(MON, 18)), "closed"));
test("« L au V 8h30/17h » dimanche fermé", () => eq(Q.textHours("L au V 8h30/17h", at(SUN, 10)), "closed"));
test("texte répété : même résultat", () => eq(Q.textHours("L au V 8h30/17h ; L au V 8h30/17h", at(MON, 10)), "open"));
test("« 7j/7 10h/18h30 »", () => { eq(Q.textHours("7j/7 10h/18h30", at(SUN, 12)), "open"); eq(Q.textHours("7j/7 10h/18h30", at(SUN, 19)), "closed"); });
test("jour seul : « S 10h/12h »", () => { eq(Q.textHours("S 10h/12h", at(SAT, 11)), "open"); eq(Q.textHours("S 10h/12h", at(MON, 11)), "closed"); });
test("plage de nuit : « 7j/7 22h/6h » à 3h", () => eq(Q.textHours("7j/7 22h/6h", at(TUE, 3)), "open"));
test("qualificatif restrictif : ne conclut jamais « ouvert »", () => eq(Q.textHours("L au V 8h/17h ; hors vacances scolaires", at(MON, 10)), "unknown"));
const CAL = {
  v: 1, covered: { from: "2026-09-01", to: "2027-09-02" }, dep: { "75": "C", "69": "A", "13": "B" },
  zones: { A: [["2026-10-17", "2026-11-02"]], B: [["2026-10-17", "2026-11-02"]], C: [["2026-10-17", "2026-11-02"], ["2026-12-19", "2027-01-04"]] },
};
test("vacances : le samedi de départ et les jours suivants, jusqu'à la veille de la reprise", () => {
  eq(Q.vacationOn(new Date(2026, 9, 16), "75002", CAL), false); // vendredi : dernier jour de cours
  eq(Q.vacationOn(new Date(2026, 9, 17), "75002", CAL), true);
  eq(Q.vacationOn(new Date(2026, 10, 1), "75002", CAL), true);
  eq(Q.vacationOn(new Date(2026, 10, 2), "75002", CAL), false); // lundi de reprise
});
test("vacances : hors calendrier, sans calendrier, sans zone ou sans code postal : on ne sait pas", () => {
  eq(Q.vacationOn(new Date(2026, 7, 1), "75002", CAL), null);   // avant la couverture
  eq(Q.vacationOn(new Date(2027, 9, 1), "75002", CAL), null);   // après
  eq(Q.vacationOn(new Date(2026, 9, 20), "75002", null), null);
  eq(Q.vacationOn(new Date(2026, 9, 20), "20000", CAL), null);  // Corse
  eq(Q.vacationOn(new Date(2026, 9, 20), "97100", CAL), null);  // outre-mer
  eq(Q.vacationOn(new Date(2026, 9, 20), undefined, CAL), null);
});
test("vacances : chaque zone a ses dates", () => {
  eq(Q.vacationOn(new Date(2026, 11, 24), "75002", CAL), true);  // zone C
  eq(Q.vacationOn(new Date(2026, 11, 24), "69001", CAL), false); // zone A
});
test("calendrier des vacances : format reconnu", () => { eq(Q.validVacations(CAL), true); eq(Q.validVacations({ v: 2 }), false); eq(Q.validVacations(null), false); });
test("« hors vacances scolaires » : fermé pendant les vacances, ouvert selon les horaires hors vacances", () => {
  const t = "L au V 8h/17h hors vacances scolaires";
  eq(Q.textHours(t, at(MON, 10), true), "closed");
  eq(Q.textHours(t, at(MON, 10), false), "open");
  eq(Q.textHours(t, at(MON, 10), null), "unknown"); // calendrier inconnu : comme avant, jamais « ouvert »
  eq(Q.textHours(t, at(SUN, 10), false), "closed");
});
test("« fermé pendant les vacances scolaires » se lit comme « hors vacances scolaires »", () => {
  const t = "Entrée - L Ma J V 7h30/18h30 fermé pendant les vacances scolaires ; L Ma J V 7h30/18h30 fermé pendant les vacances scolaires";
  eq(Q.textHours(t, at(MON, 10), false), "open");
  eq(Q.textHours(t, at(MON, 10), true), "closed");
  eq(Q.textHours(t, at(MON, 10), null), "unknown");
});
test("« hors jours fériés » reste une restriction même hors vacances", () => eq(Q.textHours("L au V 8h/17h hors jours fériés", at(MON, 10), false), "unknown"));
test("prose « hors vacances scolaires » : fermé en vacances, ouvert sinon", () => {
  const t = "du lundi au vendredi de 6h à 17h30 hors vacances scolaires";
  eq(Q.proseHours(t, at(MON, 10), true), "closed");
  eq(Q.proseHours(t, at(MON, 10), false), "open");
  eq(Q.proseHours(t, at(MON, 10), null), "unknown");
});
test("qualificatif restrictif : peut conclure « fermé »", () => eq(Q.textHours("L au V 8h/17h ; hors vacances scolaires", at(SUN, 10)), "closed"));
test("texte hors format = inconnu", () => { eq(Q.textHours("accès par le gardien", at(MON, 10)), "unknown"); eq(Q.textHours("", at(MON, 10)), "unknown"); });

// ---------- Horaires écrits en phrases ----------
const prose = (t, d, h, m) => Q.proseHours(t, at(d, h, m));
test("« du lundi au vendredi de 8h à 12h » : ouvert à 10h", () => eq(prose("du lundi au vendredi de 8h à 12h", MON, 10), "open"));
test("… fermé l'après-midi", () => eq(prose("du lundi au vendredi de 8h à 12h", MON, 13), "closed"));
test("… fermé le dimanche", () => eq(prose("du lundi au vendredi de 8h à 12h", SUN, 10), "closed"));
test("deux plages : « 8h30-12h et 14h-18h »", () => { eq(prose("Lundi au vendredi 8h30-12h et 14h-18h", WED, 15), "open"); eq(prose("Lundi au vendredi 8h30-12h et 14h-18h", WED, 13), "closed"); });
test("« tous les jours de 9h à 18h »", () => { eq(prose("Ouvert tous les jours de 9h à 18h", SAT, 10), "open"); eq(prose("Ouvert tous les jours de 9h à 18h", SAT, 19), "closed"); });
test("« le samedi de 10h à 12h »", () => { eq(prose("Le samedi de 10h à 12h", SAT, 11), "open"); eq(prose("Le samedi de 10h à 12h", FRI, 11), "closed"); });
test("abréviations : « lun-ven 8h/17h30 »", () => eq(prose("Horaires : lun-ven 8h/17h30", FRI, 17), "open"));
test("plage de nuit en phrase", () => eq(prose("du lundi au samedi de 22h à 6h", TUE, 3), "open"));
test("accents et majuscules ignorés", () => eq(prose("DU LUNDI AU VENDREDI DE 8H À 12H", MON, 10), "open"));
test("texte en plus (« sauf jours fériés ») = inconnu", () => eq(prose("du lundi au vendredi de 8h à 12h sauf jours fériés", MON, 10), "unknown"));
test("heure impossible = inconnu", () => eq(prose("du lundi au vendredi de 8h à 99h", MON, 10), "unknown"));
test("texte sans horaire = inconnu", () => eq(prose("près de l'entrée", MON, 10), "unknown"));

// ---------- Disponibilité ----------
const dae = (over) => ({ flags: 0, acces: 1, horaires: "", complement: "", ...over });
test("24/7 = sûr", () => eq(Q.availability(dae({ horaires: "24/7" }), at(SUN, 3)), "sure"));
test("horaires ouverts = sûr", () => eq(Q.availability(dae({ horaires: "Mo-Fr 08:00-18:00" }), at(MON, 10)), "sure"));
test("horaires fermés = fermé", () => eq(Q.availability(dae({ horaires: "Mo-Fr 08:00-18:00" }), at(SUN, 10)), "closed"));
// DAE 296614 (Centrakor) : les horaires renseignés s'arrêtent au vendredi, les précisions disent « S 9h30/19h »
const CENTRAKOR = dae({ acces: 1, horaires: "Mo 10:00-12:30,14:00-19:00; Tu 10:00-12:30,14:00-19:00; We 10:00-12:30,14:00-19:00; Th 10:00-12:30,14:00-19:00; Fr 10:00-12:30,14:00-19:00", complement: "Arrière caisse - L au V 10h/12h30 14h/19h S 9h30/19h ; L au V 10h/12h30 14h/19h S 9h30/19h" });
test("horaires renseignés sans le samedi, précisions avec le samedi : incertain, avec le signalement de la contradiction", () => {
  eq(JSON.stringify(Q.availabilityDetail(CENTRAKOR, at(SAT, 11))), JSON.stringify({ avail: "uncertain", conflict: true }));
  eq(Q.availability(CENTRAKOR, at(SAT, 9, 45)), "uncertain");
});
test("la contradiction ne joue que quand le texte dit ouvert : samedi soir, dimanche, lundi soir restent fermés", () => {
  eq(Q.availability(CENTRAKOR, at(SAT, 20)), "closed");
  eq(Q.availability(CENTRAKOR, at(SUN, 11)), "closed");
  eq(Q.availability(CENTRAKOR, at(MON, 20)), "closed");
  eq(Q.availabilityDetail(CENTRAKOR, at(MON, 20)).conflict, false);
});
test("pas de contradiction quand les horaires renseignés disent ouvert, ni quand le texte n'ajoute rien", () => {
  eq(JSON.stringify(Q.availabilityDetail(CENTRAKOR, at(MON, 11))), JSON.stringify({ avail: "sure", conflict: false }));
  eq(Q.availability(dae({ horaires: "Mo-Fr 08:00-18:00", complement: "Accueil - L au V 8h/18h" }), at(SAT, 10)), "closed");
});
test("un défibrillateur dont les horaires renseignés disent fermé mais le texte ouvert le samedi est proposé (incertain), pas écarté", () => {
  const c = { d: CENTRAKOR, dist: 300, avail: "uncertain", limited: false };
  assert.ok(Q.PICKS.adult[2].some(([, pred]) => pred(c)));
});
// ---------- Précisions qui disent que l'appareil n'est pas en place ----------
const NO_PLACE = [
  "bâtiment n°20, bureau Mme LE GUELLEC - DAE non accessible, en stock en attendant la réaffectation ; DAE non accessible, en stock en attendant la réaffectation",
  "non installé", "NON INSTALLE", "Hors service", "Retrait du bâtiment cause fermeture. DSA positionné en réserve log. Attente réaffectation. - L au V 7h/17h",
  "Infirmerie, remisé, n'est plus utilisé", "appareil retiré d'un magasin qui a fermé. Se trouve dans le bureau de Mme FETTER.",
];
const STILL_THERE = [
  "Selon déplacements DAE non accessible", "Inaccessible itinérant sur postes de secours", "Selon évènements DAE non accessible",
  "En stock au service technique - DAE qui servira pour les manifestations diverses - L au V selon évènements",
  "Stocké de septembre à mai aux archives de l'espace nautique à Chalon - 7j/7 10h/19h+évènements du 01/06 au 31/08",
  "Accueil - retiré du bureau IDEC - 7j/7 24h/24", "1er étage dans le bureau de la direction DAE RETROUVÉ (déclaré volé)", "ATELIER REPARATION",
  "Entrée principale du bâtiment, au niveau du dépose minute", "Hall d'entrée - code 1234", "Accessible 24h/24", "",
];
const UN = load("js/format.js", ["UNAVAILABLE_TEXT", "UNAVAILABLE_EXEMPT", "plainText", "hasUnavailableText", "unavailableSnippet"]);
test("précisions : les formulations nettes de « pas en place » sont reconnues", () => NO_PLACE.forEach((x) => assert.ok(UN.hasUnavailableText(x), x)));
test("précisions : appareils mobiles, saisonniers ou sans rapport ne le sont pas", () => STILL_THERE.forEach((x) => assert.ok(!UN.hasUnavailableText(x), x)));
test("précisions : le passage cité est celui qui le dit, sans le doublon de la base", () => {
  eq(UN.unavailableSnippet(NO_PLACE[0]), "DAE non accessible, en stock en attendant la réaffectation");
  eq(UN.unavailableSnippet("non installé"), "non installé");
});
const ABSENT = { ...dae({ gid: 297881, acces: 1, ped: 1, complement: NO_PLACE[0] }), maint: "ok" };
const OTHER = { ...dae({ gid: 2, acces: 1, ped: 1, horaires: "Mo-Su 00:00-23:59" }), maint: "ok" };
const absentCand = (d, dist, extra = {}) => ({ d, dist, avail: Q.availability(d, at(MON, 11)), limited: false, unavailable: UN.hasUnavailableText(d.complement), ...extra });
test("un appareil que les précisions disent absent n'est pas proposé tant qu'un autre l'est, même plus loin et même sans être le meilleur", () => {
  const out = Q.select([absentCand(ABSENT, 50), absentCand(OTHER, 4000)], "adult").options;
  eq(out.map((o) => o.d.gid).join(), "2");
});
test("seul, rien d'autre n'étant trouvé, il est proposé en tout dernier recours, avec son titre", () => {
  const out = Q.select([absentCand(ABSENT, 50)], "adult").options;
  eq(out.length, 1);
  eq(out[0].d.gid, 297881);
  eq(out[0].title, "Dernier recours\u00a0: les précisions indiquent qu'il n'est peut-être pas en place");
  eq(Q.select([absentCand(ABSENT, 50)], "child").options[0].title, "Dernier recours\u00a0: les précisions indiquent qu'il n'est peut-être pas en place");
});
test("il n'est pas proposé quand un autre dernier recours existe (accès à demander)", () => {
  const ask = { ...dae({ gid: 3, acces: 1, complement: "badge à l'accueil" }), maint: "ok" };
  const out = Q.select([absentCand(ABSENT, 50), absentCand(ask, 2000, { limited: true, avail: "uncertain" })], "adult").options;
  eq(out.map((o) => o.d.gid).join(), "3");
});
test("extérieur sans horaires = probable", () => eq(Q.availability(dae({ acces: 0 }), at(MON, 10)), "likely"));
test("intérieur sans horaires = incertain", () => eq(Q.availability(dae({ acces: 1 }), at(MON, 10)), "uncertain"));
test("disponibilité : vacances simulées ou non", () => {
  const d = dae({ horaires: "", complement: "Accueil - L au V 8h/17h hors vacances scolaires" });
  eq(Q.availability(d, at(MON, 10), false, true), "closed");
  eq(Q.availability(d, at(MON, 10), false, false), "sure");
  eq(Q.availability(d, at(MON, 10), false), "uncertain"); // avec la date réelle (sans calendrier dans ce test) : on ne sait pas
});
test("signalé absent momentanément = incertain, même en 24/7", () => eq(Q.availability(dae({ flags: 2, horaires: "24/7" }), at(MON, 10)), "uncertain"));
test("horaires lus dans les précisions (format base)", () => eq(Q.availability(dae({ complement: "Hall - L au V 8h30/17h" }), at(SUN, 10)), "closed"));
test("horaires lus dans les précisions (phrase)", () => eq(Q.availability(dae({ complement: "du lundi au vendredi de 8h à 12h" }), at(MON, 10)), "sure"));
test("horaires structurés prioritaires sur les précisions", () =>
  eq(Q.availability(dae({ horaires: "Mo-Su 00:00-24:00", complement: "L au V 8h/17h" }), at(SUN, 10)), "sure"));

// ---------- Horaires en texte libre : cas piégeux ----------
test("texte avant l'horaire qui réserve l'accès : jamais « ouvert »", () => {
  eq(Q.textHours("Réservé au personnel. L au V 8h/18h", at(MON, 10)), "unknown");
  eq(Q.textHours("Sur rendez-vous, L au V 8h/18h", at(MON, 10)), "unknown");
  eq(Q.textHours("Accès par badge : L au V 8h/18h", at(MON, 10)), "unknown");
  eq(Q.textHours("Hall - L au V 8h/18h", at(MON, 10)), "open"); // un simple repère de lieu ne gêne pas
});
test("texte avant l'horaire restrictif : « fermé » reste fermé", () => eq(Q.textHours("Réservé au personnel. L au V 8h/18h", at(SUN, 10)), "closed"));
test("« 9h le samedi » ne restreint pas : on ne conclut pas", () => eq(Q.textHours("L au V 8h/12h ; 9h le samedi", at(SAT, 10)), "unknown"));
test("minutes sur un seul chiffre (« 8h3 ») : illisible donc inconnu, jamais fermé", () => eq(Q.textHours("L au V 8h3/17h", at(MON, 10)), "unknown"));
test("minutes sur deux chiffres : lues", () => eq(Q.textHours("L au V 8h30/17h", at(MON, 10)), "open"));

// ---------- Une seule recherche d'urgence à la fois ----------
test("la dernière recherche lancée est la seule à compter", () => {
  const r = A.latestOnly();
  const adult = r.start(); const child = r.start();
  eq(r.isCurrent(adult), false); eq(r.isCurrent(child), true);
});
test("l'affichage des points : une vue plus récente invalide le chargement d'une vue plus ancienne", () => {
  const r = A.latestOnly();
  const old = r.start(); const recent = r.start();
  eq(r.isCurrent(old), false); eq(r.isCurrent(recent), true);
});
test("fermer la liste invalide la recherche en cours", () => {
  const r = A.latestOnly();
  const run = r.start(); r.cancel();
  eq(r.isCurrent(run), false); eq(r.isCurrent(r.start()), true);
});

// ---------- Plages de nuit : la fin appartient au lendemain ----------
test("nuit en semaine : le samedi à 2 h est la fin de la nuit de vendredi", () => {
  const h = "Mo-Fr 22:00-06:00";
  eq(Q.openState(h, at(FRI, 23)), "open"); eq(Q.openState(h, at(SAT, 2)), "open"); eq(Q.openState(h, at(SAT, 7)), "closed");
});
test("nuit en semaine : le lundi à 2 h est la fin de la nuit de dimanche, donc fermé", () => { eq(Q.openState("Mo-Fr 22:00-06:00", at(MON, 2)), "closed"); eq(Q.openState("Mo-Fr 22:00-06:00", at(SAT, 23)), "closed"); });
test("nuit en semaine : le jeudi à 2 h est ouvert (nuit de mercredi)", () => eq(Q.openState("Mo-Fr 22:00-06:00", at(WED + 1, 2)), "open"));
test("nuit tous les jours : toujours cohérent", () => { eq(Q.openState("Mo-Su 22:00-06:00", at(WED, 2)), "open"); eq(Q.openState("Mo-Su 22:00-06:00", at(WED, 12)), "closed"); });
test("fin de nuit et « off » le même jour : on ne tranche pas", () => eq(Q.openState("Mo-Fr 22:00-06:00; Sa off", at(SAT, 2)), "unknown"));
test("début et fin identiques : on ne devine pas", () => eq(Q.openState("Mo-Fr 08:00-08:00", at(MON, 10)), "unknown"));
test("toute la journée : ouvert à toute heure", () => { eq(Q.openState("Mo-Su 00:00-24:00", at(WED, 0)), "open"); eq(Q.openState("Mo-Su 00:00-24:00", at(WED, 23, 59)), "open"); });
test("texte libre, nuit : « L au V 22h/6h » le samedi à 2 h est ouvert, le lundi à 2 h fermé", () => {
  eq(Q.textHours("L au V 22h/6h", at(SAT, 2)), "open"); eq(Q.textHours("L au V 22h/6h", at(MON, 2)), "closed");
});
test("phrase, nuit : « du lundi au vendredi de 22h à 6h »", () => { eq(prose("du lundi au vendredi de 22h à 6h", SAT, 2), "open"); eq(prose("du lundi au vendredi de 22h à 6h", MON, 2), "closed"); });
test("disponibilité de nuit : le samedi à 2 h", () => eq(Q.availability(dae({ horaires: "Mo-Fr 22:00-06:00" }), at(SAT, 2)), "sure"));
test("nuit et jour férié : si la veille était fériée (PH off), elle n'a pas eu de nuit ouverte", () => {
  eq(Q.openState("Mo-Fr 22:00-06:00; PH off", at(TUE, 2), false, true), "closed");
  eq(Q.openState("Mo-Fr 22:00-06:00; PH off", at(TUE, 2), false, false), "open");
});

// ---------- Dates d'expiration ----------
const HOTEL = "Mo 06:30-11:00,17:00-21:00; Tu 06:30-11:00,17:00-21:00; We 06:30-11:00,17:00-21:00; Th 06:30-11:00,17:00-21:00; Fr 06:30-11:00,17:00-20:30; Sa 07:30-11:00,17:00-20:30; Su 07:30-11:00,17:00-20:30; PH 07:30-11:00,17:00-20:30";
test("horaires : les jours qui ont les mêmes horaires sont réunis (une ligne, pas une par jour)", () => {
  eq(A.frHours(HOTEL), "Lundi au jeudi\u00a0: 6h30 à 11h et 17h à 21h\u00a0; Vendredi\u00a0: 6h30 à 11h et 17h à 20h30\u00a0; Le week-end et les jours fériés\u00a0: 7h30 à 11h et 17h à 20h30");
});
test("horaires : jours non consécutifs, et jours fériés avec la semaine", () => {
  eq(A.frHours("Mo 08:00-12:00; Tu 14:00-18:00; We 08:00-12:00"), "Lundi et mercredi\u00a0: 8h à 12h\u00a0; Mardi\u00a0: 14h à 18h");
  eq(A.frHours("Mo-Fr 08:00-12:00; PH 08:00-12:00"), "Lundi au vendredi et les jours fériés\u00a0: 8h à 12h");
  eq(A.frHours("Mo 09:00-12:00; Tu 09:00-12:00; We 09:00-12:00; Th 09:00-12:00; Fr 09:00-12:00; Sa 09:00-12:00; Su 09:00-12:00"), "Tous les jours\u00a0: 9h à 12h");
});
test("horaires : une règle seule ou des horaires tous différents gardent leur écriture", () => {
  eq(A.frHours("Mo-Tu 08:00-12:00"), "Lundi au mardi\u00a0: 8h à 12h");
  eq(A.frHours("Mo 08:00-12:00; Tu 09:00-12:00"), "Lundi\u00a0: 8h à 12h\u00a0; Mardi\u00a0: 9h à 12h");
});
test("fmtDate : « AAAA-MM-JJ » reste le même jour", () => { eq(A.fmtDate("2026-10-23"), "23/10/2026"); eq(A.fmtDate("2027-01-01"), "01/01/2027"); eq(A.fmtDate(""), ""); });

// ---------- Jours fériés ----------
const ymd = (y, m, d) => new Date(y, m - 1, d); // m de 1 à 12
test("Pâques : dates connues", () => {
  const e = (y) => { const r = Q.easterSunday(y); return `${y}-${r.month}-${r.day}`; };
  eq(e(2024), "2024-3-31"); eq(e(2025), "2025-4-20"); eq(e(2026), "2026-4-5"); eq(e(2027), "2027-3-28"); eq(e(2038), "2038-4-25");
});
test("jours fériés nationaux 2026 : onze, dont lundi de Pâques, Ascension et lundi de Pentecôte", () =>
  eq([...Q.holidaysOf(2026).national].sort().join(), ["1-1", "11-1", "11-11", "12-25", "4-6", "5-1", "5-14", "5-25", "5-8", "7-14", "8-15"].sort().join()));
test("Alsace-Moselle 2026 : Vendredi saint et 26 décembre en plus", () => eq([...Q.holidaysOf(2026).alsace].sort().join(), ["12-26", "4-3"].join()));
test("férié national : 14 juillet, partout", () => { eq(Q.holidayOn(ymd(2026, 7, 14), "75002"), true); eq(Q.holidayOn(ymd(2026, 7, 14), "20000"), true); eq(Q.holidayOn(ymd(2026, 7, 14), "97100"), true); eq(Q.holidayOn(ymd(2026, 7, 14), undefined), true); });
test("en-tête « maintenant » : l'heure et la date un jour ordinaire", () => eq(Q.whenNowLabel(new Date(2026, 6, 15, 11, 21)), "à 11h21 (mercredi 15 juillet)"));
test("en-tête « maintenant » : date et « jour férié » un jour férié national", () => eq(Q.whenNowLabel(new Date(2026, 6, 14, 11, 21)), "à 11h21 (mardi 14 juillet, jour férié)"));
test("en-tête « maintenant » : la date, sans « jour férié », un jour férié local (Alsace-Moselle)", () => eq(Q.whenNowLabel(new Date(2026, 3, 3, 11, 21)), "à 11h21 (vendredi 3 avril)"));
test("férié local : seulement pour la date propre à l'Alsace-Moselle, jamais pour un jour national", () => {
  eq(Q.isLocalHolidayDate(new Date(2026, 11, 26)), true);
  eq(Q.isLocalHolidayDate(new Date(2026, 11, 25)), false);
  eq(Q.isNationalHoliday(new Date(2026, 11, 25)), true);
  eq(Q.isNationalHoliday(new Date(2026, 11, 26)), false);
});
test("jour ordinaire en métropole : pas férié", () => { eq(Q.holidayOn(ymd(2026, 7, 15), "75002"), false); eq(Q.holidayOn(ymd(2026, 7, 15), undefined), false); });
test("Alsace-Moselle : 26 décembre et Vendredi saint fériés, ailleurs non", () => {
  eq(Q.holidayOn(ymd(2026, 12, 26), "67000"), true); eq(Q.holidayOn(ymd(2026, 4, 3), "57000"), true); eq(Q.holidayOn(ymd(2026, 4, 3), "68100"), true);
  eq(Q.holidayOn(ymd(2026, 12, 26), "75002"), false); eq(Q.holidayOn(ymd(2026, 4, 3), "69001"), false);
});
test("sans code postal : un jour propre à l'Alsace-Moselle reste incertain", () => { eq(Q.holidayOn(ymd(2026, 12, 26), undefined), null); eq(Q.holidayOn(ymd(2026, 12, 26), "abc"), null); });
test("outre-mer : jour ordinaire incertain (jours locaux inconnus), national certain", () => { eq(Q.holidayOn(ymd(2026, 6, 2), "97400"), null); eq(Q.holidayOn(ymd(2026, 12, 25), "97400"), true); });
test("jours fériés : calculés une seule fois par année", () => eq(Q.holidaysOf(2026), Q.holidaysOf(2026)));
test("PH off : fermé un jour férié, normal sinon", () => {
  const h = "Mo-Fr 08:00-18:00; Sa-Su off; PH off";
  eq(Q.openState(h, at(WED, 10), false), "open"); eq(Q.openState(h, at(WED, 10), true), "closed"); eq(Q.openState(h, at(WED, 10), null), "unknown");
});
test("PH avec horaires : ouvert ces jours-là seulement", () => {
  eq(Q.openState("PH 10:00-12:00", at(SAT, 11), true), "open"); eq(Q.openState("PH 10:00-12:00", at(SAT, 13), true), "closed"); eq(Q.openState("PH 10:00-12:00", at(SAT, 11), false), "closed");
});
test("« Mo-Fr,PH » : jours de semaine et jours fériés", () => {
  eq(Q.openState("Mo-Fr,PH 08:00-18:00", at(SAT, 10), true), "open"); eq(Q.openState("Mo-Fr,PH 08:00-18:00", at(SAT, 10), false), "closed"); eq(Q.openState("Mo-Fr,PH 08:00-18:00", at(MON, 10), false), "open");
});
test("sans règle PH, un jour férié : jamais « ouvert » (le lieu est peut-être fermé), mais « fermé » reste fermé", () => {
  eq(Q.openState("Mo-Fr 08:00-18:00", at(WED, 10), true), "unknown");
  eq(Q.openState("Mo-Fr 08:00-18:00", at(WED, 3), true), "closed");
  eq(Q.openState("Mo-Fr 08:00-18:00", at(SUN, 10), true), "closed");
  eq(Q.openState("24/7", at(WED, 10), true), "open");
  eq(Q.openState("Mo-Fr 08:00-18:00", at(WED, 10), false), "open");
});
test("avec une règle PH qui ouvre, un jour férié est « ouvert »", () => eq(Q.openState("Mo-Fr 08:00-18:00; PH 10:00-12:00", at(WED, 11), true), "open"));
test("disponibilité un jour férié sans règle PH : incertain (intérieur) ou probable (extérieur), pas « sûr »", () => {
  const day = new Date(2026, 6, 14, 10);
  eq(Q.availability(dae({ horaires: "Mo-Fr 08:00-18:00", cp: "75002", acces: 1 }), day), "uncertain");
  eq(Q.availability(dae({ horaires: "Mo-Fr 08:00-18:00", cp: "75002", acces: 0 }), day), "likely");
  eq(Q.availability(dae({ horaires: "24/7", cp: "75002" }), day), "sure");
});
test("horaires en texte un jour férié : pas de conclusion « ouvert » ; fermé reste fermé", () => {
  eq(Q.availability(dae({ complement: "du lundi au vendredi de 8h à 12h", cp: "75002" }), new Date(2026, 6, 14, 10)), "uncertain");
  eq(Q.availability(dae({ complement: "L au V 8h30/17h", cp: "75002" }), new Date(2026, 6, 14, 20)), "closed");
});
test("disponibilité : le 14 juillet à 10 h, « PH off » = fermé ; un mardi ordinaire = sûr", () => {
  const d = dae({ horaires: "Mo-Fr 08:00-18:00; PH off", cp: "75002" });
  eq(Q.availability(d, new Date(2026, 6, 14, 10)), "closed"); eq(Q.availability(d, new Date(2026, 6, 7, 10)), "sure");
});
test("simulation : jour férié choisi ou refusé, quel que soit le calendrier", () => {
  const d = dae({ horaires: "Mo-Fr 08:00-18:00; PH off", cp: "75002" });
  eq(Q.availability(d, at(TUE, 10), true), "closed"); eq(Q.availability(d, new Date(2026, 6, 14, 10), false), "sure");
});
test("outre-mer : « PH off » un jour ordinaire = incertain, pas affirmé", () => eq(Q.availability(dae({ horaires: "Mo-Fr 08:00-18:00; PH off", cp: "97400", acces: 1 }), at(WED, 10)), "uncertain"));

// ---------- Maintenance ----------
const NOW = new Date("2026-10-28T12:00:00Z");
const FULL = { dtLcad: "2027-01-01", dtBat: "2028-05-01", dtMaint: "2026-01-01" }; // tout renseigné, rien de dépassé
test("péremptions utiles et maintenance récente renseignées = à jour", () => eq(A.maintenanceLevel(FULL, NOW), "ok"));
test("électrodes périmées = douteux", () => eq(A.maintenanceLevel({ ...FULL, dtLcad: "2026-10-01" }, NOW), "doubt"));
test("batterie périmée = douteux", () => eq(A.maintenanceLevel({ ...FULL, dtBat: "2025-01-01" }, NOW), "doubt"));
test("péremption le jour même = encore valable", () => eq(A.maintenanceLevel({ ...FULL, dtLcad: "2026-10-28" }, NOW), "ok"));
test("aucune date = non confirmé", () => eq(A.maintenanceLevel({}, NOW), "unknown"));
test("dernière maintenance de plus de 5 ans = douteux", () => eq(A.maintenanceLevel({ ...FULL, dtMaint: "2020-01-01" }, NOW), "doubt"));
test("maintenance ancienne sans péremption = douteux", () => eq(A.maintenanceLevel({ dtMaint: "2019-01-01" }, NOW), "doubt"));
test("maintenance récente sans péremption = non confirmé (les électrodes ont forcément une date)", () => eq(A.maintenanceLevel({ dtMaint: "2026-01-01" }, NOW), "unknown"));
test("batterie sans date, le reste valable = non confirmé", () => eq(A.maintenanceLevel({ ...FULL, dtBat: "" }, NOW), "unknown"));
test("électrodes adulte sans date, le reste valable = non confirmé", () => eq(A.maintenanceLevel({ ...FULL, dtLcad: "" }, NOW), "unknown"));
test("électrodes enfant sans date : comptent seulement pour un appareil pédiatrique", () => {
  eq(A.maintenanceLevel({ ...FULL, ped: 1 }, NOW), "unknown");
  eq(A.maintenanceLevel({ ...FULL, ped: 0 }, NOW), "ok");
  eq(A.maintenanceLevel({ ...FULL, ped: null }, NOW), "ok");
  eq(A.maintenanceLevel({ ...FULL, ped: 1, dtLcped: "2027-03-01" }, NOW), "ok");
});
test("maintenance sans date = non confirmé", () => eq(A.maintenanceLevel({ ...FULL, dtMaint: "" }, NOW), "unknown"));
test("ce qui manque ou est dépassé est nommé", () => {
  const i = A.maintenanceIssues({ dtLcad: "2026-01-01", dtBat: "", dtMaint: "2019-01-01", ped: 1 }, NOW);
  eq(i.expired.join(), "adultPads"); eq(i.missing.join(), "childPads,battery"); eq(i.old, true);
  eq(A.maintenanceIssues({ ...FULL }, NOW).missing.length, 0);
  eq(A.maintenanceIssues({}, NOW).missing.join(), "adultPads,battery,maintenance");
});
test("fiche : le texte nomme les pièces concernées", () => {
  const d = { ...{ dtLcad: "2027-01-01", dtBat: "", dtMaint: "2024-06-21", ped: 1, dtLcped: "" } };
  d.maint = A.maintenanceLevel(d);
  eq(A.maintText(d), "Date de péremption non renseignée : électrodes enfant et batterie");
  const e = { dtLcad: "", dtBat: "2020-01-01", dtMaint: "2019-01-01", ped: 0 };
  e.maint = A.maintenanceLevel(e);
  eq(A.maintText(e), "Périmé : batterie<br>Maintenance ancienne (plus de 5 ans)<br>Date de péremption non renseignée : électrodes adulte");
  const f = { dtLcad: "2027-01-01", dtBat: "2027-01-01", dtMaint: "", ped: 0 };
  f.maint = A.maintenanceLevel(f);
  eq(A.maintText(f), "Date de dernière maintenance non renseignée");
  eq(A.maintText({ maint: "ok" }), "Maintenance à jour");
});

// ---------- Contenu de la fiche (partagé avec la page « Guide ») ----------
const POPUP_AED = { nom: "Mairie", exploitant: "Commune", adresse: "1 place de la Mairie", cp: "31000", commune: "Toulouse", accessClass: "limited", acces: 1, horaires: "Mo-Fr 08:00-17:00", ped: 1, maint: "unknown", dtLcad: "2027-05-01", flags: 0 };
test("fiche : nom, lieu, accès, horaires lisibles et maintenance", () => {
  const html = A.popupHtml(POPUP_AED);
  assert.match(html, /<h3>Mairie<\/h3>/);
  assert.match(html, /1 place de la Mairie, 31000 Toulouse/);
  assert.match(html, /<b>[^<]+<\/b> \(/);
  assert.match(html, /maint maint-unknown/);
  assert.match(html, /popup-adult|01\/05\/2027/);
});
test("fiche : sans boutons par défaut, avec ceux que la carte fournit", () => {
  assert.match(A.popupHtml(POPUP_AED), /<div class="card-actions"><\/div>/);
  assert.match(A.popupHtml(POPUP_AED, "<button>Y aller</button>"), /<div class="card-actions"><button>Y aller<\/button><\/div>/);
});
test("fiche : ce qui vient au-dessus des boutons (le lien « Un problème ? ») les précède", () => assert.match(A.popupHtml(POPUP_AED, "<b>1</b>", "<p>dessus</p>"), /<p>dessus<\/p><div class="card-actions"><b>1<\/b><\/div><\/div>$/));
test("fiche : le texte venu de la base est échappé", () => assert.ok(!A.popupHtml({ ...POPUP_AED, nom: "<img onerror=x>" }).includes("<img")));
test("fiche : DAE signalé absent = avertissement", () => assert.match(A.popupHtml({ ...POPUP_AED, flags: 2 }), /class="note"/));

test("données d'origine : chaque champ renseigné, tel quel, et seulement ceux-là", () => {
  const rows = Array.from(A.sourceRows({ gid: 42, nom: "Mairie", exploitant: "Commune", adresse: "1 place", cp: "31000", commune: "Toulouse", lat: 43.601234, lon: 1.4334, acces: 1, horaires: "Mo-Fr 08:00-17:00", ped: 1, validation: 1, flags: 3, complement: "L au V 8h/17h", etage: "RDC", dtLcad: "2027-05-01", dtLcped: "", dtBat: null, dtMaint: "2026-01-02" }));
  eq(rows.map(([name, value]) => `${name}|${value}`).join("\n"), ["Nom\u00a0:|Mairie", "Exploitant\u00a0:|Commune", "Adresse\u00a0:|1 place, 31000 Toulouse", "Coordonnées\u00a0:|43.60123, 1.43340", "Accès\u00a0:|intérieur", "Horaires\u00a0:|Mo-Fr 08:00-17:00", "Précisions\u00a0:|L au V 8h/17h", "Étage\u00a0:|RDC", "Pédiatrique\u00a0:|oui", "Électrodes adulte\u00a0:|01/05/2027", "Dernière maintenance\u00a0:|02/01/2026", "État\u00a0:|absent momentanément", "DAE mobile\u00a0:|oui", "Déclaration\u00a0:|en attente de validation", "Identifiant\u00a0:|42"].join("\n"));
});
test("données d'origine : accès extérieur, pédiatrique non ou non renseigné, déclaration validée ou mise en doute", () => {
  const val = (d) => A.sourceRows({ gid: 1, ...d }).map(([name, value]) => `${name}|${value}`).join("\n");
  assert.ok(val({ acces: 0 }).includes("Accès\u00a0:|extérieur"));
  assert.ok(val({ ped: 0 }).includes("Pédiatrique\u00a0:|non\n") || val({ ped: 0 }).includes("Pédiatrique\u00a0:|non"));
  assert.ok(val({ ped: null }).includes("Pédiatrique\u00a0:|non renseigné"));
  assert.ok(val({ validation: 0 }).includes("Déclaration\u00a0:|validée"));
  assert.ok(val({ validation: 2 }).includes("Déclaration\u00a0:|mise en doute"));
});
test("données d'origine : validation non renseignée (3) = aucune ligne, ni note « en attente »", () => {
  assert.ok(!A.sourceRows({ gid: 1, validation: 3 }).some(([name]) => name.startsWith("Déclaration")));
  assert.ok(!A.popupHtml({ nom: "X", accessClass: "unknown", acces: 1, ped: null, maint: "unknown", validation: 3, flags: 0 }).includes("note"));
});
// ---------- Défibrillateurs ignorés : empreinte de la fiche, temps restant ----------
const REMAIN = load("js/format.js", ["unitText", "remainingText"]);
const plain = (text) => text.replace(/\s/g, " ");
test("empreinte : identique pour la même fiche, différente dès qu'un champ de la base change", () => {
  const d = { gid: 1, lat: 43.6, lon: 1.44, nom: "Mairie", horaires: "Mo-Fr 08:00-17:00", dtLcad: "2027-05-01", validation: 0, flags: 0 };
  eq(A.aedFingerprint({ ...d }), A.aedFingerprint(d));
  assert.notStrictEqual(A.aedFingerprint({ ...d, horaires: "Mo-Fr 08:00-18:00" }), A.aedFingerprint(d));
  assert.notStrictEqual(A.aedFingerprint({ ...d, dtLcad: "2028-05-01" }), A.aedFingerprint(d));
  assert.notStrictEqual(A.aedFingerprint({ ...d, lat: 43.7 }), A.aedFingerprint(d));
});
test("empreinte : les valeurs calculées par le site n'y comptent pas", () => {
  const d = { gid: 1, nom: "Mairie", horaires: "24/7" };
  eq(A.aedFingerprint({ ...d, accessClass: "h24", maint: "ok" }), A.aedFingerprint(d));
});
test("temps restant : heures jusqu'à 48 h, puis jours, semaines, mois", () => {
  eq(plain(REMAIN.remainingText(23 * 3600e3)), "23 h");
  eq(plain(REMAIN.remainingText(30 * 60e3)), "1 h");
  eq(plain(REMAIN.remainingText(3 * 86400e3)), "3 j");
  eq(plain(REMAIN.remainingText(21 * 86400e3)), "3 semaines");
  eq(plain(REMAIN.remainingText(120 * 86400e3)), "4 mois");
});
// ---------- Précisions répétées ----------
test("précisions dédoublonnées", () => eq(A.dedupeComplement("Hall - L au V 8h/17h ; L au V 8h/17h"), "Hall - L au V 8h/17h"));
test("précisions distinctes conservées", () => eq(A.dedupeComplement("code 1234 ; porte B"), "code 1234 ; porte B"));
test("précisions vides", () => { eq(A.dedupeComplement(""), ""); eq(A.dedupeComplement(undefined), ""); });

// ---------- Horaires lisibles en français ----------
const fr = (h) => A.frHours(h);
test("frHours : semaine avec pause méridienne", () => eq(fr("Mo-Fr 08:00-12:00,14:00-18:00"), "Lundi au vendredi\u00a0: 8h à 12h et 14h à 18h"));
test("frHours : minutes conservées", () => eq(fr("Mo-Fr 08:30-17:45"), "Lundi au vendredi\u00a0: 8h30 à 17h45"));
test("frHours : tous les jours", () => { eq(fr("Mo-Su 08:00-20:00"), "Tous les jours\u00a0: 8h à 20h"); eq(fr("08:00-20:00"), "Tous les jours\u00a0: 8h à 20h"); });
test("frHours : semaine + week-end et fériés fermés", () =>
  eq(fr("Mo-Fr 08:00-18:00; Sa-Su off; PH off"), "Lundi au vendredi\u00a0: 8h à 18h\u00a0; fermé le week-end et les jours fériés"));
test("frHours : un jour fermé", () => eq(fr("Mo-Sa 09:00-19:00; Su off"), "Lundi au samedi\u00a0: 9h à 19h\u00a0; fermé le dimanche"));
test("frHours : plusieurs règles ouvertes", () => eq(fr("Mo-Fr 08:00-18:00; Sa 09:00-12:00"), "Lundi au vendredi\u00a0: 8h à 18h\u00a0; Samedi\u00a0: 9h à 12h"));
test("frHours : liste de jours", () => eq(fr("Mo,We,Fr 09:00-17:00"), "Lundi, mercredi et vendredi\u00a0: 9h à 17h"));
test("frHours : week-end", () => eq(fr("Sa-Su 10:00-16:00"), "Le week-end\u00a0: 10h à 16h"));
test("frHours : jours fériés ouverts", () => eq(fr("PH 10:00-12:00"), "Les jours fériés\u00a0: 10h à 12h"));
test("frHours : 24h/24 un jour donné", () => eq(fr("Sa 00:00-24:00"), "Samedi\u00a0: 24h/24"));
test("frHours : plage de nuit", () => eq(fr("Mo-Su 22:00-06:00"), "Tous les jours\u00a0: 22h à 6h"));
test("frHours : tout fermé", () => eq(fr("Mo-Su off"), "Fermé tous les jours"));
test("frHours : 24/7, vide ou inconnu = null (texte brut affiché)", () => {
  eq(fr("24/7"), null); eq(fr(""), null); eq(fr(undefined), null);
  eq(fr("sur rendez-vous"), null); eq(fr("Mo-Fr 8h-12h"), null); eq(fr("SH off"), null); eq(fr("Mo-Xx 08:00-12:00"), null);
  eq(fr("Mo-Fr 08:00-12:00; sunrise-sunset"), null); eq(fr("Mo-Fr 08:00-99:00"), null);
});

// ---------- Sélection des options d'urgence ----------
const cand = (gid, dist, avail, over = {}) => ({ d: { gid, ped: 0, maint: "ok", ...over }, dist, avail });
const pick = (cands, mode) => Q.select(cands, mode);
const ask = (c) => ({ ...c, limited: true }); // accès à demander (interphone, badge…)
test("adulte : le plus proche accessible à jour passe en premier, même plus loin qu'un douteux", () => {
  const r = pick([cand(1, 100, "sure", { maint: "doubt" }), cand(2, 500, "sure")], "adult");
  eq(r.options[0].d.gid, 2); eq(r.hasBest, true); eq(r.options[1].d.gid, 1);
});
test("adulte : sans DAE à jour, hasBest est faux", () => eq(pick([cand(1, 100, "sure", { maint: "doubt" })], "adult").hasBest, false));
test("incertain pénalisé de 300 m face à un probable", () => {
  const c = [cand(1, 100, "uncertain"), cand(2, 350, "likely")];
  eq(Q.bestMatch(c, () => true, new Set()).d.gid, 2);
});
test("un DAE n'apparaît qu'une fois dans les options", () => {
  const ids = pick([cand(1, 100, "sure"), cand(2, 200, "sure"), cand(3, 300, "uncertain")], "adult").options.map((o) => o.d.gid);
  eq(new Set(ids).size, ids.length);
});
test("accès à demander (badge, code…) : après les incertains ordinaires, à la place d'un DAE fermé", () => {
  const r = pick([cand(1, 100, "closed", { acces: 0 }), ask(cand(2, 300, "uncertain")), cand(3, 900, "uncertain"), cand(4, 800, "sure")], "adult");
  eq(r.options.map((o) => o.d.gid).join(), "4,3,2"); // le DAE à demander remplace le fermé
  assert.ok(/accès à demander/.test(r.options[2].title), "le DAE à demander figure en dernier recours");
});
test("accès à demander : seul incertain, il n'est pas présenté comme « autre DAE proche »", () => {
  const r = pick([ask(cand(2, 300, "uncertain"))], "adult");
  assert.ok(/accès à demander/.test(r.options[0].title));
});
test("enfant : l'accès à demander ne vaut que pour un DAE pédiatrique", () => {
  const r = pick([cand(1, 100, "closed", { acces: 0 }), ask(cand(2, 300, "uncertain", { ped: 0 })), ask(cand(3, 400, "uncertain", { ped: 1 }))], "child");
  eq(r.options.map((o) => o.d.gid).join(), "3"); // le non pédiatrique ne compte pas ; le pédiatrique à demander remplace le fermé
});
test("accessRestricted : badge, code, sur demande ; pas interphone ni sonnette", () => {
  for (const t of ["Accès par badge", "Sur demande à l'accueil", "digicode à l'entrée", "Réservé au personnel"]) eq(Q.accessRestricted({ complement: t }), true);
  for (const t of ["Hall (Interphone à l'entrée)", "Sonnette pour avertir"]) eq(Q.accessRestricted({ complement: t }), false); // un intermédiaire n'est pas une barrière
  eq(Q.accessRestricted({ complement: "Hall d'entrée - L au V 8h/18h" }), false);
  eq(Q.accessRestricted({}), false);
});
test("« sauf » et « hors » : variantes de vacances reconnues", () => {
  for (const t of [
    "L au V 8h/17h hors vacances scolaires", "L au V 8h/17h sauf vacances scolaires", "L au V 8h/17h sauf pendant les vacances scolaires",
    "L au V 8h/17h hors période de vacances scolaires", "L au V 8h/17h sauf période de vacances scolaires.", "L au V 8h/17h hors vacances scolaire",
  ]) {
    const c = Q.cleanHoursText(t);
    eq(c.vacation, true); eq(c.restricted, false); eq(c.text, "L au V 8h/17h");
  }
});
test("« sauf jours fériés et vacances scolaires » : les deux restrictions", () => {
  const c = Q.cleanHoursText("L au V 8h/17h sauf jours fériés et vacances scolaires");
  eq(c.vacation, true); eq(c.restricted, true); eq(c.text, "L au V 8h/17h");
});
test("« sauf vacances universitaires » n'est pas une mention de vacances scolaires", () => {
  const c = Q.cleanHoursText("L au V 8h/17h sauf vacances universitaires");
  eq(c.vacation, false); eq(Q.textHours("L au V 8h/17h sauf vacances universitaires", at(MON, 10), false), "unknown");
});
test("horaires avec tiret : « L au V 8h-17h » se lit comme « 8h/17h »", () => {
  const t = "Restaurant - L au V 8h-17h ; L au V 8h-17h";
  eq(Q.textHours(t, at(MON, 10)), "open"); eq(Q.textHours(t, at(MON, 18)), "closed"); eq(Q.textHours(t, at(SUN, 10)), "closed");
  eq(Q.textHours("L au S 8h30-20h D 8h30-12h30", at(SUN, 10)), "open"); eq(Q.textHours("L au S 8h30-20h D 8h30-12h30", at(SUN, 14)), "closed");
});
test("« L-V : 7h30-18h15 » : jours reliés par un tiret, deux-points avant les heures", () => {
  eq(Q.textHours("L-V : 7h30-18h15", at(WED, 10)), "open"); eq(Q.textHours("L-V : 7h30-18h15", at(SAT, 10)), "closed");
});
test("deux règles différentes le même jour : on ne devine pas (exception ou ajout ?)", () => {
  eq(Q.textHours("L-V : 7h30-18h15 Me : 7h30-12h30", at(WED, 15)), "unknown");
  eq(Q.textHours("L-V : 7h30-18h15 Me : 7h30-12h30", at(MON, 10)), "open"); // le lundi, une seule règle s'applique
  eq(Q.textHours("L au V 8h/12h ; L au V 8h/12h", at(MON, 10)), "open"); // la même règle répétée n'est qu'une règle
});
test("mois, saisons et conditions avant l'horaire : jamais « ouvert »", () => {
  eq(Q.textHours("Chapelle - De mars à novembre 7j/7 9h/19h", at(MON, 10)), "unknown");
  eq(Q.textHours("Hall - Dimanche 10h/22h (en cas d'occupation de la salle)", at(SUN, 12)), "unknown");
});
test("texte descriptif autour d'horaires bien lus : il n'empêche pas de conclure", () => {
  const t = "Accessible du lundi au vendredi de 9h à 12h et de 13h30 à 19h, et le samedi de 9h à 13h30. DAE dans l'entrée, mur de gauche.";
  eq(Q.availability(dae({ complement: t }), at(MON, 10)), "sure"); eq(Q.availability(dae({ complement: t }), at(SAT, 14)), "closed");
  eq(Q.availability(dae({ complement: "Réfectoire ; Lundi : 07h00-14h00 Mardi : 07h00-14h00" }), at(MON, 10)), "sure");
});
test("un mot qui modifie l'accès, ou un chiffre, n'est pas du texte descriptif", () => {
  for (const x of ["sauf le 1er mai", "selon présence du gardien", "fermé en août", "tel 03 26 55", "si portail fermé"]) eq(Q.isDescriptive(x), false);
  for (const x of ["DAE dans l'entrée, mur de gauche", "Réfectoire", "à côté de l'ascenseur"]) eq(Q.isDescriptive(x), true);
});
test("heures sans jour rattachées à une condition, une saison ou un public : on ne conclut pas", () => {
  for (const t of ["Selon activités entre 8h et 20h", "Décembre à Mars 7/j7 9h17h", "Accessible aux adhérents de 8h à 22h", "Selon déplacement du véhicule en saison de 8h/19h"]) {
    eq(Q.timeOnlyHours(t, at(MON, 10)), "unknown");
  }
  eq(Q.timeOnlyHours("HEURE D'OUVERTURE 8H00-12H00 14H00-18H00", at(MON, 10)), "window");
});
test("heures sans jour : une heure qui n'appartient à aucune plage lue empêche de conclure « fermé »", () => {
  eq(Q.timeOnlyHours("Du lundi au vendredi de 8h30-12 / 13h30 - 16h30", at(TUE, 10)), "unknown");
  eq(Q.timeOnlyHours("Horaires 08h00 - 12h00 // 14h00 - 18h00 (17h00 le vendredi)", at(TUE, 20)), "unknown");
  eq(Q.timeOnlyHours("8h-12h 14h-18h", at(TUE, 20)), "closed");
});
test("jours en abréviations (Lu, Ma, Je, Ve) ou en minuscule (« L au j ») : on les reconnaît comme des jours", () => {
  eq(Q.hasDays("Lu - Ma - Je - Ve de 7h30 à 17h"), true); eq(Q.hasDays("8h-12h 14h-18h L/V"), true); eq(Q.hasDays("L au j 8h/12h"), true); eq(Q.hasDays("INTERIEUR DE L'ECOLE ; 08H20 - 18H30"), false);
});
test("intermédiaire (interphone, sonnette) : il n'enlève rien à l'accessibilité, le texte complet reste sur la fiche", () => {
  const t = "Hall - L au V 8h00/18h30 sauf période de vacances scolaires. (Interphone à l'entrée) ; L au V 8h00/18h30 sauf période de vacances scolaires. (Interphone à l'entrée)";
  eq(Q.textHours(t, at(SUN, 10), false), "closed");
  eq(Q.textHours(t, at(MON, 10), false), "open");
  eq(Q.textHours(t, at(MON, 20), false), "closed");
  eq(Q.textHours(t, at(MON, 10), true), "closed");
});
test("intermédiaire : phrase à part, après une virgule ou en tiret", () => {
  const d = dae({ complement: "Du Lundi au Jeudi : 8H00 - 17H30 et Vendredi 8H- 15H30. Sonnette pour avertir et accéder au DAE." });
  eq(Q.availability(d, at(MON, 10)), "sure");
  eq(Q.availability(d, at(SUN, 10)), "closed");
  eq(Q.stripGatewayNotes("L au V 8h/17h, sonner à l'interphone de l'entrée"), "L au V 8h/17h");
  eq(Q.stripGatewayNotes("L au V 8h/17h - Portail sécurisé par interphone"), "L au V 8h/17h");
  eq(Q.stripGatewayNotes("L au V 8h/17h (interphone)"), "L au V 8h/17h ");
  eq(Q.stripGatewayNotes("A, sonner, B"), "A, B");
});
test("heures sans jour + intermédiaire : fermé en dehors des heures, « jours non précisés » dedans", () => {
  const d = dae({ complement: "ACCESSIBLE DE 8H A 17H, sonner à l'interphone de l'entrée du site" });
  eq(Q.availability(d, at(MON, 22)), "closed");
  eq(Q.availability(d, at(MON, 10)), "window");
});
test("intermédiaire avec une heure ou un jour : la remarque reste dans l'horaire, on ne conclut pas", () => {
  eq(Q.stripGatewayNotes("L au V 8h/18h (digicode après 18h)"), "L au V 8h/18h (digicode après 18h)"); // digicode : pas un intermédiaire
  eq(Q.stripGatewayNotes("L au V 8h/18h (sonnette après 18h)"), "L au V 8h/18h (sonnette après 18h)");
  eq(Q.stripGatewayNotes("L au V 8h/18h, interphone le samedi"), "L au V 8h/18h, interphone le samedi");
  eq(Q.textHours("Hall - L au V 8h/18h (sonnette après 18h)", at(MON, 20), false), "unknown");
});
test("« sauf période de vacances scolaires » : lu comme « hors vacances scolaires »", () => {
  const t = "Hall - L au V 8h00/18h30 sauf période de vacances scolaires.";
  eq(Q.textHours(t, at(MON, 10), false), "open"); eq(Q.textHours(t, at(MON, 10), true), "closed"); eq(Q.textHours(t, at(MON, 10), null), "unknown");
});
test("horaires sans jours : classés avant un DAE aux horaires inconnus à peu près à la même distance, pas à n'importe quelle distance", () => {
  eq(pick([cand(1, 200, "uncertain"), cand(2, 250, "window")], "adult").options[0].d.gid, 2);   // 250 + 100 < 200 + 300
  eq(pick([cand(1, 200, "uncertain"), cand(2, 450, "window")], "adult").options[0].d.gid, 1);   // 450 + 100 > 200 + 300
});
test("horaires sans jours : jamais « ouvert » ni « probable » à l'intérieur (hors accès extérieur)", () => {
  eq(Q.AV_OK.has("window"), false);
  eq(pick([cand(2, 100, "window")], "adult").hasBest, false);
});
test("horaires sans jours : un texte qui nomme des jours n'est pas « jours non précisés »", () => {
  eq(Q.hasDays("L au V 8h/17h"), true); eq(Q.hasDays("du lundi au vendredi"), true); eq(Q.hasDays("7j/7 8h-17h"), true);
  eq(Q.hasDays("ACCESSIBLE DE 8H A 17H"), false); eq(Q.hasDays("8h-12h 14h-18h"), false);
  eq(Q.availability(dae({ complement: "L au V 8h/17h hors vacances scolaires" }), at(MON, 10), false), "uncertain"); // jours précisés, calendrier inconnu
});
// ---------- Lecture par groupes (scheduleHours) ----------
const sh = (text, day, h, m = 0) => Q.scheduleHours(text, new Date(2026, 10, 15 + day, h, m), false); // le 15/11/2026 est un dimanche : day 1 = lundi…
test("groupes : « lundi-mercredi-vendredi » est une liste de trois jours, pas une plage", () => {
  const t = "Lundi-mercredi-vendredi de 9h00 à 12h30 et mardi et jeudi de 14h00 à 17h00";
  eq(sh(t, 1, 10), "open"); eq(sh(t, 2, 10), "closed"); eq(sh(t, 2, 15), "open"); eq(sh(t, 3, 10), "open"); eq(sh(t, 4, 15), "open"); eq(sh(t, 6, 10), "closed");
});
test("groupes : un tiret entouré d'espaces entre deux plages", () => {
  const t = "du lundi au vendredi de 8h30-12h - 13h30-16h30";
  eq(sh(t, 1, 10), "open"); eq(sh(t, 1, 12, 30), "closed"); eq(sh(t, 1, 14), "open"); eq(sh(t, 6, 10), "closed");
});
test("groupes : une barre oblique entre deux plages à tiret", () => {
  const t = "L, Ma , Me , J 8h-12h/14h-18h V 8h/12h 14h/17h";
  eq(sh(t, 1, 10), "open"); eq(sh(t, 1, 13), "closed"); eq(sh(t, 5, 16), "open"); eq(sh(t, 5, 17, 30), "closed");
});
test("groupes : les heures se prennent deux par deux, « 12h/14h » n'est pas une plage", () => {
  eq(sh("L au V 8h-12h/14h-18h", 1, 13), "closed"); eq(sh("L au V 8h-12h/14h-18h", 1, 15), "open");
});
test("groupes : heure de fin sans « h » (« 8h30-12 »)", () => {
  eq(sh("Du lundi au vendredi de 8h30-12 / 13h30 - 16h30", 2, 10), "open"); eq(sh("Du lundi au vendredi de 8h30-12 / 13h30 - 16h30", 2, 13), "closed");
});
test("groupes : heures d'abord, jours ensuite (« 8h-12h 14h-18h L/V »)", () => {
  eq(sh("8h-12h 14h-18h L/V", 2, 10), "open"); eq(sh("8h-12h 14h-18h L/V", 6, 10), "closed");
  eq(sh("9h/20h du lundi au vendredi", 3, 10), "open"); eq(sh("9h/20h du lundi au vendredi", 0, 10), "closed");
});
test("groupes : tous les jours, week-end, un seul jour", () => {
  eq(sh("tous les jours de 9h à 18h", 0, 10), "open"); eq(sh("Lundi au vendredi 9h-17h, week-end 10h-12h", 6, 11), "open"); eq(sh("Lundi au vendredi 9h-17h, week-end 10h-12h", 6, 14), "closed");
  eq(sh("Mercredi 14h-18h", 3, 15), "open"); eq(sh("Mercredi 14h-18h", 4, 15), "closed");
});
test("groupes : plage qui passe minuit", () => {
  eq(sh("Lundi au vendredi 22h-6h", 2, 3), "open"); eq(sh("Lundi au vendredi 22h-6h", 2, 12), "closed"); eq(sh("L au S 14h-00h", 2, 23), "open");
});
test("groupes : on ne devine pas", () => {
  eq(sh("L M M 8h/12h 14h/18h", 2, 10), "unknown");                                              // « M » seul
  eq(sh("SITE PRIVE/ PORTAIL OUVERT DE 8H A 17H30 JOURS OUVRES- VENIR A L ACCEUIL", 2, 10), "unknown");
  eq(sh("Horaires 08h00 - 12h00 // 14h00 - 18h00 (17h00 le vendredi)", 2, 10), "unknown");        // nombre d'heures impair
  eq(sh("Lundi au vendredi 9h-12h ou 14h-17h", 1, 10), "unknown");                                 // « ou »
  eq(sh("L au V 8h-17h sauf le 1er mai", 1, 10), "unknown");                                       // mot qui modifie l'horaire
  eq(sh("Lundi 9h-12h Mardi", 1, 10), "unknown");                                                  // jour sans heures
  eq(sh("Du 01/11 au 27/03 L au V 8h/12h", 1, 10), "unknown");                                     // dates
  eq(sh("Lundi au vendredi de 9h à 12h et lundi de 14h à 17h", 1, 15), "unknown");                 // deux règles pour le même jour
});
test("groupes : une lettre isolée n'est un jour que près d'une heure ou d'un autre jour (« A L ACCEUIL », « L'ecole »)", () => {
  eq(Q.shTokens("VENIR A L ACCEUIL 8h-12h").filter((x) => x.t === "D").length, 0);
  eq(Q.shTokens("INTERIEUR DE L'ECOLE 08H20 - 18H30").filter((x) => x.t === "D").length, 0);
  eq(Q.shTokens("L au V 8h").filter((x) => x.t === "D").length, 2);
});
test("groupes : « aire de jeu - 7j/7 » : « jeu » n'est pas jeudi, et le calcul ne boucle pas", () => {
  eq(sh("Entrée côté aire de jeu - 7j/7 11h/ 23h ; 7j/7 11h/ 23h", 2, 12), "open");
  eq(sh("Entrée côté aire de jeu - 7j/7 11h/ 23h ; 7j/7 11h/ 23h", 2, 8), "closed");
  eq(Q.shTokens("aire de jeu - 7j/7").filter((x) => x.t === "D").length, 0);
  eq(Q.shTokens("ven 9h-12h").filter((x) => x.t === "D").length, 1);   // abréviation avec une heure : un jour
  eq(Q.shTokens("sam. 9h-12h").filter((x) => x.t === "D").length, 1);
});
test("groupes : « Lau J » est « L au J » ; « aléatoire », « mais » : on ne conclut pas ; vacances d'un type précis : pas « vacances scolaires »", () => {
  eq(sh("Atelier - Lau J 8h30/17h30 V 8h30/16h", 2, 10), "open");
  eq(sh("L au J 8h/17h V 8h/12h- mais aléatoire", 2, 10), "unknown");
  eq(sh("L au V 7h45 19h (hors vacances scolaires de noël)", 2, 10), "unknown");
  eq(Q.cleanHoursText("L au V 8h-17h hors vacances scolaires").vacation, true);
  eq(Q.cleanHoursText("L au V 8h-17h hors vacances de noël").vacation, false);
});
test("groupes : disponibilité de bout en bout (formats que les autres lectures ne reconnaissent pas)", () => {
  const d = (t) => dae({ complement: t });
  eq(Q.availability(d("Lundi-mercredi-vendredi de 9h à 12h30 et mardi et jeudi de 14h à 17h"), at(MON, 10)), "sure");
  eq(Q.availability(d("Lundi-mercredi-vendredi de 9h à 12h30 et mardi et jeudi de 14h à 17h"), at(TUE, 10)), "closed");
  eq(Q.availability(d("L, Ma , Me , J 8h-12h/14h-18h V 8h/12h 14h/17h"), at(MON, 10)), "sure");
});
test("fermé à l'extérieur : seulement en dernier recours", () => {
  const r = pick([cand(1, 100, "closed", { acces: 0 }), cand(2, 900, "sure")], "adult");
  eq(r.options[0].d.gid, 2);
  assert.ok(r.options.some((o) => o.d.gid === 1 && /Dernier recours/.test(o.title)), "le fermé doit figurer en dernier recours");
});
test("fermé à l'extérieur seul : proposé, mais jamais comme « meilleur »", () => {
  const r = pick([cand(1, 100, "closed", { acces: 0 })], "adult");
  eq(r.options.length, 1); eq(r.hasBest, false);
});
test("fermé à l'intérieur : jamais proposé, même seul", () => {
  eq(pick([cand(1, 100, "closed", { acces: 1 })], "adult").options.length, 0);
  eq(pick([cand(1, 100, "closed", { acces: 1 }), cand(2, 900, "sure")], "adult").options.map((o) => o.d.gid).join(), "2");
  eq(pick([cand(1, 100, "closed", { acces: 1 })], "child").options.length, 0);
});
test("aucun candidat : aucune option", () => eq(pick([], "adult").options.length, 0));
test("enfant : pédiatrique accessible à jour en premier", () => {
  const r = pick([cand(1, 100, "sure", { ped: 0 }), cand(2, 400, "sure", { ped: 1 })], "child");
  eq(r.options[0].d.gid, 2); eq(r.hasBest, true);
});
test("enfant : pédiatrique incertain proposé, avant un adulte accessible lointain", () => {
  const r = pick([cand(1, 900, "sure", { ped: 0 }), cand(2, 300, "uncertain", { ped: 1 })], "child");
  eq(r.options.length, 2);
  assert.ok(r.options.some((o) => o.d.gid === 2), "le pédiatrique incertain doit être proposé");
});
test("enfant : un DAE non pédiatrique n'est jamais présenté comme pédiatrique", () => {
  const r = pick([cand(1, 100, "sure", { ped: 0 })], "child");
  assert.ok(r.options.every((o) => !/^Pédiatrique/.test(o.title)), "titre : " + r.options.map((o) => o.title));
});

// ---------- Ordre d'affichage des options ----------
const opts = [{ d: { gid: 1 }, dist: 900 }, { d: { gid: 2 }, dist: 150 }, { d: { gid: 3 }, dist: 400 }];
test("ordre par priorité : inchangé par défaut", () => eq(Q.orderOptions(opts, false).map((o) => o.d.gid).join(), "1,2,3"));
test("24/7 : « 24/7 » et « tous les jours de 0 h à 23 h 59 » comptent, pas les autres horaires", () => {
  eq(FMT.is247("24/7"), true); eq(FMT.is247("Mo-Su 00:00-23:59"), true);
  eq(FMT.is247("Mo-Fr 00:00-23:59"), false); eq(FMT.is247("Mo-Su 08:00-18:00"), false); eq(FMT.is247(""), false); eq(FMT.is247(null), false);
});
test("24/7 écrit en toutes lettres : ouvert à toute heure, même à 23 h 59", () => {
  eq(Q.openState("Mo-Su 00:00-23:59", at(0, 23, 59)), "open"); eq(Q.openState("Mo-Su 00:00-23:59", at(1, 3, 30)), "open");
});
// ---- Accès, filtres, réglages enregistrés ----
test("accès : 24/7 et « tous les jours de 0 h à 23 h 59 » = 24h/24 et 7j/7", () => {
  eq(A.accessClassOf("24/7"), "h24"); eq(A.accessClassOf("Mo-Su 00:00-23:59"), "h24");
});
test("accès : des horaires connus mais partiels = horaires limités", () => {
  eq(A.accessClassOf("Mo-Fr 08:00-18:00"), "limited"); eq(A.accessClassOf("Mo-Su 08:00-18:00; PH off"), "limited"); eq(A.accessClassOf("Mo-Fr 00:00-23:59"), "limited");
});
test("accès : pas d'horaires = horaires inconnus", () => { eq(A.accessClassOf(""), "unknown"); eq(A.accessClassOf(null), "unknown"); eq(A.accessClassOf(undefined), "unknown"); });
const everything = () => JSON.parse(JSON.stringify(A.DEFAULT_FILTERS));
const sample = (over = {}) => ({ accessClass: "h24", maint: "ok", ped: 1, ...over });
test("filtres : par défaut tout s'affiche", () => {
  for (const accessClass of ["h24", "limited", "unknown"]) for (const maint of ["ok", "doubt", "unknown"]) for (const ped of [1, 0, null]) {
    assert.ok(A.matches(sample({ accessClass, maint, ped }), everything()), `${accessClass} ${maint} ${ped}`);
  }
});
test("filtres : décocher une classe d'accès cache ces appareils seulement", () => {
  const f = everything(); f.access = ["h24", "unknown"];
  eq(A.matches(sample({ accessClass: "limited" }), f), false); eq(A.matches(sample({ accessClass: "h24" }), f), true); eq(A.matches(sample({ accessClass: "unknown" }), f), true);
});
test("filtres : tout décocher ne laisse rien", () => {
  const f = everything(); f.access = [];
  eq(A.matches(sample(), f), false);
  const g = everything(); g.maint = [];
  eq(A.matches(sample(), g), false);
});
test("filtres : maintenance, chaque classe se règle seule", () => {
  const f = everything(); f.maint = ["ok"];
  eq(A.matches(sample({ maint: "ok" }), f), true); eq(A.matches(sample({ maint: "doubt" }), f), false); eq(A.matches(sample({ maint: "unknown" }), f), false);
});
test("filtres : pédiatrique seul, puis avec les incertains", () => {
  const f = everything(); f.ped = ["yes"];
  eq(A.matches(sample({ ped: 1 }), f), true); eq(A.matches(sample({ ped: 0 }), f), false); eq(A.matches(sample({ ped: null }), f), false);
  f.ped = ["yes", "unknown"];
  eq(A.matches(sample({ ped: null }), f), true); eq(A.matches(sample({ ped: 0 }), f), false);
});
test("réinitialisation : actif seulement quand un filtre diffère", () => {
  eq(A.filtersActive(everything()), false);
  const f = everything(); f.access = ["h24"]; eq(A.filtersActive(f), true);
  const g = everything(); g.ped = ["yes"]; eq(A.filtersActive(g), true);
});
test("réglages enregistrés : rien d'enregistré ou texte illisible = tout afficher", () => {
  eq(JSON.stringify(A.parseFilters(null)), JSON.stringify(everything()));
  eq(JSON.stringify(A.parseFilters("pas du json")), JSON.stringify(everything()));
});
test("réglages enregistrés : un choix d'accès valide est conservé", () => {
  eq(A.parseFilters(JSON.stringify({ access: ["h24", "limited"] })).access.join(), "h24,limited");
  eq(A.parseFilters(JSON.stringify({ maint: ["ok"] })).maint.join(), "ok");
});
test("réglages enregistrés : les anciens choix d'accès (extérieur, intérieur) sont ignorés", () => {
  eq(A.parseFilters(JSON.stringify({ access: ["h24", "ext"] })).access.join(), A.DEFAULT_FILTERS.access.join());
  eq(A.parseFilters(JSON.stringify({ access: ["int"] })).access.join(), A.DEFAULT_FILTERS.access.join());
  eq(A.parseFilters(JSON.stringify({ access: "h24" })).access.join(), A.DEFAULT_FILTERS.access.join());
});
test("réglages enregistrés : un réglage de maintenance inconnu est ignoré", () => {
  eq(A.parseFilters(JSON.stringify({ maint: ["ok", "inconnue"] })).maint.join(), A.DEFAULT_FILTERS.maint.join());
});
test("réglages enregistrés : le filtre pédiatrique repart toujours décoché", () => {
  eq(A.parseFilters(JSON.stringify({ ped: ["yes", "unknown"] })).ped.length, 0);
});
test("classes d'accès : chacune a une couleur et un libellé", () => {
  eq(Object.keys(A.COLORS).sort().join(), "h24,limited,unknown"); eq(Object.keys(A.ACCESS_LABEL).sort().join(), "h24,limited,unknown");
  for (const k of Object.keys(A.COLORS)) assert.match(A.COLORS[k], /^#[0-9a-f]{6}$/i);
  eq(Object.keys(A.MAINT_COLORS).sort().join(), "doubt,ok,unknown");
});
test("anneau de maintenance : une forme par classe, et les motifs font le tour exact du cercle", () => {
  eq(Object.keys(A.MAINT_DASH).sort().join(), Object.keys(A.MAINT_COLORS).sort().join());
  eq(A.MAINT_DASH.ok, null);
  const around = 2 * Math.PI * A.RING_RADIUS;
  const sum = (s) => s.split(" ").map(Number).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(3 * sum(A.MAINT_DASH.unknown) - around) < 0.2, "trois arcs");
  assert.ok(Math.abs(8 * sum(A.MAINT_DASH.doubt) - around) < 0.2, "huit tirets");
});
test("classes d'accès : les libellés existent dans les 7 langues", () => {
  for (const lang of ["fr", "en", "de", "es", "it", "nl", "pt"]) {
    const L = load("js/dae-view.js", ["ACCESS_LABEL", "MAINT_LABEL", "MAINT_PART_LABEL"], {}, lang);
    for (const v of [...Object.values(L.ACCESS_LABEL), ...Object.values(L.MAINT_LABEL), ...Object.values(L.MAINT_PART_LABEL)]) {
      assert.ok(v && !/^[a-z]+\.[A-Za-z.]+$/.test(v), `${lang} : libellé manquant « ${v} »`);
    }
  }
});
// ---- Horaires écrits dans les précisions : listes de jours, répétitions, précisions restrictives, heures sans jour ----
const CHARENTON = "Entrée passage couver - Me et S 6h/16h ; Me et S 6h/16h";
test("liste de jours « Me et S » : mercredi et samedi seulement", () => {
  eq(Q.textHours(CHARENTON, at(WED, 10)), "open"); eq(Q.textHours(CHARENTON, at(SAT, 7)), "open");
  eq(Q.textHours(CHARENTON, at(WED, 17)), "closed"); eq(Q.textHours(CHARENTON, at(MON, 10)), "closed"); eq(Q.textHours(CHARENTON, at(SAT + 0, 17)), "closed");
});
test("liste de jours « L , Ma , J , V » (espaces avant les virgules)", () => {
  const t = "Accueil rdc - L , Ma , J , V 7h30/18h30 ; L , Ma , J , V 7h30/18h30";
  eq(Q.textHours(t, at(MON, 10)), "open"); eq(Q.textHours(t, at(FRI, 18)), "open"); eq(Q.textHours(t, at(WED, 10)), "closed"); eq(Q.textHours(t, at(SAT, 10)), "closed");
});
test("plage et liste mélangées : « L au J 8h/12h V 8h/11h »", () => {
  const t = "Bureau - L au J 8h/12h V 8h/11h";
  eq(Q.textHours(t, at(WED, 10)), "open"); eq(Q.textHours(t, at(FRI, 11, 30)), "closed");
});
test("« M » seul est ambigu (mardi ou mercredi) : non lu", () => eq(Q.textHours("L, M, J et V de 8h à 17h M 8h à 12h", at(TUE, 10)), "unknown"));
test("« hors vacances scolaires » répété : jamais « ouvert », mais « fermé » reste fermé", () => {
  const t = "Hall - L au V 8h/16h40 hors vacances scolaires ; L au V 8h/16h40 hors vacances scolaires";
  eq(Q.textHours(t, at(MON, 10)), "unknown"); eq(Q.textHours(t, at(MON, 20)), "closed"); eq(Q.textHours(t, at(SAT, 10)), "closed");
});
test("« hors jours fériés » : même prudence", () => eq(Q.textHours("L au V 9h/17h hors jours fériés", at(MON, 10)), "unknown"));
test("prose : « du lundi au vendredi de 6h à 17h30 hors vacances scolaires et hors jours fériés »", () => {
  const t = "du lundi au vendredi de 6h à 17h30 hors vacances scolaires et hors jours fériés";
  eq(Q.proseHours(t, at(TUE, 10)), "unknown"); eq(Q.proseHours(t, at(TUE, 20)), "closed"); eq(Q.proseHours(t, at(SAT, 10)), "closed");
});
test("prose : liste « les lundis, mardis, jeudis et vendredis de 7h00 à 16h15 »", () => {
  const t = "les lundis, mardis, jeudis et vendredis de 7h00 à 16h15";
  eq(Q.proseHours(t, at(TUE, 10)), "open"); eq(Q.proseHours(t, at(WED, 10)), "closed"); eq(Q.proseHours(t, at(FRI, 16, 30)), "closed");
});
test("prose : deux plages séparées par « / » ne se rejoignent pas", () => {
  const t = "du lundi au jeudi : 07h00-12h00 / 13h30-17h30";
  eq(Q.proseHours(t, at(TUE, 10)), "open"); eq(Q.proseHours(t, at(TUE, 12, 45)), "closed"); eq(Q.proseHours(t, at(TUE, 14)), "open");
});
test("heures sans jour : fermé en dehors, incertain dedans, jamais ouvert", () => {
  const t = "8h-12h 14h-18h";
  eq(Q.timeOnlyHours(t, at(MON, 10)), "window"); eq(Q.timeOnlyHours(t, at(MON, 13)), "closed"); eq(Q.timeOnlyHours(t, at(MON, 20)), "closed"); eq(Q.timeOnlyHours(t, at(SUN, 3)), "closed");
  eq(Q.timeOnlyHours("Horaires : 06:00 - 22:00", at(WED, 23)), "closed"); eq(Q.timeOnlyHours("Horaires : 06:00 - 22:00", at(WED, 12)), "window");
});
test("heures sans jour : plage de nuit", () => { eq(Q.timeOnlyHours("22h-6h", at(MON, 3)), "window"); eq(Q.timeOnlyHours("22h-6h", at(MON, 12)), "closed"); });
test("heures sans jour : un autre accès possible, 24h/24 ou une heure absurde = non lu", () => {
  eq(Q.timeOnlyHours("7j/7 24h/24 ; 8h-17h", at(MON, 20)), "unknown");
  eq(Q.timeOnlyHours("gardien présent de 8h à 17h, sinon appeler le 0102", at(MON, 20)), "unknown");
  eq(Q.timeOnlyHours("en dehors de 8h-17h : digicode", at(MON, 20)), "unknown");
  eq(Q.timeOnlyHours("25h-30h", at(MON, 20)), "unknown"); eq(Q.timeOnlyHours("", at(MON, 20)), "unknown"); eq(Q.timeOnlyHours("au fond du couloir", at(MON, 20)), "unknown");
});
const withText = (complement, extra = {}) => ({ horaires: "", complement, acces: 1, cp: "94220", flags: 0, ...extra });
test("estimation : « Me et S 6h/16h » donne ouvert le mercredi matin, fermé le jeudi", () => {
  eq(Q.availability(withText(CHARENTON), at(WED, 10)), "sure"); eq(Q.availability(withText(CHARENTON), at(TUE, 10)), "closed");
});
test("estimation : heures sans jour, dedans « jours non précisés » (ou probable en extérieur), dehors fermé", () => {
  eq(Q.availability(withText("8h-12h 14h-18h"), at(TUE, 10)), "window"); eq(Q.availability(withText("8h-12h 14h-18h", { acces: 0 }), at(TUE, 10)), "likely");
  eq(Q.availability(withText("8h-12h 14h-18h"), at(TUE, 20)), "closed"); eq(Q.availability(withText("8h-12h 14h-18h", { acces: 0 }), at(TUE, 20)), "closed");
});
test("estimation : un texte « 7j/7 24h/24 » seul est accessible à toute heure, même un jour férié", () => {
  const t = "Façade salle des fêtes - 7j/7 24h/24 ; 7j/7 24h/24";
  eq(Q.availability(withText(t), at(TUE, 3)), "sure"); eq(Q.availability(withText(t), at(SUN, 3), true), "sure");
  eq(Q.availability(withText("7j/7 24h/24 lors de l'ouverture à la piscine"), at(TUE, 3)), "uncertain");
});
test("estimation : les horaires structurés restent prioritaires quand ils disent ouvert, et le texte qui les contredit en disant ouvert les rend incertains", () => {
  eq(Q.availability({ ...withText("L au V 8h/18h"), horaires: "Mo-Fr 08:00-22:00" }, at(TUE, 19)), "sure"); // ouvert d'après les horaires renseignés, le texte (fermé) ne l'emporte pas
  eq(Q.availability({ ...withText("L au V 8h/18h"), horaires: "Mo-Fr 20:00-22:00" }, at(TUE, 10)), "uncertain"); // fermé d'après les horaires renseignés, ouvert d'après le texte : la base se contredit
  eq(Q.availability({ ...withText("L au V 8h/18h"), horaires: "Mo-Fr 20:00-22:00" }, at(TUE, 23)), "closed"); // fermé selon les deux
});
test("classement : un texte avec une plage horaire donne des horaires limités", () => {
  eq(A.accessClassOf("", "8h30-12h15/13h15-17h"), "limited"); eq(A.accessClassOf("", CHARENTON), "limited"); eq(A.accessClassOf("", "de 7h30 à 15h30"), "limited");
  eq(A.accessClassOf("Mo-Fr 08:00-18:00", ""), "limited");
});
test("classement : « 7j/7 24h/24 » seul en texte = 24h/24 et 7j/7, avec condition = inconnu", () => {
  eq(A.accessClassOf("", "Façade - 7j/7 24h/24 ; 7j/7 24h/24"), "h24");
  eq(A.accessClassOf("", "7j/7 24h/24 du 19/10/2024 au 02/11/2024"), "unknown");
});
test("classement : « aux heures d'ouverture », « selon évènements », « en saison » = horaires limités, sans heure précise", () => {
  for (const text of [
    "DAE disponible aux heures et jours d'ouverture de la déchèterie", "accessible uniquement pendant les heures d'ouverture de l'établissement",
    "Hall entrée - L au V selon présence du personnel ; L au V selon présence du personnel", "Salle polyvalente - 7j/7 selon évènements ; 7j/7 selon évènements",
    "Ouvert 7J/7 l'été en période estivale", "Gymnase - selon activités", "7j/7 24h/24 lors de l'ouverture à la clientèle", "Entrée de la mairie, heures d'ouverture de la mairie",
  ]) eq(A.accessClassOf("", text), "limited", text);
});
test("classement : l'estimation d'ouverture ne bouge pas pour ces textes (incertain, probable en extérieur)", () => {
  const d = { horaires: "", complement: "disponible aux heures d'ouverture de l'école", acces: 1, cp: "94220", flags: 0 };
  eq(Q.availability(d, at(TUE, 10)), "uncertain"); eq(Q.availability(d, at(TUE, 3)), "uncertain"); eq(Q.availability({ ...d, acces: 0 }, at(TUE, 3)), "likely");
});
test("classement : sans plage horaire dans le texte = inconnu", () => {
  eq(A.accessClassOf("", "Hall d'entrée sur la gauche"), "unknown"); eq(A.accessClassOf("", "tel 04 72 44 79 74"), "unknown"); eq(A.accessClassOf("", ""), "unknown");
  eq(A.accessClassOf("", "PC sécurité 24h/24"), "unknown");
});
test("classement : les horaires structurés priment sur le texte", () => { eq(A.accessClassOf("24/7", "8h-12h"), "h24"); eq(A.accessClassOf("Mo-Fr 08:00-18:00", "7j/7 24h/24"), "limited"); });
test("taille du panneau : selon la hauteur atteinte en le glissant", () => {
  eq(Q.sheetSizeFor(0.05), "min"); eq(Q.sheetSizeFor(0.19), "min"); eq(Q.sheetSizeFor(0.2), "mid");
  eq(Q.sheetSizeFor(0.45), "mid"); eq(Q.sheetSizeFor(0.61), "mid"); eq(Q.sheetSizeFor(0.62), "max"); eq(Q.sheetSizeFor(0.88), "max");
});
test("taille du panneau : un appui fait tourner moyen, grand, réduit", () => {
  eq(Q.nextSheetSize("mid"), "max"); eq(Q.nextSheetSize("max"), "min"); eq(Q.nextSheetSize("min"), "mid");
});
test("taille du panneau : les flèches s'arrêtent aux extrémités", () => {
  eq(Q.stepSheetSize("mid", 1), "max"); eq(Q.stepSheetSize("max", 1), "max");
  eq(Q.stepSheetSize("mid", -1), "min"); eq(Q.stepSheetSize("min", -1), "min");
});
test("ordre par distance : du plus proche au plus loin", () => eq(Q.orderOptions(opts, true).map((o) => o.d.gid).join(), "2,3,1"));
test("le tri par distance ne modifie pas la liste d'origine", () => { Q.orderOptions(opts, true); eq(opts.map((o) => o.d.gid).join(), "1,2,3"); });

// ---------- « Voir le plus proche » ----------
// Carte et chargement simulés : distance plane en mètres, tuiles « chargées » = tous les DAE d'un coup.
function nearestWith(aeds, matchFn = () => true) {
  const radiiLoaded = [];
  const sandbox = load("js/app.js", ["SEARCH_RADII", "findNearest"], {
    map: { distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 111000 },
    loadAround: async (ll, r) => { radiiLoaded.push(r); },
    loadedAeds: new Map([["t", aeds]]),
    matches: matchFn,
  });
  return sandbox.findNearest([0, 0]).then((best) => ({ best, radiiLoaded }));
}
const at_m = (gid, meters, extra = {}) => ({ gid, lat: meters / 111000, lon: 0, ...extra });
test("plus proche : s'arrête au premier rayon qui contient un DAE", async () => {
  const { best, radiiLoaded } = await nearestWith([at_m(1, 1500), at_m(2, 900)]);
  eq(best.ll[0] * 111000 > 899 && best.ll[0] * 111000 < 901, true); eq(radiiLoaded.length, 1);
});
test("plus proche : élargit le rayon jusqu'à trouver", async () => {
  const { best, radiiLoaded } = await nearestWith([at_m(1, 12000)]);
  eq(Math.round(best.dist), 12000); eq(radiiLoaded.join(","), "2000,5000,15000");
});
test("plus proche : au-delà de 30 km, rien", async () => eq((await nearestWith([at_m(1, 40000)])).best, null));
test("plus proche : un DAE trop loin du rayon courant n'est pas pris pour le plus proche", async () => {
  // le DAE à 2500 m est « chargé » mais hors du disque de 2 km : il faut passer au rayon suivant, où un autre peut être plus proche
  const { best } = await nearestWith([at_m(1, 2500), at_m(2, 2100)]);
  eq(Math.round(best.dist), 2100);
});
test("plus proche : respecte les filtres", async () => {
  const { best } = await nearestWith([at_m(1, 300, { ped: 0 }), at_m(2, 4000, { ped: 1 })], (d) => d.ped === 1);
  eq(Math.round(best.dist), 4000);
});

// ---------- Nombres selon la langue ----------
const F = load("js/format.js", ["numberFormat"]);
const DATA = load("js/data.js", ["fmtMo"]);
test("distances : virgule décimale en français", () => { eq(A.formatDistance(250), "250\u00a0m"); eq(A.formatDistance(1234), "1,2\u00a0km"); eq(A.formatDistance(2000), "2,0\u00a0km"); eq(A.formatDistance(15200), "15\u00a0km"); });
test("distances : arrondi à 10 m sous le kilomètre", () => { eq(A.formatDistance(254), "250\u00a0m"); eq(A.formatDistance(996).replace(/[\u202f\u00a0]/g, " "), "1 000 m"); }); // 996 m s'arrondit à 1 000 m (le séparateur de milliers du français est une espace fine)
test("taille des jeux : « 1,2 Mo » et « 35 Mo »", () => { eq(DATA.fmtMo(1234567), "1,2\u00a0Mo"); eq(DATA.fmtMo(35913848), "36\u00a0Mo"); });
test("nombres : séparateur de milliers du français", () => eq(F.numberFormat(184335).replace(/[\u202f\u00a0]/g, " "), "184 335"));

// ---------- Zones denses ----------
const TILES = { "195_9": 11972, "195_8": 3522, "202_12": 3213 }; // nombre de DAE par tuile (centre de Paris, ouest de Paris, Lyon)
test("tuiles d'une vue : seulement celles qui existent", () => {
  eq(A.tileKeysFor(48.80, 48.90, 2.30, 2.40, 0.25, TILES).join(), "195_9");
  eq(A.tileKeysFor(48.80, 48.90, 2.10, 2.40, 0.25, TILES).join(), "195_8,195_9");
  eq(A.tileKeysFor(10, 10.1, 10, 10.1, 0.25, TILES).length, 0);
});
test("centre de Paris : trop dense sous le niveau 13, chargé à partir du 13 (le nombre réel de points décide ensuite)", () => {
  eq(A.viewTooDense(["195_9"], TILES, 12), true); eq(A.viewTooDense(["195_9"], TILES, 12.9), true);
  eq(A.viewTooDense(["195_9"], TILES, 13), false); eq(A.viewTooDense(["195_9"], TILES, 13.6), false); eq(A.viewTooDense(["195_9"], TILES, 14), false);
});
test("zone peu dense : jamais écartée, même au niveau 12", () => { eq(A.viewTooDense(["202_12"], TILES, 12), false); eq(A.viewTooDense([], TILES, 12), false); });
test("plusieurs tuiles : le total compte", () => { eq(A.viewTooDense(["195_8", "202_12", "195_9"], TILES, 12), true); eq(A.viewTooDense(["195_8", "202_12"], TILES, 12), false); });
test("seuils : un affichage plafonné reste raisonnable", () => { eq(A.MAX_DRAWN <= 3000, true); eq(A.DENSE_ZOOM > 12, true); eq(A.DENSE_ZOOM <= 13, true); });

// ---------- Vue de la carte conservée entre les pages ----------
const NOWMS = Date.parse("2026-10-30T12:00:00Z");
const savedView = (over = {}) => JSON.stringify({ lat: 48.857, lng: 2.347, zoom: 14.5, ts: NOWMS - 60000, ...over });
test("vue enregistrée valide : relue telle quelle (zoom fractionnaire compris)", () =>
  assert.deepStrictEqual({ ...A.parseSavedView(savedView(), NOWMS) }, { lat: 48.857, lng: 2.347, zoom: 14.5 }));
test("vue enregistrée : absente, abîmée, hors limites ou trop ancienne = ignorée", () => {
  for (const raw of [null, "", "pas du json", "{}", "null", savedView({ lat: 120 }), savedView({ lng: -200 }), savedView({ zoom: 99 }), savedView({ zoom: "14" }),
    savedView({ lat: null }), savedView({ ts: NOWMS - 3 * 3600 * 1000 }), savedView({ ts: undefined })]) eq(A.parseSavedView(raw, NOWMS), null);
});
test("retour d'une autre page du site (lien « Retour à la carte ») : on restaure", () =>
  eq(A.cameFromAnotherPage("navigate", "https://site.test/depot/guide.html", "https://site.test", "/depot/"), true));
test("bouton Retour du navigateur : on restaure", () => eq(A.cameFromAnotherPage("back_forward", "", "https://site.test", "/depot/"), true));
test("nouveau chargement, rechargement, autre site ou adresse tapée : on ne restaure pas", () => {
  eq(A.cameFromAnotherPage("navigate", "", "https://site.test", "/depot/"), false);
  eq(A.cameFromAnotherPage("reload", "https://site.test/depot/", "https://site.test", "/depot/"), false);
  eq(A.cameFromAnotherPage("reload", "https://site.test/depot/guide.html", "https://site.test", "/depot/"), false); // F5 après être revenu de « À propos »
  eq(A.cameFromAnotherPage("navigate", "https://autre.test/page", "https://site.test", "/depot/"), false);
  eq(A.cameFromAnotherPage("navigate", "pas une adresse", "https://site.test", "/depot/"), false);
});

// ---------- Dates des jeux de données (menu « Données ») ----------
test("fmtDay : date seule", () => eq(D.fmtDay("2026-10-23"), "23/10/2026"));
test("fmtDay : heure UTC convertie en heure de Paris (hiver)", () => eq(D.fmtDay("2026-10-26-23"), "27/10/2026 à 00h"));
test("fmtDay : heure UTC convertie en heure de Paris (été)", () => eq(D.fmtDay("2026-07-01-10"), "01/07/2026 à 12h"));

Promise.all(pending).then(() => {
  console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
  if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
});
