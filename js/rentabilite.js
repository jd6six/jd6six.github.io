/* rentabilite.js — le calcul de rentabilité.
   L'idée : le chrono mesure combien de temps prend VRAIMENT une prestation.
   À partir de cette durée, on calcule combien de voitures tiennent dans une journée
   et combien il en faut pour couvrir les charges (le point mort).
   Ce fichier ne touche pas à la page : ce sont des fonctions pures, faciles à tester. */

/* Les réglages. Les curseurs de l'onglet sont générés à partir de ce tableau,
   et il sert aussi à valider ce qu'on relit dans le stockage. */
const CHAMPS_RENTA = [
  { id: "prix", nom: "Prix de la prestation", min: 20, max: 400, pas: 5, defaut: 90, unite: "€" },
  { id: "coutProduits", nom: "Produits consommés par voiture", min: 0, max: 30, pas: 0.5, defaut: 4, unite: "€" },
  { id: "chargesFixes", nom: "Charges fixes par mois (loyer, salaires, assurance…)", min: 0, max: 10000, pas: 50, defaut: 2500, unite: "€" },
  { id: "heuresJour", nom: "Heures de travail par jour", min: 2, max: 12, pas: 0.5, defaut: 7, unite: "h" },
  { id: "joursMois", nom: "Jours travaillés par mois", min: 10, max: 31, pas: 1, defaut: 22, unite: "j" },
  { id: "battement", nom: "Battement entre deux voitures", min: 0, max: 60, pas: 5, defaut: 15, unite: "min" },
];

/* Renvoie des réglages complets et sûrs : toute valeur absente ou non numérique
   prend la valeur par défaut, toute valeur hors bornes est ramenée dans [min, max]. */
function normaliserRenta(source) {
  const propre = {};
  for (const champ of CHAMPS_RENTA) {
    const brut = source ? source[champ.id] : undefined;
    const valeur = (brut === null || brut === undefined || brut === "") ? NaN : Number(brut);
    propre[champ.id] = Number.isFinite(valeur)
      ? Math.min(champ.max, Math.max(champ.min, valeur))
      : champ.defaut;
  }
  return propre;
}

/* p = réglages, dureeSecondes = durée d'une prestation (mesurée par le chrono ou estimée). */
function calculerRentabilite(p, dureeSecondes) {
  // Une voiture occupe : la prestation + le battement avant la suivante.
  const cycleMinutes = dureeSecondes / 60 + p.battement;
  const capaciteJour = cycleMinutes > 0 ? Math.floor((p.heuresJour * 60) / cycleMinutes) : 0;
  const capaciteMois = capaciteJour * p.joursMois;

  // Ce que rapporte une voiture une fois les produits payés.
  const margeParVoiture = p.prix - p.coutProduits;

  // Point mort : nombre de voitures qui couvre exactement les charges fixes.
  // Impossible à atteindre si une voiture ne rapporte rien (marge <= 0).
  const pointMortMois = margeParVoiture > 0 ? Math.ceil(p.chargesFixes / margeParVoiture) : null;

  return {
    capaciteJour,
    capaciteMois,
    margeParVoiture,
    pointMortMois,
    pointMortJour: pointMortMois === null ? null : pointMortMois / p.joursMois,
    chiffreAffairesMax: capaciteMois * p.prix,
    resultatMax: capaciteMois * margeParVoiture - p.chargesFixes,
    tauxHoraire: dureeSecondes > 0 ? margeParVoiture / (dureeSecondes / 3600) : 0,
    rentable: pointMortMois !== null && pointMortMois <= capaciteMois,
  };
}

/* Permet de tester ce fichier avec Node sans rien changer pour le navigateur. */
if (typeof module !== "undefined") {
  module.exports = { CHAMPS_RENTA, normaliserRenta, calculerRentabilite };
}
