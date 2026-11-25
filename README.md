# 🎓 OSIRIS Lehrer-Portfolio

> **Offline-fähige Lehrerplattform & Persönliches Unterrichts-Dashboard (PWA)**  
> *100 % eigenständige Web-App (Client-Side, 0 Server-Abhängigkeit) für Deutschlehrkräfte.*

[![GitHub Pages](https://img.shields.io/badge/Accès%20Direct-GitHub%20Pages-blue?style=flat-square&logo=github)](https://osirisai-dev.github.io/LEHRER-PORTFOLIO/pages/home.html)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20Ready-brightgreen?style=flat-square)](#)

---

## 🌟 Accès Direct en Ligne (GitHub Pages)

Vous pouvez ouvrir et utiliser l'application directement dans votre navigateur, sur mobile, tablette ou ordinateur sans rien installer :

👉 **Accéder au Lehrer-Portfolio en Direct : https://osirisai-dev.github.io/LEHRER-PORTFOLIO/pages/home.html**

---

## 📋 Présentation du Projet

**OSIRIS Lehrer-Portfolio** réunit dans une interface unifiée et installable (PWA) l'ensemble des outils quotidiens pour l'enseignement de l'allemand :

* **📝 Test- & Textgenerator** (`pages/test-generator.html`) & **Testbank** (`pages/test-bank.html`) : Création, gestion et export de sujets et exercices.
* **📚 KI Wörterbuch & KI Fachwörterbuch** (`pages/woerterbuch.html`, `pages/fachwoerterbuch.html`) : Dictionnaires interactifs avec niveaux CECR, conjugaisons, mode open-source sans clé API (Wiktionary / OpenThesaurus / Wikidata / Wikipedia) et coffre chiffré AES-GCM pour vos clés API optionnelles.
* **📖 Offline Wiki & Bibliothek** (`pages/wiki.html`, `pages/library.html`, `shelves/`) : Textes de lecture hors ligne, lecteur PDF intégré et bibliothèque numérique.
* **🗒️ Lehrskizze Editor & Edu Hub** (`pages/lehrskizze-editor.html`, `pages/edu-hub.html`, `pages/dashboard.html`) : Préparation de cours (*Fiches de cours*), suivi et tableau de bord.
* **🏎️ Autobahn Racer** (`pages/autobahn_racer.html`) : Jeu éducatif de révision grammaticale et lexicale en allemand.

---

## 🚀 Utilisation & Installation PWA

1. **En ligne (0 installation) :** Ouvrez **https://osirisai-dev.github.io/LEHRER-PORTFOLIO/pages/home.html** dans Chrome, Edge ou Safari.
2. **Hors ligne (PWA) :** Cliquez sur *"Installer l'application"* / *"Ajouter à l'écran d'accueil"* dans votre navigateur. Le Service Worker (`sw.js`) met en cache les pages, polices, bibliothèques et bases locales pour un fonctionnement hors connexion.
3. **Tutoriels inclus :** `LEHRERPORTFOLIO_Tutoriel_PWA_FR.pdf` et `LEHRERPORTFOLIO_Tutoriel_PWA_DE.pdf`.

---

## 🏗️ Structure du Dépôt

```text
LEHRER PORTFOLIO/
├── index.html              # Redirection vers pages/home.html & enregistrement SW
├── manifest.json           # Manifeste PWA
├── sw.js                   # Service Worker (cache hors-ligne)
├── offline.html            # Page de repli hors-ligne
├── pages/                  # Modules applicatifs (home, dashboard, dictionnaires, wiki, testbank, racer...)
├── js/                     # Logique applicative, SmartTutor, coffre AES-GCM, sync
├── db/                     # Bases locales JSON (dictionnaire, fachwörterbuch, testbank)
├── lib/                    # Bibliothèques locales (sql.js, pdf.js, jszip, mammoth, chart.js...)
├── shelves/                # Étagères & lecteur PDF de la bibliothèque
├── fonts/                  # Polices locales (sans appel externe)
├── icons/                  # Icônes PWA & modules
└── screenshots/            # Captures d'écran PWA
```
