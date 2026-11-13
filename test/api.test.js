// npm test : API complète sur une base SQLite en mémoire
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createDb, defineVote, migrate } = require("../src/db");
const { createApp } = require("../src/app");

const ADMIN_PASSWORD = "test-admin-password-123";

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

async function startServer(options) {
  const db = createDb({ DB_STORAGE: ":memory:" });
  const Vote = defineVote(db);
  await migrate(db, Vote);
  const server = createApp(Vote, options).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const stop = async () => {
    server.closeAllConnections(); // fetch() keeps connections alive
    server.close();
    await db.close();
  };
  return { base: `http://127.0.0.1:${server.address().port}/api`, Vote, stop };
}

describe("API publique", () => {
  let ctx, base;
  before(async () => {
    ctx = await startServer({ votesPerMinute: 6 });
    base = ctx.base;
  });
  after(() => ctx.stop());

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

  test("le cookie est renouvelé à chaque visite, avec le même identifiant", async () => {
    const first = (await fetch(`${base}/votes`)).headers.get("set-cookie").split(";")[0];
    const again = await fetch(`${base}/votes`, { headers: { Cookie: first } });
    assert.equal(again.headers.get("set-cookie").split(";")[0], first);
  });

  test("on peut changer son vote, mais jamais plus d'un vote par personnage", async () => {
    const alice = browser(base);
    const bob = browser(base);

    let res = await alice.vote("Homer", "Gauche");
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { name: "Homer", gauche: 1, droite: 0, total: 1, myVote: "Gauche" });

    res = await alice.vote("Homer", "Droite"); // changement d'avis
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { name: "Homer", gauche: 0, droite: 1, total: 1, myVote: "Droite" });

    res = await alice.vote("Homer", "Droite"); // même vote : rien ne change
    assert.equal(res.status, 200);
    assert.equal((await res.json()).total, 1);

    assert.equal((await bob.vote("Homer", "Gauche")).status, 201); // autre navigateur
    assert.equal((await alice.vote("Lisa", "Gauche")).status, 201); // autre personnage

    assert.deepEqual(await (await alice.get("/my-votes")).json(), { Homer: "Droite", Lisa: "Gauche" });
    assert.equal((await (await bob.get("/votes/Homer")).json()).myVote, "Gauche");
    assert.deepEqual(await (await bob.get("/votes")).json(), [
      { name: "Homer", gauche: 1, droite: 1, total: 2 },
      { name: "Lisa", gauche: 1, droite: 0, total: 1 },
    ]);
  });

  test("un cookie falsifié est remplacé", async () => {
    const res = await fetch(`${base}/my-votes`, { headers: { Cookie: "pv_id=../../etc" } });
    assert.deepEqual(await res.json(), {});
    assert.match(res.headers.get("set-cookie"), /^pv_id=[0-9a-f-]{36};/);
  });

  test("les votes invalides sont refusés", async () => {
    const b = browser(base);
    assert.equal((await b.vote("Lisa", "Centre")).status, 400);
  });

  test("limite de votes par minute", async () => {
    const res = await browser(base).vote("Bart", "Droite");
    assert.equal(res.status, 429); // 6 requêtes de vote déjà faites dans les tests précédents
  });

  test("route inconnue", async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});

describe("Administration", () => {
  let ctx, base;
  const admin = (path, options = {}, password = ADMIN_PASSWORD) =>
    fetch(`${base}/admin${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${password}` },
    });

  before(async () => {
    ctx = await startServer({ adminPassword: ADMIN_PASSWORD });
    base = ctx.base;
    const a = browser(base);
    const b = browser(base);
    await a.vote("Homer", "Gauche");
    await a.vote("Lisa", "Droite");
    await b.vote("Homer", "Droite");
    await b.vote("Bart", "Gauche");
  });
  after(() => ctx.stop());

  test("refuse sans mot de passe ou avec un mauvais", async () => {
    assert.equal((await fetch(`${base}/admin/votes`)).status, 401);
    assert.equal((await admin("/votes", {}, "wrong-password-xxx")).status, 401);
  });

  test("affiche les statistiques et les derniers votes", async () => {
    const res = await admin("/votes");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const data = await res.json();
    assert.equal(data.total, 4);
    assert.equal(data.voters, 2);
    assert.deepEqual(
      data.characters.map((c) => [c.name, c.total]),
      [["Bart", 1], ["Homer", 2], ["Lisa", 1]]
    );
    assert.equal(data.recent.length, 4);
    assert.equal(data.recent[0].voterId.length, 8); // identifiant tronqué
  });

  test("supprime un vote, remet un personnage à zéro, puis tout", async () => {
    const { recent } = await (await admin("/votes")).json();
    const lisa = recent.find((v) => v.name === "Lisa");
    assert.deepEqual(await (await admin(`/votes/id/${lisa.id}`, { method: "DELETE" })).json(), { deleted: 1 });

    assert.deepEqual(await (await admin("/votes/Homer", { method: "DELETE" })).json(), { deleted: 2 });

    assert.equal((await admin("/votes", { method: "DELETE" })).status, 400); // sans confirmation
    const res = await admin("/votes", { method: "DELETE", body: JSON.stringify({ confirm: "RESET" }) });
    assert.deepEqual(await res.json(), { deleted: 1 });
    assert.equal((await (await admin("/votes")).json()).total, 0);
  });

  test("bloque après 10 mauvais mots de passe", async () => {
    for (let i = 0; i < 8; i++) await admin("/votes", {}, "wrong-password-xxx"); // 2 échecs déjà faits
    assert.equal((await admin("/votes", {}, "wrong-password-xxx")).status, 429);
    assert.equal((await admin("/votes")).status, 429); // même avec le bon, pendant une minute
  });
});

test("administration désactivée sans ADMIN_PASSWORD", async () => {
  const ctx = await startServer({ adminPassword: "" });
  const res = await fetch(`${ctx.base}/admin/votes`, { headers: { Authorization: "Bearer x" } });
  assert.equal(res.status, 503);
  await ctx.stop();
});

test("migration d'une base existante (votes sans voterId)", async () => {
  const { Sequelize } = require("sequelize");
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
