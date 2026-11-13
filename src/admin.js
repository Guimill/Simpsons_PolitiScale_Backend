// Routes d'administration : /api/admin/...
// Protégées par le mot de passe ADMIN_PASSWORD, envoyé dans l'en-tête "Authorization: Bearer <mot de passe>".
// Sans ADMIN_PASSWORD (ou s'il fait moins de 12 caractères), l'administration est désactivée.
const crypto = require("node:crypto");
const express = require("express");

function sameSecret(given, expected) {
  // comparaison en temps constant (hash des deux côtés : longueurs égales)
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function adminRouter(Vote, { password, statsQuery, toStats, checkName }) {
  const router = express.Router();
  const enabled = typeof password === "string" && password.length >= 12;

  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // 10 mauvais mots de passe par minute et par IP au maximum (contre la force brute)
  const failures = new Map();
  setInterval(() => failures.clear(), 60_000).unref();

  router.use((req, res, next) => {
    if (!enabled) return res.status(503).json({ error: "Administration désactivée (ADMIN_PASSWORD absent)." });
    if ((failures.get(req.ip) || 0) >= 10) {
      return res.status(429).json({ error: "Trop de tentatives, réessayez dans une minute." });
    }
    const header = req.headers.authorization || "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!given || !sameSecret(given, password)) {
      failures.set(req.ip, (failures.get(req.ip) || 0) + 1);
      return res.status(401).json({ error: "Mot de passe incorrect." });
    }
    next();
  });

  // Vue d'ensemble : statistiques par personnage + derniers votes
  router.get("/votes", async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const [stats, total, voters, recent] = await Promise.all([
      statsQuery(),
      Vote.count(),
      Vote.count({ distinct: true, col: "voterId" }),
      Vote.findAll({
        attributes: ["id", "name", "vote", "voterId", "createdAt", "updatedAt"],
        order: [["updatedAt", "DESC"]],
        limit,
        raw: true,
      }),
    ]);
    res.json({
      total,
      voters,
      characters: stats.map(toStats),
      recent: recent.map((v) => ({ ...v, voterId: v.voterId ? v.voterId.slice(0, 8) : null })),
    });
  });

  // Supprimer un vote
  router.delete("/votes/id/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Identifiant invalide." });
    res.json({ deleted: await Vote.destroy({ where: { id } }) });
  });

  // Remettre à zéro un personnage
  router.delete("/votes/:name", checkName, async (req, res) => {
    res.json({ deleted: await Vote.destroy({ where: { name: req.params.name } }) });
  });

  // Tout remettre à zéro : { "confirm": "RESET" } obligatoire
  router.delete("/votes", async (req, res) => {
    if (!req.body || req.body.confirm !== "RESET") {
      return res.status(400).json({ error: 'Confirmation requise : { "confirm": "RESET" }.' });
    }
    res.json({ deleted: await Vote.destroy({ where: {} }) });
  });

  return router;
}

module.exports = { adminRouter };
