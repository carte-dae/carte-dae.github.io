#!/usr/bin/env python3
"""Vérifie que les jeux de données publiés sont cohérents (utilisé aussi par le workflow avant publication).

Usage : python3 -I tests/check_data.py [dossier_data] [--min N]
Code de sortie 0 si tout est cohérent, 1 sinon (la liste des problèmes est affichée).
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_dataset  # noqa: E402

ISO = re.compile(r"\d{4}-\d{2}-\d{2}")


def check_dataset(data, ds, min_count):
    errors = []
    fail = lambda msg: errors.append(f"{ds['date']} : {msg}")
    folder = data / ds["date"]
    meta_path = folder / "meta.json"
    if not meta_path.exists():
        return [f"{ds['date']} : meta.json absent"]
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if meta["formatVersion"] != build_dataset.FORMAT_VERSION:
        fail(f"formatVersion {meta['formatVersion']} au lieu de {build_dataset.FORMAT_VERSION}")
    if meta["date"] != ds["date"]:
        fail(f"meta.date « {meta['date']} » ≠ nom du dossier")
    if meta["fields"] != build_dataset.FIELDS:
        fail("liste des champs différente de celle du script de construction")
    if meta["count"] != ds["count"]:
        fail(f"count de l'index ({ds['count']}) ≠ meta ({meta['count']})")
    if meta["count"] < min_count:
        fail(f"seulement {meta['count']} DAE (minimum attendu : {min_count})")
    if meta.get("sourceSha1") != ds.get("sourceSha1"):
        fail("sourceSha1 de l'index ≠ meta")

    idx = {f: i for i, f in enumerate(meta["fields"])}
    today = date.today().isoformat()
    seen, total = set(), 0
    for key, expected in meta["tiles"].items():
        tile = folder / "tiles" / f"{key}.json"
        if not tile.exists():
            fail(f"tuile {key} absente")
            continue
        recs = json.loads(tile.read_text(encoding="utf-8"))
        if len(recs) != expected:
            fail(f"tuile {key} : {len(recs)} DAE au lieu de {expected}")
        total += len(recs)
        for r in recs:
            if len(r) != len(meta["fields"]):
                fail(f"gid {r[0]} : {len(r)} champs au lieu de {len(meta['fields'])}")
                continue
            gid, lat, lon = r[idx["gid"]], r[idx["lat"]], r[idx["lon"]]
            if gid in seen:
                fail(f"gid {gid} en double")
            seen.add(gid)
            if not (-22 <= lat <= 52 and -64 <= lon <= 56):
                fail(f"gid {gid} : coordonnées hors France ({lat}, {lon})")
            # tolérance : jeux construits avant l'arrondi de la clé (écart de 0,00001° ≈ 1 m au bord d'une tuile)
            near = {build_dataset.tile_key(lat + a, lon + b) for a in (-1e-5, 0, 1e-5) for b in (-1e-5, 0, 1e-5)}
            if key not in near:
                fail(f"gid {gid} rangé dans la mauvaise tuile")
            if r[idx["acces"]] not in (0, 1):
                fail(f"gid {gid} : acces = {r[idx['acces']]}")
            if r[idx["ped"]] not in (0, 1, None):
                fail(f"gid {gid} : ped = {r[idx['ped']]}")
            if r[idx["validation"]] not in (0, 1, 2, 3) or not 0 <= r[idx["flags"]] <= 3:
                fail(f"gid {gid} : validation/flags invalides")
            if r[idx["horaires"]].lower() in ("off", "mo-su off"):
                fail(f"gid {gid} : horaires « off » non blanchis")
            for f in ("dtLcad", "dtLcped", "dtBat", "dtMaint"):
                v = r[idx[f]]
                if v and not ISO.fullmatch(v):
                    fail(f"gid {gid} : {f} illisible « {v} »")
            if r[idx["dtMaint"]] > today:
                fail(f"gid {gid} : maintenance dans le futur")
        if len(errors) > 20:
            errors.append("… (trop d'erreurs, arrêt)")
            return errors
    if total != meta["count"]:
        fail(f"somme des tuiles ({total}) ≠ count ({meta['count']})")
    return errors


def main():
    args = sys.argv[1:]
    min_count = 150000
    if "--min" in args:
        i = args.index("--min")
        min_count = int(args[i + 1])
        del args[i:i + 2]
    data = Path(args[0]) if args else ROOT / "data"
    index = json.loads((data / "index.json").read_text(encoding="utf-8"))
    errors = []
    ids = [d["date"] for d in index["datasets"]]
    if ids != sorted(ids, reverse=True):
        errors.append("index : jeux non triés du plus récent au plus ancien")
    if not ids or index.get("latest") != ids[0]:
        errors.append("index : « latest » ne désigne pas le plus récent")
    for ds in index["datasets"]:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(-\d{2})?", ds["date"]):
            errors.append(f"index : identifiant invalide « {ds['date']} »")
            continue
        errors += check_dataset(data, ds, min_count)
    for folder in sorted(p.name for p in data.iterdir() if p.is_dir() and p.name != "raw"):
        if folder not in ids:
            errors.append(f"dossier {folder} absent de l'index")
    if errors:
        print("\n".join(f"✗ {e}" for e in errors))
        sys.exit(1)
    print(f"Données cohérentes : {len(ids)} jeu(x) vérifié(s).")


if __name__ == "__main__":
    main()
