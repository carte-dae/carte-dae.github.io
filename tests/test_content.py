"""Le texte rédigé de « Guide » (content/guide.<langue>.html) : chaque traduction doit garder la même structure que le français.

La structure, ce sont les balises, les identifiants (ancres, éléments que les scripts retrouvent), les classes, les liens et les
morceaux de page insérés : tout sauf le texte. Une traduction ne peut donc pas casser le sommaire, la simulation ou les liens.
"""
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEXT_ATTRIBUTES = {"aria-label", "title", "alt", "placeholder", "style"}  # texte lisible : propre à chaque langue


class Structure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []

    def handle_starttag(self, tag, attrs):
        # les numéros d'urgence se citent dans un ordre propre à chaque langue (15 puis 112 en français, 112 puis 15 ailleurs) :
        # l'ordre des liens « tel: » ne fait pas partie de la structure (leur présence est vérifiée à part)
        attrs = [(k, "tel:*" if k == "href" and (v or "").startswith("tel:") else v) for k, v in attrs]
        self.items.append((tag, tuple(sorted((k, v) for k, v in attrs if k not in TEXT_ATTRIBUTES))))

    def handle_endtag(self, tag):
        self.items.append(("/" + tag, ()))


def structure(html):
    parser = Structure()
    parser.feed(html)
    return parser.items


def partials(html):
    return re.findall(r"\{\{partial:([\w-]+)\}\}", html)


def contents():
    return {p.name.split(".")[1]: p.read_text(encoding="utf-8") for p in sorted((ROOT / "content").glob("guide.*.html"))}


class StructureCommuneAuxTraductions(unittest.TestCase):
    def test_chaque_langue_a_la_structure_du_francais(self):
        pages = contents()
        self.assertIn("fr", pages)
        for lang, html in pages.items():
            self.assertEqual(structure(html), structure(pages["fr"]), f"« Guide » ({lang}) n'a pas la même structure que le français")
            self.assertEqual(partials(html), partials(pages["fr"]), lang)

    def test_chaque_ancre_du_sommaire_existe(self):
        for lang, html in contents().items():
            ids = set(re.findall(r'\bid="([^"]+)"', html))
            for anchor in re.findall(r'href="#([^"]+)"', html):
                self.assertIn(anchor, ids, f"{lang} : l'ancre #{anchor} n'existe pas")

    def test_numeros_d_urgence_dans_l_ordre_de_chaque_langue(self):
        # une ligne qui cite les deux numéros : le 15 d'abord en français, le 112 d'abord dans les autres langues
        for lang, html in contents().items():
            first, second = ("15", "112") if lang == "fr" else ("112", "15")
            for line in html.split("\n"):
                numbers = re.findall(r'href="tel:(\d+)"', line)
                if len(numbers) > 1:
                    self.assertEqual(numbers, [first, second], f"{lang} : ordre des numéros d'urgence")
            self.assertEqual(sorted(set(re.findall(r'href="tel:(\d+)"', html))), ["112", "15"], f"{lang} : les deux numéros doivent figurer")

    def test_les_liens_importants_sont_dans_chaque_langue(self):
        for lang, html in contents().items():
            # le lien vers la carte (dans la même langue) est dans les boutons du haut et du bas, qui sont des morceaux de page partagés
            self.assertTrue('href="{{page:index}}"' in html or ("{{partial:open-map-sticky}}" in html and "{{partial:open-map-end}}" in html), f"{lang} : retour à la carte manquant")
        for name in ("open-map-sticky", "open-map-end"):
            partial = (ROOT / "templates" / "partials" / f"{name}.html").read_text(encoding="utf-8")
            self.assertIn('href="{{page:index}}"', partial, f"{name} : le bouton doit mener à la carte")


class ComparaisonDeStructure(unittest.TestCase):
    BASE = '<section id="a"><p class="x">Bonjour <a href="https://exemple.test/a">15</a></p></section>'

    def test_le_texte_ne_change_pas_la_structure(self):
        self.assertEqual(structure(self.BASE), structure('<section id="a"><p class="x">Hello <a href="https://exemple.test/a">fifteen</a></p></section>'))

    def test_l_ordre_des_attributs_ne_compte_pas(self):
        self.assertEqual(structure('<a href="x" class="y">t</a>'), structure('<a class="y" href="x">t</a>'))

    def test_un_lien_une_classe_un_id_ou_une_balise_en_plus_est_detecte(self):
        for broken in ('<section id="a"><p class="x">B <a href="https://exemple.test/b">15</a></p></section>',
                       '<section id="b"><p class="x">B <a href="https://exemple.test/a">15</a></p></section>',
                       '<section id="a"><p class="z">B <a href="https://exemple.test/a">15</a></p></section>',
                       '<section id="a"><p class="x">B <a href="https://exemple.test/a">15</a></p><p>en trop</p></section>',
                       '<section id="a"><p class="x">B 15</p></section>'):
            self.assertNotEqual(structure(self.BASE), structure(broken), broken)

    def test_l_ordre_des_numeros_d_urgence_ne_compte_pas_dans_la_structure(self):
        fr = '<p><a href="tel:15">15</a> ou <a href="tel:112">112</a></p>'
        en = '<p><a href="tel:112">112</a> or <a href="tel:15">15</a></p>'
        self.assertEqual(structure(fr), structure(en))

    def test_un_lien_tel_en_moins_est_detecte(self):
        self.assertNotEqual(structure('<p><a href="tel:15">15</a> <a href="tel:112">112</a></p>'), structure('<p><a href="tel:15">15</a></p>'))

    def test_un_texte_d_attribut_peut_etre_traduit(self):
        self.assertEqual(structure('<nav aria-label="Sommaire"><ul></ul></nav>'), structure('<nav aria-label="Contents"><ul></ul></nav>'))


if __name__ == "__main__":
    unittest.main()
