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

// Un enregistrement par vote (même table "personnages" que la première version).
// voterId = cookie anonyme du navigateur ; l'index unique (name, voterId) garantit
// un seul vote par personnage et par navigateur (les anciens votes ont voterId NULL).
function defineVote(db) {
  return db.define(
    "personnages",
    {
      name: { type: DataTypes.STRING(64), allowNull: false },
      vote: { type: DataTypes.ENUM(...VOTES), allowNull: false },
      voterId: { type: DataTypes.STRING(36), allowNull: true },
    },
    {
      indexes: [
        { fields: ["name"] },
        { name: "personnages_name_voter_unique", unique: true, fields: ["name", "voterId"] },
      ],
    }
  );
}

// Crée la table, ou met à jour une table existante (ajout de voterId + index unique)
async function migrate(db, Vote) {
  const qi = db.getQueryInterface();
  const table = Vote.getTableName();
  const tables = await qi.showAllTables();
  if (tables.includes(table)) {
    const columns = await qi.describeTable(table);
    if (!columns.voterId) await qi.addColumn(table, "voterId", { type: DataTypes.STRING(36), allowNull: true });
    const indexes = (await qi.showIndex(table)).map((i) => i.name);
    if (!indexes.includes("personnages_name_voter_unique")) {
      await qi.addIndex(table, ["name", "voterId"], { name: "personnages_name_voter_unique", unique: true });
    }
  }
  await db.sync();
}

module.exports = { createDb, defineVote, migrate, VOTES };
