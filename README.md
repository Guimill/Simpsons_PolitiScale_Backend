# Simpsons PolitiScale — API

API Node.js (Express 5 + Sequelize + SQLite) qui enregistre les votes « Gauche / Droite » pour chaque personnage
et renvoie les statistiques. Frontend : [Simpsons_PolitiScale_FrontEnd](https://github.com/Guimill/Simpsons_PolitiScale_FrontEnd).

## API

| Méthode | Route | Réponse |
|---|---|---|
| `GET` | `/api/health` | `{ "status": "ok" }` |
| `GET` | `/api/votes` | `[{ "name", "gauche", "droite", "total" }, …]` |
| `GET` | `/api/votes/:name` | `{ "name", "gauche", "droite", "total" }` |
| `POST` | `/api/votes/:name` avec `{ "vote": "Gauche" \| "Droite" }` | `201` + statistiques à jour |

## Développement

```sh
npm install
npm test                                        # tests sur SQLite en mémoire
npm start         # API sur http://localhost:3000, votes dans politiscale.sqlite
```

Configuration (variables d'environnement) : `DB_STORAGE` (fichier SQLite), `PORT`,
`CORS_ORIGIN` (seulement si le frontend est sur un autre domaine).

## Production

Docker (`compose.yaml`, base SQLite dans le volume `data`) derrière Nginx Proxy Manager. Le serveur suit la branche `main` :

```sh
/srv/politiscale-api/deploy/update.sh    # git pull + rebuild
```
