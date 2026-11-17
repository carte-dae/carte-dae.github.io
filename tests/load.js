// Charge des fonctions et constantes de js/*.js dans un contexte Node, sans navigateur.
// On extrait les déclarations de premier niveau par leur nom (le reste du fichier touche à la carte et au DOM).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extract(source, name) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^(?:async\\s+)?(?:function\\s+${name}\\b|(?:const|let)\\s+${name}\\b)`).test(l));
  if (start < 0) throw new Error(`Déclaration introuvable : ${name}`);
  const isFunction = /^(?:async\s+)?function/.test(lines[start]);
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    // fonction : « } » en colonne 0 ; constante : ligne finissant par « ; » et suivie d'une ligne vide ou d'une autre déclaration en colonne 0
    const closes = isFunction ? l === "}" : /;\s*(\/\/.*)?$/.test(l) && (i + 1 >= lines.length || /^($|[^\s}\])])/.test(lines[i + 1]));
    if (closes) return lines.slice(start, i + 1).join("\n");
  }
  throw new Error(`Fin de déclaration introuvable : ${name}`);
}

// load("js/quick.js", ["openState", ...], { MAINT_MAX_YEARS: 5 }) -> objet des déclarations demandées
function load(file, names, globals = {}, lang = "fr") {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  // les textes (js/i18n.js) sont toujours disponibles, comme dans la page où il est chargé en premier
  const files = ["i18n.js", `lang/${lang}.js`, ...(file === "js/format.js" ? [] : ["format.js"])];
  const i18n = files.map((f) => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8")).join("\n");
  const code = i18n + "\n" + names.map((n) => extract(source, n)).join("\n") + `\n({ ${names.join(", ")} })`;
  // la langue de la page est lue dans <html lang> : on la simule
  const document = { documentElement: { lang } };
  return vm.runInNewContext(code, { Intl, Date, Math, JSON, Set, Object, Number, document, ...globals });
}

module.exports = { load };
