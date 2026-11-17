#!/usr/bin/env python3
"""Construit la table des communes (data/places.json) pour les liens ?cp=… et ?code_insee=….

Usage : python3 -I scripts/build_places.py [fichier_de_sortie]
Source : API Géo (geo.api.gouv.fr), données Adresses sous Licence Ouverte ; téléchargée à la construction du site, jamais depuis le navigateur.
Format : {"v": 1, "c": {code INSEE: [longitude, latitude]}, "p": {code postal: [codes INSEE]}}
Codes de sortie : 0 = écrit, 1 = erreur (le fichier existant n'est pas touché).
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "places.json"
FORMAT_VERSION = 1
USER_AGENT = "aed-finder-places (+https://github.com)"
COMMUNES_URL = "https://geo.api.gouv.fr/communes?fields=code,centre,codesPostaux&format=json"
ARRONDISSEMENTS_URL = "https://geo.api.gouv.fr/communes?type=arrondissement-municipal&fields=code,centre,codesPostaux&format=json"

# Paris, Lyon et Marseille : la ville entière et ses arrondissements ont les mêmes codes postaux ; on garde les arrondissements, plus précis.
ARRONDISSEMENTS = {"75056": range(75101, 75121), "69123": range(69381, 69390), "13055": range(13201, 13217)}
MIN_COMMUNES = 34000   # en dessous, la source est probablement tronquée
MIN_POSTAL = 6000


def build(communes, arrondissements):
    """Table compacte à partir des deux réponses de l'API (listes de communes avec centre et codes postaux)."""
    centres, postal = {}, {}
    for x in list(communes) + list(arrondissements):
        point = (x.get("centre") or {}).get("coordinates")
        if not point or len(point) != 2:
            continue
        centres[x["code"]] = [round(point[0], 4), round(point[1], 4)]
        for cp in x.get("codesPostaux") or []:
            postal.setdefault(cp, []).append(x["code"])
    for parent, rng in ARRONDISSEMENTS.items():
        kids = {str(c) for c in rng}
        for codes in postal.values():
            if parent in codes and kids & set(codes):
                codes.remove(parent)
    return {"v": FORMAT_VERSION, "c": centres, "p": {cp: sorted(codes) for cp, codes in sorted(postal.items())}}


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=120) as r:
        return json.load(r)


def main(argv):
    out = Path(argv[0]) if argv else OUT
    try:
        table = build(get_json(COMMUNES_URL), get_json(ARRONDISSEMENTS_URL))
        if len(table["c"]) < MIN_COMMUNES or len(table["p"]) < MIN_POSTAL:
            raise RuntimeError(f"table trop petite ({len(table['c'])} communes, {len(table['p'])} codes postaux)")
    except Exception as e:  # réseau, format inattendu, source tronquée
        print(f"Table des communes non construite : {e}", file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(table, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    tmp.replace(out)
    print(f"{out} : {len(table['c'])} communes, {len(table['p'])} codes postaux")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
