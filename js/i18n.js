// Traduction des textes produits par les scripts. Chargé avant les autres, sans rien utiliser du DOM à son chargement
// (les tests le chargent dans Node).
// Les textes eux-mêmes sont dans js/lang/<langue>.js, GÉNÉRÉS depuis lang/<langue>.json par scripts/build_site.py : chaque page ne
// charge que celui de sa langue, juste après ce fichier. Les textes écrits dans les pages (index.html…) sont rendus par le même script.
//
// - tr("clé", { param })     : texte, avec {param} remplacés. Insérer le résultat avec textContent, ou esc() dans du HTML.
// - trn("clé", n, { param }) : accord au pluriel, clés « clé.one » (n ≤ 1) et « clé.other » ; {n} est fourni.
// - Clés dites « HTML » (balises <a>, <b>, <br>… dans le texte) : à insérer avec innerHTML, et seulement avec des paramètres sûrs.
const STRINGS = {};

// La langue est celle de la page (<html lang="…">), à défaut le français
const LANG = typeof document !== "undefined" && document.documentElement.lang ? document.documentElement.lang : "fr";
let LOCALE = "fr-FR"; // réglé par js/lang/<langue>.js (valeur « locale » de LANGUAGES dans scripts/build_site.py)

// Un message dans la langue choisie, à défaut en français, à défaut la clé elle-même (visible : on le verrait vite)
function tr(key, params = {}) {
  const text = (STRINGS[LANG] && STRINGS[LANG][key]) ?? (STRINGS.fr && STRINGS.fr[key]) ?? key;
  return text.replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all));
}

function trn(key, n, params = {}) {
  return tr(`${key}.${n > 1 ? "other" : "one"}`, { n, ...params });
}
