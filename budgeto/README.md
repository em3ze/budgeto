# 💸 Budgeto

Application de suivi de dépenses pour deux personnes.

## Déploiement rapide (Docker)

### Prérequis
- Docker et Docker Compose installés sur ton serveur

### Lancer l'app

```bash
# Clone / copie les fichiers sur ton serveur, puis:
docker-compose up -d
```

L'app sera accessible sur **http://ton-serveur:3000**

---

### Derrière un reverse proxy (Apache / Nginx recommandé)

Si tu veux un domaine propre genre `budget.monserveur.com`, ajoute un Virtual Host Apache:

```apache
<VirtualHost *:80>
    ServerName budget.monserveur.com

    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/
</VirtualHost>
```

Active les modules nécessaires:
```bash
sudo a2enmod proxy proxy_http
sudo systemctl reload apache2
```

---

### Données persistantes

Les données sont stockées dans un volume Docker (`budgeto_data`) sur ton serveur.  
Pour faire une sauvegarde manuelle:

```bash
docker cp budgeto:/data/budgeto.json ./backup-budgeto.json
```

Pour restaurer:
```bash
docker cp ./backup-budgeto.json budgeto:/data/budgeto.json
docker restart budgeto
```

---

### Commandes utiles

```bash
# Voir les logs
docker logs budgeto

# Redémarrer
docker-compose restart

# Arrêter
docker-compose down

# Mettre à jour (après modif du code)
docker-compose up -d --build
```

---

### Structure des fichiers

```
budgeto/
├── server.js          # Backend Express
├── package.json
├── Dockerfile
├── docker-compose.yml
├── README.md
└── public/
    └── index.html     # Frontend complet
```
