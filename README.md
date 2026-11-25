# Trouver un défibrillateur

Site web (**France uniquement**, **non officiel**, en sept langues dont le français, langue par défaut) pour localiser les défibrillateurs (DAE) autour de soi : carte avec filtres, et recherche d'urgence qui propose plusieurs options selon l'heure, l'état probable de l'appareil et l'âge de la personne à secourir.

> **En cas d'urgence vitale, appelez le 15 ou le 112 (SMS : 114).** Ce site n'est pas un dispositif médical, il est fourni tel quel, sans garantie, et peut contenir des erreurs.

## Données

Base nationale **Géo'DAE** (data.gouv.fr), sous [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/). Elle est déclarative, donc parfois incomplète ou périmée. Le script `scripts/build_dataset.py` la nettoie et la découpe en jeux datés (`data/<date>/`) qui ne sont jamais écrasés.

Calendrier des **vacances scolaires** (zones A, B, C) : « Le calendrier scolaire » de l'Éducation nationale (data.education.gouv.fr), sous Licence Ouverte 2.0. Le script `scripts/build_vacances.py` le réduit à `data/vacances.json`, que le workflow reconstruit à chaque passage ; le navigateur s'en sert pour les horaires « hors vacances scolaires ».

## Publication

La branche `main` ne contient que le code. Les données ne sont **jamais** commitées dessus : le workflow [.github/workflows/update.yml](.github/workflows/update.yml) vérifie data.gouv.fr toutes les heures, construit un nouveau jeu si besoin (`scripts/update.py`), puis réécrit la branche `gh-pages` en un seul commit (site + 3 derniers jeux). GitHub Pages sert cette branche. Avant de publier, `scripts/stamp_assets.py` ajoute aux feuilles de style et scripts des pages une marque de version calculée sur leur contenu (`css/style.css?v=3fa9c1d2`) : un fichier modifié est rechargé par les navigateurs, un fichier inchangé reste en cache. Les anciens jeux ne sont pas conservés sur le serveur : chaque utilisateur peut garder les siens sur son appareil.

### Réglages de publication (indexation, vérification des moteurs de recherche)

Le dépôt publie le site en `noindex` et sans balise de vérification : les moteurs de recherche ne l'indexent pas. Pour changer cela **sans rien écrire dans le dépôt**, le workflow lit des *variables* du dépôt GitHub (Settings > Secrets and variables > Actions > onglet Variables) et applique `scripts/publish_settings.py` au dossier publié, jamais aux fichiers du dépôt :

| Variable | Effet |
|---|---|
| `INDEXABLE` | `true` : les pages (sauf 404) perdent leur balise `noindex` |
| `GOOGLE_SITE_VERIFICATION` | valeur de la balise de Google Search Console, ajoutée à la page d'accueil |
| `BING_SITE_VERIFICATION` | valeur de la balise de Bing Webmaster Tools, ajoutée à la page d'accueil |

Variable vide ou absente : rien ne change. Une valeur mal formée arrête la publication (rien n'est écrit). Après avoir modifié une variable, lancer le workflow à la main (Actions > Run workflow) : sans lui, la publication attend la prochaine mise à jour de données. `tests/test_publish_settings.py` couvre le script.

## Lancer en local

```
python3 -m http.server 8000
```

Puis ouvrir http://localhost:8000 (la géolocalisation exige `localhost` ou HTTPS).

## Générer un jeu de données

Placer le CSV officiel dans `data/raw/` (ignoré par git), puis :

```
python3 -I scripts/build_dataset.py data/raw/geodae_AAAA-MM-JJ.csv AAAA-MM-JJ
```

## Tests

```
sh tests/run.sh
```

Rien à installer (Node et Python suffisent). Ils vérifient que les données sont bien interprétées : lecture des horaires (structurés, texte libre, phrases), niveau de maintenance, choix des options d'urgence, nettoyage et construction des jeux de données (sur un petit CSV truqué), règle de conservation, et cohérence des jeux présents dans `data/`, cohérence du site (fichiers référencés par les pages, et fichiers réellement publiés par le workflow), et textes de l'interface. Le workflow les lance avant chaque publication : en cas d'échec, rien n'est publié. Quand on découvre une donnée mal lue, on ajoute le cas dans `tests/app.test.js` ou `tests/test_build.py`.

## Logo et icônes

Le logo est une adaptation du pictogramme ISO 7010 E010 (CC0, Wikimedia Commons) où le cœur est remplacé par la France. Les fichiers sources et les scripts sont dans [sources/](sources/) (voir son README). Les icônes du site (favicon, Apple, Android, Windows, image de partage, manifeste) sont dans `icons/` et se régénèrent avec :

```
python3 -B sources/generer_icones.py
```

Le script a besoin de Google Chrome (il dessine les PNG en mode sans fenêtre). Les icônes sont versionnées : il n'est utile de le relancer que si le logo change.

## Pages et textes (modèles)

Les pages d'accueil (`index.html`, `index.<langue>.html`), les pages « Guide » (`guide.html`, `guide.en.html`, `guia.es.html`…) `404.html`, `sitemap.xml` et `robots.txt` sont des **fichiers générés** (ils portent une ligne de commentaire qui le dit) : ne pas les modifier à la main. Les sources sont :

- `templates/` : la structure de chaque page, avec des emplacements `{{t:clé}}` (texte), `{{a:clé}}` (valeur d'attribut), `{{h:clé}}` (texte avec liens ou gras), `{{lang}}`, `{{content}}`…
- `lang/fr.json` : tous les textes. La section `page` sert aux modèles seuls ; la section `script` est aussi envoyée au navigateur (`js/lang/fr.js`, généré lui aussi) pour les messages que fabriquent les scripts.
- `content/guide.fr.html` : le texte rédigé de la page « Guide ».

Après une modification de l'une de ces sources :

```
python3 scripts/build_site.py          # réécrit les fichiers générés
python3 scripts/build_site.py --check  # vérifie qu'ils sont à jour (le workflow le fait avant de publier)
```

Dans les scripts, `tr("clé", { paramètres })` donne un texte et `trn` gère le pluriel ; la langue est lue dans `<html lang>`. `js/format.js` met en forme les dates des jeux, `js/dae-view.js` contient ce qui fait lire un défibrillateur (libellés d'accès et de maintenance, couleurs et formes des points, horaires lisibles, contenu de la fiche d'un point) et sert à la carte comme à la page « Guide », et `js/guide.js` contient les scripts de la page « Guide » (aucun script en ligne). La section « Lire une fiche » de cette page dessine cinq défibrillateurs fictifs (`js/guide-examples.js`, dessinés par `js/guide-infocards.js` avec le code de la carte) ; le texte qui les explique est dans le contenu de chaque langue. Le texte rédigé de « Guide » reste du HTML, un fichier par langue. Langues existantes : le **français** (par défaut, à la racine), l'**anglais** (`index.en.html`, `guide.en.html`) l'**espagnol** (`index.es.html`, `acerca-de.es.html`) l'**allemand** (`index.de.html`, `ueber-diese-seite.de.html`), l'**italien** (`index.it.html`, `informazioni.it.html`) le **néerlandais** (`index.nl.html`, `over-deze-site.nl.html`) et le **portugais du Portugal** (`index.pt.html`, `sobre-este-site.pt.html`). Les langues autres que le français utilisent l'heure sur 24 heures et citent le 112 avant le 15 ; l'anglais est britannique, l'espagnol celui d'Espagne (vouvoiement, « ubicación », « DEA »), l'allemand utilise le vouvoiement (« Sie »), « AED » et les guillemets „ “ ; l'italien le vouvoiement (« Lei ») dans les textes et l'infinitif ou l'impératif dans les boutons, « DAE » comme en français ; le néerlandais le vouvoiement (« u »), « AED » et le mot « dataset » ; le portugais est celui du Portugal (`pt-PT` : « desfibrilhador », « descarregar », « separador », « ecrã », « localização », « DAE »), à la 3e personne polie. À partir de quatre langues, la page d'erreur passe en version compacte.

### Ajouter une langue

1. Copier `lang/fr.json` en `lang/<langue>.json` et traduire les valeurs (jamais les clés ni les `{paramètres}`).
2. Copier `content/guide.fr.html` en `content/guide.<langue>.html` et traduire le texte de la page complète. Ne pas toucher aux balises, aux `id`, aux classes, aux liens (`href`) ni aux emplacements `{{…}}` : `tests/test_content.py` échoue si la structure diffère du français. **Numéros d'urgence : 15 puis 112 en français, 112 puis 15 dans toutes les autres langues** (le 112 est le numéro européen, le plus adapté à un visiteur) ; seul l'ordre des liens `tel:` peut changer, et les tests le vérifient dans les textes et dans « Guide ». Ne jamais promettre qu'on parlera une langue donnée au téléphone : l'anglais ou un interprète est possible au 112, pas garanti.
3. Ajouter la langue à `LANGUAGES` dans `scripts/build_site.py` (`locale` : réglage des dates et des nombres du navigateur, par exemple `en-GB` ; nom de la langue écrit dans cette langue, balise `og:locale`, guillemets, et `slugs` : nom de fichier de la page « Guide » dans cette langue, par exemple `{"guide": "guia"}` pour `guia.es.html` ; lettres minuscules sans accent, chiffres et tirets, vérifié par le script ; la carte reste `index.<langue>.html`) (`js/lang/<langue>.js` est généré et règle lui-même `LOCALE` : rien à faire dans `js/i18n.js`). Les nombres et les dates sont mis en forme par le navigateur (`Intl`), selon cette `locale`.
4. Ajouter dans la section `page` de `lang/<langue>.json` l'accroche de l'image de partage (`og.tagline`), puis dessiner cette image : `python3 -B sources/generer_icones.py --partage` (Google Chrome requis ; elle produit `icons/og-<langue>.png`). Les alternatives de langue (`hreflang`), la canonique et le plan du site se déduisent de `LANGUAGES`.
5. `python3 scripts/build_site.py`, puis `sh tests/run.sh`.

La page « Guide » est conçue pour être traduite en entier : la mécanique (formulaire de simulation, bouton de pourboire) est dans `templates/partials/` et ses textes dans le fichier de langue, donc le contenu à traduire ne contient que du texte et des liens. Les noms de boutons ou de menus cités dans le texte (`{{q:nav.data}}`, `{{q:card.go}}`…) viennent du fichier de langue : ils restent identiques à ceux de l'interface, et se mettent entre les guillemets de la langue.

**Limite connue** : les textes à pluriel n'ont que deux formes (`.one` pour 0 et 1, `.other` au-delà), ce qui suffit pour le français, l'anglais, l'italien, l'espagnol, l'allemand, le portugais ou le néerlandais ; le russe, le polonais, le tchèque ou l'arabe demanderaient d'autres formes. Les langues qui s'écrivent de droite à gauche ne sont pas prises en charge.

Le **bouton de langue** (globe et code de la langue, dans la colonne de boutons de la carte) ouvre la liste des langues, chacune écrite dans sa langue ; chaque entrée est un lien vers la même page dans cette langue, et la vue de la carte est conservée. Il est généré à partir de `LANGUAGES`, dans l'ordre de `display_order()` (français d'abord, puis les autres langues par ordre alphabétique de leur nom, accents ignorés : une langue ajoutée se place donc toute seule), comme la ligne de liens de langue en haut de « Guide » et la page d'erreur (message complet en français et en anglais, puis une ligne par autre langue : `NOTFOUND_FULL` dans le script). Les liens entre pages (`{{page:index}}`, `{{page:guide}}`) suivent la langue de la page. Avant la mise en ligne, il faudra ajouter les balises `hreflang` avec les adresses complètes (elles exigent le nom de domaine définitif).

**Liens directs** : `?gps_dae=43.59947,1.43335` (coordonnées d'un défibrillateur, avec `&id_dae=12345` facultatif pour choisir parmi plusieurs appareils à la même position) ouvre la carte à cet endroit, au zoom 18, et ouvre la fiche de l'appareil ; il prime sur les deux suivants et se crée avec le bouton « Partager » d'une fiche. `?cp=75002` (code postal) et `?code_insee=75102` (code INSEE d'une commune) centrent la carte sur la commune. Si les deux sont donnés, le code INSEE l'emporte (il ne désigne qu'une commune) ; le code postal ne sert que si le code INSEE est absent, mal formé ou inconnu. Un code postal partagé par plusieurs communes les cadre toutes. Un paramètre non reconnu est ignoré, et un retour depuis une autre page du site garde la vue quittée. Un lien reconnu ne déclenche pas la demande de position à l'arrivée ; le paramètre est retiré de l'adresse (autres paramètres conservés) dès qu'une position de l'utilisateur est affichée (`showUser`). Le lieu du lien est aussi gardé dans l'onglet (`sessionStorage`, clé `placeLink`) pour traverser « Guide » : au retour, si la vue conservée a expiré, la carte se recentre sur ce lieu. En simulation (lancée depuis « Guide »), si un lieu de lien est gardé et que la carte est au moins au zoom 12, la recherche part du centre de la carte au lieu du GPS (position affichée comme choisie, « Revenir au GPS » possible) ; la recherche réelle part toujours du GPS. Les deux paramètres ne peuvent pas être fusionnés en un seul : environ 3 000 nombres à cinq chiffres sont à la fois un code postal et le code INSEE d'une autre commune. La table (`data/places.json`, 1,2 Mo, lue seulement si l'adresse contient un paramètre) est construite à la publication par `scripts/build_places.py` à partir de l'API Géo (Licence Ouverte) ; si la source est indisponible, la table déjà publiée est conservée. Logique : `js/places.js`, tests : `tests/places.test.js` et `tests/test_places.py`.

**Générateur de lien** : la page Guide propose un formulaire (`templates/partials/widget.html`, `js/widget.js`) qui fabrique un extrait HTML que d'autres sites collent tel quel : un bouton, un badge ou un lien texte, dans l'une des langues, avec ou sans lieu (code postal ou code INSEE saisi à la main, nom de commune libre), en trois jeux de couleurs, logo fixe ou animé. L'extrait contient son propre style et son logo : aucun script, aucune image ni feuille de style appelée depuis ce site. Les logos et le CSS de l'animation sont dans `js/widget-logo.js`, généré par `python3 -B sources/generer_icones.py --logo-anime` à partir de `css/page.css` (`tests/test_logo_anime.py` vérifie qu'ils sont à jour). Les formules par défaut du lien sont dans `lang/<langue>.json` (`widget.textGeneric`, `widget.textPlace` avec `{name}`).

**Contact** : la page « Guide » (section « Mentions légales ») propose un lien « Me contacter » ; au vrai clic (`event.isTrusted`, un `.click()` du code est ignoré), le lien est remplacé par l'adresse en texte simple (sélectionnable) et la messagerie s'ouvre (`mailto:`). L'adresse n'existe en clair ni dans les pages ni dans les fichiers : `js/contact.js` l'assemble à partir de positions dans une table de caractères qui ressemble volontairement à une adresse. C'est un ralentisseur contre les collecteurs qui lisent le texte, pas une protection (le script est public). `tests/contact.test.js` vérifie le comportement (adresse comparée par empreinte SHA-256) et échoue si le nom du fournisseur de messagerie ou un fragment de l'adresse apparaît en clair dans un fichier du dépôt (la liste exacte des motifs est dans le test). Pour changer d'adresse : régénérer la table et les positions (un petit script jetable suffit), puis mettre à jour l'empreinte du test.

Les tests (`tests/i18n.test.js`, `tests/test_pages.py`, `tests/test_content.py`) vérifient les clés, les paramètres, la structure des contenus et que tout est à jour.

## Vue de la carte

Au retour d'une autre page du site (« Retour à la carte » ou bouton Retour), la carte retrouve sa vue (centre et zoom, gardés dans `sessionStorage`, donc propres à l'onglet et jamais envoyés ailleurs) et ne se recentre pas sur le GPS ; le point de position s'affiche quand même. Un nouveau chargement ou un rechargement repart de la position, comme à la première ouverture.

## Zones denses

Au centre de Paris, une vue de téléphone au niveau 12 contient plus de 8 000 défibrillateurs. Pour rester fluide, `js/app.js` ne charge pas les vues très denses à faible zoom (somme des DAE des tuiles de la vue supérieure à `DENSE_TILE_TOTAL`, sous le niveau `DENSE_ZOOM`) et, à partir de ce niveau, ne dessine aucun point si plus de `MAX_DRAWN` sont réellement visibles : un message invite à zoomer, avec un bouton « Voir le plus proche ». Les trois seuils sont des constantes en tête de fichier, à régler d'après des essais sur téléphone.

## Crédits

- Données : Géo'DAE, [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
- Fond de carte : © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL). Carte : [Leaflet](https://leafletjs.com/) (BSD-2).
- Communes et codes postaux : API Géo (DINUM), à partir des données Adresses (Licence Ouverte).
- Recherche d'adresse : Géoplateforme de l'IGN.
- Logo : adaptation du pictogramme ISO 7010 E010 (CC0).

## Licence

Code sous licence [MIT](LICENSE). Les données restent sous leur licence d'origine.
