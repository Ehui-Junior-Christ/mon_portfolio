# Politique de sécurité

## Signaler une faille

Vous avez trouvé une vulnérabilité sur ce site ?

- Écrivez à l'adresse indiquée dans [`/.well-known/security.txt`](.well-known/security.txt) avec l'objet « Sécurité portfolio » : description, étapes pour reproduire, impact estimé.
- Merci de **ne pas ouvrir d'issue publique** avant correction, et de ne pas tester sur les données ou comptes d'autrui.
- Réponse visée : sous 7 jours. Le signalement sera crédité si vous le souhaitez.

## Principes appliqués

- Tout contenu affiché est échappé ; les liens et images sont filtrés par schéma.
- Politique de sécurité du contenu (CSP) stricte : seuls les scripts du site s'exécutent.
- En-têtes de sécurité, HTTPS forcé et accès refusé aux fichiers techniques côté serveur.
- Aucun secret n'est stocké dans ce dépôt.
