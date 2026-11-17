// Liens directs ?cp=… et ?code_insee=… : lecture de l'adresse et choix des points à montrer.
// Lancer : node tests/places.test.js   (rien à installer)
const assert = require("assert");
const { load } = require("./load");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}
const P = load("js/places.js", ["PLACE_ZOOM", "DAE_ZOOM", "parseDaeParams", "parsePlaceParams", "resolvePlace", "withoutPlaceParams", "placeSearch", "rememberedPlace"], { URLSearchParams });
const json = (x) => JSON.stringify(x);
const eq = (actual, expected) => assert.strictEqual(actual, expected);

// Mini-table : Paris 2e (75102) et Paris entier (75056), deux communes partageant 01000, une commune en Corse
const table = {
  v: 1,
  c: { "75056": [2.3488, 48.8534], "75102": [2.3428, 48.8679], "01053": [5.2257, 46.2052], "01344": [5.2, 46.15], "2A004": [8.7376, 41.9267] },
  p: { "75002": ["75102"], "01000": ["01053", "01344"], "20000": ["2A004"], "99999": ["00000"] },
};

test("adresse sans paramètre : rien à faire", () => assert.strictEqual(json(P.parsePlaceParams("")), json({ cp: null, insee: null })));
test("code postal et code INSEE lus", () => assert.strictEqual(json(P.parsePlaceParams("?cp=75002&code_insee=75102")), json({ cp: "75002", insee: "75102" })));
test("code INSEE corse en minuscules accepté", () => assert.strictEqual(P.parsePlaceParams("?code_insee=2a004").insee, "2A004"));
test("valeurs mal formées ignorées", () => {
  for (const bad of ["?cp=7500", "?cp=750022", "?cp=abcde", "?cp=75%20002", "?code_insee=2C004", "?code_insee=", "?cp=75002;x"])
    assert.strictEqual(P.parsePlaceParams(bad).cp || P.parsePlaceParams(bad).insee, null, bad);
});
test("code postal d'une commune", () => assert.strictEqual(json(P.resolvePlace("?cp=75002", table)), json([[48.8679, 2.3428]])));
test("code postal partagé : toutes les communes", () => assert.strictEqual(P.resolvePlace("?cp=01000", table).length, 2));
test("code INSEE seul : une commune", () => assert.strictEqual(json(P.resolvePlace("?code_insee=01053", table)), json([[46.2052, 5.2257]])));
test("code INSEE de la ville entière (Paris)", () => assert.strictEqual(json(P.resolvePlace("?code_insee=75056", table)), json([[48.8534, 2.3488]])));
test("les deux : le code INSEE l'emporte", () => assert.strictEqual(json(P.resolvePlace("?cp=01000&code_insee=01344", table)), json([[46.15, 5.2]])));
test("code INSEE inconnu : repli sur le code postal", () => assert.strictEqual(P.resolvePlace("?code_insee=99000&cp=01000", table).length, 2));
test("code INSEE mal formé : repli sur le code postal", () => assert.strictEqual(P.resolvePlace("?code_insee=zz&cp=75002", table).length, 1));
test("code postal inconnu : rien", () => assert.strictEqual(P.resolvePlace("?cp=12345", table), null));
test("rien de reconnu : null", () => assert.strictEqual(P.resolvePlace("?code_insee=00000&cp=00000", table), null));
test("commune sans centre dans la table : ignorée", () => assert.strictEqual(P.resolvePlace("?cp=99999", table), null));
test("clés héritées d'un objet ne comptent pas", () => assert.strictEqual(P.resolvePlace("?cp=constructor", table), null));

// Lien vers un défibrillateur : ?gps_dae=lat,lon (+ id_dae facultatif)
test("gps_dae : coordonnées lues, id absent", () => eq(json(P.parseDaeParams("?gps_dae=43.59947,1.43335")), json({ gps: [43.59947, 1.43335], id: null })));
test("gps_dae avec id_dae", () => eq(json(P.parseDaeParams("?gps_dae=43.59947,1.43335&id_dae=12345")), json({ gps: [43.59947, 1.43335], id: 12345 })));
test("gps_dae : espace après la virgule et virgule codée acceptés", () => {
  eq(json(P.parseDaeParams("?gps_dae=43.59947, 1.43335")), json({ gps: [43.59947, 1.43335], id: null }));
  eq(json(P.parseDaeParams("?gps_dae=43.59947%2C1.43335")), json({ gps: [43.59947, 1.43335], id: null }));
});
test("gps_dae : beaucoup de décimales acceptées", () => eq(json(P.parseDaeParams("?gps_dae=43.597229999999996,1.42152000000001").gps), json([43.597229999999996, 1.42152000000001])));
test("gps_dae : valeurs négatives (outre-mer)", () => eq(json(P.parseDaeParams("?gps_dae=16.2411,-61.5331").gps), json([16.2411, -61.5331])));
test("gps_dae : valeurs fausses ignorées", () => {
  for (const bad of ["", "?gps_dae=", "?gps_dae=abc", "?gps_dae=43.6", "?gps_dae=43.6,1.4,5", "?gps_dae=95,1.4", "?gps_dae=43.6,200", "?gps_dae=0,0", "?gps_dae=43.6;1.4", "?gps_dae=<script>,1"]) {
    eq(json(P.parseDaeParams(bad)), json({ gps: null, id: null }));
  }
});
test("id_dae sans gps_dae valable ou mal formé : ignoré", () => {
  eq(json(P.parseDaeParams("?id_dae=12345")), json({ gps: null, id: null }));
  eq(P.parseDaeParams("?gps_dae=43.6,1.4&id_dae=12a").id, null);
  eq(P.parseDaeParams("?gps_dae=43.6,1.4&id_dae=-5").id, null);
});
test("retrait de gps_dae et id_dae, les autres paramètres restent", () => eq(P.withoutPlaceParams("?a=1&gps_dae=43.6,1.4&id_dae=7&cp=75002"), "?a=1"));
test("lieu mémorisé avec un défibrillateur : adresse équivalente", () => eq(P.placeSearch({ gps: [43.59947, 1.43335], id: 12345 }), "?gps_dae=43.59947%2C1.43335&id_dae=12345"));
test("lieu mémorisé : l'adresse équivalente se relit à l'identique", () => {
  const q = P.parseDaeParams(P.placeSearch({ gps: [43.59947, 1.43335], id: 12345 }));
  eq(json(q), json({ gps: [43.59947, 1.43335], id: 12345 }));
});
test("zoom d'un lien vers un défibrillateur : 18, comme « Voir sur la carte »", () => eq(P.DAE_ZOOM, 18));
test("retrait des deux paramètres de lieu", () => eq(P.withoutPlaceParams("?cp=75002&code_insee=75102"), ""));
test("les autres paramètres restent", () => eq(P.withoutPlaceParams("?utm_source=x&cp=75002&a=1"), "?utm_source=x&a=1"));
test("adresse sans paramètre inchangée", () => eq(P.withoutPlaceParams(""), ""));

test("lieu mémorisé : adresse équivalente", () => eq(P.placeSearch({ cp: "75002", insee: null }), "?cp=75002"));
test("lieu mémorisé avec les deux codes", () => eq(P.placeSearch({ cp: "75002", insee: "75102" }), "?cp=75002&code_insee=75102"));
test("lieu mémorisé vide ou absent", () => { eq(P.placeSearch({ cp: null, insee: null }), ""); eq(P.placeSearch(null), ""); });

const HOUR = 3600 * 1000;
test("lieu mémorisé récent : retrouvé", () => eq(P.rememberedPlace(json({ cp: "75004", insee: null, ts: 1000 }), 1000 + HOUR, 2 * HOUR), "?cp=75004"));
test("lieu mémorisé trop ancien : oublié", () => eq(P.rememberedPlace(json({ cp: "75004", insee: null, ts: 1000 }), 1000 + 3 * HOUR, 2 * HOUR), null));
test("lieu mémorisé sans date ou abîmé : oublié", () => {
  eq(P.rememberedPlace(json({ cp: "75004" }), 5, 2 * HOUR), null);
  eq(P.rememberedPlace("pas du json", 5, 2 * HOUR), null);
  eq(P.rememberedPlace(null, 5, 2 * HOUR), null);
});

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
failures.forEach((f) => console.log("  ✗ " + f));
process.exit(failures.length ? 1 : 0);
