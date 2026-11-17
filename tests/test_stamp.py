"""Marque de version des fichiers css/js avant publication (scripts/stamp_assets.py)."""
import hashlib
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import stamp_assets as st  # noqa: E402

PAGE = """<!doctype html><html><head>
<link rel="icon" href="icons/f.svg">
<link rel="stylesheet" href="https://cdn.exemple/x.css">
<link rel="stylesheet" href="css/style.css">
<link rel="manifest" href="icons/m.webmanifest">
</head><body>
<script src="https://cdn.exemple/x.js"></script>
<script src="/absolu.js"></script>
<script src="js/app.js"></script>
</body></html>"""


class Marque(unittest.TestCase):
    def setUp(self):
        self.site = Path(tempfile.mkdtemp())
        (self.site / "css").mkdir()
        (self.site / "js").mkdir()
        (self.site / "css/style.css").write_text("body{}", encoding="utf-8")
        (self.site / "js/app.js").write_text("let a=1;", encoding="utf-8")
        (self.site / "index.html").write_text(PAGE, encoding="utf-8")
        (self.site / "autre.html").write_text(PAGE, encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.site, ignore_errors=True)

    def stamp(self):
        return st.stamp_page(self.site / "index.html", self.site)

    def v(self, name):
        return hashlib.sha1((self.site / name).read_bytes()).hexdigest()[:8]

    def test_css_et_js_locaux_sont_marques_par_leur_contenu(self):
        self.assertEqual(self.stamp(), 2)
        html = (self.site / "index.html").read_text(encoding="utf-8")
        self.assertIn(f'href="css/style.css?v={self.v("css/style.css")}"', html)
        self.assertIn(f'src="js/app.js?v={self.v("js/app.js")}"', html)

    def test_le_reste_est_intact(self):
        self.stamp()
        html = (self.site / "index.html").read_text(encoding="utf-8")
        for intact in ('href="icons/f.svg"', 'href="https://cdn.exemple/x.css"', 'href="icons/m.webmanifest"',
                       'src="https://cdn.exemple/x.js"', 'src="/absolu.js"'):
            self.assertIn(intact, html)

    def test_un_fichier_modifie_change_de_marque_un_fichier_inchange_garde_la_sienne(self):
        self.stamp()
        before = (self.site / "index.html").read_text(encoding="utf-8")
        (self.site / "css/style.css").write_text("body{color:red}", encoding="utf-8")
        st.stamp_page(self.site / "autre.html", self.site)
        after = (self.site / "autre.html").read_text(encoding="utf-8")
        self.assertNotEqual(re.search(r"style\.css\?v=(\w+)", before).group(1), re.search(r"style\.css\?v=(\w+)", after).group(1))
        self.assertEqual(re.search(r"app\.js\?v=(\w+)", before).group(1), re.search(r"app\.js\?v=(\w+)", after).group(1))

    def test_relancer_ne_change_rien(self):
        self.stamp()
        once = (self.site / "index.html").read_text(encoding="utf-8")
        self.stamp()
        self.assertEqual((self.site / "index.html").read_text(encoding="utf-8"), once)
        self.assertEqual(once.count("?v="), 2)

    def test_fichier_absent_fait_echouer_sans_rien_ecrire(self):
        (self.site / "js/app.js").unlink()
        with self.assertRaises(SystemExit):
            self.stamp()
        self.assertEqual((self.site / "index.html").read_text(encoding="utf-8"), PAGE)


class SiteReel(unittest.TestCase):
    def test_toutes_les_pages_du_site_sont_marquees_sans_erreur(self):
        site = Path(tempfile.mkdtemp())
        try:
            for page in ROOT.glob("*.html"):  # toutes les pages générées, dans toutes les langues
                shutil.copy(page, site / page.name)
            for folder in ("css", "js", "vendor", "icons"):
                shutil.copytree(ROOT / folder, site / folder)
            for page in site.glob("*.html"):
                st.stamp_page(page, site)
                html = page.read_text(encoding="utf-8")
                local = re.findall(r'<script[^>]+src="((?!https?:)[^"]+)"', html) + re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="((?!https?:)[^"]+)"', html)
                self.assertTrue(all(re.search(r"\?v=[0-9a-f]{8}$", ref) for ref in local), f"{page.name} : {local}")
            self.assertIn("?v=", (site / "index.html").read_text(encoding="utf-8"))
        finally:
            shutil.rmtree(site, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
