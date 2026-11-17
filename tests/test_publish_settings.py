"""Réglages de publication (scripts/publish_settings.py) : indexation et balises de vérification, appliquées au seul dossier publié."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "publish_settings.py"
sys.path.insert(0, str(ROOT / "scripts"))
import publish_settings as ps  # noqa: E402

PAGES = ["index.html", "index.en.html", "guide.html", "guia.es.html", "404.html"]
GOOGLE = "AbC123_xyz-0987654321"
BING = "0123456789ABCDEF0123456789ABCDEF"


class Folder(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        for name in PAGES:
            shutil.copy(ROOT / name, self.dir / name)
        self.addCleanup(self.tmp.cleanup)

    def read(self, name):
        return (self.dir / name).read_text(encoding="utf-8")

    def noindex(self, name):
        return 'content="noindex, nofollow"' in self.read(name)


class ParDefaut(Folder):
    def test_sans_variables_rien_ne_change(self):
        before = {n: self.read(n) for n in PAGES}
        done = ps.apply(self.dir, {})
        self.assertEqual(done, {"indexables": 0, "balises": []})
        self.assertEqual({n: self.read(n) for n in PAGES}, before)
        for name in PAGES:
            self.assertTrue(self.noindex(name), f"{name} reste en noindex")

    def test_variables_vides_ou_fausses_ne_changent_rien(self):
        for value in ("", "false", "0", "non", "peut-être", "   "):
            ps.apply(self.dir, {"INDEXABLE": value, "GOOGLE_SITE_VERIFICATION": "", "BING_SITE_VERIFICATION": "  "})
            for name in PAGES:
                self.assertTrue(self.noindex(name), f"{name} avec INDEXABLE={value!r}")


class Indexation(Folder):
    def test_indexable_retire_le_noindex_sauf_de_la_page_d_erreur(self):
        done = ps.apply(self.dir, {"INDEXABLE": "true"})
        self.assertEqual(done["indexables"], 4)
        for name in PAGES:
            self.assertEqual(self.noindex(name), name == "404.html", name)

    def test_formes_acceptees(self):
        for value in ("true", "TRUE", "1", "yes", "oui", " true "):
            folder = self.dir / value.strip()
            folder.mkdir(exist_ok=True)
            shutil.copy(ROOT / "index.html", folder / "index.html")
            self.assertEqual(ps.apply(folder, {"INDEXABLE": value})["indexables"], 1, value)

    def test_appliquer_deux_fois_ne_change_plus_rien(self):
        env = {"INDEXABLE": "true", "GOOGLE_SITE_VERIFICATION": GOOGLE}
        ps.apply(self.dir, env)
        after = {n: self.read(n) for n in PAGES}
        self.assertEqual(ps.apply(self.dir, env), {"indexables": 0, "balises": []})
        self.assertEqual({n: self.read(n) for n in PAGES}, after)


class Verification(Folder):
    def test_les_balises_vont_sur_la_page_d_accueil_seulement(self):
        done = ps.apply(self.dir, {"GOOGLE_SITE_VERIFICATION": GOOGLE, "BING_SITE_VERIFICATION": BING})
        self.assertEqual(done["balises"], ["google-site-verification", "msvalidate.01"])
        home = self.read("index.html")
        self.assertIn(f'<meta name="google-site-verification" content="{GOOGLE}">', home)
        self.assertIn(f'<meta name="msvalidate.01" content="{BING}">', home)
        self.assertLess(home.index("google-site-verification"), home.index("</head>"), "dans l'en-tête")
        for name in PAGES[1:]:
            self.assertNotIn("site-verification", self.read(name))
            self.assertNotIn("msvalidate", self.read(name))

    def test_une_seule_balise_par_service(self):
        ps.apply(self.dir, {"GOOGLE_SITE_VERIFICATION": GOOGLE})
        ps.apply(self.dir, {"GOOGLE_SITE_VERIFICATION": GOOGLE})
        self.assertEqual(self.read("index.html").count("google-site-verification"), 1)

    def test_une_valeur_mal_formee_est_refusee_sans_rien_ecrire(self):
        before = {n: self.read(n) for n in PAGES}
        for bad in ('x"><script>alert(1)</script>', "court", "avec espace dedans!!", "a" * 200, "<b>", 'abc"def1234567890'):
            with self.assertRaises(SystemExit, msg=bad):
                ps.apply(self.dir, {"INDEXABLE": "true", "GOOGLE_SITE_VERIFICATION": bad})
            self.assertEqual({n: self.read(n) for n in PAGES}, before, f"rien n'est écrit : {bad!r}")


class LigneDeCommande(Folder):
    def run_script(self, **env):
        base = {k: v for k, v in os.environ.items() if k not in ("INDEXABLE", "GOOGLE_SITE_VERIFICATION", "BING_SITE_VERIFICATION")}
        return subprocess.run([sys.executable, "-I", str(SCRIPT), str(self.dir)], env={**base, **env}, capture_output=True, text=True)

    def test_compte_rendu_et_code_de_sortie(self):
        r = self.run_script(INDEXABLE="true", GOOGLE_SITE_VERIFICATION=GOOGLE)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("4 page(s)", r.stdout)
        self.assertIn("google-site-verification", r.stdout)

    def test_sans_variables_le_compte_rendu_le_dit(self):
        r = self.run_script()
        self.assertEqual(r.returncode, 0)
        self.assertIn("inchangée", r.stdout)

    def test_valeur_refusee_code_1(self):
        self.assertEqual(self.run_script(BING_SITE_VERIFICATION="<script>").returncode, 1)

    def test_dossier_inconnu(self):
        r = subprocess.run([sys.executable, "-I", str(SCRIPT), str(self.dir / "absent")], capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)


class DepotInchange(unittest.TestCase):
    def test_le_depot_reste_en_noindex_et_sans_balise(self):
        for name in PAGES:
            html = (ROOT / name).read_text(encoding="utf-8")
            self.assertIn('content="noindex, nofollow"', html, name)
            self.assertNotIn("site-verification", html)
            self.assertNotIn("msvalidate", html)

    def test_le_workflow_passe_les_variables_au_script(self):
        yml = (ROOT / ".github" / "workflows" / "update.yml").read_text(encoding="utf-8")
        for variable in ("INDEXABLE", "GOOGLE_SITE_VERIFICATION", "BING_SITE_VERIFICATION"):
            self.assertIn(f"{variable}: ${{{{ vars.{variable} }}}}", yml)
        self.assertLess(yml.index("publish_settings.py"), yml.index("stamp_assets.py"), "réglages avant la marque de version des fichiers")


if __name__ == "__main__":
    unittest.main()
