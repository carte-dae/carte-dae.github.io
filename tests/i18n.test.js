// Tests des textes : lang/<langue>.json est la seule source, les modèles et les scripts en dépendent.
// (Que les pages générées soient à jour est vérifié par tests/test_pages.py.)
// Lancer : node tests/i18n.test.js   (rien à installer)
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const langs = fs.readdirSync(path.join(root, "lang")).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
const dict = (lang) => JSON.parse(read(`lang/${lang}.json`));
const fr = dict("fr");
const runtime = (document, lang = "fr") => vm.runInNewContext(read("js/i18n.js") + "\n" + read(`js/lang/${lang}.js`) + "\n({ STRINGS, tr, trn, LANG, LOCALE })", document ? { document } : {});

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n").slice(0, 40).join("\n    ")}`); }
}
const stem = (key) => key.replace(/\.(one|other)$/, "");

// Premier argument de chaque appel tr( / trn( : ce qui précède la première virgule ou parenthèse fermante
function keysCalled(source) {
  const keys = [];
  for (const m of source.matchAll(/\btrn?\(/g)) {
    let i = m.index + m[0].length;
    let arg = "";
    while (i < source.length && ![",", ")"].includes(source[i])) arg += source[i++];
    for (const k of arg.matchAll(/["'`]([a-z]+(?:\.[A-Za-z0-9]+)+)["'`]/g)) keys.push(k[1]);
  }
  return keys;
}

// Clés demandées par les modèles et le contenu des pages : {{t:clé}}, {{a:clé}}, {{h:clé}}
function keysInTemplates() {
  const list = (dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".html")).map((f) => `${dir}/${f}`);
  const files = [...list("templates"), ...list("templates/partials"), ...list("content")];
  const fromTemplates = files.flatMap((f) => [...read(f).matchAll(/\{\{[tahq]:([\w.]+)\}\}/g)].map((m) => m[1]));
  // textes demandés directement par le script de génération (données structurées)
  const fromBuilder = [...read("scripts/build_site.py").matchAll(/lookup\("([\w.]+)"/g)].map((m) => m[1]);
  return [...fromTemplates, ...fromBuilder];
}

const jsFiles = ["js/app.js", "js/dae-view.js", "js/quick.js", "js/data.js", "js/format.js", "js/guide.js", "js/guide-infocards.js", "js/widget.js"];
const called = jsFiles.flatMap((f) => keysCalled(read(f)));

test("les scripts n'appellent que des textes envoyés au navigateur (section « script »)", () => {
  const missing = called.filter((k) => !(k in fr.script) && !(`${k}.one` in fr.script && `${k}.other` in fr.script));
  assert.deepStrictEqual([...new Set(missing)], []);
});

test("les modèles ne demandent que des textes qui existent", () => {
  const missing = keysInTemplates().filter((k) => !(k in fr.page) && !(k in fr.script));
  assert.deepStrictEqual([...new Set(missing)], []);
});

test("aucun texte n'est orphelin (ni dans « page », ni dans « script »)", () => {
  const used = new Set([...called, ...keysInTemplates()]);
  const orphans = [...Object.keys(fr.page), ...Object.keys(fr.script)].filter((k) => !used.has(k) && !used.has(stem(k)));
  assert.deepStrictEqual(orphans, []);
});

test("une clé n'est pas dans « page » et « script » à la fois, et une clé de « page » n'est jamais appelée par un script", () => {
  const both = Object.keys(fr.page).filter((k) => k in fr.script);
  assert.deepStrictEqual(both, []);
  assert.deepStrictEqual([...new Set(called.filter((k) => k in fr.page))], []);
});

test("js/lang/fr.js contient exactement la section « script » (fichier généré à jour)", () => {
  const { STRINGS } = runtime();
  assert.deepStrictEqual({ ...STRINGS.fr }, fr.script);
});

test("chaque langue a exactement les clés du français, avec les mêmes {paramètres}", () => {
  const params = (t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  const problems = [];
  for (const lang of langs.filter((l) => l !== "fr")) {
    const d = dict(lang);
    for (const section of ["page", "script"]) {
      for (const k of Object.keys(fr[section])) {
        if (!(k in d[section])) problems.push(`${lang} : clé manquante ${section}/${k}`);
        else if (params(d[section][k]) !== params(fr[section][k])) problems.push(`${lang} : paramètres différents pour ${k}`);
      }
      for (const k of Object.keys(d[section])) if (!(k in fr[section])) problems.push(`${lang} : clé en trop ${section}/${k}`);
    }
  }
  assert.deepStrictEqual(problems, []);
});

test("numéros d'urgence : 15 puis 112 en français, 112 puis 15 dans les autres langues", () => {
  const problems = [];
  const at = (text, n) => { const m = new RegExp(`(?<!\\d)${n}(?!\\d)`).exec(text); return m ? m.index : -1; };
  for (const lang of langs) {
    const first = lang === "fr" ? "15" : "112";
    const second = lang === "fr" ? "112" : "15";
    for (const section of ["page", "script"]) {
      for (const [key, text] of Object.entries(dict(lang)[section])) {
        const a = at(text, first), b = at(text, second);
        if (a >= 0 && b >= 0 && a > b) problems.push(`${lang} : ${key} cite le ${second} avant le ${first}`);
      }
    }
  }
  assert.deepStrictEqual(problems, []);
});

test("la langue est celle de <html lang>, à défaut le français", () => {
  const withLang = (lang, file = lang || "fr") => runtime({ documentElement: { lang } }, file);
  assert.strictEqual(withLang("fr").LANG, "fr");
  assert.strictEqual(withLang("").LANG, "fr");
  assert.strictEqual(withLang("fr").LOCALE, "fr-FR");
  assert.strictEqual(withLang("en").LANG, "en");
  assert.strictEqual(withLang("en").LOCALE, "en-GB"); // le réglage vient du fichier de la langue chargée
});

test("tr : paramètres remplacés, jamais re-lus, et clé absente visible", () => {
  const { tr } = runtime();
  assert.strictEqual(tr("unit.km", { n: "{n}" }), "{n} km");
  assert.strictEqual(tr("clé.inexistante"), "clé.inexistante");
});

test("trn : singulier pour 0 et 1, pluriel au-delà", () => {
  const { trn } = runtime();
  assert.strictEqual(trn("status.count", 1), "1 défibrillateur affiché");
  assert.strictEqual(trn("status.count", 2), "2 défibrillateurs affichés");
});

test("plus aucun texte français en dur dans les scripts de l'interface", () => {
  // une chaîne ou un gabarit qui contient un mot courant, hors commentaires et clés internes
  const suspicious = [];
  for (const f of jsFiles) {
    read(f).split("\n").forEach((line, n) => {
      if (line.includes("new Error(")) return; // messages internes, jamais affichés
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
        const text = m[2];
        if (/\b(de|du|des|le|la|les|un|une|pour|votre|vous|aucun|aucune|erreur|fermer|annuler)\b/i.test(text) && /\s/.test(text) && !/^\^|\\\\[dsw]|\(\?:/.test(text)) {
          suspicious.push(`${f}:${n + 1} ${text.slice(0, 60)}`);
        }
      }
    });
  }
  assert.strictEqual(suspicious.join("\n"), "");
});

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
if (failures.length) { console.log("\n" + failures.map((f) => "✗ " + f).join("\n")); process.exit(1); }
