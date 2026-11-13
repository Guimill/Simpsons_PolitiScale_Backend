const express = require("express");
const { fn, col, literal } = require("sequelize");
const { VOTES } = require("./db");

const NAME_RE = /^[\p{L}\p{N} '._-]{1,64}$/u;

// Limite simple en mémoire : N votes par minute et par adresse IP
function rateLimit({ max, windowMs }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > max) return res.status(429).json({ error: "Trop de votes, réessayez dans une minute." });
    next();
  };
}

function toStats(row) {
  const total = Number(row.total) || 0;
  const gauche = Number(row.gauche) || 0;
  return { name: row.name, gauche, droite: total - gauche, total };
}

function createApp(Vote, { corsOrigin = process.env.CORS_ORIGIN, votesPerMinute = 30 } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true); // derrière nginx / Nginx Proxy Manager
  app.use(express.json({ limit: "1kb" }));

  if (corsOrigin) {
    // Seulement utile si le frontend est servi depuis un autre domaine
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", corsOrigin);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
  }

  const statsQuery = (where) =>
    Vote.findAll({
      attributes: [
        "name",
        [fn("COUNT", col("id")), "total"],
        [fn("SUM", literal("CASE WHEN vote = 'Gauche' THEN 1 ELSE 0 END")), "gauche"],
      ],
      where,
      group: ["name"],
      order: [["name", "ASC"]],
      raw: true,
    });

  const checkName = (req, res, next) => {
    if (!NAME_RE.test(req.params.name)) return res.status(400).json({ error: "Nom de personnage invalide." });
    next();
  };

  const router = express.Router();

  router.get("/health", (req, res) => res.json({ status: "ok" }));

  // Statistiques de tous les personnages (page Bilan)
  router.get("/votes", async (req, res) => {
    res.json((await statsQuery()).map(toStats));
  });

  // Statistiques d'un personnage
  router.get("/votes/:name", checkName, async (req, res) => {
    const [row] = await statsQuery({ name: req.params.name });
    res.json(toStats(row || { name: req.params.name }));
  });

  // Vote { "vote": "Gauche" | "Droite" } ; renvoie les statistiques à jour
  router.post("/votes/:name", rateLimit({ max: votesPerMinute, windowMs: 60_000 }), checkName, async (req, res) => {
    const vote = req.body && req.body.vote;
    if (!VOTES.includes(vote)) return res.status(400).json({ error: `Vote attendu : ${VOTES.join(" ou ")}.` });
    await Vote.create({ name: req.params.name, vote });
    const [row] = await statsQuery({ name: req.params.name });
    res.status(201).json(toStats(row));
  });

  app.use("/api", router);
  app.use((req, res) => res.status(404).json({ error: "Introuvable." }));
  // Express 5 transmet les erreurs des handlers async ici
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "JSON invalide." });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur." });
  });

  return app;
}

module.exports = { createApp };
