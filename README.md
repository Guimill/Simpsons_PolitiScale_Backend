# Simpsons PolitiScale — API

API Node.js (Express 5 + Sequelize + SQLite) qui enregistre les votes « Gauche / Droite » pour chaque personnage
et renvoie les statistiques. Frontend : [Simpsons_PolitiScale_FrontEnd](https://github.com/Guimill/Simpsons_PolitiScale_FrontEnd).

## API

Chaque navigateur reçoit un identifiant anonyme (cookie `pv_id`, HttpOnly, renouvelé à chaque visite) :
**un seul vote par personnage et par navigateur** (index unique en base). Revoter modifie le vote existant.

| Méthode | Route | Réponse |
|---|---|---|
| `GET` | `/api/health` | `{ "status": "ok" }` |
| `GET` | `/api/votes` | `[{ "name", "gauche", "droite", "total" }, …]` |
| `GET` | `/api/votes/:name` | `{ "name", "gauche", "droite", "total", "myVote" }` (`myVote` : `null` si pas encore voté) |
| `GET` | `/api/my-votes` | `{ "Homer": "Gauche", … }` |
| `POST` | `/api/votes/:name` avec `{ "vote": "Gauche" \| "Droite" }` | `201` (premier vote) ou `200` (vote modifié) + statistiques |

### Administration

Routes `/api/admin/...` protégées par le mot de passe `ADMIN_PASSWORD` (en-tête `Authorization: Bearer <mot de passe>`,
10 essais ratés par minute au maximum). Interface : page `/admin` du frontend.

| Méthode | Route | Effet |
|---|---|---|
| `GET` | `/api/admin/votes` | totaux, statistiques par personnage, derniers votes |
| `DELETE` | `/api/admin/votes/id/:id` | supprime un vote |
| `DELETE` | `/api/admin/votes/:name` | remet un personnage à zéro |
| `DELETE` | `/api/admin/votes` avec `{ "confirm": "RESET" }` | remet tout à zéro |

## Développement

```sh
npm install
npm test                                        # tests sur SQLite en mémoire
npm start         # API sur http://localhost:3000, votes dans politiscale.sqlite
```

Configuration (variables d'environnement) : `DB_STORAGE` (fichier SQLite), `PORT`, `ADMIN_PASSWORD` (12 caractères minimum, sinon l'administration est désactivée),
`CORS_ORIGIN` (seulement si le frontend est sur un autre domaine).

## Production

Docker (`compose.yaml`, base SQLite dans le volume `data`) derrière Nginx Proxy Manager. Le serveur suit la branche `main` :

```sh
/srv/politiscale-api/deploy/update.sh    # git pull + rebuild ; le mot de passe admin est dans .env
```
