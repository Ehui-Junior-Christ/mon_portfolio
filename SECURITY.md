# Politique de sécurité

## Signaler une faille

Vous avez trouvé une vulnérabilité sur ce portfolio (site public, portail `admin/`, configuration) ?

- Écrivez à **juniorehui15@gmail.com** avec l'objet « Sécurité portfolio » : description, étapes pour reproduire, impact estimé.
- Merci de **ne pas ouvrir d'issue publique** avant correction, et de ne pas tester sur les données ou comptes d'autrui.
- Réponse visée : sous 7 jours. Le signalement sera crédité si vous le souhaitez.

Fichier machine : `/.well-known/security.txt` (RFC 9116).

## Mesures en place

| Domaine | Mesure |
| --- | --- |
| Contenu (`data/content.json`) | Tout texte est échappé avant affichage ; seul `**gras**` / `*italique*` est reconverti. Les URL sont filtrées (http(s), mailto:, tel:, chemins relatifs ; images : http(s) et relatifs). |
| Scripts tiers | Aucun script externe : GSAP 3.12.5, ScrollTrigger et Lenis 1.3.26 sont hébergés dans `js/vendor/` (fichiers vérifiés contre les hash sha384 officiels), donc `script-src 'self'`. Seules les feuilles de style Font Awesome (avec SRI) et Google Fonts (SRI impossible, CSS générée selon le navigateur) viennent de l'extérieur. |
| CSP | En `<meta>` dans chaque page (GitHub Pages) et en en-tête HTTP via `.htaccess` (InfinityFree), avec `frame-ancestors 'none'` en plus. |
| Portail admin | Token jamais dans l'URL ni les logs, `no-referrer`, CSP stricte, refus de s'afficher dans un cadre, envois limités (images ré-encodées en WebP/JPEG, PDF vérifié), écritures limitées à `data/content.json` et `assets/uploads/`. |
| Hébergement Apache | Listing désactivé, fichiers cachés/docs/sauvegardes/scripts serveur refusés, en-têtes de sécurité, `assets/uploads/` ne sert que images et PDF. |

### Maintenance des hash CSP

Les pages contiennent quelques blocs inline autorisés par leur hash sha256 :

- `index.html` : le script `document.documentElement.classList.add('js');`
- `404.html` : la balise style et la balise script (chacune sur une seule ligne).

Si vous modifiez un de ces blocs, recalculez le hash et mettez-le à jour dans la `<meta>` de la page **et** dans `.htaccess` / `admin/.htaccess` :

```bash
python -c "import hashlib,base64,sys;print('sha256-'+base64.b64encode(hashlib.sha256(sys.argv[1].encode()).digest()).decode())" "document.documentElement.classList.add('js');"
```

Pour mettre à jour une bibliothèque de `js/vendor/`, téléchargez la version exacte et comparez son empreinte à celle publiée par cdnjs / jsdelivr ; pour Font Awesome (CDN), recalculez son `integrity` (sha384) :

```bash
curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A
```

## Pour le propriétaire

### Token GitHub du portail admin

- Uniquement un token **fine-grained** (jamais « classic » `ghp_…`, qui ouvre tous vos dépôts).
- *Repository access* : **Only select repositories → `mon_portfolio`**.
- *Permissions* : **Contents : Read and write** seulement (Metadata : read est ajouté d'office). Rien d'autre.
- *Expiration* : **90 jours** maximum ; recréez-le ensuite.
- Ne cochez « Se souvenir sur cet appareil » que sur votre ordinateur personnel. Sur GitHub Pages, l'admin partage l'origine `ehui-junior-christ.github.io` avec **tous vos autres sites GitHub Pages** : un script malveillant sur l'un d'eux pourrait lire un token mémorisé. Préférez la session (case décochée) ou l'admin du domaine InfinityFree.
- En cas de doute (ordinateur perdu, token affiché à l'écran en public…) : **révoquez-le immédiatement** sur https://github.com/settings/personal-access-tokens, puis créez-en un nouveau.

### Mot de passe FTP InfinityFree

- Le mot de passe FTP ne doit **jamais** apparaître dans le dépôt (code, README, commit, issue). Il n'existe que dans les *secrets* GitHub Actions.
- S'il a été partagé (chat, capture, fichier texte…), changez-le dans le panneau InfinityFree (*Accounts → FTP Details / Change password*), puis mettez à jour le secret :

```bash
gh secret set FTP_PASSWORD --repo Ehui-Junior-Christ/mon_portfolio
```

(la commande demande la valeur sans l'afficher ; ne la passez pas en argument, elle resterait dans l'historique du terminal).

### HTTPS sur InfinityFree

1. Panneau InfinityFree → *SSL/TLS* → demander le certificat gratuit pour `ehui-christ-dev.gt.tc`, l'installer.
2. Vérifier que `https://ehui-christ-dev.gt.tc` s'ouvre sans alerte.
3. Dans `.htaccess`, décommenter le bloc « Redirection HTTPS », puis la ligne `upgrade-insecure-requests`, puis HSTS avec `max-age=300`.
4. Après quelques jours sans problème, passer HSTS à `max-age=31536000`.
5. Penser à renouveler le certificat (les certificats gratuits expirent vite) : un certificat expiré + HSTS = site inaccessible.

### Compte GitHub

- Activer la **double authentification** (2FA) : https://github.com/settings/security.
- Protéger la branche `main` (*Settings → Rules → Rulesets*) : interdire le *force push* et la suppression. Le portail écrit directement sur `main` : n'exigez donc pas de pull request, sinon l'admin ne peut plus publier.
- Vérifier de temps en temps *Settings → Personal access tokens* et révoquer les tokens inutilisés.
- Les secrets `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` ne sont lisibles que par les workflows ; n'ajoutez pas de workflow déclenché par `pull_request_target` ou par des forks.
