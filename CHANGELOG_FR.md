# 📝 Journal des modifications (Changelog) - OSIRIS Lehrer-Portfolio

Ce document récapitule toutes les nouveautés, améliorations, corrections et optimisations apportées récemment au projet.

## ✨ Nouveautés & Améliorations UI
* **Animation d'en-tête (Header) :** Ajout d'une transition CSS fluide (slide-up/slide-down) lors du repli et du dépliage de l'en-tête dans library.html et edu-hub.html.
* **Menus déroulants fonctionnels :** Résolution d'un conflit CSS (overflow: hidden) empêchant la lecture des menus absolus ("AI Sorting", "API-Keys"). Ils sont désormais parfaitement visibles même avec l'en-tête replié.

## 🐛 Corrections de bugs & Navigation
* **Encodage UTF-8 (Accents) :** Restauration et conversion stricte de tous les fichiers (précédemment en Windows-1252) vers l'UTF-8. Tous les caractères accentués français et allemands (é, à, ü, ö, Ä, etc.) s'affichent désormais sans aucune corruption.
* **Flux d'accueil (Home) :** Le bouton "Call to action" (CTA) et l'aperçu iframe de home.html pointent désormais correctement vers la structure complète portfolio-subpage.html (au lieu de pointer directement sur le dashboard).
* **Raccourcis fixes (Fixed Shortcuts) :** Mise à jour des liens internes codés en dur dans portfolio-subpage.html pour rediriger vers les noms de fichiers modernes (library.html, edu-hub.html, woerterbuch.html).
* **Liens et chemins d'accès :** Les balises <script> et href des bibliothèques (lib/), des icônes et du cœur de l'app (js/core/osiris-core.js) ont été réparées dans toutes les pages "Étagères" (shelves).

## 📱 PWA & Mode Hors-ligne
* **Génération d'icônes & Captures :** Création de l'ensemble complet d'icônes PWA (de 72x72 à 512x512 pixels, avec version "maskable") et de 2 captures d'écran (format large et étroit) pour un affichage parfait lors de l'installation de l'application.
* **Service Worker (sw.js) :** Mise à jour majeure de la liste de pré-mise en cache pour inclure les noms corrects des étagères (ex: 	he_codex_collection.html), et passage à la version de cache 3 pour forcer la mise à jour chez les utilisateurs.
* **Manifestes de dossiers :** Création et actualisation dynamique des fichiers manifest.json à l'intérieur des dossiers onts/, portfolio/fonts/, portfolio/icons/ et icons/ (qui référence désormais plus de 130 icônes).

## ⚡ Optimisations & Nettoyage (Humanisation)
* **Suppression des doublons :** Les fichiers JavaScript redondants présents à la racine du projet ont été supprimés. L'architecture est maintenant centralisée autour de js/apps/, js/core/ et lib/.
* **Minification et nettoyage sécurisé :** Nettoyage massif d'environ **149 000 caractères** d'espaces vides et de commentaires de développement inutiles dans les fichiers HTML, JS et CSS.
* **Sécurité du code :** Le nettoyage a été exécuté via un algorithme préservant à 100% la logique métier, les balises <script> et <style>, ainsi que les commentaires de licences tierces.