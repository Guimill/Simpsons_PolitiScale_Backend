const crypto = require("node:crypto");
const express = require("express");
const { fn, col, literal, UniqueConstraintError } = require("sequelize");
const { VOTES } = require("./db");
const { adminRouter } = require("./admin");

const NAME_RE = /^[\p{L}\p{N} '._-]{1,64}$/u;
const VOTER_COOKIE = "pv_id";
const VOTER_RE = /^[0-9a-f-]{36}$/;
const MAX_AGE = 400 * 24 * 3600; // longest lifetime browsers accept; renewed on every visit

// Limite simple en mémoire : N requêtes par minute et par adresse IP
function rateLimit({ max, windowMs, message = "Trop de votes, réessayez dans une minute." }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const n = (hits.get(req.ip) || 0) + 1;
    hits.set(req.ip, n);
    if (n > max) return res.status(429).json({ error: message });
    next();
  };
}

// Identifiant anonyme et permanent du navigateur (cookie HttpOnly), créé à la première visite
// et renouvelé à chaque visite (les navigateurs plafonnent la durée d'un cookie à 400 jours).
// C'est lui qui limite à un vote par personnage.
function voterId(req, res, next) {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)pv_id=([^;]+)/);
  const id = match && VOTER_RE.test(match[1]) ? match[1] : crypto.randomUUID();
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${VOTER_COOKIE}=${id}; Max-Age=${MAX_AGE}; Path=/api; HttpOnly; SameSite=Lax${secure}`);
  req.voterId = id;
  next();
}

function toStats(row) {
  const total = Number(row.total) || 0;
  const gauche = Number(row.gauche) || 0;
  return { name: row.name, gauche, droite: total - gauche, total };
}

function createApp(
  Vote,
  { corsOrigin = process.env.CORS_ORIGIN, votesPerMinute = 30, adminPassword = process.env.ADMIN_PASSWORD } = {}
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true); // derrière nginx / Nginx Proxy Manager
  app.use(express.json({ limit: "1kb" }));

  if (corsOrigin) {
    // Seulement utile si le frontend est servi depuis un autre domaine
    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", corsOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
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

  const statsFor = async (name) => {
    const [row] = await statsQuery({ name });
    return toStats(row || { name });
  };

  const checkName = (req, res, next) => {
    if (!NAME_RE.test(req.params.name)) return res.status(400).json({ error: "Nom de personnage invalide." });
    next();
  };

  // Administration (mot de passe ADMIN_PASSWORD), avant le cookie des votants
  app.use("/api/admin", adminRouter(Vote, { password: adminPassword, statsQuery, toStats, checkName }));

  const router = express.Router();

  router.get("/health", (req, res) => res.json({ status: "ok" }));

  router.use(voterId);

  // Statistiques de tous les personnages (page Bilan)
  router.get("/votes", async (req, res) => {
    res.json((await statsQuery()).map(toStats));
  });

  // Mes votes : { "Homer": "Gauche", ... }
  router.get("/my-votes", async (req, res) => {
    const rows = await Vote.findAll({ attributes: ["name", "vote"], where: { voterId: req.voterId }, raw: true });
    res.json(Object.fromEntries(rows.map((r) => [r.name, r.vote])));
  });

  // Statistiques d'un personnage + mon vote (null si je n'ai pas voté)
  router.get("/votes/:name", checkName, async (req, res) => {
    const { name } = req.params;
    const mine = await Vote.findOne({ attributes: ["vote"], where: { name, voterId: req.voterId }, raw: true });
    res.json({ ...(await statsFor(name)), myVote: mine ? mine.vote : null });
  });

  // Vote { "vote": "Gauche" | "Droite" } : un seul vote par personnage et par navigateur,
  // que l'on peut changer autant de fois qu'on veut.
  // 201 (premier vote) ou 200 (vote modifié / inchangé) + statistiques à jour.
  router.post("/votes/:name", rateLimit({ max: votesPerMinute, windowMs: 60_000 }), checkName, async (req, res) => {
    const { name } = req.params;
    const vote = req.body && req.body.vote;
    if (!VOTES.includes(vote)) return res.status(400).json({ error: `Vote attendu : ${VOTES.join(" ou ")}.` });

    const where = { name, voterId: req.voterId };
    let status = 200;
    const [updated] = await Vote.update({ vote }, { where });
    if (updated === 0) {
      try {
        await Vote.create({ ...where, vote });
        status = 201;
      } catch (error) {
        // deux requêtes simultanées du même navigateur : l'autre vient de créer la ligne
        if (!(error instanceof UniqueConstraintError)) throw error;
        await Vote.update({ vote }, { where });
      }
    }
    res.status(status).json({ ...(await statsFor(name)), myVote: vote });
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
