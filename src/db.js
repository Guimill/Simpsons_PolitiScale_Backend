// Base de données SQLite (un simple fichier), configurée par variables d'environnement.
//   DB_STORAGE  chemin du fichier (défaut : politiscale.sqlite ; ":memory:" pour les tests)
const { Sequelize, DataTypes } = require("sequelize");

function createDb(env = process.env) {
  return new Sequelize({
    dialect: "sqlite",
    storage: env.DB_STORAGE || "politiscale.sqlite",
    logging: env.DB_LOG === "true" ? console.log : false,
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
