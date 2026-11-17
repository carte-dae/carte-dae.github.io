#!/usr/bin/env python3
"""Ajoute une marque de version aux feuilles de style et scripts d'un site avant publication.

Usage : python3 -I scripts/stamp_assets.py DOSSIER_DU_SITE

Dans chaque page .html du dossier, « css/style.css » devient « css/style.css?v=3fa9c1d2 », où la marque est calculée sur le CONTENU
du fichier : un fichier modifié change d'adresse (le navigateur le recharge à coup sûr), un fichier inchangé garde la sienne
(il reste en cache). Sans cela, un visiteur peut garder l'ancien style.css avec la nouvelle page, et voir un site déformé.

Seuls les fichiers locaux (<link rel="stylesheet" href="…"> et <script src="…">) sont marqués. Un fichier référencé mais absent
du dossier fait échouer le script : mieux vaut ne rien publier qu'un site cassé. Relancer le script est sans effet de plus.
"""
import hashlib
import re
import sys
from pathlib import Path

TAG = re.compile(r"<(link|script)\b[^>]*>", re.I)
ATTR = {"link": re.compile(r'(\bhref=")([^"]*)(")', re.I), "script": re.compile(r'(\bsrc=")([^"]*)(")', re.I)}


def is_local(ref):
    return bool(ref) and not re.match(r"([a-z][a-z0-9+.-]*:|//|/|#)", ref, re.I)


def version(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8]


def stamp_page(page, site):
    """Réécrit une page ; rend le nombre de références marquées."""
    count = 0

    def rewrite(m):
        nonlocal count
        tag = m.group(1).lower()
        text = m.group(0)
        if tag == "link" and not re.search(r'\brel="[^"]*\bstylesheet\b', text, re.I):
            return text
        attr = ATTR[tag].search(text)
        if not attr or not is_local(attr.group(2)):
            return text
        ref = attr.group(2).split("?")[0].split("#")[0]
        target = (page.parent / ref).resolve()
        if not target.is_file() or site.resolve() not in target.parents:
            raise SystemExit(f"{page.name} référence {ref}, absent du site : rien n'est marqué.")
        count += 1
        return text[: attr.start(2)] + f"{ref}?v={version(target)}" + text[attr.end(2):]

    html = page.read_text(encoding="utf-8")
    page.write_text(TAG.sub(rewrite, html), encoding="utf-8")
    return count


def main():
    if len(sys.argv) != 2 or not Path(sys.argv[1]).is_dir():
        sys.exit(__doc__)
    site = Path(sys.argv[1])
    total = 0
    for page in sorted(site.glob("*.html")):
        n = stamp_page(page, site)
        total += n
        print(f"{page.name} : {n} fichier(s) marqué(s)")
    print(f"Total : {total}")


if __name__ == "__main__":
    main()
