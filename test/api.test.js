// npm test : API complète sur une base SQLite en mémoire
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createDb, defineVote } = require("../src/db");
const { createApp } = require("../src/app");

describe("API", () => {
  let server, base, db;

  before(async () => {
    db = createDb({ DB_STORAGE: ":memory:" });
    const Vote = defineVote(db);
    await db.sync();
    server = createApp(Vote, { votesPerMinute: 5 }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(async () => {
    server.closeAllConnections(); // fetch() keeps connections alive
    server.close();
    await db.close();
  });

  const post = (name, body) =>
    fetch(`${base}/votes/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  test("health", async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
  });

  test("un personnage sans vote a des statistiques à zéro", async () => {
    const res = await fetch(`${base}/votes/Ned`);
    assert.deepEqual(await res.json(), { name: "Ned", gauche: 0, droite: 0, total: 0 });
  });

  test("voter renvoie les statistiques à jour", async () => {
    assert.equal((await post("Homer", { vote: "Gauche" })).status, 201);
    assert.equal((await post("Homer", { vote: "Gauche" })).status, 201);
    const res = await post("Homer", { vote: "Droite" });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { name: "Homer", gauche: 2, droite: 1, total: 3 });

    const all = await (await fetch(`${base}/votes`)).json();
    assert.deepEqual(all, [{ name: "Homer", gauche: 2, droite: 1, total: 3 }]);
  });

  test("les votes invalides sont refusés", async () => {
    assert.equal((await post("Lisa", { vote: "Centre" })).status, 400);
    assert.equal((await post("<script>", { vote: "Gauche" })).status, 400);
  });

  test("limite de votes par minute", async () => {
    const res = await post("Bart", { vote: "Droite" });
    assert.equal(res.status, 429); // 5 requêtes déjà faites dans les tests précédents
  });

  test("route inconnue", async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});
