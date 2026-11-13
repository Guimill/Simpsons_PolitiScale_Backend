// Connexion à la base de données, configurée par variables d'environnement (jamais dans le code).
//   DB_DIALECT  mysql (défaut, MariaDB en production) | sqlite (tests, développement)
//   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
//   DB_STORAGE  fichier SQLite (":memory:" par défaut)
const { Sequelize, DataTypes } = require("sequelize");

function createDb(env = process.env) {
  const dialect = env.DB_DIALECT || "mysql";
  const logging = env.DB_LOG === "true" ? console.log : false;
  if (dialect === "sqlite") {
    return new Sequelize({ dialect, storage: env.DB_STORAGE || ":memory:", logging });
  }
  return new Sequelize(env.DB_NAME || "politiscale", env.DB_USER || "politiscale", env.DB_PASSWORD, {
    host: env.DB_HOST || "localhost",
    port: Number(env.DB_PORT) || 3306,
    dialect,
    logging,
    pool: { max: 5, idle: 10_000 },
  });
}

const VOTES = ["Gauche", "Droite"];

// Un enregistrement par vote (même table "personnages" que la première version)
function defineVote(db) {
  return db.define(
    "personnages",
    {
      name: { type: DataTypes.STRING(64), allowNull: false },
      vote: { type: DataTypes.ENUM(...VOTES), allowNull: false },
    },
    { indexes: [{ fields: ["name"] }] }
  );
}

module.exports = { createDb, defineVote, VOTES };
