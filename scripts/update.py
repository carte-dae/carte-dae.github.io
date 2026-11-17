#!/usr/bin/env python3
"""Met à jour les données : vérifie data.gouv.fr, télécharge le CSV s'il est nouveau,
construit un jeu daté, puis ne garde que les 3 derniers jeux.

Usage : python3 -I scripts/update.py [--check]
  --check  vérifie seulement s'il y a du nouveau (ne télécharge rien, ne modifie rien)

Codes de sortie : 0 = à jour ou publié, 1 = erreur (rien n'est conservé de la tentative).
Les jeux déjà publiés ne sont jamais modifiés ; seule la règle de conservation (3 derniers jeux) en supprime.
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATASET_API = "https://www.data.gouv.fr/api/1/datasets/61556e1e9d6adb2df86eb0fc/"
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

KEEP_LATEST = 3           # le serveur ne garde que les 3 derniers jeux ; l'historique, c'est l'affaire de chaque appareil
MIN_RATIO = 0.9           # un jeu qui perd plus de 10 % des DAE est refusé (source tronquée ?)
USER_AGENT = "aed-finder-update (+https://github.com)"


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=60)


def source_csv():
    """(url, sha1, id du jeu, datetime UTC de la source) du CSV national."""
    with get(DATASET_API) as r:
        res = json.load(r)["resources"]
    csv = next(x for x in res if x["format"] == "csv" and x["title"] == "geodae.csv")
    m = re.search(r"/(\d{8})-(\d{2})\d{4}/", csv["url"])
    if not m:
        raise RuntimeError(f"Date introuvable dans l'URL : {csv['url']}")
    day, hour = m.groups()
    stamp = datetime.strptime(day + hour, "%Y%m%d%H").replace(tzinfo=timezone.utc)
    return csv["url"], (csv.get("checksum") or {}).get("value", ""), stamp


def dataset_time(ds):
    """Heure UTC d'un jeu (minuit pour un identifiant sans heure)."""
    p = ds["date"].split("-")
    return datetime(int(p[0]), int(p[1]), int(p[2]), int(p[3]) if len(p) > 3 else 0, tzinfo=timezone.utc)


def already_published(index, sha1, ident):
    """Le fichier source est-il déjà un jeu publié ? Par empreinte, ou, si la source n'en annonce pas, par identifiant."""
    return any((sha1 and d.get("sourceSha1") == sha1) or d["date"] == ident for d in index["datasets"])


def read_index():
    path = DATA / "index.json"
    return json.loads(path.read_text()) if path.exists() else {"datasets": [], "latest": None}


def prune(index):
    """Ne conserve que les KEEP_LATEST jeux les plus récents."""
    sets = sorted(index["datasets"], key=lambda d: d["date"], reverse=True)
    removed = sets[KEEP_LATEST:]
    for ds in removed:
        shutil.rmtree(DATA / ds["date"], ignore_errors=True)
    index["datasets"] = sets[:KEEP_LATEST]
    index["latest"] = index["datasets"][0]["date"]
    (DATA / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
    return removed


def main():
    args = set(sys.argv[1:])
    if args - {"--check"}:
        sys.exit(__doc__)
    url, sha1, stamp = source_csv()
    index = read_index()
    ident = stamp.strftime("%Y-%m-%d-%H")
    print(f"Source : {stamp:%Y-%m-%d %H}h UTC, sha1 {sha1[:10] or 'non annoncé'}…")

    if already_published(index, sha1, ident):
        print("Déjà à jour : un jeu publié vient de ce fichier.")
        return
    if "--check" in args:
        print("Nouveau fichier disponible.")
        return
    if (DATA / ident).exists():
        sys.exit(f"L'identifiant {ident} existe déjà : rien n'est écrasé.")

    raw = DATA / "raw" / f"geodae_{ident}.csv"
    raw.parent.mkdir(parents=True, exist_ok=True)
    print(f"Téléchargement vers {raw.name}…")
    digest = hashlib.sha1()
    with get(url) as r, open(raw, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
            digest.update(chunk)
    if sha1 and digest.hexdigest() != sha1:
        raw.unlink()
        sys.exit("Empreinte SHA1 différente de celle annoncée : fichier rejeté.")

    saved_index = (DATA / "index.json").read_text() if (DATA / "index.json").exists() else None
    previous = index["datasets"][0]["count"] if index["datasets"] else 0
    try:
        subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "build_dataset.py"), str(raw), ident], check=True)
    except subprocess.CalledProcessError:
        # un dossier partiel bloquerait tous les essais suivants (« existe déjà ») : on ne garde rien de la tentative
        shutil.rmtree(DATA / ident, ignore_errors=True)
        raw.unlink(missing_ok=True)
        if saved_index is not None:
            (DATA / "index.json").write_text(saved_index)
        sys.exit("La construction du jeu a échoué : rien n'est conservé de la tentative.")

    new = read_index()["datasets"]
    count = next(d["count"] for d in new if d["date"] == ident)
    if previous and count < previous * MIN_RATIO:
        shutil.rmtree(DATA / ident, ignore_errors=True)
        if saved_index is not None:
            (DATA / "index.json").write_text(saved_index)
        sys.exit(f"Refusé : {count} DAE contre {previous} au jeu précédent (perte > {round((1 - MIN_RATIO) * 100)} %).")

    removed = prune(read_index())
    print(f"Publié : {ident} ({count} DAE).")
    for d in removed:
        print(f"Supprimé (conservation) : {d['date']}")


if __name__ == "__main__":
    main()
