// Rendu en espagnol : horaires, dates, unités, titres des options d'urgence. Les phrases doivent rester justes ET prudentes.
// Lancer : node tests/es.test.js   (rien à installer)
const assert = require("assert");
const { load } = require("./load");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}
const eq = (actual, expected) => assert.strictEqual(actual, expected, `obtenu « ${actual} », attendu « ${expected} »`);

const A = { ...load("js/app.js", ["formatDistance"], {}, "es"), ...load("js/dae-view.js", ["ACCESS_LABEL", "MAINT_LABEL", "fmtDate", "DAY_FR", "WEEK", "frDaySpec", "frTime", "ruleDays", "daysLabel", "mergeRules", "frHours"], {}, "es") };
const Q = load("js/quick.js", ["PICKS", "AV_LABEL"], {}, "es");
const D = load("js/format.js", ["fmtDay", "numberFormat"], {}, "es");
const DATA = load("js/data.js", ["fmtMo"], {}, "es");
const fr = (h) => A.frHours(h);

test("horarios : semana, fin de semana y festivos cerrados", () =>
  eq(fr("Mo-Fr 08:00-18:00; Sa-Su off; PH off"), "Lunes a viernes: 8:00 a 18:00; cerrado los fines de semana y los festivos"));
test("horarios : un día cerrado", () => eq(fr("Mo-Sa 09:00-19:00; Su off"), "Lunes a sábado: 9:00 a 19:00; cerrado el domingo"));
test("horarios : lista de días", () => eq(fr("Mo,We,Fr 09:00-17:00"), "Lunes, miércoles y viernes: 9:00 a 17:00"));
test("horarios : dos franjas", () => eq(fr("Mo-Fr 08:30-12:00,14:00-18:00"), "Lunes a viernes: 8:30 a 12:00 y 14:00 a 18:00"));
test("horarios : todo cerrado", () => eq(fr("Mo-Su off"), "Cerrado todos los días"));
test("horarios : festivos abiertos", () => eq(fr("PH 10:00-12:00"), "Los festivos: 10:00 a 12:00"));
test("horarios : cerrado de lunes a viernes", () => eq(fr("Sa-Su 10:00-12:00; Mo-Fr off"), "Los fines de semana: 10:00 a 12:00; cerrado de lunes a viernes"));
test("horarios ilegibles : nada inventado", () => eq(fr("sur rendez-vous"), null));

test("fechas y números con las reglas del español", () => {
  eq(A.fmtDate("2026-10-23"), "23/10/2026");
  eq(D.fmtDay("2026-10-26-23"), "27/10/2026 a las 00:00");
  eq(A.formatDistance(1234), "1,2\u00a0km");
  eq(DATA.fmtMo(1234567), "1,2\u00a0MB");
  eq(D.numberFormat(184335), "184.335");
});

// prudencia : ninguna frase debe volverse más afirmativa que en francés
test("disponibilidad : se conservan los matices de prudencia", () => {
  assert.match(Q.AV_LABEL.sure, /según los horarios declarados/);
  assert.match(Q.AV_LABEL.likely, /^Probablemente accesible/);
  assert.match(Q.AV_LABEL.uncertain, /incierta/);
  assert.match(Q.AV_LABEL.closed, /según el horario/);
});
test("opciones de emergencia : « puede estar abierto », « no confirmado », « último recurso »", () => {
  const titles = [...Q.PICKS.adult, ...Q.PICKS.child].flatMap((choices) => choices.map(([title]) => title));
  assert.ok(titles.some((t) => /puede estar abierto/.test(t)));
  assert.ok(titles.some((t) => /no confirmado/.test(t)));
  assert.ok(titles.some((t) => /^Último recurso: lugar cerrado según el horario, DEA en el exterior/.test(t)));
  assert.ok(titles.some((t) => /^Último recurso: hay que pedir el acceso/.test(t)));
});
test("mantenimiento : « dudoso » y « desconocido » no se vuelven « al día »", () => {
  eq(A.MAINT_LABEL.ok, "Mantenimiento al día");
});
test("acceso : « horario desconocido » se conserva", () => assert.match(A.ACCESS_LABEL.unknown, /desconocido/));

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
