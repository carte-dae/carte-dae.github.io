"""Tests de la construction des jeux de données et de la règle de conservation.

Lancer : python3 -m unittest discover -s tests -v   (rien à installer)
"""
import csv
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_dataset as bd  # noqa: E402
import update  # noqa: E402


class PlaceName(unittest.TestCase):
    def test_retire_le_prefixe_dae(self):
        self.assertEqual(bd.place_name("DAE Piscine municipale", "Mairie de X", "12", "rue A", "X"), "Piscine municipale")

    def test_nom_identique_a_l_exploitant_est_ecarte(self):
        self.assertEqual(bd.place_name("Mairie de X", "Mairie de X", "1", "rue A", "X"), "")

    def test_un_nom_contenu_dans_un_mot_de_l_adresse_n_est_pas_ecarte(self):
        # « Gare » est une suite de lettres de « Garenne », mais pas un mot de l'adresse
        self.assertEqual(bd.place_name("Gare", "Mairie", "1", "rue de la Garenne", "X"), "Gare")
        self.assertEqual(bd.place_name("Rue de la Garenne", "Mairie", "1", "rue de la Garenne", "X"), "")

    def test_segments_repetant_adresse_ou_commune_sont_ecartes(self):
        self.assertEqual(bd.place_name("DAE - Gymnase Y - 20 ile Martinet - X", "Mairie", "20", "ile Martinet", "X"), "Gymnase Y")

    def test_accents_et_casse_ignores(self):
        self.assertEqual(bd.place_name("ÉCOLE Jules Ferry", "ecole jules ferry", "", "", ""), "")

    def test_nom_vide(self):
        self.assertEqual(bd.place_name("", "Mairie", "1", "rue A", "X"), "")

    def test_longueur_limitee(self):
        self.assertEqual(len(bd.place_name("A" * 200, "", "", "", "")), 80)


class DeviceNames(unittest.TestCase):
    """Les noms d'appareils saisis à la place du nom du lieu doivent disparaître, les vrais noms jamais."""

    def name(self, nom):
        return bd.place_name(nom, "Exploitant X", "1", "rue A", "Ville")

    def test_noms_d_appareil_vides(self):
        for nom in ("FRED PA-1 ENTIEREMENT AUTOMATIQUE", "FRED EASY LIFE D.E.A", "DEFIBRILLATEUR AUTOMATIQUE", "SCHILLER", "DAE",
                    "Zoll® AED3 (DSA)", "Mindray C1A DEA", "PHILIPS HS1", "ZOLL AED PLUS", "FRED EASY D.S.A", "Fred PA1", "Cardiac Science G5",
                    "Samaritan Pad", "LIFEPAK CR PLUS", "FRED EASY PORT+ ENTIEREMENT AUTOMATIQUE"):
            self.assertEqual(self.name(nom), "", nom)

    def test_le_lieu_est_conserve(self):
        cases = {
            "FRED PA-1 / BNP PARIBAS": "BNP PARIBAS", "FRED PA-1 MAIRIE": "MAIRIE", "FRED PA-1 SALLE DES FETES": "SALLE DES FETES",
            "Défibrillateur Mairie": "Mairie", "Défibrillateur salle des fêtes": "salle des fêtes", "PA-1 LEROY MERLIN": "LEROY MERLIN",
            "FRED PA-1 / HOTEL DE VILLE": "HOTEL DE VILLE", "DAE Gymnase Jean Moulin": "Gymnase Jean Moulin",
        }
        for nom, expected in cases.items():
            self.assertEqual(self.name(nom), expected, nom)

    def test_vrais_noms_jamais_touches(self):
        for nom in ("Salle des fêtes", "Mairie annexe", "Piscine municipale", "Gymnase de l'Europe et du Port", "Auto-école Dupont",
                    "Plus Belle la Vie", "Port de plaisance", "Centre Hospitalier – Accueil", "École maternelle One Two", "Stade Sam Hugo"):
            self.assertEqual(self.name(nom), nom, nom)

    def test_codes_de_lieu_ressemblant_a_un_modele_sont_gardes(self):
        # « C1 », « D1 », « G3 »… sont aussi des bâtiments ou des salles : jamais retirés sans mot d'appareil
        for nom in ("Bâtiment C1", "Hall G3", "Bloc C2", "Salle D1", "Entrée G5"):
            self.assertEqual(self.name(nom), nom, nom)
        self.assertEqual(self.name("Salle D1 - Gymnase"), "Salle D1 – Gymnase")

    def test_mots_courants_qui_sont_aussi_des_appareils_sont_gardes(self):
        for nom in ("PA du Moulin", "PA Porte du Littoral", "Batiment J – PA du Pont Royal", "Easy Gym", "EASY CASH", "Salle de A"):
            self.assertEqual(self.name(nom), nom, nom)
        self.assertEqual(self.name("Bureau de A."), "Bureau de A.")

    def test_mots_d_appareil_voisins_toujours_retires(self):
        self.assertEqual(self.name("Fred PA1"), "")
        self.assertEqual(self.name("PHILIPS HEARTSTART"), "")
        self.assertEqual(self.name("COLSON 3EME ETAGE"), "3EME ETAGE")
        self.assertEqual(self.name("FRED EASY"), "")
        self.assertEqual(self.name("PHILIPS HS1"), "")
        self.assertEqual(self.name("PA-1 LEROY MERLIN"), "LEROY MERLIN")
        self.assertEqual(self.name("Easy Life DAE Mairie"), "Mairie")
        self.assertEqual(self.name("DAE D.E.A. Gymnase"), "Gymnase")

    def test_codes_de_modele_retires_hors_repere_de_lieu(self):
        for nom in ("Mindray D1", "Mindray BeneHeart C1", "Cardiac Science G3", "Powerheart G5", "G5", "C1"):
            self.assertEqual(self.name(nom), "", nom)
        self.assertEqual(self.name("G5 Salle Polyvalente"), "Salle Polyvalente")
        self.assertEqual(self.name("G5 - Maison de Santé"), "Maison de Santé")

    def test_numero_seul_et_abreviation_de_commune_ecartes(self):
        self.assertEqual(bd.place_name("5 - CCAS La Passerelle", "Mairie", "1", "rue A", "Ville"), "CCAS La Passerelle")
        self.assertEqual(bd.place_name("RUEIL M - Gym Buissonnets", "Mairie", "1", "rue A", "Rueil-Malmaison"), "Gym Buissonnets")
        self.assertEqual(bd.place_name("Gare", "Mairie", "1", "rue A", "Garenne"), "Gare")
        self.assertEqual(bd.place_name("D", "Mairie", "1", "rue A", "Ville"), "")  # une lettre seule
        self.assertEqual(bd.place_name("1892", "LIDL", "1", "rue A", "Ville"), "")  # identifiant de magasin : l'exploitant suffit
        self.assertEqual(bd.place_name("SUPER U", "SUPER U ORGELET", "1", "rue A", "Ville"), "SUPER U")  # pas une abréviation

    def test_mots_faibles_seuls_ne_suffisent_pas(self):
        # « auto », « et », « plus », « one »… ne sont retirés que s'il y a aussi un mot d'appareil
        self.assertEqual(self.name("Garage auto et plus"), "Garage auto et plus")

    def test_ne_vide_pas_un_nom_a_deux_segments(self):
        self.assertEqual(self.name("FRED PA-1 – Gymnase du Parc"), "Gymnase du Parc")


class Helpers(unittest.TestCase):
    def test_parse_date_valide(self):
        from datetime import date
        self.assertEqual(bd.parse_date("2027-03-01", date(2000, 1, 1), date(2100, 1, 1)), "2027-03-01")

    def test_parse_date_hors_bornes_ou_illisible(self):
        from datetime import date
        lo, hi = date(2000, 1, 1), date(2100, 1, 1)
        for bad in ("1900-01-01", "2200-01-01", "n'importe quoi", "", None, "2027-13-45"):
            self.assertEqual(bd.parse_date(bad, lo, hi), "", bad)

    def test_parse_date_ignore_l_heure(self):
        from datetime import date
        self.assertEqual(bd.parse_date("2027-03-01T10:00:00", date(2000, 1, 1), date(2100, 1, 1)), "2027-03-01")

    def test_clean_espaces(self):
        self.assertEqual(bd.clean("  a   b \n c "), "a b c")
        self.assertEqual(bd.clean(None), "")

    def test_tile_key_coordonnees_negatives(self):
        self.assertEqual(bd.tile_key(-0.1, -0.1), "-1_-1")
        self.assertEqual(bd.tile_key(48.85, 2.35), "195_9")


HEADER = ["gid", "c_gid", "c_doublon", "c_etat_fonct", "c_etat", "c_lat_coor1", "c_long_coor1", "c_dispo_horaires", "c_lc_ped",
          "c_dae_mobile", "c_acc_complt", "c_disp_complt", "c_dtpr_lcad", "c_dtpr_lcped", "c_dtpr_bat", "c_expt_rais",
          "c_nom", "c_adr_num", "c_adr_voie", "c_com_nom", "c_com_cp", "c_acc", "c_etat_valid", "c_acc_etg", "c_dermnt"]


def row(**over):
    # le gid de la source est un numéro de ligne instable : il est faux exprès ici, seul c_gid (donné par gid=…) doit servir d'identifiant
    if "gid" in over:
        over["c_gid"] = over.pop("gid")
    base = dict(gid="777000", c_gid="1", c_doublon="f", c_etat_fonct="En fonctionnement", c_etat="", c_lat_coor1="48.85", c_long_coor1="2.35",
                c_dispo_horaires="Mo-Fr 08:00-18:00", c_lc_ped="t", c_dae_mobile="f", c_acc_complt="", c_disp_complt="",
                c_dtpr_lcad="2030-01-01", c_dtpr_lcped="2030-01-01", c_dtpr_bat="2030-01-01", c_expt_rais="Mairie de Paris",
                c_nom="DAE Hall", c_adr_num="1", c_adr_voie="rue A", c_com_nom="Paris", c_com_cp="75001", c_acc="Extérieur",
                c_etat_valid="validées", c_acc_etg="", c_dermnt="2025-06-01")
    base.update(over)
    return [base[h] for h in HEADER]


class EndToEnd(unittest.TestCase):
    """Construit un jeu à partir d'un petit CSV truqué, dans un dossier temporaire (le vrai data/ n'est pas touché)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        (cls.tmp / "scripts").mkdir()
        shutil.copy(ROOT / "scripts" / "build_dataset.py", cls.tmp / "scripts")
        rows = [
            row(gid="1"),                                                          # normal
            row(gid="2", c_doublon="t"),                                           # doublon : écarté
            row(gid="3", c_etat_fonct="Hors service"),                             # hors service : écarté
            row(gid="4", c_etat_fonct="Supprimé définitivement"),                  # supprimé : écarté
            row(gid="5", c_etat="A supprimer"),                                    # à supprimer : écarté
            row(gid="6", c_lat_coor1="0", c_long_coor1="0"),                       # coordonnées nulles : écarté
            row(gid="7", c_lat_coor1="10", c_long_coor1="100"),                    # hors de France : écarté
            row(gid="8", c_lat_coor1="abc"),                                       # illisible : écarté
            row(gid="9", c_dispo_horaires="off"),                                  # horaires « off » : blanchis
            row(gid="10", c_lc_ped="f"),                                           # non pédiatrique
            row(gid="11", c_lc_ped=""),                                            # pédiatrique inconnu
            row(gid="12", c_etat_fonct="Absent momentanément"),                    # drapeau 2
            row(gid="13", c_dae_mobile="t"),                                       # drapeau 1
            row(gid="14", c_dtpr_lcad="1850-01-01", c_dermnt="2999-01-01"),        # dates absurdes : blanchies
            row(gid="15", c_acc="Intérieur", c_etat_valid="mises en doute"),       # intérieur, validation 2
            row(gid="16", c_acc_complt="code 1234", c_disp_complt="L au V 8h/17h"),  # précisions fusionnées
            row(gid="17", c_etat_valid=""),                                        # validation non renseignée : jamais « en attente »
        ]
        src = cls.tmp / "source.csv"
        with open(src, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(HEADER)
            w.writerows(rows)
        cls.build = subprocess.run([sys.executable, "-I", str(cls.tmp / "scripts" / "build_dataset.py"), str(src), "2026-10-28-14"],
                                 capture_output=True, text=True)
        out = cls.tmp / "data" / "2026-10-28-14"
        cls.meta = json.loads((out / "meta.json").read_text(encoding="utf-8"))
        cls.recs = {}
        for tile in (out / "tiles").glob("*.json"):
            for r in json.loads(tile.read_text(encoding="utf-8")):
                cls.recs[r[0]] = dict(zip(cls.meta["fields"], r))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_construction_reussie(self):
        self.assertEqual(self.build.returncode, 0, self.build.stderr)

    def test_identifiant_vient_de_c_gid(self):
        self.assertNotIn(777000, self.recs)
        self.assertEqual(self.meta["formatVersion"], bd.FORMAT_VERSION)

    def test_dae_ecartes(self):
        for gid in (2, 3, 4, 5, 6, 7, 8):
            self.assertNotIn(gid, self.recs, f"gid {gid} aurait dû être écarté")
        self.assertEqual(sorted(self.recs), [1, 9, 10, 11, 12, 13, 14, 15, 16, 17])
        self.assertEqual(self.meta["count"], 10)

    def test_champs_de_base(self):
        r = self.recs[1]
        self.assertEqual((r["lat"], r["lon"]), (48.85, 2.35))
        self.assertEqual((r["acces"], r["ped"], r["validation"], r["flags"]), (0, 1, 0, 0))
        self.assertEqual((r["exploitant"], r["nom"], r["adresse"], r["commune"], r["cp"]), ("Mairie de Paris", "Hall", "1 rue A", "Paris", "75001"))
        self.assertEqual(r["horaires"], "Mo-Fr 08:00-18:00")

    def test_horaires_off_blanchis(self):
        self.assertEqual(self.recs[9]["horaires"], "")

    def test_pediatrique(self):
        self.assertEqual((self.recs[1]["ped"], self.recs[10]["ped"], self.recs[11]["ped"]), (1, 0, None))

    def test_drapeaux(self):
        self.assertEqual((self.recs[12]["flags"], self.recs[13]["flags"]), (2, 1))

    def test_dates_absurdes_blanchies(self):
        self.assertEqual(self.recs[14]["dtLcad"], "")
        self.assertEqual(self.recs[14]["dtMaint"], "")
        self.assertEqual(self.recs[1]["dtMaint"], "2025-06-01")

    def test_interieur_et_validation(self):
        self.assertEqual((self.recs[15]["acces"], self.recs[15]["validation"]), (1, 2))

    def test_validation_non_renseignee(self):
        self.assertEqual(self.recs[17]["validation"], 3)
        self.assertEqual(self.recs[1]["validation"], 0)

    def test_precisions_fusionnees(self):
        self.assertEqual(self.recs[16]["complement"], "code 1234 ; L au V 8h/17h")

    def test_index_mis_a_jour(self):
        index = json.loads((self.tmp / "data" / "index.json").read_text())
        self.assertEqual(index["latest"], "2026-10-28-14")
        self.assertEqual(index["datasets"][0]["count"], 10)

    def test_refuse_d_ecraser(self):
        again = subprocess.run([sys.executable, "-I", str(self.tmp / "scripts" / "build_dataset.py"), str(self.tmp / "source.csv"), "2026-10-28-14"],
                               capture_output=True, text=True)
        self.assertNotEqual(again.returncode, 0)

    def test_identifiant_invalide_refuse(self):
        bad = subprocess.run([sys.executable, "-I", str(self.tmp / "scripts" / "build_dataset.py"), str(self.tmp / "source.csv"), "demain"],
                             capture_output=True, text=True)
        self.assertNotEqual(bad.returncode, 0)


class MiseAJour(unittest.TestCase):
    """update.main() sans réseau : la source et le téléchargement sont simulés."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = (update.DATA, update.source_csv, update.get, update.subprocess.run, sys.argv)
        update.DATA = self.tmp
        sys.argv = ["update.py"]
        self.stamp = datetime(2026, 10, 28, 14, tzinfo=timezone.utc)

    def tearDown(self):
        update.DATA, update.source_csv, update.get, update.subprocess.run, sys.argv = self.saved
        shutil.rmtree(self.tmp, ignore_errors=True)

    def index(self, datasets):
        (self.tmp / "index.json").write_text(json.dumps({"datasets": datasets, "latest": datasets[0]["date"] if datasets else None}))

    def test_deja_publie_par_empreinte_ou_par_identifiant(self):
        index = {"datasets": [{"date": "2026-10-28-14", "sourceSha1": "abc"}]}
        self.assertTrue(update.already_published(index, "abc", "2026-10-29-09"))
        self.assertTrue(update.already_published(index, "", "2026-10-28-14"))  # source sans empreinte : l'identifiant décide
        self.assertFalse(update.already_published(index, "", "2026-10-29-09"))
        self.assertFalse(update.already_published({"datasets": [{"date": "2026-10-20", "sourceSha1": ""}]}, "", "2026-10-29-09"))

    def test_source_sans_empreinte_deja_publiee_ne_fait_pas_echouer(self):
        self.index([{"date": "2026-10-28-14", "count": 1, "sourceSha1": "abc"}])
        update.source_csv = lambda: ("https://exemple/geodae.csv", "", self.stamp)
        update.main()  # « déjà à jour » : retour normal, pas de sys.exit ni de téléchargement

    def test_echec_de_construction_ne_laisse_rien(self):
        import io
        self.index([{"date": "2026-10-20", "count": 100, "sourceSha1": "old"}])
        saved_index = (self.tmp / "index.json").read_text()
        update.source_csv = lambda: ("https://exemple/geodae.csv", "", self.stamp)
        update.get = lambda url: io.BytesIO(b"gid;x\n1;2\n")

        def crash(cmd, check):
            (self.tmp / "2026-10-28-14").mkdir()  # dossier partiel, comme après un plantage en cours d'écriture
            raise subprocess.CalledProcessError(1, cmd)
        update.subprocess.run = crash
        with self.assertRaises(SystemExit):
            update.main()
        self.assertFalse((self.tmp / "2026-10-28-14").exists())
        self.assertFalse((self.tmp / "raw" / "geodae_2026-10-28-14.csv").exists())
        self.assertEqual((self.tmp / "index.json").read_text(), saved_index)
        # et le prochain essai n'est pas bloqué par un dossier « existe déjà »
        self.assertFalse((self.tmp / "2026-10-28-14").exists())


class Conservation(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.saved = update.DATA
        update.DATA = self.tmp

    def tearDown(self):
        update.DATA = self.saved
        shutil.rmtree(self.tmp, ignore_errors=True)

    def make(self, ids):
        for i in ids:
            (self.tmp / i).mkdir()
        return {"datasets": [{"date": i, "count": 1} for i in ids]}

    def test_garde_les_trois_plus_recents(self):
        index = self.make(["2026-10-23-13", "2026-10-26-23", "2026-10-28-14", "2026-10-27-10", "2026-10-20"])
        removed = update.prune(index)
        self.assertEqual([d["date"] for d in index["datasets"]], ["2026-10-28-14", "2026-10-27-10", "2026-10-26-23"])
        self.assertEqual(sorted(d["date"] for d in removed), ["2026-10-20", "2026-10-23-13"])
        self.assertEqual(index["latest"], "2026-10-28-14")
        self.assertEqual(sorted(p.name for p in self.tmp.iterdir() if p.is_dir()), ["2026-10-26-23", "2026-10-27-10", "2026-10-28-14"])

    def test_moins_de_trois_jeux_rien_supprime(self):
        index = self.make(["2026-10-23-13", "2026-10-28-14"])
        self.assertEqual(update.prune(index), [])
        self.assertEqual(len(index["datasets"]), 2)

    def test_ancien_format_sans_heure_trie_correctement(self):
        index = self.make(["2026-10-23", "2026-10-23-13", "2026-10-22"])
        update.prune(index)
        self.assertEqual(index["latest"], "2026-10-23-13")

    def test_dataset_time(self):
        self.assertEqual(update.dataset_time({"date": "2026-10-23"}), datetime(2026, 10, 23, 0, tzinfo=timezone.utc))
        self.assertEqual(update.dataset_time({"date": "2026-10-23-13"}), datetime(2026, 10, 23, 13, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
