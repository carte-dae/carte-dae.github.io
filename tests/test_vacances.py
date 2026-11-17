"""Calendrier des vacances scolaires : construction à partir d'enregistrements simulés, sans réseau."""
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_vacances as bv  # noqa: E402

TODAY = date(2026, 11, 15)
# (début UTC, reprise UTC) : minuit à Paris, donc la veille à 22 h (heure d'été) ou 23 h (heure d'hiver)
PERIODES = [
    ("2026-10-16T22:00:00+00:00", "2026-11-01T23:00:00+00:00"),
    ("2026-12-18T23:00:00+00:00", "2027-01-03T23:00:00+00:00"),
    ("2027-02-12T23:00:00+00:00", "2027-02-28T23:00:00+00:00"),
    ("2027-04-09T22:00:00+00:00", "2027-04-25T22:00:00+00:00"),
    ("2027-07-02T22:00:00+00:00", "2027-09-01T22:00:00+00:00"),
]


def rec(zone, start, end, description="Vacances de la Toussaint", population="-"):
    return {"zones": zone, "description": description, "population": population, "start_date": start, "end_date": end}


def complet(extra=()):
    return [rec(z, s, e) for z in ("Zone A", "Zone B", "Zone C") for s, e in PERIODES] + list(extra)


class Calendrier(unittest.TestCase):
    def test_dates_locales_et_reprise_exclue(self):
        c = bv.build(complet(), TODAY)
        self.assertEqual(c["zones"]["A"][0], ["2026-10-17", "2026-11-02"])  # samedi -> lundi de reprise
        self.assertEqual(c["zones"]["A"][1], ["2026-12-19", "2027-01-04"])  # heure d'hiver
        self.assertEqual(c["zones"]["A"][-1], ["2027-07-03", "2027-09-02"])  # heure d'été

    def test_couverture_et_mise_a_jour(self):
        c = bv.build(complet(), TODAY)
        self.assertEqual(c["covered"], {"from": "2026-10-17", "to": "2027-09-02"})
        self.assertEqual(c["updated"], "2026-11-15")

    def test_enseignants_ponts_et_debuts_sans_reprise_ecartes(self):
        extra = [
            rec("Zone A", "2027-07-02T22:00:00+00:00", "2027-08-30T22:00:00+00:00", "Vacances d'Été", "Enseignants"),
            rec("Zone A", "2027-05-05T22:00:00+00:00", "2027-05-09T22:00:00+00:00", "Pont de l'Ascension"),
            rec("Zone A", "2028-07-03T22:00:00+00:00", "2028-07-03T22:00:00+00:00", "Début des Vacances d'Été"),
        ]
        self.assertEqual(bv.build(complet(extra), TODAY)["zones"]["A"], bv.build(complet(), TODAY)["zones"]["A"])

    def test_autres_zones_ecartees(self):
        extra = [rec("Corse", "2027-01-01T23:00:00+00:00", "2027-01-10T23:00:00+00:00"),
                 rec("Réunion", "2027-01-01T23:00:00+00:00", "2027-01-10T23:00:00+00:00")]
        self.assertEqual(set(bv.build(complet(extra), TODAY)["zones"]), {"A", "B", "C"})

    def test_periodes_qui_se_chevauchent_refusees(self):
        with self.assertRaises(RuntimeError):
            bv.build(complet([rec("Zone B", "2026-10-30T22:00:00+00:00", "2026-11-08T23:00:00+00:00")]), TODAY)

    def test_source_tronquee_refusee(self):
        with self.assertRaises(RuntimeError):
            bv.build(complet()[:10], TODAY)


class Departements(unittest.TestCase):
    def test_tous_les_departements_metropolitains_ont_une_zone_et_une_seule(self):
        self.assertEqual(set(bv.DEPARTMENT_ZONE), bv.EXPECTED_DEPARTMENTS)
        listed = " ".join(bv._ZONE_DEPARTMENTS.values()).split()
        self.assertEqual(len(listed), len(set(listed)))

    def test_exemples_connus(self):
        d = bv.DEPARTMENT_ZONE
        self.assertEqual((d["75"], d["69"], d["13"], d["67"], d["31"], d["59"]), ("C", "A", "B", "B", "C", "B"))

    def test_corse_et_outre_mer_sans_zone(self):
        self.assertTrue(all(k not in bv.DEPARTMENT_ZONE for k in ("20", "97", "98")))


if __name__ == "__main__":
    unittest.main()
