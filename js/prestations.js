/* prestations.js — les données du site : les prestations d'un atelier de nettoyage auto
   et leurs phases. Chaque phase a une durée cible (en minutes) et, quand c'est possible,
   une « zone » : la partie de la voiture qu'elle nettoie. C'est cette zone que le dessin
   de la voiture fait passer de « sale » à « propre ». */

const INTERIEUR = [
  { id: "int-accueil", nom: "Accueil et état des lieux", cible: 10, zone: null },
  { id: "int-tapis", nom: "Tapis et moquettes", cible: 13, zone: "sol" },
  { id: "int-aspiration", nom: "Soufflage et aspiration", cible: 10, zone: "sol" },
  { id: "int-plastiques", nom: "Plastiques et tableau de bord", cible: 30, zone: "tableau" },
  { id: "int-sieges", nom: "Sièges", cible: 40, zone: "sieges" },
  { id: "int-vitres", nom: "Vitres intérieures", cible: 10, zone: "vitres" },
  { id: "int-controle", nom: "Contrôle qualité et photos", cible: 10, zone: null },
];

const EXTERIEUR = [
  { id: "ext-roues", nom: "Roues et jantes", cible: 15, zone: "roues" },
  { id: "ext-prelavage", nom: "Prélavage", cible: 10, zone: "carrosserie" },
  { id: "ext-lavage", nom: "Lavage", cible: 20, zone: "carrosserie" },
  { id: "ext-sechage", nom: "Séchage", cible: 15, zone: "carrosserie" },
  { id: "ext-vitres", nom: "Vitres extérieures", cible: 8, zone: "vitres" },
  { id: "ext-finition", nom: "Finition et contrôle", cible: 10, zone: null },
];

const PRESTATIONS = [
  { id: "interieur", nom: "Intérieur complet", phases: INTERIEUR },
  { id: "exterieur", nom: "Extérieur", phases: EXTERIEUR },
  { id: "complet", nom: "Intérieur + extérieur", phases: INTERIEUR.concat(EXTERIEUR) },
];

const ZONES = ["carrosserie", "roues", "vitres", "tableau", "sieges", "sol"];

const CIBLE_MIN = 1;
const CIBLE_MAX = 240;

function trouverPrestation(id) {
  return PRESTATIONS.find((p) => p.id === id) || PRESTATIONS[0];
}
