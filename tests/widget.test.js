// Générateur de lien vers la carte (page Guide) : l'extrait produit est autonome, correct et échappé.
// Lancer : node tests/widget.test.js   (rien à installer)
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { load } = require("./load");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}
const eq = (actual, expected) => assert.strictEqual(actual, expected);

const logos = load("js/widget-logo.js", ["WIDGET_LOGO_ANIMATED", "WIDGET_LOGO_STATIC", "WIDGET_ANIMATION_CSS"]);
const W = load("js/widget.js", ["WIDGET_THEMES", "WIDGET_FORMATS", "WIDGET_ARROW", "widgetEscape", "widgetPlaceParam", "widgetHref", "widgetDefaultText", "widgetCss", "widgetSnippet"], logos);
const P = load("js/places.js", ["parsePlaceParams"], { URLSearchParams });

const langs = {
  fr: { name: "Français", url: "https://exemple.test/", generic: "Trouver un défibrillateur près de chez vous", place: "Trouver un défibrillateur à {name}" },
  de: { name: "Deutsch", url: "https://exemple.test/index.de.html", generic: "Defibrillator in Ihrer Nähe finden", place: "Defibrillator in {name} finden" },
};
const base = { format: "button", lang: "fr", placeKind: "none", placeValue: "", placeName: "", text: "", theme: "green", animated: false };
const make = (over) => W.widgetSnippet({ ...base, ...over }, langs);

test("code postal : cinq chiffres, sinon rien", () => {
  eq(W.widgetPlaceParam("cp", "75011"), "cp=75011");
  eq(W.widgetPlaceParam("cp", " 75011 "), "cp=75011");
  for (const bad of ["7501", "750111", "abcde", "75 011", "", "75011;x"]) eq(W.widgetPlaceParam("cp", bad), null, bad);
});
test("code INSEE : cinq caractères, la Corse en 2A ou 2B", () => {
  eq(W.widgetPlaceParam("insee", "75102"), "code_insee=75102");
  eq(W.widgetPlaceParam("insee", "2a004"), "code_insee=2A004");
  eq(W.widgetPlaceParam("insee", "2B033"), "code_insee=2B033");
  for (const bad of ["2C004", "7510", "abcde", ""]) eq(W.widgetPlaceParam("insee", bad), null, bad);
});
test("sans lieu choisi, un code saisi ne compte pas", () => eq(W.widgetPlaceParam("none", "75011"), null));
test("mêmes règles que le lien direct de la carte (js/places.js)", () => {
  for (const [kind, key, values] of [["cp", "cp", ["75011", "7501", "750111", "abcde", "75011;x", "00000"]], ["insee", "insee", ["75102", "2a004", "2B033", "2C004", "7510", "zzzzz", "01053"]]]) {
    for (const v of values) {
      const widget = W.widgetPlaceParam(kind, v) !== null;
      const map = P.parsePlaceParams(`?${kind === "cp" ? "cp" : "code_insee"}=${v}`)[key] !== null;
      eq(widget, map, `${kind} ${v}`);
    }
  }
});

test("adresse du lien : la carte de la langue, avec le lieu", () => {
  eq(W.widgetHref({ ...base }, langs), "https://exemple.test/");
  eq(W.widgetHref({ ...base, placeKind: "cp", placeValue: "75011" }, langs), "https://exemple.test/?cp=75011");
  eq(W.widgetHref({ ...base, lang: "de", placeKind: "insee", placeValue: "2a004" }, langs), "https://exemple.test/index.de.html?code_insee=2A004");
  eq(W.widgetHref({ ...base, lang: "de", placeKind: "cp", placeValue: "12" }, langs), "https://exemple.test/index.de.html"); // code invalide : pas de lieu
});
test("texte par défaut : formule générique, ou formule avec le nom de la commune", () => {
  eq(W.widgetDefaultText({ ...base }, langs), "Trouver un défibrillateur près de chez vous");
  eq(W.widgetDefaultText({ ...base, placeKind: "cp", placeName: "Paris 11e" }, langs), "Trouver un défibrillateur à Paris 11e");
  eq(W.widgetDefaultText({ ...base, lang: "de", placeKind: "cp", placeName: "Köln" }, langs), "Defibrillator in Köln finden");
  eq(W.widgetDefaultText({ ...base, placeKind: "none", placeName: "Paris" }, langs), "Trouver un défibrillateur près de chez vous"); // un nom sans lieu ne change rien
  eq(W.widgetDefaultText({ ...base, placeKind: "cp", placeName: "   " }, langs), "Trouver un défibrillateur près de chez vous");
});

test("lien texte : une simple ligne, sans style ni logo", () => {
  const html = make({ format: "link" });
  eq(html, '<a href="https://exemple.test/" lang="fr" hreflang="fr" rel="noopener">Trouver un défibrillateur près de chez vous</a>');
});
test("le texte saisi est échappé (aucune balise ne passe)", () => {
  const html = make({ format: "link", text: '<img src=x onerror="alert(1)"> & "ok"' });
  assert.ok(!html.includes("<img"), html);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;ok&quot;"), html);
});
test("le nom de la commune saisi est échappé aussi", () => {
  const html = make({ format: "link", placeKind: "cp", placeValue: "75011", placeName: "<b>Paris</b>" });
  assert.ok(!html.includes("<b>"), html);
});
test("bouton et badge : style, logo, texte ; la flèche seulement sur le bouton", () => {
  const button = make({ format: "button" });
  const badge = make({ format: "badge" });
  for (const html of [button, badge]) {
    assert.ok(html.startsWith("<style>"), "style en tête");
    assert.ok(html.includes('class="aedw"') && html.includes('class="aedw-logo"') && html.includes('class="aedw-text"'));
    assert.ok(html.includes('href="https://exemple.test/"') && html.includes('rel="noopener"'));
  }
  assert.ok(button.includes("aedw-arrow") && !badge.includes("aedw-arrow"));
});
test("extrait autonome : ni script, ni image, ni feuille de style, ni adresse externe en dehors du lien", () => {
  for (const format of ["button", "badge", "link"]) {
    for (const animated of [false, true]) {
      const html = make({ format, animated, placeKind: "cp", placeValue: "75011" });
      assert.ok(!/<script|<img|<link|<iframe|@import|src=/i.test(html), `${format} ${animated}`);
      eq((html.match(/https?:\/\//g) || []).length, 1, `${format} ${animated} : une seule adresse, celle du lien`);
      assert.ok(!/url\((?!#)/.test(html), `${format} ${animated} : url() limité aux références internes`);
    }
  }
});
test("logo fixe : sans éléments animés ; logo animé : avec, et le CSS de l'animation", () => {
  const still = make({ format: "button", animated: false });
  const animated = make({ format: "button", animated: true });
  assert.ok(!still.includes("aedw-wave1") && !still.includes("@keyframes"), "rien d'animé");
  assert.ok(animated.includes("aedw-wave1") && animated.includes("aedw-big") && animated.includes("aedw-zap") && animated.includes("aedw-flash"));
  assert.ok(animated.includes("@keyframes aedw-big") && animated.includes("prefers-reduced-motion"), "animation et règle « réduire »");
});
test("l'animation du code donné est celle du site (css/page.css) sous d'autres noms de classes", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "page.css"), "utf8");
  const names = [...css.matchAll(/@keyframes (la-[\w-]+)/g)].map((m) => m[1]);
  assert.ok(names.length >= 5, "les images clés du logo existent dans la page");
  for (const name of names) assert.ok(logos.WIDGET_ANIMATION_CSS.includes(`@keyframes ${name.replace("la-", "aedw-")}`), name);
  assert.ok(!logos.WIDGET_ANIMATION_CSS.includes("la-"), "aucun nom de classe du site ne reste");
});
test("coins concentriques : rayon du bouton = écart + rayon extérieur du logo (bouton et badge)", () => {
  for (const format of ["button", "badge"]) {
    const css = W.widgetCss({ ...base, format });
    const f = W.WIDGET_FORMATS[format];
    const radius = +css.match(/border-radius:([\d.]+)px;background/)[1];
    const outer = +css.match(/\.aedw-logo\{[^}]*border-radius:([\d.]+)px/)[1];
    assert.ok(Math.abs(radius - (f.gap + outer)) < 0.02, `${format} : ${radius} ≠ ${f.gap} + ${outer}`);
  }
});
test("thèmes : couleurs de chaque thème, vert par défaut si le thème est inconnu", () => {
  assert.ok(W.widgetCss({ ...base, theme: "dark" }).includes("#17181a"));
  assert.ok(W.widgetCss({ ...base, theme: "light" }).includes("#eef6f1"));
  assert.ok(W.widgetCss({ ...base, theme: "inconnu" }).includes("#237F52"));
});
test("un extrait de chaque format reste court", () => {
  assert.ok(make({ format: "link" }).length < 200);
  assert.ok(make({ format: "button" }).length < 9000);
  assert.ok(make({ format: "button", animated: true }).length < 16000);
});

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
