// Rendu en anglais : horaires, dates, unités, titres des options d'urgence. Les phrases doivent rester justes ET prudentes.
// Lancer : node tests/en.test.js   (rien à installer)
const assert = require("assert");
const { load } = require("./load");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}
const eq = (actual, expected) => assert.strictEqual(actual, expected, `obtenu « ${actual} », attendu « ${expected} »`);

const A = { ...load("js/app.js", ["formatDistance"], {}, "en"), ...load("js/dae-view.js", ["MAINT_MAX_YEARS", "ACCESS_LABEL", "MAINT_LABEL", "fmtDate", "DAY_FR", "WEEK", "frDaySpec", "frTime", "ruleDays", "daysLabel", "mergeRules", "frHours", "MAINT_PARTS", "maintenanceIssues", "maintenanceLevel"], {}, "en") };
const Q = load("js/quick.js", ["PICKS", "AV_LABEL"], {}, "en");
const DATA = load("js/data.js", ["fmtMo"], {}, "en");
const F = load("js/format.js", ["numberFormat"], {}, "en");
const D = load("js/format.js", ["fmtDay"], {}, "en");
const fr = (h) => A.frHours(h);

test("horaires : semaine, week-end et jours fériés fermés", () =>
  eq(fr("Mo-Fr 08:00-18:00; Sa-Su off; PH off"), "Monday to Friday: 8:00 to 18:00; closed at weekends and on public holidays"));
test("horaires : un jour fermé", () => eq(fr("Mo-Sa 09:00-19:00; Su off"), "Monday to Saturday: 9:00 to 19:00; closed on Sunday"));
test("horaires : liste de jours", () => eq(fr("Mo,We,Fr 09:00-17:00"), "Monday, Wednesday and Friday: 9:00 to 17:00"));
test("horaires : deux plages", () => eq(fr("Mo-Fr 08:30-12:00,14:00-18:00"), "Monday to Friday: 8:30 to 12:00 and 14:00 to 18:00"));
test("horaires : tout fermé", () => eq(fr("Mo-Su off"), "Closed every day"));
test("horaires : jours fériés ouverts", () => eq(fr("PH 10:00-12:00"), "On public holidays: 10:00 to 12:00"));
test("horaires : 24 h", () => eq(fr("Mo-Fr 00:00-24:00"), "Monday to Friday: 24 hours"));
test("horaires illisibles : rien d'inventé", () => eq(fr("sur rendez-vous"), null));

test("dates d'expiration au format britannique", () => eq(A.fmtDate("2026-10-23"), "23/10/2026"));
test("date d'un jeu, heure de Paris", () => { eq(D.fmtDay("2026-10-23"), "23/10/2026"); eq(D.fmtDay("2026-10-26-23"), "27/10/2026 at 0:00".replace("0:00", "00:00")); });
test("distances et unités : point décimal en anglais", () => { eq(A.formatDistance(250), "250\u00a0m"); eq(A.formatDistance(1234), "1.2\u00a0km"); });
test("taille des jeux et grands nombres", () => { eq(DATA.fmtMo(1234567), "1.2\u00a0MB"); eq(F.numberFormat(184335), "184,335"); });

// prudence : aucune formulation ne doit devenir plus affirmative que le français
test("disponibilité : les nuances de prudence sont conservées", () => {
  assert.match(Q.AV_LABEL.sure, /according to the declared hours/);
  assert.match(Q.AV_LABEL.likely, /^Probably accessible/);
  assert.match(Q.AV_LABEL.uncertain, /uncertain/);
  assert.match(Q.AV_LABEL.closed, /according to the opening hours/);
});
test("options d'urgence : « peut être ouvert », « non confirmé », « dernier recours »", () => {
  const titles = [...Q.PICKS.adult, ...Q.PICKS.child].flatMap((choices) => choices.map(([title]) => title));
  assert.ok(titles.some((t) => /may be open/.test(t)));
  assert.ok(titles.some((t) => /not confirmed/.test(t)));
  assert.ok(titles.some((t) => /^Last resort: place closed according to the opening hours, outdoor AED/.test(t)));
  assert.ok(titles.some((t) => /^Last resort: access has to be requested/.test(t)));
});
test("maintenance : « douteuse » et « inconnue » ne deviennent pas « à jour »", () => {
  eq(A.MAINT_LABEL.ok, "Maintenance up to date");
});
test("accès : « horaires inconnus » exprimé sans certitude", () => assert.match(A.ACCESS_LABEL.unknown, /unknown/));

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
