# Ehui Junior Christ — Portfolio

Mon portfolio personnel. Je suis développeur web full-stack, diplômé d'une Licence MIAGE à l'Université Polytechnique de Bingerville (2026), et basé à Abidjan. On y trouve mon parcours, mes compétences, une sélection de projets et un petit jeu du serpent pour faire une pause.

## Stack

- HTML
- CSS
- JavaScript (vanilla, sans framework)
- [GSAP](https://gsap.com/) et ScrollTrigger pour les animations au défilement
- [Lenis](https://lenis.darkroom.engineering/) pour le défilement fluide

Aucune étape de build : le site est entièrement statique.

## Structure

```
.
├── index.html          page unique du portfolio
├── data/content.json   tout le contenu du site (profil, parcours, projets...)
├── admin/              portail d'administration
├── css/                feuilles de style (mise en page, animations, jeu)
├── js/                 scripts (rendu du contenu, animations, jeu du serpent)
└── assets/             images, favicon, image de partage, uploads
```

## Lancer en local

Le contenu est chargé depuis `data/content.json`, il faut donc un petit serveur local (ouvrir le fichier directement en `file://` n'affiche qu'une version minimale).

J'utilise l'extension **Live Server** de VS Code : clic droit sur `index.html` puis « Open with Live Server ».

## Modifier le contenu sans toucher au code

Le portail `admin/` (en ligne : https://ehui-junior-christ.github.io/mon_portfolio/admin/) permet de modifier le profil, les projets, le parcours, les compétences et d'envoyer des images. Il enregistre directement `data/content.json` dans ce dépôt via l'API GitHub ; le site est republié environ une minute après.

Première fois :

1. Créer un jeton sur https://github.com/settings/personal-access-tokens/new : accès au seul dépôt `mon_portfolio`, permission **Contents : Read and write**.
2. Ouvrir la page admin, coller le jeton, se connecter.
3. Modifier, puis « Publier ».

Le jeton ne doit jamais être partagé. En cas de doute, le révoquer depuis les paramètres GitHub.

## Contact

- Email : [juniorehui15@gmail.com](mailto:juniorehui15@gmail.com)
- LinkedIn : [junior-christ-emmanuel-ehui](https://www.linkedin.com/in/junior-christ-emmanuel-ehui-4362572b2/)
- GitHub : [Ehui-Junior-Christ](https://github.com/Ehui-Junior-Christ)
