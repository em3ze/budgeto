
----------
# 💸 Budgeto

> Application de suivi de dépenses simple et efficace pour deux personnes.

---

## 🚀 Déploiement

### Prérequis
- **Docker** et **Docker Compose** installés sur ton serveur.

### Lancer l'application
Clone ou copie les fichiers du projet sur ton serveur, puis exécute la commande suivante à la racine :

```bash
docker-compose up -d

```

L'application sera directement accessible sur `http://ton-serveur:3000`.

----------

## 🌐 Reverse Proxy (Recommandé)

Si tu souhaites utiliser un nom de domaine propre (par exemple `budget.monserveur.com`), il est recommandé de placer l'application derrière un reverse proxy (Apache ou Nginx).

### Exemple avec Apache

Crée un nouveau _Virtual Host_ :

Apache

```
<VirtualHost *:80>
    ServerName budget.monserveur.com

    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>

```

Active ensuite les modules nécessaires et recharge le service :

Bash

```
sudo a2enmod proxy proxy_http
sudo systemctl reload apache2

```

----------

## 💾 Données Persistantes

Les données de l'application sont stockées de manière persistante dans un volume Docker (`budgeto_data`).

### Sauvegarde manuelle

Pour extraire les données et faire une sauvegarde en local :

Bash

```
docker cp budgeto:/data/budgeto.json ./backup-budgeto.json

```

### Restauration

Pour injecter une sauvegarde dans le conteneur et l'appliquer :

Bash

```
docker cp ./backup-budgeto.json budgeto:/data/budgeto.json
docker restart budgeto

```

----------

## 🛠 Commandes Utiles

**Action**

**Commande**

**Voir les logs**

`docker logs budgeto`

**Redémarrer l'app**

`docker-compose restart`

**Arrêter l'app**

`docker-compose down`

**Mettre à jour** _(après modif du code)_

`docker-compose up -d --build`

----------

## 📂 Structure du Projet

Plaintext

```
budgeto/
├── server.js          # Backend Express
├── package.json       # Dépendances Node.js
├── Dockerfile         # Configuration de l'image Docker
├── docker-compose.yml # Orchestration des conteneurs
├── README.md          # Documentation
└── public/
    └── index.html     # Frontend complet
```
