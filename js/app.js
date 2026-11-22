/* app.js — l'interface : elle lit l'état, l'affiche, et réagit aux clics.
   Plan du fichier :
   1. État et raccourcis        4. Affichage (rendre, tictac)
   2. Calculs sur l'état        5. Historique et cibles
   3. Actions du chrono         6. Voix, écran, thème, démarrage */

/* ================= 1. État et raccourcis ================= */

let session = chargerSession();        // la session en cours (voir storage.js)
let historique = chargerHistorique();  // les sessions enregistrées
let cibles = chargerCibles();          // les cibles modifiées par l'utilisateur
let renta = chargerRenta();            // les réglages de l'onglet Rentabilité
let voixActive = lireCookie("pitstop_voix") === "oui";
let verrouEcran = null;                // Wake Lock : empêche l'écran de s'éteindre
let minuterieMessage = null;

const $ = (id) => document.getElementById(id);

/* Fabrique un élément HTML. On passe toujours par textContent (jamais innerHTML) :
   un texte tapé par l'utilisateur ne peut donc pas être interprété comme du code. */
function creer(balise, classe, texte) {
  const element = document.createElement(balise);
  if (classe) element.className = classe;
  if (texte !== undefined) element.textContent = texte;
  return element;
}

/* ================= 2. Calculs sur l'état ================= */

/* Les phases de la prestation choisie, avec la cible personnalisée si elle existe. */
function phasesCourantes() {
  return trouverPrestation(session.prestaId).phases.map((phase) => ({
    ...phase,
    cible: cibles[phase.id] || phase.cible,
  }));
}

function etatDe(id) {
  return session.phases[id] || {};
}

function estFaite(id) {
  return etatDe(id).duree !== undefined;
}

function estEnCours(id) {
  const etat = etatDe(id);
  return etat.debut !== undefined && etat.duree === undefined;
}

/* Secondes écoulées : on fait « maintenant − heure de départ ».
   Aucun compteur à incrémenter, donc aucune dérive et aucune perte au rechargement. */
function ecoule(id) {
  const etat = etatDe(id);
  if (etat.duree !== undefined) return etat.duree;
  if (etat.debut !== undefined) return Math.max(0, Math.floor((Date.now() - etat.debut) / 1000));
  return 0;
}

function phaseEnCours() {
  return phasesCourantes().find((p) => estEnCours(p.id)) || null;
}

function prochainePhase() {
  return phasesCourantes().find((p) => !estFaite(p.id) && !estEnCours(p.id)) || null;
}

/* Meilleur temps (en secondes) déjà enregistré pour une phase, ou null. */
function record(id) {
  let meilleur = null;
  for (const entree of historique) {
    for (const p of entree.phases) {
      if (p.id === id && p.duree > 0 && (meilleur === null || p.duree < meilleur)) meilleur = p.duree;
    }
  }
  return meilleur;
}

/* Moyenne (en secondes) et nombre de mesures pour une phase. */
function moyenne(id) {
  const durees = [];
  for (const entree of historique) {
    for (const p of entree.phases) {
      if (p.id === id) durees.push(p.duree);
    }
  }
  if (durees.length === 0) return null;
  return { secondes: durees.reduce((a, b) => a + b, 0) / durees.length, nombre: durees.length };
}

function mmss(secondes) {
  const s = Math.max(0, Math.round(secondes));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const reste = String(s % 60).padStart(2, "0");
  if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + reste;
  return m + ":" + reste;
}

/* ================= 3. Actions du chrono ================= */

function demarrer(id) {
  const dejaEnCours = phaseEnCours();
  if (dejaEnCours && dejaEnCours.id !== id) terminer(dejaEnCours.id, true);

  const phase = phasesCourantes().find((p) => p.id === id);
  if (!phase) return;
  session.phases[id] = { debut: Date.now(), annonce: false };
  sauverSession(session);
  parler(phase.nom + ". Cible : " + phase.cible + " minutes.");
  rendre();
}

function terminer(id, silencieux) {
  if (!estEnCours(id)) return;
  const duree = ecoule(id);
  const ancienRecord = record(id);
  session.phases[id] = { duree };
  sauverSession(session);

  if (navigator.vibrate) navigator.vibrate(120);
  if (!silencieux) {
    const recordBattu = ancienRecord !== null && duree > 0 && duree < ancienRecord;
    if (recordBattu) {
      afficherMessage("Record battu : " + mmss(duree) + " (avant : " + mmss(ancienRecord) + ")");
      parler("Record battu.");
    }
    rendre();
    if (recordBattu) animerRecord();
  }
}

function refaire(id) {
  delete session.phases[id];
  sauverSession(session);
  rendre();
}

/* Le gros bouton (et la barre d'espace) : termine la phase en cours,
   sinon démarre la suivante, sinon enregistre la session. */
function actionPrincipale() {
  const enCours = phaseEnCours();
  if (enCours) return terminer(enCours.id);
  const suivante = prochainePhase();
  if (suivante) return demarrer(suivante.id);
  enregistrerSession();
}

function enregistrerSession() {
  const enCours = phaseEnCours();
  if (enCours) terminer(enCours.id, true);

  const faites = phasesCourantes().filter((p) => estFaite(p.id));
  if (faites.length === 0) {
    afficherMessage("Aucune phase chronométrée : rien à enregistrer.");
    return;
  }
  const phases = faites.map((p) => ({ id: p.id, nom: p.nom, cible: p.cible, duree: etatDe(p.id).duree }));
  const presta = trouverPrestation(session.prestaId);
  historique.unshift({
    date: Date.now(),
    prestaId: presta.id,
    prestaNom: presta.nom,
    vehicule: session.vehicule.trim(),
    total: phases.reduce((somme, p) => somme + p.duree, 0),
    phases,
  });
  const ok = sauverHistorique(historique);

  session = { prestaId: session.prestaId, vehicule: "", phases: {} };
  sauverSession(session);
  $("vehicule").value = "";
  afficherMessage(ok ? "Session enregistrée dans l'historique." : "Enregistrement impossible : stockage refusé par le navigateur.");
  rendre();
}

function reinitialiser() {
  if (Object.keys(session.phases).length > 0 && !confirm("Effacer tous les chronos de cette session ?")) return;
  session.phases = {};
  sauverSession(session);
  rendre();
}

function changerPrestation(id) {
  const selecteur = $("choix-presta");
  if (Object.keys(session.phases).length > 0 && !confirm("Changer de prestation efface les chronos en cours. Continuer ?")) {
    selecteur.value = session.prestaId;
    return;
  }
  session.prestaId = trouverPrestation(id).id;
  session.phases = {};
  sauverSession(session);
  rendre();
}

/* ================= 4. Affichage ================= */

/* Redessine tout l'écran à partir de l'état. Appelée après chaque action. */
function rendre() {
  const phases = phasesCourantes();
  rendreCartePhase(phases);
  rendreListe(phases);
  rendreVoiture(phases);
  rendreCompteurs(phases);
  rendreHistorique();
  rendreCibles(phases);
  rendreRentabilite(phases);
  gererVerrouEcran();
}

function rendreCartePhase(phases) {
  const enCours = phaseEnCours();
  const suivante = prochainePhase();
  const phase = enCours || suivante;
  const bouton = $("btn-principal");
  const badge = $("phase-record");

  bouton.classList.toggle("stop", Boolean(enCours));
  badge.classList.remove("battu");

  if (!phase) {
    const aucune = phases.every((p) => !estFaite(p.id));
    $("phase-statut").textContent = "Terminé";
    $("phase-nom").textContent = aucune ? "Aucune phase" : "Toutes les phases sont faites";
    $("phase-cible").textContent = "";
    badge.hidden = true;
    bouton.textContent = "Enregistrer la session";
  } else {
    const meilleur = record(phase.id);
    $("phase-statut").textContent = enCours ? "Phase en cours" : "Prochaine phase";
    $("phase-nom").textContent = phase.nom;
    $("phase-cible").textContent = "cible " + phase.cible + " min";
    badge.hidden = meilleur === null;
    if (meilleur !== null) badge.textContent = "Record " + mmss(meilleur);
    bouton.textContent = enCours ? "Terminer la phase" : "Démarrer";
  }
  tictac();
}

/* Mise à jour légère, une fois par seconde : seuls les chiffres qui bougent sont touchés. */
function tictac() {
  const phases = phasesCourantes();
  const enCours = phaseEnCours();
  const affichage = $("phase-ecoule");
  const jauge = $("phase-jauge");

  if (enCours) {
    const secondes = ecoule(enCours.id);
    const limite = enCours.cible * 60;
    const depasse = secondes > limite;
    affichage.textContent = mmss(secondes);
    affichage.classList.toggle("trop", depasse);
    jauge.style.width = Math.min(100, (secondes / limite) * 100) + "%";
    jauge.classList.toggle("trop", depasse);

    const ligne = document.querySelector('#liste-phases li.encours .duree');
    if (ligne) ligne.textContent = mmss(secondes);

    // Annonce vocale du dépassement, une seule fois par phase.
    const etat = etatDe(enCours.id);
    if (depasse && !etat.annonce) {
      etat.annonce = true;
      sauverSession(session);
      parler("Cible dépassée sur " + enCours.nom + ".");
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  } else {
    affichage.textContent = "0:00";
    affichage.classList.remove("trop");
    jauge.style.width = "0%";
    jauge.classList.remove("trop");
  }
  $("total").textContent = mmss(phases.reduce((somme, p) => somme + ecoule(p.id), 0));
}

function rendreListe(phases) {
  const liste = $("liste-phases");
  liste.replaceChildren();
  for (const phase of phases) {
    const ligne = creer("li");
    const faite = estFaite(phase.id);
    const enCours = estEnCours(phase.id);
    if (faite) ligne.classList.add("faite");
    if (enCours) ligne.classList.add("encours");
    if (faite && etatDe(phase.id).duree > phase.cible * 60) ligne.classList.add("trop");

    ligne.append(creer("span", "pastille"), creer("span", "nom", phase.nom));
    ligne.append(creer("span", "cible", phase.cible + " min"));
    ligne.append(creer("span", "duree", faite || enCours ? mmss(ecoule(phase.id)) : "—"));

    const bouton = creer("button", "btn btn-mini", faite ? "Refaire" : enCours ? "Fin" : "Lancer");
    bouton.type = "button";
    bouton.addEventListener("click", () => {
      if (faite) refaire(phase.id);
      else if (enCours) terminer(phase.id);
      else demarrer(phase.id);
    });
    ligne.append(bouton);
    liste.append(ligne);
  }
}

/* La voiture : chaque zone prend une classe selon l'avancement de SES phases.
   hors = aucune phase ne la concerne, actif = une phase tourne dessus,
   propre = toutes ses phases sont faites, sinon elle reste sale. */
function rendreVoiture(phases) {
  for (const zone of ZONES) {
    const groupe = document.querySelector('.zone[data-zone="' + zone + '"]');
    const concernees = phases.filter((p) => p.zone === zone);
    groupe.classList.remove("hors", "actif", "propre");
    if (concernees.length === 0) groupe.classList.add("hors");
    else if (concernees.some((p) => estEnCours(p.id))) groupe.classList.add("actif");
    else if (concernees.every((p) => estFaite(p.id))) groupe.classList.add("propre");
  }
  const toutFait = phases.length > 0 && phases.every((p) => estFaite(p.id));
  $("voiture").classList.toggle("brillant", toutFait);
}

function rendreCompteurs(phases) {
  const faites = phases.filter((p) => estFaite(p.id));
  $("faites").textContent = faites.length + " / " + phases.length;

  // Écart cumulé entre les durées réelles et les cibles, sur les phases terminées.
  const ecart = faites.reduce((somme, p) => somme + etatDe(p.id).duree - p.cible * 60, 0);
  const affichage = $("ecart");
  affichage.classList.remove("ok", "trop");
  if (faites.length === 0) {
    affichage.textContent = "—";
  } else {
    affichage.textContent = (ecart > 0 ? "+" : "−") + mmss(Math.abs(ecart));
    affichage.classList.add(ecart > 0 ? "trop" : "ok");
  }
}

function animerRecord() {
  const badge = $("phase-record");
  badge.classList.add("battu");
}

function afficherMessage(texte) {
  const zone = $("message");
  zone.textContent = texte;
  zone.hidden = false;
  clearTimeout(minuterieMessage);
  minuterieMessage = setTimeout(() => { zone.hidden = true; }, 3500);
}

/* ================= 5. Historique et cibles ================= */

function rendreHistorique() {
  const conteneur = $("liste-historique");
  conteneur.replaceChildren();
  if (historique.length === 0) {
    conteneur.append(creer("p", "vide", "Aucune session enregistrée pour l'instant."));
    return;
  }
  historique.forEach((entree, index) => {
    const carte = creer("div", "carte session");
    const tete = creer("div", "session-tete");
    const titres = creer("div");
    const titre = entree.prestaNom + (entree.vehicule ? " · " + entree.vehicule : "");
    titres.append(creer("div", "session-titre", titre));
    const date = entree.date ? new Date(entree.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Date inconnue";
    titres.append(creer("div", "note", date + " · total " + mmss(entree.total)));
    const supprimer = creer("button", "btn btn-mini", "Supprimer");
    supprimer.type = "button";
    supprimer.addEventListener("click", () => {
      historique.splice(index, 1);
      sauverHistorique(historique);
      rendre();
    });
    tete.append(titres, supprimer);
    carte.append(tete);

    for (const p of entree.phases) {
      const ligne = creer("div", "ligne-barre");
      const piste = creer("div", "piste");
      const barre = creer("div");
      const limite = p.cible * 60;
      // La piste entière représente la cible ; une barre pleine et rouge = cible dépassée.
      barre.style.width = (limite > 0 ? Math.min(100, (p.duree / limite) * 100) : 100) + "%";
      if (limite > 0 && p.duree > limite) barre.className = "trop";
      piste.append(barre);
      ligne.append(creer("span", "", p.nom), piste, creer("strong", "", mmss(p.duree)));
      carte.append(ligne);
    }
    conteneur.append(carte);
  });
}

/* Export : on fabrique un fichier en mémoire (Blob) et on déclenche son téléchargement. */
function exporterHistorique() {
  if (historique.length === 0) {
    afficherMessage("Rien à exporter : l'historique est vide.");
    return;
  }
  const blob = new Blob([JSON.stringify(historique, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const lien = creer("a");
  lien.href = url;
  lien.download = "pitstop-historique.json";
  document.body.append(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

function viderHistorique() {
  if (historique.length === 0) return;
  if (!confirm("Effacer tout l'historique ? Les records et les moyennes seront perdus.")) return;
  historique = [];
  sauverHistorique(historique);
  rendre();
}

function rendreCibles(phases) {
  const tableau = $("tableau-cibles");
  tableau.replaceChildren();

  const entete = creer("tr");
  for (const titre of ["Phase", "Cible (min)", "Ta moyenne", "Record", ""]) entete.append(creer("th", "", titre));
  const thead = creer("thead");
  thead.append(entete);
  const tbody = creer("tbody");

  for (const phase of phases) {
    const ligne = creer("tr");
    const stats = moyenne(phase.id);
    const meilleur = record(phase.id);

    const champ = creer("input");
    champ.type = "number";
    champ.min = CIBLE_MIN;
    champ.max = CIBLE_MAX;
    champ.step = 1;
    champ.value = phase.cible;
    champ.setAttribute("aria-label", "Cible en minutes pour " + phase.nom);
    champ.addEventListener("change", () => fixerCible(phase.id, champ.value));
    const celluleChamp = creer("td");
    celluleChamp.append(champ);

    const celluleAction = creer("td");
    if (stats) {
      const adopter = creer("button", "btn btn-mini", "Adopter");
      adopter.type = "button";
      adopter.addEventListener("click", () => fixerCible(phase.id, Math.round(stats.secondes / 60)));
      celluleAction.append(adopter);
    }

    ligne.append(
      creer("td", "", phase.nom),
      celluleChamp,
      creer("td", "", stats ? mmss(stats.secondes) + " (" + stats.nombre + ")" : "—"),
      creer("td", "", meilleur !== null ? mmss(meilleur) : "—"),
      celluleAction,
    );
    tbody.append(ligne);
  }
  tableau.append(thead, tbody);
}

/* Valide une cible avant de l'enregistrer : entier entre CIBLE_MIN et CIBLE_MAX. */
function fixerCible(id, valeur) {
  const minutes = Math.round(Number(valeur));
  if (!Number.isFinite(minutes) || String(valeur).trim() === "") {
    afficherMessage("Cible invalide : entre un nombre de minutes.");
  } else {
    cibles[id] = Math.min(CIBLE_MAX, Math.max(CIBLE_MIN, minutes));
    sauverCibles(cibles);
    afficherMessage("Cible enregistrée : " + cibles[id] + " min.");
  }
  rendre();
}

/* ----- Rentabilité : le lien entre le chrono et l'argent ----- */

/* Durée d'une prestation. Si l'historique contient des sessions COMPLÈTES de cette prestation,
   on prend leur moyenne (mesure réelle). Sinon on additionne les cibles (estimation). */
function dureePrestation(phases) {
  const completes = historique.filter((e) => e.prestaId === session.prestaId && e.phases.length === phases.length);
  if (completes.length > 0) {
    const total = completes.reduce((somme, e) => somme + e.total, 0);
    return { secondes: total / completes.length, mesures: completes.length };
  }
  return { secondes: phases.reduce((somme, p) => somme + p.cible * 60, 0), mesures: 0 };
}

function euros(montant) {
  return Math.round(montant).toLocaleString("fr-FR") + " €";
}

function valeurAvecUnite(champ, valeur) {
  return valeur.toLocaleString("fr-FR") + " " + champ.unite;
}

/* Fabrique un curseur par ligne de CHAMPS_RENTA, avec un titre à chaque changement de groupe.
   Appelée une seule fois au démarrage. */
function construireCurseurs() {
  const formulaire = $("form-renta");
  let groupe = "";
  for (const champ of CHAMPS_RENTA) {
    if (champ.groupe !== groupe) {
      groupe = champ.groupe;
      formulaire.append(creer("h4", "", groupe));
    }
    const bloc = creer("div", "curseur");
    const tete = creer("div", "curseur-tete");
    const etiquette = creer("label", "", champ.nom);
    etiquette.htmlFor = "renta-" + champ.id;
    const sortie = creer("output", "", valeurAvecUnite(champ, renta[champ.id]));
    tete.append(etiquette, sortie);

    const curseur = creer("input");
    curseur.type = "range";
    curseur.id = "renta-" + champ.id;
    curseur.min = champ.min;
    curseur.max = champ.max;
    curseur.step = champ.pas;
    curseur.value = renta[champ.id];
    curseur.addEventListener("input", () => {
      renta[champ.id] = Number(curseur.value);
      sortie.textContent = valeurAvecUnite(champ, renta[champ.id]);
      sauverRenta(renta);
      rendreRentabilite(phasesCourantes());
    });
    bloc.append(tete, curseur);
    formulaire.append(bloc);
  }
}

/* Un chiffre après la virgule au plus, à la française : 3,6. */
function unChiffre(nombre) {
  return (Math.round(nombre * 10) / 10).toLocaleString("fr-FR");
}

/* Crée un élément SVG (il faut un espace de noms, createElement ne suffit pas). */
function svg(balise, attributs, texte) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", balise);
  for (const nom in attributs) element.setAttribute(nom, attributs[nom]);
  if (texte !== undefined) element.textContent = texte;
  return element;
}

/* Dessine la droite « résultat du mois selon le nombre de voitures par jour ».
   Elle part de −charges fixes (zéro voiture) et monte de la marge à chaque voiture.
   Là où elle coupe l'axe du zéro, c'est le point mort. */
function dessinerGraphique(r) {
  const dessin = $("renta-graphique");
  dessin.replaceChildren();
  const L = 320, H = 170, gauche = 8, droite = 8, haut = 12, bas = 24;

  // Axe horizontal : de 0 à un peu plus loin que la capacité et le point mort.
  const xMax = Math.max(r.capaciteJour, Math.ceil(r.pointMortJour || 0), 1) + 1;
  const resultatPour = (voituresJour) => voituresJour * renta.joursMois * r.margeParVoiture - renta.chargesFixes;

  // Axe vertical : il doit contenir le zéro et les deux bouts de la droite.
  const debut = resultatPour(0), fin = resultatPour(xMax);
  let mini = Math.min(debut, fin, 0), maxi = Math.max(debut, fin, 0);
  if (maxi === mini) maxi = mini + 1;
  const marge = (maxi - mini) * 0.08;
  mini -= marge; maxi += marge;

  const X = (v) => gauche + (v / xMax) * (L - gauche - droite);
  const Y = (v) => haut + ((maxi - v) / (maxi - mini)) * (H - haut - bas);
  const yZero = Y(0), yBas = H - bas;

  dessin.append(
    svg("rect", { class: "zone-gain", x: gauche, y: haut, width: L - gauche - droite, height: yZero - haut }),
    svg("rect", { class: "zone-perte", x: gauche, y: yZero, width: L - gauche - droite, height: yBas - yZero }),
    svg("line", { class: "axe", x1: gauche, y1: yZero, x2: L - droite, y2: yZero }),
    svg("text", { x: gauche + 4, y: yZero - 4 }, "0 €"),
    svg("line", { class: "limite", x1: X(r.capaciteJour), y1: haut, x2: X(r.capaciteJour), y2: yBas }),
    svg("line", { class: "droite", x1: X(0), y1: Y(debut), x2: X(xMax), y2: Y(fin) }),
    svg("text", { x: gauche, y: H - 8 }, "0"),
    svg("text", { x: L - droite, y: H - 8, "text-anchor": "end" }, xMax + " voitures par jour")
  );
  if (r.pointMortJour !== null && r.pointMortJour <= xMax) {
    dessin.append(svg("circle", { class: "pt-mort", cx: X(r.pointMortJour), cy: yZero, r: 5 }));
  }
  dessin.append(svg("circle", { class: "pt-toi", cx: X(r.voituresJour), cy: Y(r.resultat), r: 6.5 }));
}

/* Une ligne de légende : une puce, un libellé, une valeur en gras. */
function ligneLegende(classePuce, libelle, valeur) {
  const ligne = creer("li");
  ligne.append(creer("span", "puce " + classePuce), libelle + " ", creer("b", "", valeur));
  return ligne;
}

function rendreRentabilite(phases) {
  const duree = dureePrestation(phases);
  const r = calculerRentabilite(renta, duree.secondes);
  const presta = trouverPrestation(session.prestaId);

  $("renta-duree").textContent = mmss(duree.secondes);
  $("renta-source").textContent = duree.mesures > 0
    ? presta.nom + " : moyenne mesurée sur " + duree.mesures + " session(s) complète(s)."
    : presta.nom + " : estimation d'après tes cibles. Enregistre une session complète pour avoir ta vraie durée.";

  // Le verdict : une phrase, et une couleur selon la situation.
  const parJour = r.pointMortJour === null ? null : unChiffre(Math.ceil(r.pointMortJour * 10) / 10);
  const moyenne = unChiffre(r.voituresJour);
  const verdict = $("renta-verdict");
  verdict.classList.toggle("trop", r.etat === "vide" || r.etat === "perte" || r.etat === "impossible");
  verdict.classList.toggle("juste", r.etat === "juste");
  if (r.etat === "vide") {
    verdict.textContent = "Aucune voiture ne tient dans ta journée : la prestation et le battement durent plus longtemps que ton temps de travail.";
  } else if (r.etat === "perte") {
    verdict.textContent = "Chaque voiture te coûte de l'argent : une fois les cotisations et les produits payés, il ne reste rien. Aucun volume ne rend l'activité rentable.";
  } else if (r.etat === "impossible") {
    verdict.textContent = "Ça ne tient pas : il faudrait " + parJour + " voiture(s) par jour pour couvrir tes charges, mais une journée n'en contient que " + r.capaciteJour + ", même avec un planning plein.";
  } else if (r.etat === "juste") {
    verdict.textContent = "Faisable, mais pas avec ce remplissage : tu fais " + moyenne + " voiture(s) par jour en moyenne, il en faut " + parJour + ". Il te manque " + euros(-r.resultat) + " par mois.";
  } else {
    verdict.textContent = "Ça tient : avec " + moyenne + " voiture(s) par jour en moyenne, "
      + (r.pointMortMois === 0 ? "tu n'as aucune charge fixe à couvrir" : "tu couvres tes charges (" + parJour + " suffisent)")
      + " et il te reste " + euros(r.resultat) + " par mois.";
  }

  dessinerGraphique(r);
  $("renta-legende").replaceChildren(
    ligneLegende("toi", "Toi aujourd'hui :", moyenne + " voitures par jour"),
    ligneLegende("mort", "Point mort :", parJour === null ? "inatteignable" : parJour + " voitures par jour"),
    ligneLegende("limite", "Planning plein :", r.capaciteJour + " voitures par jour")
  );

  const resultat = $("renta-resultat");
  resultat.textContent = euros(r.resultat);
  resultat.classList.toggle("trop", r.resultat < 0);
  resultat.classList.toggle("ok", r.resultat >= 0);
  $("renta-resultat-note").textContent = "à " + moyenne + " voitures par jour";
  const plein = $("renta-resultat-max");
  plein.textContent = euros(r.resultatMax);
  plein.classList.toggle("trop", r.resultatMax < 0);
  plein.classList.toggle("ok", r.resultatMax >= 0);
  $("renta-capacite").textContent = "à " + r.capaciteJour + " voitures par jour";
  $("renta-pointmort").textContent = parJour === null ? "—" : parJour;
  $("renta-horaire").textContent = euros(r.tauxHoraire);

  // Ce que vaut le chrono : le gain de temps qui fait entrer une voiture de plus.
  const suivante = prochaineVoiture(renta, duree.secondes);
  const minute = $("renta-minute");
  if (r.margeParVoiture <= 0) {
    minute.textContent = "Tant qu'une voiture ne rapporte rien, aller plus vite ne change rien.";
  } else if (suivante === null) {
    minute.textContent = "Avec ce battement, impossible de caser une voiture de plus dans la journée, même en allant plus vite.";
  } else {
    minute.textContent = "Gagne " + suivante.minutesAGagner + " min par voiture (de " + mmss(duree.secondes) + " à " + mmss(suivante.dureeVisee)
      + ") : tu en cases " + suivante.capaciteJour + " par jour au lieu de " + r.capaciteJour
      + ", soit " + euros(suivante.gainMensuel) + " de plus par mois à remplissage égal.";
  }
}

/* ================= 6. Voix, écran, thème, démarrage ================= */

/* Synthèse vocale (API Web Speech) : utile en atelier, les mains mouillées ou gantées. */
function parler(texte) {
  if (!voixActive || !("speechSynthesis" in window)) return;
  const phrase = new SpeechSynthesisUtterance(texte);
  phrase.lang = "fr-FR";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(phrase);
}

function rendreBoutonVoix() {
  const bouton = $("btn-voix");
  bouton.textContent = voixActive ? "🔊" : "🔈";
  bouton.setAttribute("aria-pressed", String(voixActive));
}

function basculerVoix() {
  if (!("speechSynthesis" in window)) {
    afficherMessage("Ce navigateur ne sait pas parler (synthèse vocale absente).");
    return;
  }
  voixActive = !voixActive;
  ecrireCookie("pitstop_voix", voixActive ? "oui" : "non", 365);
  rendreBoutonVoix();
  if (voixActive) parler("Annonces vocales activées.");
  else window.speechSynthesis.cancel();
}

/* Wake Lock : tant qu'une phase tourne, on demande au téléphone de ne pas éteindre l'écran.
   L'API n'existe pas partout et peut refuser (batterie faible) : dans ce cas on ne fait rien. */
async function gererVerrouEcran() {
  if (!("wakeLock" in navigator)) return;
  const besoin = phaseEnCours() !== null && document.visibilityState === "visible";
  try {
    if (besoin && !verrouEcran) {
      verrouEcran = await navigator.wakeLock.request("screen");
      verrouEcran.addEventListener("release", () => { verrouEcran = null; });
    } else if (!besoin && verrouEcran) {
      await verrouEcran.release();
      verrouEcran = null;
    }
  } catch (erreur) {
    verrouEcran = null;
  }
}

function appliquerTheme(theme) {
  document.documentElement.dataset.theme = theme === "clair" ? "clair" : "sombre";
}

function basculerTheme() {
  const nouveau = document.documentElement.dataset.theme === "clair" ? "sombre" : "clair";
  appliquerTheme(nouveau);
  ecrireCookie("pitstop_theme", nouveau, 365);
}

function afficherVue(nom) {
  for (const vue of document.querySelectorAll(".vue")) vue.hidden = vue.id !== "vue-" + nom;
  for (const onglet of document.querySelectorAll(".onglet")) {
    const actif = onglet.dataset.vue === nom;
    onglet.classList.toggle("actif", actif);
    if (actif) onglet.setAttribute("aria-current", "page");
    else onglet.removeAttribute("aria-current");
  }
}

function demarrerApplication() {
  // Thème : le cookie d'abord, sinon la préférence du système.
  const themeCookie = lireCookie("pitstop_theme");
  const systemeClair = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  appliquerTheme(themeCookie || (systemeClair ? "clair" : "sombre"));
  rendreBoutonVoix();

  const selecteur = $("choix-presta");
  for (const presta of PRESTATIONS) {
    const option = creer("option", "", presta.nom);
    option.value = presta.id;
    selecteur.append(option);
  }
  selecteur.value = session.prestaId;
  selecteur.addEventListener("change", () => changerPrestation(selecteur.value));

  const vehicule = $("vehicule");
  vehicule.value = session.vehicule;
  vehicule.addEventListener("input", () => {
    session.vehicule = vehicule.value.slice(0, 40);
    sauverSession(session);
  });

  $("btn-principal").addEventListener("click", actionPrincipale);
  $("btn-enregistrer").addEventListener("click", enregistrerSession);
  $("btn-reinit").addEventListener("click", reinitialiser);
  $("btn-export").addEventListener("click", exporterHistorique);
  $("btn-vider").addEventListener("click", viderHistorique);
  $("btn-voix").addEventListener("click", basculerVoix);
  $("btn-theme").addEventListener("click", basculerTheme);
  for (const onglet of document.querySelectorAll(".onglet")) {
    onglet.addEventListener("click", () => afficherVue(onglet.dataset.vue));
  }

  // Barre d'espace = gros bouton, sauf si on est en train d'écrire ou sur un autre bouton.
  document.addEventListener("keydown", (evenement) => {
    if (evenement.code !== "Space" || evenement.repeat) return;
    const cible = evenement.target;
    if (cible.closest("input, select, textarea, button, a")) return;
    if ($("vue-chrono").hidden) return;
    evenement.preventDefault();
    actionPrincipale();
  });

  // Quand on revient sur l'onglet, on recalcule tout de suite et on reprend le verrou d'écran.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tictac();
      gererVerrouEcran();
    }
  });

  construireCurseurs();
  rendre();
  setInterval(tictac, 1000);
}

demarrerApplication();
