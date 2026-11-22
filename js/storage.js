/* storage.js — tout ce qui touche à la sauvegarde dans le navigateur.
   - localStorage : session en cours, historique, cibles personnalisées
   - cookies : préférences (thème, voix)
   app.js ne lit et n'écrit jamais directement dans localStorage : il passe par ces fonctions.
   Tout ce qui est relu est vérifié, car le contenu du stockage peut être abîmé ou modifié à la main. */

const CLES = {
  session: "pitstop.session",
  historique: "pitstop.historique",
  cibles: "pitstop.cibles",
  rentabilite: "pitstop.rentabilite",
};

const MAX_HISTORIQUE = 100;

/* Lit une valeur JSON. Clé absente ou contenu illisible : on renvoie la valeur par défaut. */
function lire(cle, defaut) {
  try {
    const brut = localStorage.getItem(cle);
    if (brut === null) return defaut;
    return JSON.parse(brut);
  } catch (erreur) {
    return defaut;
  }
}

/* Écrit une valeur JSON. Renvoie false si le navigateur refuse (navigation privée, stockage plein). */
function ecrire(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
    return true;
  } catch (erreur) {
    return false;
  }
}

function estObjet(valeur) {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function nombrePositif(valeur) {
  return Number.isFinite(valeur) && valeur >= 0;
}

/* Session en cours : { prestaId, vehicule, phases: { idPhase: { debut, duree, annonce } } }
   - debut : horodatage (Date.now(), en millisecondes) du démarrage de la phase
   - duree : durée finale en secondes, présente seulement quand la phase est terminée
   C'est parce qu'on stocke l'heure de départ, et pas un compteur, que le chrono
   continue de tourner juste même si on ferme ou recharge la page. */
function chargerSession() {
  const vide = { prestaId: PRESTATIONS[0].id, vehicule: "", phases: {} };
  const donnees = lire(CLES.session, null);
  if (!estObjet(donnees) || !estObjet(donnees.phases)) return vide;

  const phases = {};
  for (const [id, etat] of Object.entries(donnees.phases)) {
    if (!estObjet(etat)) continue;
    if (nombrePositif(etat.duree)) {
      phases[id] = { duree: Math.round(etat.duree) };
    } else if (nombrePositif(etat.debut) && etat.debut <= Date.now()) {
      phases[id] = { debut: etat.debut, annonce: etat.annonce === true };
    }
  }
  return {
    prestaId: trouverPrestation(donnees.prestaId).id,
    vehicule: typeof donnees.vehicule === "string" ? donnees.vehicule.slice(0, 40) : "",
    phases,
  };
}

function sauverSession(session) {
  return ecrire(CLES.session, session);
}

/* Historique : [{ date, prestaId, prestaNom, vehicule, total, phases: [{ id, nom, cible, duree }] }] */
function chargerHistorique() {
  const donnees = lire(CLES.historique, []);
  if (!Array.isArray(donnees)) return [];
  const propre = [];
  for (const entree of donnees) {
    if (!estObjet(entree) || !Array.isArray(entree.phases)) continue;
    const phases = entree.phases.filter((p) =>
      estObjet(p) && typeof p.id === "string" && typeof p.nom === "string"
      && nombrePositif(p.cible) && nombrePositif(p.duree));
    if (phases.length === 0) continue;
    propre.push({
      date: nombrePositif(entree.date) ? entree.date : 0,
      prestaId: String(entree.prestaId || ""),
      prestaNom: String(entree.prestaNom || "Prestation").slice(0, 60),
      vehicule: String(entree.vehicule || "").slice(0, 40),
      total: phases.reduce((somme, p) => somme + p.duree, 0),
      phases,
    });
  }
  return propre.slice(0, MAX_HISTORIQUE);
}

function sauverHistorique(historique) {
  return ecrire(CLES.historique, historique.slice(0, MAX_HISTORIQUE));
}

/* Cibles personnalisées : { idPhase: minutes }. Remplacent les cibles de prestations.js. */
function chargerCibles() {
  const donnees = lire(CLES.cibles, {});
  if (!estObjet(donnees)) return {};
  const propre = {};
  for (const [id, minutes] of Object.entries(donnees)) {
    if (Number.isInteger(minutes) && minutes >= CIBLE_MIN && minutes <= CIBLE_MAX) propre[id] = minutes;
  }
  return propre;
}

function sauverCibles(cibles) {
  return ecrire(CLES.cibles, cibles);
}

/* Réglages de l'onglet Rentabilité (validés par normaliserRenta, dans rentabilite.js). */
function chargerRenta() {
  return normaliserRenta(lire(CLES.rentabilite, null));
}

function sauverRenta(reglages) {
  return ecrire(CLES.rentabilite, reglages);
}

/* ---------- Cookies ---------- */

function lireCookie(nom) {
  for (const morceau of document.cookie.split("; ")) {
    const [cle, valeur] = morceau.split("=");
    if (cle === nom) return decodeURIComponent(valeur || "");
  }
  return null;
}

function ecrireCookie(nom, valeur, jours) {
  const duree = jours * 24 * 60 * 60;
  document.cookie = nom + "=" + encodeURIComponent(valeur) + "; max-age=" + duree + "; path=/; SameSite=Lax";
}
