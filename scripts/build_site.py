#!/usr/bin/env python3
"""Génère les pages HTML et les fichiers de textes des scripts à partir des modèles et des textes de chaque langue.

Usage : python3 scripts/build_site.py            écrit les fichiers générés
        python3 scripts/build_site.py --check    ne modifie rien, échoue si un fichier généré n'est pas à jour

Sources (à modifier) :
  templates/*.html          la structure de chaque page, avec des emplacements {{…}}
  lang/<langue>.json        les textes : "page" (utilisés par les modèles) et "script" (envoyés aussi au navigateur)
  content/guide.<langue>.html   le texte rédigé de la page « Guide »
Fichiers générés (ne pas les modifier à la main : ils sont réécrits) :
  index.html, guide.html, 404.html        (français ; une page par autre langue : index.en.html, guide.en.html, guia.es.html…)
  js/lang/<langue>.js                        (404.html est unique : son message est répété dans chaque langue)
  js/lang/<langue>.js

Emplacements d'un modèle :
  {{lang}} {{og_locale}}   code de la langue (fr), balise og:locale (fr_FR)
  {{t:clé}}                texte, échappé pour du HTML
  {{a:clé}}                texte, échappé pour une valeur d'attribut entre guillemets doubles
  {{h:clé}}                texte qui contient du HTML (liens, gras…), inséré tel quel
  {{jsonld:index}}         données structurées de la carte (JSON-LD) ; {{jsonld:guide}} : celles de la page « Guide »
  {{canonical}}            adresse publique absolue de la page (SITE_URL), sans paramètre
  {{alternates}}           une ligne <link rel="alternate" hreflang> par langue, plus x-default (la langue par défaut)
  {{og_image}}             adresse absolue de l'image de partage de la langue (icons/og-<langue>.png)
  {{og_alternates}}        une balise og:locale:alternate par autre langue
  {{q:clé}}               nom d'un bouton ou d'un menu cité dans un texte, entre les guillemets de la langue (« Données »)
  {{partial:nom}}          morceau de page réutilisable (templates/partials/nom.html), mêmes emplacements
  {{page:nom}}             adresse de la page « nom » (index, guide) dans la langue en cours
  {{site}}                 adresse publique du site (SITE_URL), avec « / » final
  {{file:nom}}             nom de fichier de la page « nom » dans la langue en cours (index.html, index.en.html…)
  {{lang_code}}            code de la langue en majuscules (FR)
  {{language_control}}     bouton de langue de la carte (templates/partials/language-control.html)
  {{language_menu:page}}   liens vers la page dans chaque langue, pour le menu
  {{language_links}}       ligne de liens de langue de la page « Guide »
  {{widget_texts}}         (JSON, dans un attribut) nom, adresse de la carte et formules par défaut de chaque langue, pour le générateur de lien du Guide
  {{notfound_blocks}}      page d'erreur : le message complet dans les langues de NOTFOUND_FULL, puis une ligne par autre langue
                           (templates/partials/notfound-block.html et notfound-short.html)
  {{content}}              contenu de la page « Guide » dans la langue
L'espace insécable des textes devient « &nbsp; » dans le HTML.
"""
import json
import re
import unicodedata
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NBSP = " "

# Langue par défaut : à la racine (index.html). Les autres : index.<langue>.html.
DEFAULT_LANG = "fr"
SITE_URL = "https://carte-dae.github.io/"  # adresse publique du site (avec « / » final) : le seul endroit à changer si elle change
# Page d'erreur : le message complet n'existe qu'en français et en anglais ; les autres langues n'ont qu'une ligne (titre court et lien
# vers la carte), pour que la page reste courte.
NOTFOUND_FULL = ("fr", "en")
# locale : réglage des dates et des nombres du navigateur (code BCP 47) ; name : nom de la langue écrit dans cette langue (menu des langues) ; quote : guillemets qui entourent le nom d'un bouton ou d'un
# menu cité dans un texte ({{q:clé}}) ; slugs (facultatif) : nom de fichier d'une page dans cette langue, par exemple
# {"guide": "guia"} pour guia.es.html ; sans entrée, la page garde son nom de base. La carte reste « index » dans toutes les langues.
LANGUAGES = {
    "fr": {"locale": "fr-FR", "og_locale": "fr_FR", "name": "Français", "quote": ("«\u00a0", "\u00a0»")},
    "en": {"locale": "en-GB", "og_locale": "en_GB", "name": "English", "quote": ("“", "”")},
    "es": {"locale": "es-ES", "og_locale": "es_ES", "name": "Español", "quote": ("«", "»"), "slugs": {"guide": "guia"}},
    "de": {"locale": "de-DE", "og_locale": "de_DE", "name": "Deutsch", "quote": ("„", "“"), "slugs": {"guide": "leitfaden"}},
    "it": {"locale": "it-IT", "og_locale": "it_IT", "name": "Italiano", "quote": ("«", "»"), "slugs": {"guide": "guida"}},
    "nl": {"locale": "nl-NL", "og_locale": "nl_NL", "name": "Nederlands", "quote": ("“", "”"), "slugs": {"guide": "gids"}},
    "pt": {"locale": "pt-PT", "og_locale": "pt_PT", "name": "Português", "quote": ("«", "»"), "slugs": {"guide": "guia"}},
}

def display_order():
    """Codes de langue dans l'ordre d'affichage : la langue par défaut d'abord, les autres par ordre alphabétique de leur nom."""
    def key(code):
        name = unicodedata.normalize("NFD", LANGUAGES[code]["name"]).encode("ascii", "ignore").decode().lower()
        return name
    return [DEFAULT_LANG] + sorted((c for c in LANGUAGES if c != DEFAULT_LANG), key=key)


SLOT = re.compile(r"\{\{(\w+)(?::([\w.\-]+))?\}\}")


class BuildError(Exception):
    pass


def slug(base, lang):
    return LANGUAGES.get(lang, {}).get("slugs", {}).get(base, base)


def page_name(base, lang):
    name = slug(base, lang)
    return f"{name}.html" if lang == DEFAULT_LANG else f"{name}.{lang}.html"


def check_languages():
    """Noms de fichiers valides (lettres minuscules sans accent, chiffres, tirets) et sans doublon d'une page ou d'une langue à l'autre."""
    seen = {}
    for lang, info in LANGUAGES.items():
        for base in ("index", "guide"):
            name = slug(base, lang)
            if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
                raise BuildError(f"nom de page invalide pour {base} en {lang} : « {name} » (minuscules sans accent, chiffres et tirets)")
            file = page_name(base, lang)
            if file in seen:
                raise BuildError(f"{file} serait produit deux fois ({seen[file]} et {lang}/{base})")
            seen[file] = f"{lang}/{base}"
    return list(seen)


def page_url(base, lang):
    """Adresse relative d'une page dans une langue ; la carte en langue par défaut est la racine du site."""
    return "./" if base == "index" and lang == DEFAULT_LANG else page_name(base, lang)


def language_items(base, lang, tag):
    """Un lien par langue vers la même page (la langue en cours est marquée), entouré de `tag` ('li' ou '' pour aucun)."""
    items = []
    for code in display_order():
        info = LANGUAGES[code]
        current = ' aria-current="true"' if code == lang else ""
        link = f'<a href="{page_url(base, code)}" lang="{code}" hreflang="{code}"{current}>{esc_text(info["name"])}</a>'
        items.append(f"      <{tag}>{link}</{tag}>" if tag else link)
    return items


def load_strings(lang):
    data = json.loads((ROOT / "lang" / f"{lang}.json").read_text(encoding="utf-8"))
    return data["page"], data["script"]


def esc_text(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(NBSP, "&nbsp;")


def esc_attr(s):
    return esc_text(s).replace('"', "&quot;")


# Code de langue des alternatives (hreflang) quand il diffère du code de la page : le portugais est celui du Portugal
HREFLANG = {"pt": "pt-PT"}


def alternate_links(base):
    """(hreflang, adresse) de chaque version d'une page, la page se citant elle-même, plus x-default : la langue par défaut."""
    links = [(HREFLANG.get(code, code), page_address(base, code)) for code in display_order()]
    return links + [("x-default", page_address(base, DEFAULT_LANG))]


def sitemap():
    """Plan du site : les 14 pages (carte et « Guide » dans chaque langue), avec leurs alternatives de langue. Pas de date."""
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for base in ("index", "guide"):
        for code in display_order():
            lines += ["  <url>", f"    <loc>{page_address(base, code)}</loc>"]
            lines += [f'    <xhtml:link rel="alternate" hreflang="{h}" href="{u}"/>' for h, u in alternate_links(base)]
            lines.append("  </url>")
    return "\n".join(lines + ["</urlset>"]) + "\n"


def robots():
    return f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}sitemap.xml\n"


def page_address(base, lang):
    """Adresse publique absolue d'une page, sans paramètre : la carte en français est la racine du site."""
    return SITE_URL if base == "index" and lang == DEFAULT_LANG else SITE_URL + page_name(base, lang)


def jsonld_site(lang, page, script):
    home = page_address("index", lang)
    return {"@type": "WebSite", "@id": home + "#site", "url": home, "name": lookup("site.name", page, script), "inLanguage": lang}


def jsonld_index(lang, page, script):
    """Données structurées de la carte : le site et l'application (gratuite, pour la France, pour qui cherche un défibrillateur)."""
    home = page_address("index", lang)
    app = {
        "@type": "WebApplication", "@id": home + "#app", "url": home, "name": lookup("site.name", page, script),
        "description": lookup("index.description", page, script), "inLanguage": lang, "applicationCategory": "HealthApplication",
        "operatingSystem": lookup("index.jsonldOs", page, script), "isAccessibleForFree": True,
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
        "areaServed": "FR", "audience": {"@type": "Audience", "audienceType": lookup("index.jsonldAudience", page, script)},
        "isPartOf": {"@id": home + "#site"},
    }
    return json.dumps({"@context": "https://schema.org", "@graph": [jsonld_site(lang, page, script), app]}, ensure_ascii=False, separators=(",", ":"))


def jsonld_guide(lang, page, script):
    """Données structurées de la page « Guide » : elle décrit le site (la carte), ses données et ses limites."""
    home = page_address("index", lang)
    guide_url = page_address("guide", lang)
    page_data = {
        "@type": "WebPage", "@id": guide_url + "#page", "url": guide_url, "name": lookup("guide.metaTitle", page, script),
        "description": lookup("guide.description", page, script), "inLanguage": lang, "isPartOf": {"@id": home + "#site"},
        "about": {"@type": "WebApplication", "@id": home + "#app", "url": home, "name": lookup("site.name", page, script)},
    }
    return json.dumps({"@context": "https://schema.org", "@graph": [jsonld_site(lang, page, script), page_data]}, ensure_ascii=False, separators=(",", ":"))


def lookup(key, page, script):
    if key in page:
        return page[key]
    if key in script:
        return script[key]
    raise BuildError(f"texte inconnu : {key}")


def render(template, lang, page, script, content="", base=""):
    def fill(m):
        kind, key = m.group(1), m.group(2)
        if kind in ("canonical", "alternates") and not base:
            raise BuildError(f"{m.group(0)} : page de base inconnue")
        if kind == "canonical":
            return page_address(base, lang)
        if kind == "alternates":
            return "\n  ".join(f'<link rel="alternate" hreflang="{h}" href="{u}">' for h, u in alternate_links(base))
        if kind == "og_image":
            return f"{SITE_URL}icons/og-{lang}.png"
        if kind == "og_alternates":
            return "\n  ".join(f'<meta property="og:locale:alternate" content="{LANGUAGES[c]["og_locale"]}">' for c in display_order() if c != lang)
        if kind == "lang":
            return lang
        if kind == "og_locale":
            return LANGUAGES[lang]["og_locale"]
        if kind == "content":
            return render(content, lang, page, script)  # le contenu a lui aussi ses emplacements
        if kind == "jsonld":
            return jsonld_guide(lang, page, script) if key == "guide" else jsonld_index(lang, page, script)
        if kind == "page":
            return page_url(key, lang)
        if kind == "site":
            return SITE_URL
        if kind == "file":
            return page_name(key, lang)
        if kind == "lang_code":
            return lang.upper()
        if kind == "language_menu":
            return "\n".join(language_items(key, lang, "li"))
        if kind == "language_control":
            return render((ROOT / "templates" / "partials" / "language-control.html").read_text(encoding="utf-8").rstrip("\n"), lang, page, script)
        if kind == "widget_texts":  # pour le générateur de lien du Guide : par langue, son nom, l'adresse de sa carte et les deux formules par défaut du lien
            texts = {}
            for code in display_order():
                other_page, other_script = load_strings(code)
                texts[code] = {"name": LANGUAGES[code]["name"], "url": SITE_URL + ("" if code == DEFAULT_LANG else page_name("index", code)),
                               "generic": lookup("widget.textGeneric", other_page, other_script), "place": lookup("widget.textPlace", other_page, other_script)}
            return esc_attr(json.dumps(texts, ensure_ascii=False))
        if kind == "language_links":
            links = " · ".join(language_items("guide", lang, ""))
            return f'    <nav class="langs" aria-label="{esc_attr(lookup("lang.button", page, script))}">{links}</nav>\n'
        if kind == "notfound_blocks":
            def part(name):
                return (ROOT / "templates" / "partials" / name).read_text(encoding="utf-8").rstrip("\n")
            full = [code for code in display_order() if code in NOTFOUND_FULL]
            short = [render(part("notfound-short.html"), code, *load_strings(code)) for code in display_order() if code not in NOTFOUND_FULL]
            blocks = [render(part("notfound-block.html"), code, *load_strings(code)) for code in full]
            if short:
                blocks.append("    <section class=\"others\">\n      <ul>\n" + "\n".join(short) + "\n      </ul>\n    </section>")
            return "\n".join(blocks)
        if kind == "partial":
            path = ROOT / "templates" / "partials" / f"{key}.html"
            if not path.is_file():
                raise BuildError(f"morceau de page inconnu : {key}")
            return render(path.read_text(encoding="utf-8").rstrip("\n"), lang, page, script)
        text = lookup(key, page, script)
        if kind == "t":
            return esc_text(text)
        if kind == "a":
            return esc_attr(text)
        if kind == "h":  # peut contenir {{page:nom}} : adresse d'une autre page dans la même langue
            text = re.sub(r"\{\{page:([\w-]+)\}\}", lambda m: page_url(m.group(1), lang), text)
            return text.replace(NBSP, "&nbsp;")
        if kind == "q":
            opening, closing = LANGUAGES[lang]["quote"]
            return esc_text(opening + text + closing)
        raise BuildError(f"emplacement inconnu : {m.group(0)}")
    return SLOT.sub(fill, template)


def banner(source, lang):
    return f"<!-- Page générée par scripts/build_site.py ({source}, langue : {lang}). Ne pas la modifier à la main. -->\n"


def with_banner(html, source, lang):
    first, rest = html.split("\n", 1)
    assert first.lower() == "<!doctype html>", "un modèle doit commencer par <!doctype html>"
    return first + "\n" + banner(source, lang) + rest


def lang_script(lang, script):
    lines = []
    for key, value in script.items():
        lines.append(f"  {json.dumps(key, ensure_ascii=False)}: {json.dumps(value, ensure_ascii=False).replace(NBSP, chr(92) + 'u00a0')},")
    return (f"// Textes des scripts, langue : {lang}. Fichier GÉNÉRÉ par scripts/build_site.py à partir de lang/{lang}.json : ne pas le modifier à la main.\n"
            f"STRINGS.{lang} = {{\n" + "\n".join(lines) + "\n};\n"
            f'LOCALE = "{LANGUAGES[lang]["locale"]}"; // réglage des dates et des nombres de cette langue\n')


def build():
    """Rend { chemin relatif : contenu } de tous les fichiers générés."""
    check_languages()
    out = {}
    for lang in LANGUAGES:
        page, script = load_strings(lang)
        out[f"js/lang/{lang}.js"] = lang_script(lang, script)
        for base in ("index", "guide"):
            template = (ROOT / "templates" / f"{base}.html").read_text(encoding="utf-8")
            content = ""
            if base == "guide":
                content = (ROOT / "content" / f"guide.{lang}.html").read_text(encoding="utf-8")
            html = render(template, lang, page, script, content, base)
            out[page_name(base, lang)] = with_banner(html, f"modèle templates/{base}.html", lang)
    page, script = load_strings(DEFAULT_LANG)  # une seule page d'erreur pour tout le site : dans la langue par défaut
    template = (ROOT / "templates" / "404.html").read_text(encoding="utf-8")
    out["404.html"] = with_banner(render(template, DEFAULT_LANG, page, script), "modèle templates/404.html", DEFAULT_LANG)
    out["sitemap.xml"] = sitemap()
    out["robots.txt"] = robots()
    return out


def main():
    check = "--check" in sys.argv[1:]
    if set(sys.argv[1:]) - {"--check"}:
        sys.exit(__doc__)
    stale = []
    for name, content in build().items():
        path = ROOT / name
        if path.exists() and path.read_text(encoding="utf-8") == content:
            continue
        stale.append(name)
        if not check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
    if check:
        if stale:
            sys.exit("Fichiers générés pas à jour : " + ", ".join(stale) + "\nLancer : python3 scripts/build_site.py")
        print("Fichiers générés à jour.")
    else:
        print("Écrits : " + (", ".join(stale) if stale else "rien à changer (tout était à jour)"))


if __name__ == "__main__":
    main()
