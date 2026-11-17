"""Cohérence du site : fichiers référencés par les pages, et fichiers réellement publiés par le workflow."""
import fnmatch
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "guide.html", "404.html"]


def local_refs(html):
    refs = re.findall(r'(?:href|src)="([^"#?]+)"', html)
    return [r for r in refs if not re.match(r"(https?:|tel:|sms:|mailto:|/|data:)", r) and r != "./"]


class TestSite(unittest.TestCase):
    def test_references_locales_existent(self):
        for page in PAGES:
            for ref in local_refs((ROOT / page).read_text(encoding="utf-8")):
                self.assertTrue((ROOT / ref).exists(), f"{page} référence {ref}, introuvable")

    def test_aucune_ressource_externe_chargee_par_les_pages(self):
        # un script ou une feuille de style venant d'un autre domaine rend la page dépendante de lui (panne, compromission)
        for page in PAGES:
            html = (ROOT / page).read_text(encoding="utf-8")
            external = re.findall(r'<script[^>]+src="(https?://[^"]+)"', html) + re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="(https?://[^"]+)"', html)
            self.assertEqual(external, [], f"{page} charge une ressource externe")

    def test_donnees_structurees_des_pages(self):
        # chaque page de carte et de « Guide » porte un bloc JSON-LD : valide, aux adresses absolues du site, dans la langue de la page
        site = re.search(r'SITE_URL = "([^"]+)"', (ROOT / "scripts" / "build_site.py").read_text(encoding="utf-8")).group(1)
        pages = [p for p in sorted(ROOT.glob("*.html")) if p.name != "404.html"]
        self.assertEqual(len(pages), 14)
        for path in pages:
            html = path.read_text(encoding="utf-8")
            lang = re.search(r'<html lang="([^"]+)"', html).group(1)
            blocks = re.findall(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', html, re.S)
            self.assertEqual(len(blocks), 1, f"{path.name} : un bloc JSON-LD attendu")
            data = json.loads(blocks[0])
            self.assertEqual(data["@context"], "https://schema.org")
            nodes = {n["@type"]: n for n in data["@graph"]}
            is_map = path.name.startswith("index")
            home = site if path.name == "index.html" else site + (path.name if is_map else "")
            kinds = {"WebSite", "WebApplication"} if is_map else {"WebSite", "WebPage"}
            self.assertEqual(set(nodes), kinds, path.name)
            ids = [n["@id"] for n in data["@graph"]]
            self.assertEqual(len(ids), len(set(ids)), f"{path.name} : @id en double")
            for node in nodes.values():
                self.assertEqual(node["inLanguage"], lang, f"{path.name} : langue du bloc {node['@type']}")
                self.assertTrue(node["url"].startswith(site), f"{path.name} : adresse non absolue")
                self.assertNotIn("?", node["url"], f"{path.name} : l'adresse ne doit pas porter de paramètre")
            if is_map:
                self.assertEqual(nodes["WebApplication"]["url"], home)
                self.assertEqual(nodes["WebApplication"]["areaServed"], "FR")
                self.assertTrue(nodes["WebApplication"]["audience"]["audienceType"])
                self.assertTrue(nodes["WebApplication"]["isAccessibleForFree"])
            else:
                self.assertEqual(nodes["WebPage"]["url"], site + path.name)
                self.assertTrue(nodes["WebPage"]["about"]["url"].startswith(site))
            # le bloc ne contient ni auteur ni éditeur
            self.assertNotIn("author", blocks[0]); self.assertNotIn("publisher", blocks[0])

    def test_balises_de_reference_et_de_partage(self):
        # canonique, alternatives de langue (réciproques), x-default, aperçu de partage : chaque page, dans sa langue
        import struct
        site = re.search(r'SITE_URL = "([^"]+)"', (ROOT / "scripts" / "build_site.py").read_text(encoding="utf-8")).group(1)
        pages = [p for p in sorted(ROOT.glob("*.html")) if p.name != "404.html"]
        groups = {"index": {}, "guide": {}}
        for path in pages:
            html = path.read_text(encoding="utf-8")
            lang = re.search(r'<html lang="([^"]+)"', html).group(1)
            kind = "index" if path.name.startswith("index") else "guide"
            address = site if path.name == "index.html" else site + path.name
            canonical = re.findall(r'<link rel="canonical" href="([^"]+)">', html)
            self.assertEqual(canonical, [address], f"{path.name} : canonique")
            alternates = dict(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">', html))
            self.assertEqual(len(alternates), 8, f"{path.name} : 7 langues et x-default")
            self.assertIn("pt-PT", alternates); self.assertNotIn("pt", alternates)
            self.assertEqual(alternates["x-default"], alternates["fr"], f"{path.name} : x-default doit être le français")
            self.assertIn(address, alternates.values(), f"{path.name} : la page doit se citer elle-même")
            groups[kind][path.name] = alternates
            self.assertEqual(re.findall(r'<meta property="og:url" content="([^"]+)">', html), [address])
            image = re.findall(r'<meta property="og:image" content="([^"]+)">', html)
            self.assertEqual(image, [f"{site}icons/og-{lang}.png"], f"{path.name} : image de partage de la langue")
            png = ROOT / "icons" / f"og-{lang}.png"
            self.assertTrue(png.exists(), f"{png.name} manque")
            self.assertEqual(struct.unpack(">II", png.read_bytes()[16:24]), (1200, 630), f"{png.name} : taille")
            self.assertIn('<meta property="og:image:width" content="1200">', html)
            self.assertIn('<meta name="twitter:card" content="summary_large_image">', html)
            self.assertEqual(len(re.findall(r'<meta property="og:locale:alternate"', html)), 6)
            self.assertTrue(re.search(r'<meta property="og:image:alt" content="[^"]+ - [^"]+">', html), f"{path.name} : texte alternatif de l'image")
        for kind, group in groups.items():
            sets = {tuple(sorted(a.items())) for a in group.values()}
            self.assertEqual(len(sets), 1, f"{kind} : toutes les versions doivent déclarer les mêmes alternatives (réciprocité)")

    def test_plan_du_site_et_robots(self):
        site = re.search(r'SITE_URL = "([^"]+)"', (ROOT / "scripts" / "build_site.py").read_text(encoding="utf-8")).group(1)
        sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        locs = re.findall(r"<loc>([^<]+)</loc>", sitemap)
        expected = sorted(site if p.name == "index.html" else site + p.name for p in ROOT.glob("*.html") if p.name != "404.html")
        self.assertEqual(sorted(locs), expected, "le plan du site liste les 14 pages, hors 404")
        self.assertEqual(len(re.findall(r'<xhtml:link rel="alternate" hreflang="x-default"', sitemap)), 14)
        self.assertEqual(len(re.findall(r'<xhtml:link rel="alternate"', sitemap)), 14 * 8)
        self.assertNotIn("<lastmod>", sitemap)
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn(f"Sitemap: {site}sitemap.xml", robots)
        self.assertNotIn("Disallow", robots, "un robot doit pouvoir lire les pages pour voir leur noindex")
        workflow = (ROOT / ".github/workflows/update.yml").read_text(encoding="utf-8")
        self.assertIn("sitemap.xml", workflow, "le workflow doit publier le plan du site")

    def test_leaflet_heberge_est_celui_documente(self):
        import hashlib, base64
        for name, expected in (("leaflet.js", "20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="), ("leaflet.css", "p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=")):
            digest = base64.b64encode(hashlib.sha256((ROOT / "vendor/leaflet" / name).read_bytes()).digest()).decode()
            self.assertEqual(digest, expected, f"{name} ne correspond pas à Leaflet 1.9.4")

    def test_scripts_de_la_page_a_propos_sont_des_fichiers(self):
        # le texte d'un script en ligne échapperait au test des textes de l'interface
        html = (ROOT / "guide.html").read_text(encoding="utf-8")
        self.assertEqual(re.findall(r"<script(?![^>]*\bsrc=)(?![^>]*application/ld\+json)[^>]*>\s*\S", html), [], "script en ligne dans guide.html")

    def test_i18n_est_charge_avant_les_scripts_qui_l_utilisent(self):
        for page in ("index.html", "guide.html"):
            scripts = re.findall(r'<script src="(js/[^"?]+)', (ROOT / page).read_text(encoding="utf-8"))
            self.assertEqual(scripts[0], "js/i18n.js", page)
            self.assertTrue(scripts[1].startswith("js/lang/"), f"{page} : le fichier de langue suit i18n.js")
            others = [s for s in scripts if s not in ("js/i18n.js", "js/format.js") and not s.startswith("js/lang/")]
            if "js/format.js" in scripts:
                self.assertLess(scripts.index("js/format.js"), min(scripts.index(s) for s in others), page)

    def test_aucun_texte_francais_en_dur_dans_les_feuilles_de_style(self):
        # un texte injecté par le CSS (content: "…") échapperait à toute traduction et au test des textes
        for css in (ROOT / "css").glob("*.css"):
            self.assertEqual(re.findall(r'content:\s*"[^"]*[A-Za-zÀ-ÿ][^"]*"', css.read_text(encoding="utf-8")), [], css.name)

    def test_le_suffixe_ferie_vient_du_html(self):
        self.assertIn("--holiday-suffix", (ROOT / "guide.html").read_text(encoding="utf-8"))

    def test_le_workflow_marque_la_version_des_fichiers_avant_de_publier(self):
        workflow = (ROOT / ".github/workflows/update.yml").read_text(encoding="utf-8")
        self.assertIn("scripts/stamp_assets.py out", workflow)
        self.assertLess(workflow.index("cp -r css js"), workflow.index("scripts/stamp_assets.py out"))
        self.assertLess(workflow.index("scripts/stamp_assets.py out"), workflow.index("git init"))

    def test_icones_du_manifeste_existent(self):
        manifest = ROOT / "icons" / "manifest.webmanifest"
        for icon in json.loads(manifest.read_text(encoding="utf-8"))["icons"]:
            self.assertTrue((manifest.parent / icon["src"]).exists(), icon["src"])

    def test_le_workflow_publie_tout_ce_que_les_pages_utilisent(self):
        workflow = (ROOT / ".github/workflows/update.yml").read_text(encoding="utf-8")
        copied = set()
        for line in re.findall(r"^\s*cp (?:-r )?(.+) out/\s*$", workflow, re.M):
            copied.update(line.split())
        published = lambda name: any(fnmatch.fnmatch(name, pattern) for pattern in copied)  # « *.html » : toutes les pages de la racine
        for page in sorted({p.name for p in ROOT.glob("*.html")} | set(PAGES)):
            self.assertTrue(published(page), f"{page} n'est pas publié par le workflow")
            for ref in local_refs((ROOT / page).read_text(encoding="utf-8")):
                top = ref.split("/")[0]
                self.assertTrue(published(top), f"{page} utilise {ref}, mais le workflow ne publie pas {top}")


if __name__ == "__main__":
    unittest.main()
