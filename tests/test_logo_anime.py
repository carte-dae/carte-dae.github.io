"""Logo animé de la page Guide et générateur de lien : les fichiers produits par sources/generer_icones.py sont à jour, et la page est cohérente."""
import json
import re
import sys
import unittest
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sources"))
import generer_icones as gi  # noqa: E402

GUIDES = ["guide.html", "guide.en.html", "guia.es.html", "leitfaden.de.html", "guida.it.html", "gids.nl.html", "guia.pt.html"]


def read(name):
    return (ROOT / name).read_text(encoding="utf-8")


class FichiersGeneres(unittest.TestCase):
    def test_les_logos_de_la_page_sont_a_jour(self):
        for name, expected in (("logo-anime", gi.logo_anime()), ("logo-anime-bouton", gi.logo_anime("-bouton", 58)), ("logo-anime-bouton-bas", gi.logo_anime("-bas", 58))):
            self.assertEqual(read(f"templates/partials/{name}.html"), expected + "\n", f"{name} : relancer python3 -B sources/generer_icones.py --logo-anime")

    def test_le_code_du_generateur_est_a_jour(self):
        self.assertEqual(read("js/widget-logo.js"), gi.widget_logo_js(), "js/widget-logo.js : relancer python3 -B sources/generer_icones.py --logo-anime")

    def test_le_logo_fixe_n_a_aucun_element_anime(self):
        still = gi.logo_anime("", 56, False, "aedw", "aedw-svg")
        for part in ("wave", "big", "zap", "flash", "clipPath"):
            self.assertNotIn(part, still)

    def test_le_logo_anime_du_site_et_celui_du_code_donne_ont_les_memes_dessins(self):
        site = gi.logo_anime()
        given = gi.logo_anime("", 96, True, "aedw", "aedw-svg")
        self.assertEqual(site.replace("la-", "aedw-").replace("logo-anim", "aedw-svg"), given)


class PageGuide(unittest.TestCase):
    def test_aucun_identifiant_en_double(self):
        for name in GUIDES:
            ids = re.findall(r'\bid="([^"]+)"', read(name))
            self.assertEqual(sorted(i for i in set(ids) if ids.count(i) > 1), [], f"{name} : identifiants en double")

    def test_les_textes_du_generateur_couvrent_toutes_les_langues(self):
        for name in GUIDES:
            data = json.loads(unescape(re.search(r'data-langs="([^"]*)"', read(name)).group(1)))
            self.assertEqual(sorted(data), ["de", "en", "es", "fr", "it", "nl", "pt"], name)
            for code, entry in data.items():
                self.assertEqual(entry["url"], "https://carte-dae.github.io/" + ("" if code == "fr" else f"index.{code}.html"), f"{name} {code}")
                self.assertIn("{name}", entry["place"], f"{name} {code} : la formule avec lieu doit contenir {{name}}")
                self.assertNotIn("{name}", entry["generic"], f"{name} {code}")
                self.assertTrue(entry["name"] and entry["generic"])

    def test_le_generateur_et_ses_scripts_sont_dans_chaque_page(self):
        for name in GUIDES:
            html = read(name)
            self.assertIn('id="widget-generator"', html, name)
            self.assertLess(html.index("js/widget-logo.js"), html.index("js/widget.js"), f"{name} : le logo se charge avant le générateur")


if __name__ == "__main__":
    unittest.main()
