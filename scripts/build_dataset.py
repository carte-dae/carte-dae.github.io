#!/usr/bin/env python3
"""Convertit un CSV brut GéoDAE en jeu de données daté, découpé en tuiles.

Usage : python3 -I scripts/build_dataset.py data/raw/geodae_2026-10-23.csv 2026-10-23
L'identifiant du jeu est une date AAAA-MM-JJ, ou AAAA-MM-JJ-HH (heure UTC de la source) s'il y en a
plusieurs le même jour. En routine, scripts/update.py s'en charge.

Un jeu existant n'est jamais écrasé. data/index.json est mis à jour (ajout seulement).
"""
import csv
import hashlib
import json
import math
import re
import unicodedata
import sys
from collections import Counter
from datetime import date
from pathlib import Path

TILE_DEG = 0.25
FORMAT_VERSION = 3  # 3 : « gid » vient désormais de c_gid (stable d'un export à l'autre)
# « gid » = la colonne c_gid de la source, l'identifiant propre de chaque appareil. La colonne gid de la source n'est qu'un numéro
# de ligne renuméroté à chaque export (comparaison de deux exports : 3,5 % seulement des numéros désignent encore le même appareil).
FIELDS = ["gid", "lat", "lon", "exploitant", "nom", "adresse", "commune", "cp", "acces",
          "horaires", "ped", "validation", "flags", "etage", "complement",
          "dtLcad", "dtLcped", "dtBat", "dtMaint"]
VALIDATION = {"validées": 0, "en attente de validation": 1, "mises en doute": 2}
VALIDATION_UNKNOWN = 3  # la source ne dit rien : on ne prétend pas que la déclaration est en attente
EXCLUDED_STATES = {"Hors service", "Supprimé définitivement"}
EXCLUDED_ETAT = {"A supprimer"}


def clean(s):
    return " ".join((s or "").split())


def norm(s):
    s = unicodedata.normalize("NFD", s or "").lower()
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


# Beaucoup d'exploitants saisissent le modèle de l'appareil à la place du nom du lieu (« FRED PA-1 ENTIEREMENT AUTOMATIQUE »).
# Un segment qui contient un de ces mots « forts » est vidé de tous les mots d'appareil ; ce qui reste (« Mairie ») est gardé.
DEVICE_STRONG = {
    "dae", "dea", "dsa", "aed", "aed3", "aedplus", "aedpro", "defibrillateur", "defibrillateurs", "defibrilateur", "defib",
    "fred", "easyport", "eazy", "pa1", "schiller", "zoll", "mindray", "beneheart", "c1a",
    "philips", "heartstart", "hs1", "frx", "cardiac", "powerheart", "g5a", "defibtech", "lifeline", "lifepak",
    "lifepack", "cr2", "crplus", "samaritan", "heartsine", "360p", "350p", "saver", "primedic", "lifeaz", "skity", "colson",
    "welch", "allyn", "medtronic", "stryker", "defibrillator", "hearton", "ipad", "ddu", "d60", "nf1200",
}
# Codes de modèle qui sont aussi des repères de lieu (« Bâtiment C1 », « Hall G3 », « Salle D1 ») : ils comptent comme
# modèle d'appareil, sauf juste après un mot de lieu.
DEVICE_AMBIGUOUS = {"c1", "c2", "d1", "g3", "g5"}
LOCATION_WORDS = {
    "batiment", "bat", "hall", "bloc", "salle", "entree", "escalier", "porte", "tour", "aile", "etage", "local", "niveau",
    "zone", "parking", "bureau", "pavillon", "residence", "cage", "corps", "secteur", "quai",
}
# Mots qui désignent un appareil mais sont aussi de vrais noms de lieux (« PA du Pont Royal » = parc d'activités, « Easy Cash ») :
# retirés seulement à côté d'un autre mot d'appareil, ou si tout le segment est un nom d'appareil.
# (Fred, Philips, Colson, PA1… restent « forts » : dans les données, ce sont presque toujours un appareil ou son fournisseur.)
DEVICE_SOFT = {"pa", "easy"}
DEVICE_WEAK = {
    "automatique", "automatiques", "auto", "semi", "entierement", "online", "metronome", "avec", "option", "messages",
    "manuel", "mode", "et", "reconditionne", "life", "plus", "one", "pad", "science", "sciences", "cu", "medical",
    "cardiaque", "externe", "cr", "hs", "sam", "bls",
}
DEVICE_NUMBER_AFTER = {"pa", "hs", "aed", "c", "g", "cr", "d", "easy", "samaritan"}  # « PA 1 », « HS-1 », « AED 3 »


def strip_device(segment):
    """Retire les mots désignant l'appareil ; rend le reste (éventuellement vide). Sans mot fort, le segment est intact."""
    # « D.E.A » et « D.S.A » avec leurs points (sans eux, « de a » dans « Salle de A » serait pris pour un appareil)
    segment = re.sub(r"\bD\.\s?E\.\s?A\b\.?", "DEA", segment, flags=re.I)
    segment = re.sub(r"\bD\.\s?S\.\s?A\b\.?", "DSA", segment, flags=re.I)
    segment = re.sub(r"\bEASY\s*PORT\s*(?:\+|PLUS\b)?", "EASYPORT ", segment, flags=re.I)
    words = segment.split()
    kind, soft_word, soft_pair, strong, prev = [], [], [], False, ""
    for w in words:
        tokens = norm(w).split()
        if not tokens:
            kind.append("punct")  # « / », « + » : retiré seulement en début ou fin de reste
            soft_word.append(False)
            soft_pair.append(False)
            continue
        ok, soft = True, False
        for t in tokens:
            if t in DEVICE_STRONG or (t in DEVICE_AMBIGUOUS and prev not in LOCATION_WORDS):
                strong = True
            elif t in DEVICE_SOFT:
                soft = True
            elif not (t in DEVICE_WEAK or (t.isdigit() and prev in DEVICE_NUMBER_AFTER)):
                ok = False
            prev = t
        kind.append("device" if ok else "keep")
        soft_word.append(soft and ok)
        soft_pair.append(soft and ok and len(tokens) > 1)  # « PA-1 » : le mot porte déjà son numéro
    if not strong:
        # un mot « mou » (Fred, Easy, PA…) ne suffit pas seul : il lui faut un voisin d'appareil, ou un segment entièrement d'appareil
        entirely_device = all(k in ("device", "punct") for k in kind)
        for i, is_soft in enumerate(soft_word):
            next_to_device = any(kind[j] == "device" for j in (i - 1, i + 1) if 0 <= j < len(kind))
            if is_soft and (soft_pair[i] or entirely_device or next_to_device):
                strong = True
    if not strong:
        return segment
    kept = [(w, k) for w, k in zip(words, kind) if k != "device"]
    while kept and kept[0][1] == "punct":
        kept.pop(0)
    while kept and kept[-1][1] == "punct":
        kept.pop()
    return " ".join(w for w, _ in kept).strip(" -–:,;")


def abbreviates(n, target):
    """« rueil m » abrège « rueil malmaison » : mots entiers, sauf le dernier réduit à son initiale."""
    tokens = n.split()
    return len(tokens) >= 2 and len(tokens[-1]) == 1 and re.search(rf"\b{re.escape(' '.join(tokens[:-1]))} {tokens[-1]}\w+", target) is not None


def place_name(nom, exploitant, num, voie, commune):
    """Nom du lieu tiré de c_nom : on retire ce qui répète l'exploitant, l'adresse ou la commune."""
    nom = re.sub(r"^(?:DAE|DEA)[\s:_-]+", "", clean(nom), flags=re.I)
    address = norm(f"{num} {voie}")
    known = {norm(exploitant), norm(voie), address, norm(commune)} - {""}
    kept = []
    for seg in re.split(r"\s+[-–]\s+", nom):
        seg = strip_device(seg)
        n = norm(seg)
        # « Gare » n'est pas dans « rue de la Garenne » : on compare des mots entiers, pas des suites de lettres.
        # Un numéro seul (« 5 - CCAS », ou un identifiant de magasin) ou une lettre seule n'est jamais un nom de lieu.
        if len(n) < 2 or n.isdigit() or n in known or (address and f" {n} " in f" {address} "):
            continue
        if any(abbreviates(n, target) for target in (address, norm(commune), norm(exploitant)) if target):
            continue
        kept.append(seg.strip())
    return " – ".join(kept)[:80]


def parse_date(s, lo, hi):
    try:
        d = date.fromisoformat((s or "")[:10])
    except ValueError:
        return ""
    return d.isoformat() if lo <= d <= hi else ""


def tile_key(lat, lon):
    return f"{math.floor(lat / TILE_DEG)}_{math.floor(lon / TILE_DEG)}"


def dir_size(path):
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    csv_path, day = Path(sys.argv[1]), sys.argv[2]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(-\d{2})?", day):
        sys.exit("Identifiant attendu : AAAA-MM-JJ ou AAAA-MM-JJ-HH")
    date.fromisoformat(day[:10])
    root = Path(__file__).resolve().parent.parent
    out = root / "data" / day
    if out.exists():
        sys.exit(f"{out} existe déjà : rien n'est écrasé.")

    today = date.today()
    sha1 = hashlib.sha1(csv_path.read_bytes()).hexdigest()
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig"), delimiter=";"))

    tiles, dropped = {}, Counter()
    for r in rows:
        if r["c_doublon"] == "t":
            dropped["doublon"] += 1
            continue
        if r["c_etat_fonct"] in EXCLUDED_STATES or r["c_etat"] in EXCLUDED_ETAT:
            dropped["hors service / supprimé"] += 1
            continue
        try:
            lat, lon = float(r["c_lat_coor1"]), float(r["c_long_coor1"])
        except ValueError:
            dropped["coordonnées illisibles"] += 1
            continue
        if (lat == 0 and lon == 0) or not (-22 <= lat <= 52 and -64 <= lon <= 56):
            dropped["coordonnées hors France"] += 1
            continue

        horaires = clean(r["c_dispo_horaires"])
        if horaires.lower() in ("", "off", "mo-su off"):
            horaires = ""  # horaires inconnus
        ped = {"t": 1, "f": 0}.get(r["c_lc_ped"], None)
        flags = (1 if r["c_dae_mobile"] == "t" else 0) | (2 if r["c_etat_fonct"] == "Absent momentanément" else 0)
        complement = " ; ".join(x for x in (clean(r["c_acc_complt"]), clean(r["c_disp_complt"])) if x)
        expiry = lambda k: parse_date(r[k], date(2000, 1, 1), date(2100, 1, 1))
        rec = [
            int(r["c_gid"]), round(lat, 5), round(lon, 5),
            clean(r["c_expt_rais"]),
            place_name(r["c_nom"], r["c_expt_rais"], r["c_adr_num"], r["c_adr_voie"], r["c_com_nom"]),
            clean(f'{r["c_adr_num"]} {r["c_adr_voie"]}'),
            clean(r["c_com_nom"]), clean(r["c_com_cp"]),
            0 if r["c_acc"] == "Extérieur" else 1,
            horaires, ped, VALIDATION.get(r["c_etat_valid"], VALIDATION_UNKNOWN), flags,
            clean(r["c_acc_etg"]), complement,
            expiry("c_dtpr_lcad"), expiry("c_dtpr_lcped"), expiry("c_dtpr_bat"),
            parse_date(r["c_dermnt"], date(1990, 1, 1), today),
        ]
        tiles.setdefault(tile_key(round(lat, 5), round(lon, 5)), []).append(rec)  # même arrondi que dans la fiche

    (out / "tiles").mkdir(parents=True)
    for key, recs in tiles.items():
        (out / "tiles" / f"{key}.json").write_text(
            json.dumps(recs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    kept = sum(len(v) for v in tiles.values())
    meta = {
        "formatVersion": FORMAT_VERSION, "date": day, "sourceSha1": sha1,
        "sourceFile": csv_path.name, "count": kept, "tileDeg": TILE_DEG,
        "fields": FIELDS,
        "tiles": {k: len(v) for k, v in sorted(tiles.items())},
    }
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = dir_size(out)

    index_path = root / "data" / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"datasets": []}
    index["datasets"] = [d for d in index["datasets"] if d["date"] != day]
    index["datasets"].append({"date": day, "count": kept, "bytes": size, "sourceSha1": sha1})
    index["datasets"].sort(key=lambda d: d["date"], reverse=True)
    index["latest"] = index["datasets"][0]["date"]
    index_path.write_text(json.dumps(index, indent=1), encoding="utf-8")

    print(f"Lus : {len(rows)} | gardés : {kept} | tuiles : {len(tiles)} | poids : {size / 1e6:.1f} Mo")
    for reason, n in dropped.most_common():
        print(f"  écartés ({reason}) : {n}")


if __name__ == "__main__":
    main()
