// Page « Guide », section « Lire une fiche » : les cinq défibrillateurs fictifs (js/guide-infocards.js les dessine). Ce sont des données, comme celles de la carte :
// les noms, adresses et notes des exploitants restent en français dans toutes les langues. Les dates dtLcad, dtLcped, dtBat (péremptions) et dtMaint sont
// des écarts en jours avec aujourd'hui (positif : dans le futur).
const GUIDE_EXAMPLES = [
  { nom: "Mairie de Maville", adresse: "Place de la Mairie", cp: "99999", commune: "Maville", lat: 48.0011, lon: 2.0014, acces: 0, horaires: "24/7", ped: 0,
    dtLcad: 420, dtBat: 1100, dtMaint: -130, validation: 0, accessClass: "h24" },
  { nom: "Gymnase des Tilleuls", adresse: "12 rue des Tilleuls", cp: "99990", commune: "Bellevue-sur-Exemple", lat: 48.0187, lon: 2.0462, acces: 1, horaires: "Mo-Fr 08:00-20:00; Sa 09:00-12:00", ped: null,
    dtLcad: 300, dtBat: 900, validation: 0, accessClass: "limited" },
  { nom: "École maternelle Les Petits Pas", adresse: "3 impasse des Écoliers", cp: "99991", commune: "Villeneuve-Exemple", lat: 47.9874, lon: 1.9921, acces: 1, horaires: "Mo,Tu,Th,Fr 08:30-16:30", ped: 1,
    complement: "Demander la clé à la directrice, bureau à droite de l'entrée", dtLcad: 200, dtLcped: 200, dtBat: 1500, dtMaint: -60, validation: 0, accessClass: "limited" },
  { nom: "Pharmacie du Centre", adresse: "8 avenue de la Gare", cp: "99992", commune: "Saint-Imaginaire", lat: 48.0302, lon: 1.9733, acces: 1, ped: null,
    complement: "Dans le hall, à gauche de la caisse", dtLcad: -250, dtBat: 500, dtMaint: -2600, validation: 0, accessClass: "unknown" },
  { nom: "Atelier municipal", adresse: "Chemin du Lavoir", cp: "99993", commune: "Lieu-dit-sur-Rien", lat: 47.9658, lon: 2.0817, acces: 0, ped: null,
    complement: "DAE non accessible, en stock en attendant la réaffectation", dtLcad: 380, dtBat: 1000, dtMaint: -200, validation: 1, accessClass: "unknown" },
];
