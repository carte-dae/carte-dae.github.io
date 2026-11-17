#!/usr/bin/env python3
"""Réglages de publication, appliqués au dossier à publier (jamais aux fichiers du dépôt).

Usage : python3 -I scripts/publish_settings.py <dossier>
Variables d'environnement (dans GitHub : Settings > Secrets and variables > Actions > Variables ; vides ou absentes = rien ne change) :
  INDEXABLE                  « true » : les moteurs de recherche peuvent indexer les pages (la balise noindex est retirée, sauf de 404.html)
  GOOGLE_SITE_VERIFICATION   valeur de la balise de vérification de Google Search Console (ajoutée à la page d'accueil)
  BING_SITE_VERIFICATION     valeur de la balise de vérification de Bing Webmaster Tools (idem)
Par défaut, le site reste en noindex et sans balise de vérification : les valeurs ne sont écrites nulle part dans le dépôt.
Code de sortie : 0 = appliqué (ou rien à faire), 1 = valeur refusée (rien n'est écrit).
"""
import os
import re
import sys
from pathlib import Path

NOINDEX = re.compile(r'[ \t]*<meta name="robots" content="noindex, nofollow">\n')
CHARSET = '<meta charset="utf-8">\n'
TOKEN = re.compile(r"[A-Za-z0-9_\-]{10,120}")  # une balise de vérification n'est faite que de lettres, chiffres, tirets et soulignés
VERIFICATIONS = (("GOOGLE_SITE_VERIFICATION", "google-site-verification"), ("BING_SITE_VERIFICATION", "msvalidate.01"))
HOME = "index.html"
ALWAYS_NOINDEX = {"404.html"}


def is_true(value):
    return (value or "").strip().lower() in {"true", "1", "yes", "oui"}


def check_tokens(env):
    """{nom de balise : valeur} des vérifications demandées ; arrête tout si une valeur n'a pas le bon format."""
    tags = {}
    for variable, meta in VERIFICATIONS:
        value = (env.get(variable) or "").strip()
        if not value:
            continue
        if not TOKEN.fullmatch(value):
            raise SystemExit(f"{variable} : valeur refusée (lettres, chiffres, tirets et soulignés seulement, 10 à 120 caractères).")
        tags[meta] = value
    return tags


def apply(folder, env):
    """Applique les réglages au dossier ; rend un compte rendu {pages rendues indexables, balises ajoutées}."""
    tags = check_tokens(env)
    indexable = is_true(env.get("INDEXABLE"))
    done = {"indexables": 0, "balises": []}
    for path in sorted(Path(folder).glob("*.html")):
        html = path.read_text(encoding="utf-8")
        original = html
        if indexable and path.name not in ALWAYS_NOINDEX:
            html, n = NOINDEX.subn("", html)
            done["indexables"] += n
        if path.name == HOME:
            for meta, value in tags.items():
                if f'name="{meta}"' in html:
                    continue  # déjà là : on n'en ajoute pas une deuxième
                if CHARSET not in html:
                    raise SystemExit(f"{path.name} : emplacement des balises de vérification introuvable.")
                html = html.replace(CHARSET, CHARSET + f'  <meta name="{meta}" content="{value}">\n', 1)
                done["balises"].append(meta)
        if html != original:
            path.write_text(html, encoding="utf-8")
    return done


def main(argv):
    if len(argv) != 1 or not Path(argv[0]).is_dir():
        sys.exit(__doc__)
    done = apply(argv[0], os.environ)
    print(f"Indexation autorisée sur {done['indexables']} page(s)" if done["indexables"] else "Indexation : inchangée (noindex)",
          "| balises de vérification : " + (", ".join(done["balises"]) if done["balises"] else "aucune"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
