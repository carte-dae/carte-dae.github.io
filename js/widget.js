// Générateur de lien vers la carte (page « Guide ») : il produit un extrait HTML autonome, que d'autres sites collent tel quel.
// Style et logo sont dans l'extrait lui-même : aucun script, aucune image ni feuille de style appelée depuis ce site, rien à maintenir de leur côté.
// Les logos et le CSS de l'animation viennent de js/widget-logo.js (généré par sources/generer_icones.py --logo-anime, à partir de css/page.css).
// Chargé après i18n.js et widget-logo.js.

const WIDGET_THEMES = {
  green: { bg: "#237F52", hover: "#1d6b45", fg: "#fff", ring: "#fff", shadow: "0 6px 18px rgba(16,40,28,.28),0 1px 4px rgba(0,0,0,.2)" },
  light: { bg: "#fff", hover: "#eef6f1", fg: "#1d1d1f", ring: "#237F52", shadow: "inset 0 0 0 1.5px #237F52,0 4px 12px rgba(0,0,0,.12)" },
  dark: { bg: "#17181a", hover: "#2a2c2f", fg: "#fff", ring: "#fff", shadow: "0 6px 18px rgba(0,0,0,.35),0 1px 4px rgba(0,0,0,.3)" },
};
// logo : côté du logo, cadre de 1 px compris ; gap : écart entre le logo et le bord du bouton. Le rayon du bouton vaut l'écart plus le rayon extérieur
// du logo, pour que les deux coins aient le même centre (comme sur le bouton de la page Guide).
const WIDGET_FORMATS = {
  button: { logo: 56, gap: 3, right: 18, between: 12, size: "1em", arrow: true },
  badge: { logo: 34, gap: 3, right: 12, between: 9, size: ".92em", arrow: false },
};
const WIDGET_ARROW = '<svg class="aedw-arrow" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const widgetEscape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Le paramètre d'adresse du lieu (voir « Faire un lien direct vers la carte ») : null si le code n'a pas le bon format
function widgetPlaceParam(kind, value) {
  const code = String(value || "").trim().toUpperCase();
  if (kind === "cp") return /^\d{5}$/.test(code) ? `cp=${code}` : null;
  if (kind === "insee") return /^(?:\d{2}|2A|2B)\d{3}$/.test(code) ? `code_insee=${code}` : null;
  return null;
}

// langs : { fr: { name, url, generic, place }, … } (voir {{widget_texts}} dans scripts/build_site.py)
function widgetHref(options, langs) {
  const param = widgetPlaceParam(options.placeKind, options.placeValue);
  return param ? `${langs[options.lang].url}?${param}` : langs[options.lang].url;
}

function widgetDefaultText(options, langs) {
  const name = String(options.placeName || "").trim();
  return name && options.placeKind !== "none" ? langs[options.lang].place.replace("{name}", name) : langs[options.lang].generic;
}

function widgetCss(options) {
  const f = WIDGET_FORMATS[options.format];
  const t = WIDGET_THEMES[options.theme] || WIDGET_THEMES.green;
  const inner = f.logo - 2;
  const outer = (inner * 0.18 + 1).toFixed(2);
  const radius = (f.gap + inner * 0.18 + 1).toFixed(2);
  const rules = [
    `.aedw{display:inline-flex;align-items:center;box-sizing:border-box;max-width:100%;padding:${f.gap}px ${f.right}px ${f.gap}px ${f.gap}px;border-radius:${radius}px;background:${t.bg};color:${t.fg};font-family:inherit;font-size:${f.size};font-weight:700;line-height:1.25;text-decoration:none;box-shadow:${t.shadow}}`,
    `.aedw:hover{background:${t.hover}}`,
    ".aedw:focus-visible{outline:3px solid #f5a300;outline-offset:3px}",
    `.aedw-logo{flex:none;box-sizing:border-box;width:${f.logo}px;height:${f.logo}px;margin-right:${f.between}px;border:1px solid ${t.ring};border-radius:${outer}px;overflow:hidden}`,
    ".aedw-logo svg{display:block;width:100%;height:100%}",
    ".aedw-text{flex:1 1 auto;min-width:0}",
  ];
  if (f.arrow) rules.push(`.aedw-arrow{flex:none;width:20px;height:20px;margin-left:${f.between}px}`);
  if (options.animated) rules.push(WIDGET_ANIMATION_CSS);
  return rules.join("\n");
}

// options : { format: "button" | "badge" | "link", lang, placeKind: "none" | "cp" | "insee", placeValue, placeName, text, theme: "green" | "light" | "dark", animated }
function widgetSnippet(options, langs) {
  const href = widgetEscape(widgetHref(options, langs));
  const lang = widgetEscape(options.lang);
  const text = widgetEscape(String(options.text || "").trim() || widgetDefaultText(options, langs));
  if (options.format === "link") return `<a href="${href}" lang="${lang}" hreflang="${lang}" rel="noopener">${text}</a>`;
  const f = WIDGET_FORMATS[options.format];
  const logo = options.animated ? WIDGET_LOGO_ANIMATED : WIDGET_LOGO_STATIC;
  return `<style>\n${widgetCss(options)}\n</style>\n<a class="aedw" href="${href}" lang="${lang}" hreflang="${lang}" rel="noopener">` +
    `<span class="aedw-logo">${logo}</span><span class="aedw-text">${text}</span>${f.arrow ? WIDGET_ARROW : ""}</a>`;
}

(() => {
  const root = document.getElementById("widget-generator");
  if (!root) return;
  let langs;
  try { langs = JSON.parse(root.dataset.langs); } catch { return; }
  const $ = (id) => document.getElementById(id);
  const choice = (name) => root.querySelector(`input[name="${name}"]:checked`).value;
  const select = $("wg-lang");
  Object.entries(langs).forEach(([code, l]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = l.name;
    select.appendChild(option);
  });
  select.value = langs[document.documentElement.lang] ? document.documentElement.lang : Object.keys(langs)[0];
  const text = $("wg-text");
  let edited = false; // tant que le texte n'a pas été écrit à la main, il suit la langue et le lieu
  const options = () => ({
    format: choice("wg-format"), lang: select.value, placeKind: choice("wg-place"), placeValue: $("wg-code").value, placeName: $("wg-name").value,
    text: text.value, theme: choice("wg-theme"), animated: $("wg-anim").checked,
  });
  const refresh = () => {
    let o = options();
    const hasPlace = o.placeKind !== "none";
    root.querySelector(".wg-place-fields").hidden = !hasPlace;
    const warn = $("wg-warn");
    warn.hidden = !(hasPlace && o.placeValue.trim() !== "" && !widgetPlaceParam(o.placeKind, o.placeValue));
    warn.textContent = warn.hidden ? "" : tr("widget.invalid");
    if (!edited) { text.value = widgetDefaultText(o, langs); o = options(); }
    $("wg-name").disabled = edited; // le nom de la commune ne sert qu'au texte proposé : inactif tant que le texte est écrit à la main
    const plain = o.format === "link"; // le lien texte n'a ni logo, ni couleurs
    $("wg-anim").disabled = plain;
    root.querySelectorAll('input[name="wg-theme"]').forEach((input) => { input.disabled = plain; });
    const snippet = widgetSnippet(o, langs);
    $("wg-preview").innerHTML = snippet;
    $("wg-out").value = snippet;
  };
  text.addEventListener("input", () => { edited = text.value.trim() !== "" && text.value !== widgetDefaultText(options(), langs); });
  root.addEventListener("input", refresh);
  root.addEventListener("change", refresh);
  $("wg-preview").addEventListener("click", (e) => { if (e.target.closest("a")) e.preventDefault(); }); // l'aperçu ne quitte pas la page
  $("wg-copy").addEventListener("click", async () => {
    const out = $("wg-out");
    const status = $("wg-status");
    try {
      await navigator.clipboard.writeText(out.value);
      status.textContent = tr("widget.copied");
    } catch {
      out.select();
      let done = false;
      try { done = document.execCommand("copy"); } catch { /* ignoré */ }
      status.textContent = tr(done ? "widget.copied" : "widget.copyFailed");
    }
    setTimeout(() => { status.textContent = ""; }, 2500);
  });
  refresh();
})();
