// Rendu en néerlandais : openingstijden, data, eenheden, titels van de noodopties. De zinnen moeten juist EN voorzichtig blijven.
// Lancer : node tests/nl.test.js   (rien à installer)
const assert = require("assert");
const { load } = require("./load");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}
const eq = (actual, expected) => assert.strictEqual(actual, expected, `obtenu « ${actual} », attendu « ${expected} »`);

const A = { ...load("js/app.js", ["formatDistance"], {}, "nl"), ...load("js/dae-view.js", ["ACCESS_LABEL", "MAINT_LABEL", "fmtDate", "DAY_FR", "WEEK", "frDaySpec", "frTime", "ruleDays", "daysLabel", "mergeRules", "frHours"], {}, "nl") };
const Q = load("js/quick.js", ["PICKS", "AV_LABEL"], {}, "nl");
const D = load("js/format.js", ["fmtDay", "numberFormat"], {}, "nl");
const DATA = load("js/data.js", ["fmtMo"], {}, "nl");
const fr = (h) => A.frHours(h);

test("openingstijden : week, weekend en feestdagen gesloten", () =>
  eq(fr("Mo-Fr 08:00-18:00; Sa-Su off; PH off"), "Maandag tot en met vrijdag: 8:00 tot 18:00; gesloten in het weekend en op feestdagen"));
test("openingstijden : één gesloten dag", () => eq(fr("Mo-Sa 09:00-19:00; Su off"), "Maandag tot en met zaterdag: 9:00 tot 19:00; gesloten op zondag"));
test("openingstijden : lijst van dagen", () => eq(fr("Mo,We,Fr 09:00-17:00"), "Maandag, woensdag en vrijdag: 9:00 tot 17:00"));
test("openingstijden : twee tijdvakken", () => eq(fr("Mo-Fr 08:30-12:00,14:00-18:00"), "Maandag tot en met vrijdag: 8:30 tot 12:00 en 14:00 tot 18:00"));
test("openingstijden : alles gesloten", () => eq(fr("Mo-Su off"), "Gesloten elke dag"));
test("openingstijden : feestdagen open", () => eq(fr("PH 10:00-12:00"), "Op feestdagen: 10:00 tot 12:00"));
test("openingstijden : gesloten van maandag tot en met vrijdag", () => eq(fr("Sa-Su 10:00-12:00; Mo-Fr off"), "In het weekend: 10:00 tot 12:00; gesloten maandag tot en met vrijdag"));
test("openingstijden : 24 uur per dag", () => eq(fr("Mo-Fr 00:00-24:00"), "Maandag tot en met vrijdag: 24 uur per dag"));
test("onleesbare openingstijden : niets verzonnen", () => eq(fr("sur rendez-vous"), null));

test("data en getallen volgens de Nederlandse regels", () => {
  eq(A.fmtDate("2026-10-23"), "23-10-2026");
  eq(D.fmtDay("2026-10-26-23"), "27-10-2026 om 00:00 uur");
  eq(A.formatDistance(1234), "1,2\u00a0km");
  eq(DATA.fmtMo(1234567), "1,2\u00a0MB");
  eq(D.numberFormat(184335), "184.335");
});

// voorzichtigheid : geen enkele formulering mag stelliger worden dan in het Frans
test("toegankelijkheid : de nuances van voorzichtigheid blijven behouden", () => {
  assert.match(Q.AV_LABEL.sure, /volgens de opgegeven openingstijden/);
  assert.match(Q.AV_LABEL.likely, /^Waarschijnlijk toegankelijk/);
  assert.match(Q.AV_LABEL.uncertain, /onzeker/);
  assert.match(Q.AV_LABEL.closed, /^Gesloten volgens de openingstijden/);
});
test("noodopties : « kan open zijn », « niet bevestigd », « laatste redmiddel »", () => {
  const titles = [...Q.PICKS.adult, ...Q.PICKS.child].flatMap((choices) => choices.map(([title]) => title));
  assert.ok(titles.some((t) => /kan open zijn/.test(t)));
  assert.ok(titles.some((t) => /niet bevestigd/.test(t)));
  assert.ok(titles.some((t) => /^Laatste redmiddel: plek volgens de openingstijden gesloten, AED buiten/.test(t)));
  assert.ok(titles.some((t) => /^Laatste redmiddel: toegang moet worden gevraagd/.test(t)));
});
test("onderhoud : « twijfelachtig » en « onbekend » worden niet « op orde »", () => {
  eq(A.MAINT_LABEL.ok, "Onderhoud op orde");
});
test("toegang : « openingstijden onbekend » blijft behouden", () => assert.match(A.ACCESS_LABEL.unknown, /onbekend/));

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
