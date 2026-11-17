"""Table des communes (liens ?cp= et ?code_insee=) : construction à partir de réponses de l'API simulées, sans réseau."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_places as bp  # noqa: E402


def commune(code, lon, lat, *cps):
    return {"code": code, "centre": {"type": "Point", "coordinates": [lon, lat]}, "codesPostaux": list(cps)}


class TableDesCommunes(unittest.TestCase):
    def setUp(self):
        self.t = bp.build(
            [commune("75056", 2.34881, 48.85341, "75001", "75002"), commune("01053", 5.22571, 46.20519, "01000"),
             commune("01344", 5.2, 46.15, "01000"), {"code": "00000", "codesPostaux": ["00001"]}],
            [commune("75101", 2.336, 48.862, "75001"), commune("75102", 2.3428, 48.8679, "75002")],
        )

    def test_centres_arrondis(self):
        self.assertEqual(self.t["c"]["01053"], [5.2257, 46.2052])

    def test_code_postal_partage(self):
        self.assertEqual(self.t["p"]["01000"], ["01053", "01344"])

    def test_paris_entier_retire_des_codes_postaux_d_arrondissement(self):
        self.assertEqual(self.t["p"]["75002"], ["75102"])
        self.assertEqual(self.t["p"]["75001"], ["75101"])

    def test_paris_entier_reste_accessible_par_son_code_insee(self):
        self.assertIn("75056", self.t["c"])

    def test_commune_sans_centre_ignoree(self):
        self.assertNotIn("00000", self.t["c"])
        self.assertNotIn("00001", self.t["p"])

    def test_version(self):
        self.assertEqual(self.t["v"], bp.FORMAT_VERSION)


if __name__ == "__main__":
    unittest.main()
