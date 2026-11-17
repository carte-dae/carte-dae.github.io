"""Pages générées (scripts/build_site.py) : à jour par rapport aux modèles, aux textes et au contenu, et sans reste d'emplacement."""
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_site as bs  # noqa: E402


class PagesGenerees(unittest.TestCase):
    def test_ordre_des_langues(self):
        self.assertEqual(bs.display_order(), ["fr", "de", "en", "es", "it", "nl", "pt"])

    def test_les_fichiers_generes_sont_a_jour(self):
        stale = [name for name, content in bs.build().items() if (ROOT / name).read_text(encoding="utf-8") != content]
        self.assertEqual(stale, [], "relancer : python3 scripts/build_site.py")

    def test_la_commande_de_verification_reussit(self):
        r = subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "build_site.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_aucun_emplacement_ni_ancien_marquage_ne_reste(self):
        for name, content in bs.build().items():
            self.assertNotIn("{{", content, name)
            self.assertNotIn("data-i18n", content, name)

    def test_chaque_page_generee_porte_sa_langue_et_sa_banniere(self):
        for name, content in bs.build().items():
            if name.endswith(".html"):
                self.assertTrue(content.startswith("<!doctype html>\n<!-- Page générée par scripts/build_site.py"), name)
                lang = re.search(r"\.([a-z]{2})\.html$", name)
                self.assertIn(f'<html lang="{lang.group(1) if lang else "fr"}">', content, name)  # 404.html : langue par défaut

    def test_les_pages_chargent_le_fichier_de_langue_apres_i18n(self):
        for name in ("index.html", "guide.html"):
            scripts = re.findall(r'<script src="(js/[^"]+)"', bs.build()[name])
            self.assertEqual(scripts[:2], ["js/i18n.js", "js/lang/fr.js"], name)

    def test_le_texte_rendu_est_echappe(self):
        self.assertEqual(bs.esc_text("a < b & c :"), "a &lt; b &amp; c&nbsp;:")
        self.assertEqual(bs.esc_attr('dit "oui" d\'abord'), 'dit &quot;oui&quot; d\'abord')  # l'apostrophe reste telle quelle

    def test_la_carte_en_langue_par_defaut_est_la_racine_les_autres_pages_ont_leur_suffixe(self):
        self.assertEqual(bs.page_url("index", "fr"), "./")
        self.assertEqual(bs.page_url("index", "en"), "index.en.html")
        self.assertEqual(bs.page_url("guide", "fr"), "guide.html")
        self.assertEqual(bs.page_url("guide", "en"), "guide.en.html")
        self.assertEqual(bs.page_url("guide", "es"), "guia.es.html")  # nom de page traduit

    def test_les_liens_internes_suivent_la_langue(self):
        page = {"k": '<a href="{{page:guide}}">x</a>'}
        self.assertEqual(bs.render("{{h:k}}", "fr", page, {}), '<a href="guide.html">x</a>')
        self.assertEqual(bs.render("{{h:k}}", "es", page, {}), '<a href="guia.es.html">x</a>')

    def test_nom_de_page_traduit(self):
        saved = dict(bs.LANGUAGES)
        bs.LANGUAGES["en"] = {"og_locale": "en_GB", "name": "English", "quote": ("“", "”"), "slugs": {"guide": "aide"}}
        try:
            self.assertEqual(bs.page_name("guide", "en"), "aide.en.html")
            self.assertEqual(bs.page_url("guide", "en"), "aide.en.html")
            self.assertEqual(bs.page_url("index", "en"), "index.en.html")  # la carte garde son nom
            self.assertEqual(bs.page_name("guide", "fr"), "guide.html")  # le français ne change pas
            self.assertEqual(bs.render("{{page:guide}}", "en", {}, {}), "aide.en.html")
            self.assertIn('href="aide.en.html"', bs.render("{{language_links}}", "fr", {"lang.button": "x"}, {}))
            files = bs.check_languages()
            for expected in ("guide.html", "aide.en.html", "index.en.html", "index.html"):
                self.assertIn(expected, files)  # (les autres langues déclarées ont leurs propres pages)
        finally:
            bs.LANGUAGES.clear()
            bs.LANGUAGES.update(saved)

    def test_nom_de_page_invalide_ou_en_double_refuse(self):
        saved = dict(bs.LANGUAGES)
        try:
            for bad in ("Guide", "mon guide", "a_guide", "-guide", "guide-", "", "guidé"):
                bs.LANGUAGES["en"] = {"og_locale": "en_GB", "name": "English", "quote": ("“", "”"), "slugs": {"guide": bad}}
                with self.assertRaises(bs.BuildError, msg=repr(bad)):
                    bs.check_languages()
            bs.LANGUAGES["en"] = {"og_locale": "en_GB", "name": "English", "quote": ("“", "”"), "slugs": {"guide": "index"}}
            with self.assertRaises(bs.BuildError):  # guide = index : deux pages sous le même nom
                bs.check_languages()
        finally:
            bs.LANGUAGES.clear()
            bs.LANGUAGES.update(saved)

    def test_menu_et_liens_de_langue_avec_plusieurs_langues(self):
        saved = dict(bs.LANGUAGES)
        bs.LANGUAGES["en"] = {"og_locale": "en_GB", "name": "English", "quote": ("“", "”")}
        try:
            menu = bs.render("{{language_menu:index}}", "en", {}, {})
            self.assertIn('<a href="./" lang="fr" hreflang="fr">Français</a>', menu)
            self.assertIn('<a href="index.en.html" lang="en" hreflang="en" aria-current="true">English</a>', menu)
            links = bs.render("{{language_links}}", "fr", {"lang.button": "Changer de langue"}, {})
            self.assertIn('<nav class="langs" aria-label="Changer de langue">', links)
            self.assertIn('href="guide.en.html"', links)
            self.assertEqual(bs.render("{{page:index}}", "en", {}, {}), "index.en.html")
            self.assertEqual(bs.render("{{q:k}}", "en", {"k": "Data"}, {}), "“Data”")
        finally:
            bs.LANGUAGES.clear()
            bs.LANGUAGES.update(saved)

    def test_page_d_erreur_message_complet_en_francais_et_en_anglais_une_ligne_pour_les_autres(self):
        notfound = bs.render("{{notfound_blocks}}", "fr", *bs.load_strings("fr"))
        self.assertEqual(notfound.count("<h1>"), len(bs.NOTFOUND_FULL))  # un message complet par langue de NOTFOUND_FULL
        for code in bs.NOTFOUND_FULL:
            self.assertIn(f'<section lang="{code}">', notfound)
        others = [code for code in bs.LANGUAGES if code not in bs.NOTFOUND_FULL]
        self.assertEqual(notfound.count("<li lang="), len(others))  # une ligne pour chacune des autres
        for code in others:
            self.assertIn(f'<li lang="{code}"><a data-page="{bs.page_url("index", code)}"', notfound)

    def test_le_bouton_de_langue_et_les_liens_listent_toutes_les_langues(self):
        control = bs.render("{{language_control}}", "fr", *bs.load_strings("fr"))
        links = bs.render("{{language_links}}", "fr", *bs.load_strings("fr"))
        for code, info in bs.LANGUAGES.items():
            self.assertIn(f'lang="{code}" hreflang="{code}"', control)
            self.assertIn(f'<a href="{bs.page_url("guide", code)}" lang="{code}" hreflang="{code}"', links)
            self.assertIn(info["name"], control)

    def test_le_code_de_langue_est_en_majuscules(self):
        self.assertEqual(bs.render("{{lang_code}}", "fr", {}, {}), "FR")

    def test_citation_d_un_bouton_selon_la_langue(self):
        self.assertEqual(bs.render("{{q:k}}", "fr", {"k": "Données"}, {}), "«&nbsp;Données&nbsp;»")

    def test_le_contenu_et_les_morceaux_ont_leurs_propres_emplacements(self):
        self.assertEqual(bs.render("<main>{{content}}</main>", "fr", {"k": "x"}, {}, content="[{{t:k}}]"), "<main>[x]</main>")
        self.assertIn("sim-custom-form", bs.render("{{partial:sim-form}}", "fr", *bs.load_strings("fr")))

    def test_un_morceau_inconnu_fait_echouer_la_generation(self):
        with self.assertRaises(bs.BuildError):
            bs.render("{{partial:nexiste-pas}}", "fr", {}, {})

    def test_un_texte_inconnu_fait_echouer_la_generation(self):
        with self.assertRaises(bs.BuildError):
            bs.render("{{t:texte.qui.nexiste.pas}}", "fr", {}, {})

    def test_le_texte_html_garde_ses_balises_et_ses_espaces_insecables(self):
        self.assertEqual(bs.render("{{h:k}}", "fr", {"k": "a : <b>x</b>"}, {}), "a&nbsp;: <b>x</b>")


if __name__ == "__main__":
    unittest.main()
