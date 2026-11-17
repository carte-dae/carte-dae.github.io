#!/bin/sh
# Lance tous les tests depuis la racine du projet : sh tests/run.sh
cd "$(dirname "$0")/.." || exit 1
status=0
echo "== Logique du navigateur (horaires, maintenance, sélection)"; node tests/app.test.js || status=1
echo; echo "== Même logique en fuseau Antilles (dates, jours, heures)"; TZ=America/Guadeloupe node tests/app.test.js || status=1
echo; echo "== Textes (clés des modèles et des scripts, langues cohérentes)"; node tests/i18n.test.js || status=1
echo; echo "== Rendu en anglais (horaires, dates, prudence des libellés)"; node tests/en.test.js || status=1
echo; echo "== Rendu en espagnol (horaires, dates, prudence des libellés)"; node tests/es.test.js || status=1
echo; echo "== Rendu en allemand (horaires, dates, prudence des libellés)"; node tests/de.test.js || status=1
echo; echo "== Rendu en italien (horaires, dates, prudence des libellés)"; node tests/it.test.js || status=1
echo; echo "== Rendu en néerlandais (horaires, dates, prudence des libellés)"; node tests/nl.test.js || status=1
echo; echo "== Rendu en portugais (horaires, dates, prudence des libellés)"; node tests/pt.test.js || status=1
echo; echo "== Liens directs (?cp=, ?code_insee=)"; node tests/places.test.js || status=1
echo; echo "== Contact (script et garde-fou)"; node tests/contact.test.js || status=1
echo; echo "== Générateur de lien vers la carte (extrait autonome, échappement, animation)"; node tests/widget.test.js || status=1
echo; echo "== Construction des données et conservation"; python3 -m unittest discover -s tests || status=1
if [ -f data/index.json ]; then echo; echo "== Cohérence des jeux de données présents"; python3 -I tests/check_data.py || status=1; fi
exit $status
