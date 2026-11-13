const { createDb, defineVote } = require("./src/db");
const { createApp } = require("./src/app");

const port = Number(process.env.PORT) || 3000;

async function connect(db, attempts = 30) {
  // Au démarrage du conteneur, la base peut ne pas être encore prête
  for (let i = 1; ; i++) {
    try {
      await db.authenticate();
      return;
    } catch (error) {
      if (i >= attempts) throw error;
      console.warn(`Base de données indisponible (${error.message}), nouvel essai dans 2 s…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const db = createDb();
  const Vote = defineVote(db);
  await connect(db);
  await db.sync(); // crée la table si elle n'existe pas
  console.log("Base de données connectée.");

  const server = createApp(Vote).listen(port, () => console.log(`API à l'écoute sur le port ${port}`));

  const stop = () => server.close(() => db.close().finally(() => process.exit(0)));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((error) => {
  console.error("Démarrage impossible :", error);
  process.exit(1);
});
