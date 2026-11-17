// Rendu en allemand : horaires, dates, unités, titres des options d'urgence. Les phrases doivent rester justes ET prudentes.
// Lancer : node tests/de.test.js   (rien à installer)
const assert = require("assert");
const { load } = require("./load");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}
const eq = (actual, expected) => assert.strictEqual(actual, expected, `obtenu « ${actual} », attendu « ${expected} »`);

const A = { ...load("js/app.js", ["formatDistance"], {}, "de"), ...load("js/dae-view.js", ["ACCESS_LABEL", "MAINT_LABEL", "fmtDate", "DAY_FR", "WEEK", "frDaySpec", "frTime", "ruleDays", "daysLabel", "mergeRules", "frHours"], {}, "de") };
const Q = load("js/quick.js", ["PICKS", "AV_LABEL"], {}, "de");
const D = load("js/format.js", ["fmtDay", "numberFormat"], {}, "de");
const DATA = load("js/data.js", ["fmtMo"], {}, "de");
const fr = (h) => A.frHours(h);

test("Öffnungszeiten : Woche, Wochenende und Feiertage geschlossen", () =>
  eq(fr("Mo-Fr 08:00-18:00; Sa-Su off; PH off"), "Montag bis Freitag: 8:00 bis 18:00; geschlossen am Wochenende und an Feiertagen"));
test("Öffnungszeiten : ein geschlossener Tag", () => eq(fr("Mo-Sa 09:00-19:00; Su off"), "Montag bis Samstag: 9:00 bis 19:00; geschlossen am Sonntag"));
test("Öffnungszeiten : Liste von Tagen", () => eq(fr("Mo,We,Fr 09:00-17:00"), "Montag, Mittwoch und Freitag: 9:00 bis 17:00"));
test("Öffnungszeiten : zwei Zeitfenster", () => eq(fr("Mo-Fr 08:30-12:00,14:00-18:00"), "Montag bis Freitag: 8:30 bis 12:00 und 14:00 bis 18:00"));
test("Öffnungszeiten : alles geschlossen", () => eq(fr("Mo-Su off"), "Geschlossen täglich"));
test("Öffnungszeiten : Feiertage geöffnet", () => eq(fr("PH 10:00-12:00"), "An Feiertagen: 10:00 bis 12:00"));
test("Öffnungszeiten : von Montag bis Freitag geschlossen", () => eq(fr("Sa-Su 10:00-12:00; Mo-Fr off"), "Am Wochenende: 10:00 bis 12:00; geschlossen Montag bis Freitag"));
test("Öffnungszeiten : rund um die Uhr", () => eq(fr("Mo-Fr 00:00-24:00"), "Montag bis Freitag: rund um die Uhr"));
test("unlesbare Öffnungszeiten : nichts erfunden", () => eq(fr("sur rendez-vous"), null));

test("Daten und Zahlen nach deutschen Regeln", () => {
  eq(A.fmtDate("2026-10-23"), "23.10.2026");
  eq(D.fmtDay("2026-10-26-23"), "27.10.2026 um 00:00 Uhr");
  eq(A.formatDistance(1234), "1,2\u00a0km");
  eq(DATA.fmtMo(1234567), "1,2\u00a0MB");
  eq(D.numberFormat(184335), "184.335");
});

// Vorsicht : keine Formulierung darf bestimmter werden als im Französischen
test("Zugänglichkeit : die Vorsichtsnuancen bleiben erhalten", () => {
  assert.match(Q.AV_LABEL.sure, /laut den angegebenen Öffnungszeiten/);
  assert.match(Q.AV_LABEL.likely, /^Wahrscheinlich zugänglich/);
  assert.match(Q.AV_LABEL.uncertain, /unsicher/);
  assert.match(Q.AV_LABEL.closed, /^Laut Öffnungszeiten geschlossen/);
});
test("Notfalloptionen : « kann geöffnet sein », « nicht bestätigt », « letzter Ausweg »", () => {
  const titles = [...Q.PICKS.adult, ...Q.PICKS.child].flatMap((choices) => choices.map(([title]) => title));
  assert.ok(titles.some((t) => /kann geöffnet sein/.test(t)));
  assert.ok(titles.some((t) => /nicht bestätigt/.test(t)));
  assert.ok(titles.some((t) => /^Letzter Ausweg: Ort laut Öffnungszeiten geschlossen, AED im Außenbereich/.test(t)));
  assert.ok(titles.some((t) => /^Letzter Ausweg: Zugang muss erbeten werden/.test(t)));
});
test("Wartung : « zweifelhaft » und « unbekannt » werden nicht zu « aktuell »", () => {
  eq(A.MAINT_LABEL.ok, "Wartung aktuell");
});
test("Zugang : « Öffnungszeiten unbekannt » bleibt erhalten", () => assert.match(A.ACCESS_LABEL.unknown, /unbekannt/));

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
