#!/usr/bin/env python3
"""Construit le calendrier des vacances scolaires (data/vacances.json) pour les horaires « hors vacances scolaires ».

Usage : python3 -I scripts/build_vacances.py [fichier_de_sortie]
Source : « Calendrier scolaire » de l'Éducation nationale (data.education.gouv.fr), données ouvertes ; téléchargé à la construction du site,
jamais depuis le navigateur.
Format : {"v": 1, "updated": "2026-11-15", "covered": {"from": "2025-10-18", "to": "2028-05-08"},
          "zones": {"A": [["2025-10-18", "2025-11-03"], ...], "B": [...], "C": [...]}, "dep": {"01": "A", ...}}
Un intervalle va du premier jour de vacances (le samedi) jusqu'au jour de reprise, exclu. Seules les zones A, B et C de la métropole sont publiées : la
Corse et l'outre-mer ont leur calendrier, on ne les devine pas. Les vacances d'été des enseignants et les « ponts » ne sont pas des vacances d'élèves.
Codes de sortie : 0 = écrit, 1 = erreur (le fichier existant n'est pas touché).
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "vacances.json"
FORMAT_VERSION = 1
USER_AGENT = "aed-finder-vacances (+https://github.com)"
API = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records"
PARIS = ZoneInfo("Europe/Paris")
ZONES = {"Zone A": "A", "Zone B": "B", "Zone C": "C"}
LOOKBACK_DAYS = 400   # les dates passées servent peu : on garde un peu plus d'un an
MIN_PER_ZONE = 5      # en dessous, la source est probablement tronquée (un an complet : cinq périodes)

# Département -> zone, d'après les académies (la Corse, 20, et l'outre-mer, 97 et 98, n'ont pas de zone ici)
_ZONE_DEPARTMENTS = {
    "A": "01 03 07 15 16 17 19 21 23 24 25 26 33 38 39 40 42 43 47 58 63 64 69 70 71 73 74 79 86 87 89 90",
    "B": "02 04 05 06 08 10 13 14 18 22 27 28 29 35 36 37 41 44 45 49 50 51 52 53 54 55 56 57 59 60 61 62 67 68 72 76 80 83 84 85 88",
    "C": "09 11 12 30 31 32 34 46 48 65 66 75 77 78 81 82 91 92 93 94 95",
}
DEPARTMENT_ZONE = {dep: zone for zone, deps in _ZONE_DEPARTMENTS.items() for dep in deps.split()}
EXPECTED_DEPARTMENTS = {f"{n:02d}" for n in range(1, 96)} - {"20"}


def local_date(iso):
    """Date locale (Paris) d'un instant UTC : minuit à Paris est la veille à 22 h ou 23 h UTC."""
    return datetime.fromisoformat(iso).astimezone(PARIS).date()


def build(records, today):
    """Calendrier compact à partir des enregistrements de l'API (liste de dictionnaires)."""
    zones = {z: set() for z in ZONES.values()}
    for r in records:
        zone = ZONES.get(r.get("zones"))
        description = r.get("description") or ""
        if zone is None or r.get("population") not in ("-", "Élèves") or not description.startswith("Vacances"):
            continue
        start, end = local_date(r["start_date"]), local_date(r["end_date"])
        if start < end:  # « Début des vacances d'été » : sans date de reprise, pas encore un intervalle
            zones[zone].add((start.isoformat(), end.isoformat()))
    for zone, intervals in zones.items():
        if len(intervals) < MIN_PER_ZONE:
            raise RuntimeError(f"zone {zone} : {len(intervals)} périodes seulement")
        ordered = sorted(intervals)
        for (_, end_a), (start_b, _) in zip(ordered, ordered[1:]):
            if start_b < end_a:
                raise RuntimeError(f"zone {zone} : périodes qui se chevauchent ({end_a} > {start_b})")
    firsts = [min(i)[0] for i in zones.values()]
    lasts = [max(i)[1] for i in zones.values()]
    return {
        "v": FORMAT_VERSION,
        "updated": today.isoformat(),
        "covered": {"from": max(firsts), "to": min(lasts)},
        "zones": {zone: [list(i) for i in sorted(intervals)] for zone, intervals in zones.items()},
        "dep": dict(sorted(DEPARTMENT_ZONE.items())),
    }


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=60) as r:
        return json.load(r)


def fetch(today):
    """Tous les enregistrements des zones A, B et C depuis un peu plus d'un an, page après page."""
    since = (today - timedelta(days=LOOKBACK_DAYS)).isoformat()
    where = f'zones in ("Zone A","Zone B","Zone C") and start_date >= date\'{since}\''
    records, offset = [], 0
    while True:
        query = urllib.parse.urlencode({"where": where, "order_by": "start_date", "limit": 100, "offset": offset,
                                        "select": "description,population,start_date,end_date,zones"})
        page = get_json(f"{API}?{query}")["results"]
        records += page
        if len(page) < 100:
            return records
        offset += 100


def main(argv):
    out = Path(argv[0]) if argv else OUT
    today = date.today()
    try:
        assert set(DEPARTMENT_ZONE) == EXPECTED_DEPARTMENTS, "table département -> zone incomplète"
        calendar = build(fetch(today), today)
    except Exception as e:  # réseau, format inattendu, source tronquée ou incohérente
        print(f"Calendrier des vacances non construit : {e}", file=sys.stderr)
        return 1
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".tmp")
    tmp.write_text(json.dumps(calendar, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    tmp.replace(out)
    print(f"{out} : de {calendar['covered']['from']} à {calendar['covered']['to']}, "
          + ", ".join(f"zone {z} {len(i)} périodes" for z, i in calendar["zones"].items()))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
