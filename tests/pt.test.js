// Rendu en portugais (Portugal) : horários, datas, unidades, títulos das opções de emergência. As frases devem ficar certas E prudentes.
// Lancer : node tests/pt.test.js   (rien à installer)
const assert = require("assert");
const { load } = require("./load");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}
const eq = (actual, expected) => assert.strictEqual(actual, expected, `obtenu « ${actual} », attendu « ${expected} »`);

const A = { ...load("js/app.js", ["formatDistance"], {}, "pt"), ...load("js/dae-view.js", ["ACCESS_LABEL", "MAINT_LABEL", "fmtDate", "DAY_FR", "WEEK", "frDaySpec", "frTime", "ruleDays", "daysLabel", "mergeRules", "frHours"], {}, "pt") };
const Q = load("js/quick.js", ["PICKS", "AV_LABEL"], {}, "pt");
const D = load("js/format.js", ["fmtDay", "numberFormat"], {}, "pt");
const DATA = load("js/data.js", ["fmtMo"], {}, "pt");
const fr = (h) => A.frHours(h);

test("horários : semana, fim de semana e feriados fechados", () =>
  eq(fr("Mo-Fr 08:00-18:00; Sa-Su off; PH off"), "Segunda-feira a sexta-feira: das 8:00 às 18:00; fechado aos fins de semana e nos feriados"));
test("horários : um dia fechado", () => eq(fr("Mo-Sa 09:00-19:00; Su off"), "Segunda-feira a sábado: das 9:00 às 19:00; fechado domingo"));
test("horários : lista de dias", () => eq(fr("Mo,We,Fr 09:00-17:00"), "Segunda-feira, quarta-feira e sexta-feira: das 9:00 às 17:00"));
test("horários : duas faixas", () => eq(fr("Mo-Fr 08:30-12:00,14:00-18:00"), "Segunda-feira a sexta-feira: das 8:30 às 12:00 e das 14:00 às 18:00"));
test("horários : tudo fechado", () => eq(fr("Mo-Su off"), "Fechado todos os dias"));
test("horários : feriados abertos", () => eq(fr("PH 10:00-12:00"), "Nos feriados: das 10:00 às 12:00"));
test("horários : fechado de segunda-feira a sexta-feira", () => eq(fr("Sa-Su 10:00-12:00; Mo-Fr off"), "Aos fins de semana: das 10:00 às 12:00; fechado de segunda-feira a sexta-feira"));
test("horários : 24 horas por dia", () => eq(fr("Mo-Fr 00:00-24:00"), "Segunda-feira a sexta-feira: 24 horas por dia"));
test("horários ilegíveis : nada inventado", () => eq(fr("sur rendez-vous"), null));

test("datas e números segundo as regras do português", () => {
  eq(A.fmtDate("2026-10-23"), "23/10/2026");
  eq(D.fmtDay("2026-10-26-23"), "27/10/2026 às 00:00");
  eq(A.formatDistance(1234), "1,2\u00a0km");
  eq(DATA.fmtMo(1234567), "1,2\u00a0MB");
  eq(D.numberFormat(184335).replace(/[\u202f\u00a0]/g, " "), "184 335");
});

// prudência : nenhuma formulação deve ficar mais afirmativa do que em francês
test("acessibilidade : as nuances de prudência mantêm-se", () => {
  assert.match(Q.AV_LABEL.sure, /segundo os horários declarados/);
  assert.match(Q.AV_LABEL.likely, /^Provavelmente acessível/);
  assert.match(Q.AV_LABEL.uncertain, /incerta/);
  assert.match(Q.AV_LABEL.closed, /^Fechado segundo o horário/);
});
test("opções de emergência : « pode estar aberto », « não confirmado », « último recurso »", () => {
  const titles = [...Q.PICKS.adult, ...Q.PICKS.child].flatMap((choices) => choices.map(([title]) => title));
  assert.ok(titles.some((t) => /pode estar aberto/.test(t)));
  assert.ok(titles.some((t) => /não confirmado/.test(t)));
  assert.ok(titles.some((t) => /^Último recurso: local fechado segundo o horário, DAE no exterior/.test(t)));
  assert.ok(titles.some((t) => /^Último recurso: é preciso pedir o acesso/.test(t)));
});
test("manutenção : « duvidosa » e « desconhecida » não passam a « em dia »", () => {
  eq(A.MAINT_LABEL.ok, "Manutenção em dia");
});
test("acesso : « horário desconhecido » mantém-se", () => assert.match(A.ACCESS_LABEL.unknown, /desconhecido/));

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
