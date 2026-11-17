# Sources graphiques

- `ISO_7010_E010_original.svg` : pictogramme « défibrillateur automatisé externe » (ISO 7010, E010), copie du fichier de
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:ISO_7010_E010.svg), placé sous licence CC0 (domaine public) par son auteur.
  Conservé tel quel, pour référence.
- **Logo du site (validé)**, dérivé de l'original (carré vert, croix blanche, éclair en creux centré sur le
  centre de gravité de la France). La France métropolitaine, sans la Corse, y remplace le cœur :
  - `logo-dae-france.svg` : la France en **larges courbes**. Le contour
    de la métropole est coupé aux angles notables, et chaque tronçon est
    remplacé par une seule courbe de Bézier (ajustement aux moindres carrés).
- `generer_logos.py` : script qui produit le logo.
  Lancer : `python3 -B sources/generer_logos.py` depuis la racine du projet.

- `generer_icones.py` : décline le logo en icônes dans `icons/` (favicon, Apple, Android, Windows, image de partage,
  manifeste ; images de partage, une par langue, avec le nom du site et l'accroche tirés de `lang/<langue>.json`, ou seulement elles avec `--partage`). Trois dessins selon la taille : complet, simple (sans la croix, pour 16 à 48 px) et « maskable » (Android).
  Les PNG sont dessinés par Google Chrome en mode sans fenêtre. Lancer : `python3 -B sources/generer_icones.py`.
  Le logo animé de la page Guide (`templates/partials/logo-anime.html` : le logo complet et les éléments que `css/page.css` anime) est écrit aussi, ou seul avec `--logo-anime` (sans Chrome).

Le site n'est pas officiel (voir la page « Guide ») : ces logos sont des adaptations illustratives, pas une marque officielle.
