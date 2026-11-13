// npm test : API complète sur une base SQLite en mémoire
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { Sequelize } = require("sequelize");
const { createDb, defineVote, migrate } = require("../src/db");
const { createApp } = require("../src/app");

// Un "navigateur" : garde le cookie pv_id reçu du serveur
function browser(base) {
  let cookie = null;
  const call = async (path, options = {}) => {
    const res = await fetch(base + path, {
      ...options,
      headers: { ...(options.headers || {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  return {
    get: (path) => call(path),
    vote: (name, vote) =>
      call(`/votes/${encodeURIComponent(name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      }),
  };
}

describe("API", () => {
  let server, base, db;

  before(async () => {
    db = createDb({ DB_STORAGE: ":memory:" });
    const Vote = defineVote(db);
    await migrate(db, Vote);
    server = createApp(Vote, { votesPerMinute: 6 }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(async () => {
    server.closeAllConnections(); // fetch() keeps connections alive
    server.close();
    await db.close();
  });

  test("health", async () => {
    assert.equal((await fetch(`${base}/health`)).status, 200);
  });

  test("un personnage sans vote a des statistiques à zéro", async () => {
    const res = await browser(base).get("/votes/Ned");
    assert.deepEqual(await res.json(), { name: "Ned", gauche: 0, droite: 0, total: 0, myVote: null });
  });

  test("le premier appel pose un cookie anonyme HttpOnly (400 jours)", async () => {
    const res = await fetch(`${base}/votes`);
    assert.match(
      res.headers.get("set-cookie"),
      /^pv_id=[0-9a-f-]{36}; Max-Age=34560000; Path=\/api; HttpOnly; SameSite=Lax/
    );
  });

  test("un seul vote par personnage et par navigateur", async () => {
    const alice = browser(base);
    const bob = browser(base);

    let res = await alice.vote("Homer", "Gauche");
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { name: "Homer", gauche: 1, droite: 0, total: 1, myVote: "Gauche" });

    res = await alice.vote("Homer", "Droite"); // 2e tentative : refusée
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.myVote, "Gauche");
    assert.equal(body.total, 1);

    assert.equal((await bob.vote("Homer", "Droite")).status, 201); // autre navigateur : OK
    assert.equal((await alice.vote("Lisa", "Gauche")).status, 201); // autre personnage : OK

    assert.deepEqual(await (await alice.get("/my-votes")).json(), { Homer: "Gauche", Lisa: "Gauche" });
    assert.equal((await (await bob.get("/votes/Homer")).json()).myVote, "Droite");
    assert.deepEqual(await (await bob.get("/votes")).json(), [
      { name: "Homer", gauche: 1, droite: 1, total: 2 },
      { name: "Lisa", gauche: 1, droite: 0, total: 1 },
    ]);
  });

  test("le cookie est renouvelé à chaque visite, avec le même identifiant", async () => {
    const first = (await fetch(`${base}/votes`)).headers.get("set-cookie").split(";")[0];
    const again = await fetch(`${base}/votes`, { headers: { Cookie: first } });
    assert.equal(again.headers.get("set-cookie").split(";")[0], first);
  });

  test("un cookie falsifié est remplacé", async () => {
    const res = await fetch(`${base}/my-votes`, { headers: { Cookie: "pv_id=../../etc" } });
    assert.deepEqual(await res.json(), {});
    assert.match(res.headers.get("set-cookie"), /^pv_id=[0-9a-f-]{36};/);
  });

  test("les votes invalides sont refusés", async () => {
    const b = browser(base);
    assert.equal((await b.vote("Lisa", "Centre")).status, 400);
    assert.equal((await b.vote("<script>", "Gauche")).status, 400);
  });

  test("limite de votes par minute", async () => {
    const res = await browser(base).vote("Bart", "Droite");
    assert.equal(res.status, 429); // 6 requêtes de vote déjà faites dans les tests précédents
  });

  test("route inconnue", async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});

test("migration d'une base existante (votes sans voterId)", async () => {
  const db = createDb({ DB_STORAGE: ":memory:" });
  // ancienne table, sans la colonne voterId
  await db.query(
    "CREATE TABLE personnages (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(64) NOT NULL, " +
      "vote TEXT NOT NULL, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)"
  );
  await db.query(
    "INSERT INTO personnages (name, vote, createdAt, updatedAt) VALUES " +
      "('Moe','Droite',datetime(),datetime()),('Moe','Droite',datetime(),datetime())"
  );
  const Vote = defineVote(db);
  await migrate(db, Vote);
  await migrate(db, Vote); // idempotent

  assert.equal(await Vote.count({ where: { name: "Moe" } }), 2); // anciens votes conservés
  const id = "11111111-1111-1111-1111-111111111111";
  await Vote.create({ name: "Moe", vote: "Gauche", voterId: id });
  await assert.rejects(Vote.create({ name: "Moe", vote: "Droite", voterId: id }), Sequelize.UniqueConstraintError);
  await db.close();
});
