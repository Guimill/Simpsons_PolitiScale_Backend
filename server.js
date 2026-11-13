const { createDb, defineVote } = require("./src/db");
const { createApp } = require("./src/app");

const port = Number(process.env.PORT) || 3000;

async function main() {
  const db = createDb();
  const Vote = defineVote(db);
  await db.authenticate();
  await db.query("PRAGMA journal_mode = WAL"); // lectures pendant les écritures
  await db.sync(); // crée la table si elle n'existe pas
  console.log(`Base SQLite : ${db.options.storage}`);

  const server = createApp(Vote).listen(port, () => console.log(`API à l'écoute sur le port ${port}`));

  const stop = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((error) => {
  console.error("Démarrage impossible :", error);
  process.exit(1);
});
