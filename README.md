# Pit Stop — le chrono d'atelier

Site statique en HTML, CSS et JavaScript (sans bibliothèque ni étape de build), réalisé pour le TP GitHub de L2 Informatique à l'Université de Guyane.

Pit Stop chronomètre un nettoyage automobile phase par phase. À l'écran, la voiture passe de sale à propre au fil des phases, une voix annonce les étapes, et les temps enregistrés servent à battre ses records et à ajuster ses durées cibles.

## Fonctionnalités

- Chrono par phase qui survit au rechargement de la page (`localStorage`).
- Voiture en SVG dont les zones changent d'état, avec animations CSS.
- Annonces vocales (API Web Speech) et écran maintenu allumé (API Wake Lock).
- Historique des sessions, records, moyennes et export en JSON.
- Cibles ajustables, avec adoption de sa moyenne réelle.
- Onglet Rentabilité : la durée mesurée par le chrono donne la capacité d'une journée, le point mort, le résultat du mois (graphique SVG dessiné en JavaScript) et ce que rapporte chaque minute gagnée.
- Thème clair ou sombre et choix de la voix mémorisés par cookies.

## Organisation des fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page et dessin SVG de la voiture |
| `css/style.css` | Thèmes, mise en page, animations |
| `js/prestations.js` | Données : prestations, phases, cibles, zones |
| `js/rentabilite.js` | Calcul de rentabilité (fonctions pures) |
| `js/storage.js` | Sauvegarde : `localStorage` et cookies, avec validation |
| `js/app.js` | Logique du chrono et affichage |

## Lancer en local

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```bash
python3 -m http.server 8000
```

Les cookies et le maintien de l'écran allumé demandent une adresse `http://localhost` ou `https://`.
