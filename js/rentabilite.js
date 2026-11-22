/* rentabilite.js — le calcul de rentabilité.
   L'idée : le chrono mesure combien de temps prend VRAIMENT une prestation.
   À partir de cette durée, on calcule combien de voitures tiennent dans une journée,
   combien il en faut pour couvrir les charges (le point mort), ce qu'il reste à la fin
   du mois, et ce que rapporterait chaque minute gagnée sur une voiture.
   Ce fichier ne touche pas à la page : ce sont des fonctions pures, faciles à tester. */

/* Les réglages. Les curseurs de l'onglet sont générés à partir de ce tableau,
   et il sert aussi à valider ce qu'on relit dans le stockage. */
const CHAMPS_RENTA = [
  { id: "prix", groupe: "Ce que rapporte une voiture", nom: "Prix de la prestation", min: 20, max: 400, pas: 5, defaut: 90, unite: "€" },
  { id: "coutProduits", groupe: "Ce que rapporte une voiture", nom: "Produits consommés par voiture", min: 0, max: 30, pas: 0.5, defaut: 4, unite: "€" },
  { id: "cotisations", groupe: "Ce que rapporte une voiture", nom: "Cotisations et taxes prélevées sur le prix", min: 0, max: 40, pas: 1, defaut: 20, unite: "%" },
  { id: "heuresJour", groupe: "Ton temps", nom: "Heures de travail par jour", min: 2, max: 12, pas: 0.5, defaut: 7, unite: "h" },
  { id: "joursMois", groupe: "Ton temps", nom: "Jours travaillés par mois", min: 10, max: 31, pas: 1, defaut: 22, unite: "j" },
  { id: "battement", groupe: "Ton temps", nom: "Battement entre deux voitures", min: 0, max: 60, pas: 5, defaut: 15, unite: "min" },
  { id: "remplissage", groupe: "Ton temps", nom: "Remplissage du planning (créneaux réellement vendus)", min: 10, max: 100, pas: 5, defaut: 60, unite: "%" },
  { id: "chargesFixes", groupe: "Tes charges", nom: "Charges fixes par mois (loyer, assurance, salaire visé…)", min: 0, max: 10000, pas: 50, defaut: 2500, unite: "€" },
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

  // Le planning n'est jamais plein : on ne vend qu'une partie des créneaux.
  // C'est une moyenne, donc pas forcément un nombre entier (3,6 voitures par jour).
  const voituresJour = capaciteJour * (p.remplissage / 100);
  const voituresMois = voituresJour * p.joursMois;

  // Ce que rapporte une voiture une fois les cotisations et les produits payés.
  const margeParVoiture = p.prix * (1 - p.cotisations / 100) - p.coutProduits;

  // Point mort : nombre de voitures qui couvre exactement les charges fixes.
  // Impossible à atteindre si une voiture ne rapporte rien (marge <= 0).
  const pointMortMois = margeParVoiture > 0 ? Math.ceil(p.chargesFixes / margeParVoiture) : null;

  // Cinq situations possibles, de la pire à la meilleure.
  let etat;
  if (capaciteJour === 0) etat = "vide";                       // même une seule voiture ne tient pas dans la journée
  else if (pointMortMois === null) etat = "perte";             // chaque voiture coûte de l'argent
  else if (pointMortMois > capaciteMois) etat = "impossible";  // même un planning plein ne suffit pas
  else if (pointMortMois > voituresMois) etat = "juste";       // faisable, mais pas avec ce remplissage
  else etat = "ok";

  return {
    capaciteJour,
    capaciteMois,
    voituresJour,
    voituresMois,
    margeParVoiture,
    pointMortMois,
    pointMortJour: pointMortMois === null ? null : pointMortMois / p.joursMois,
    resultat: voituresMois * margeParVoiture - p.chargesFixes,
    resultatMax: capaciteMois * margeParVoiture - p.chargesFixes,
    tauxHoraire: dureeSecondes > 0 ? margeParVoiture / (dureeSecondes / 3600) : 0,
    etat,
  };
}

/* Le lien direct entre le chrono et l'argent : combien de minutes faut-il gagner par voiture
   pour en caser UNE de plus dans la journée, et combien cela rapporte par mois ?
   Renvoie null si c'est impossible (le battement seul remplit déjà le créneau visé)
   ou sans intérêt (une voiture de plus ne rapporte rien). */
function prochaineVoiture(p, dureeSecondes) {
  const actuel = calculerRentabilite(p, dureeSecondes);
  if (actuel.margeParVoiture <= 0) return null;

  // Pour faire (capacité + 1) voitures, chacune doit tenir dans ce créneau.
  const cycleVise = (p.heuresJour * 60) / (actuel.capaciteJour + 1);
  // On retire une seconde pour ne pas tomber pile sur la limite (arrondis des nombres à virgule),
  // puis on arrondit à la minute entière en dessous : un objectif de 1:29:00 se retient mieux que 1:29:59.
  const dureeVisee = Math.floor(((cycleVise - p.battement) * 60 - 1) / 60) * 60;
  if (dureeVisee <= 0 || dureeVisee >= dureeSecondes) return null;

  const apres = calculerRentabilite(p, dureeVisee);
  return {
    dureeVisee,
    minutesAGagner: Math.ceil((dureeSecondes - dureeVisee) / 60),
    capaciteJour: apres.capaciteJour,
    gainMensuel: apres.resultat - actuel.resultat,
  };
}

/* Permet de tester ce fichier avec Node sans rien changer pour le navigateur. */
if (typeof module !== "undefined") {
  module.exports = { CHAMPS_RENTA, normaliserRenta, calculerRentabilite, prochaineVoiture };
}
