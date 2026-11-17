// Rendu en italien : orari, date, unità, titoli delle opzioni di emergenza. Le frasi devono restare giuste E prudenti.
// Lancer : node tests/it.test.js   (rien à installer)
const assert = require("assert");
const { load } = require("./load");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}
const eq = (actual, expected) => assert.strictEqual(actual, expected, `obtenu « ${actual} », attendu « ${expected} »`);

const A = { ...load("js/app.js", ["formatDistance"], {}, "it"), ...load("js/dae-view.js", ["ACCESS_LABEL", "MAINT_LABEL", "fmtDate", "DAY_FR", "WEEK", "frDaySpec", "frTime", "ruleDays", "daysLabel", "mergeRules", "frHours"], {}, "it") };
const Q = load("js/quick.js", ["PICKS", "AV_LABEL"], {}, "it");
const D = load("js/format.js", ["fmtDay", "numberFormat"], {}, "it");
const DATA = load("js/data.js", ["fmtMo"], {}, "it");
const fr = (h) => A.frHours(h);

test("orari : settimana, fine settimana e festivi chiusi", () =>
  eq(fr("Mo-Fr 08:00-18:00; Sa-Su off; PH off"), "Da lunedì a venerdì: 8:00-18:00; chiuso nel fine settimana e nei giorni festivi"));
test("orari : un giorno chiuso", () => eq(fr("Mo-Sa 09:00-19:00; Su off"), "Da lunedì a sabato: 9:00-19:00; chiuso di domenica"));
test("orari : elenco di giorni", () => eq(fr("Mo,We,Fr 09:00-17:00"), "Lunedì, mercoledì e venerdì: 9:00-17:00"));
test("orari : due fasce", () => eq(fr("Mo-Fr 08:30-12:00,14:00-18:00"), "Da lunedì a venerdì: 8:30-12:00 e 14:00-18:00"));
test("orari : tutto chiuso", () => eq(fr("Mo-Su off"), "Chiuso tutti i giorni"));
test("orari : festivi aperti", () => eq(fr("PH 10:00-12:00"), "Nei giorni festivi: 10:00-12:00"));
test("orari : chiuso da lunedì a venerdì", () => eq(fr("Sa-Su 10:00-12:00; Mo-Fr off"), "Nel fine settimana: 10:00-12:00; chiuso da lunedì a venerdì"));
test("orari : 24 ore su 24", () => eq(fr("Mo-Fr 00:00-24:00"), "Da lunedì a venerdì: 24 ore su 24"));
test("orari illeggibili : nulla di inventato", () => eq(fr("sur rendez-vous"), null));

test("date e numeri con le regole dell'italiano", () => {
  eq(A.fmtDate("2026-10-23"), "23/10/2026");
  eq(D.fmtDay("2026-10-26-23"), "27/10/2026 alle 00:00");
  eq(A.formatDistance(1234), "1,2\u00a0km");
  eq(DATA.fmtMo(1234567), "1,2\u00a0MB");
  eq(D.numberFormat(184335), "184.335");
});

// prudenza : nessuna frase deve diventare più affermativa che in francese
test("accessibilità : le sfumature di prudenza restano", () => {
  assert.match(Q.AV_LABEL.sure, /secondo gli orari dichiarati/);
  assert.match(Q.AV_LABEL.likely, /^Probabilmente accessibile/);
  assert.match(Q.AV_LABEL.uncertain, /incerta/);
  assert.match(Q.AV_LABEL.closed, /^Chiuso secondo gli orari/);
});
test("opzioni di emergenza : « può essere aperto », « non confermato », « ultima risorsa »", () => {
  const titles = [...Q.PICKS.adult, ...Q.PICKS.child].flatMap((choices) => choices.map(([title]) => title));
  assert.ok(titles.some((t) => /può essere aperto/.test(t)));
  assert.ok(titles.some((t) => /non confermato/.test(t)));
  assert.ok(titles.some((t) => /^Ultima risorsa: luogo chiuso secondo gli orari, DAE all'esterno/.test(t)));
  assert.ok(titles.some((t) => /^Ultima risorsa: l'accesso va richiesto/.test(t)));
});
test("manutenzione : « dubbia » e « sconosciuta » non diventano « aggiornata »", () => {
  eq(A.MAINT_LABEL.ok, "Manutenzione aggiornata");
});
test("accesso : « orari sconosciuti » resta", () => assert.match(A.ACCESS_LABEL.unknown, /sconosciuti/));

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
