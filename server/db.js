// ============================================================
// HAWLA — server/db.js
// SQLite database using better-sqlite3.
// Stores every rate snapshot with a timestamp so you build
// historical data over time (useful for charts + data licensing).
// ============================================================

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

// Store database file in a persistent location
const DB_DIR  = path.join(__dirname, "../data");
const DB_PATH = path.join(DB_DIR, "hawla.db");

// Create data directory if it doesn't exist
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// ── Enable WAL mode for better performance ──
db.pragma("journal_mode = WAL");

// ── Create tables ──────────────────────────────────────────
db.exec(`
  -- Stores every rate snapshot (one row per provider per corridor per scrape)
  CREATE TABLE IF NOT EXISTS rates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT    NOT NULL,
    corridor    TEXT    NOT NULL,
    rate        REAL    NOT NULL,
    fee         REAL    NOT NULL DEFAULT 0,
    scraped_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    source      TEXT    NOT NULL DEFAULT 'scraper'
  );

  -- Index for fast lookups of latest rate per provider+corridor
  CREATE INDEX IF NOT EXISTS idx_rates_lookup
    ON rates(provider_id, corridor, scraped_at DESC);

  -- Alert subscribers
  CREATE TABLE IF NOT EXISTS subscribers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    phone            TEXT    NOT NULL,
    corridor         TEXT    NOT NULL,
    amount           REAL    NOT NULL DEFAULT 1000,
    best_rate_at_signup REAL,
    lang             TEXT    NOT NULL DEFAULT 'en',
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(phone, corridor)
  );

  -- Track last rate seen per corridor for alert diffing
  CREATE TABLE IF NOT EXISTS rate_snapshots (
    corridor    TEXT PRIMARY KEY,
    best_rate   REAL NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── RATE FUNCTIONS ─────────────────────────────────────────

// Save a batch of scraped rates
function saveRates(rows) {
  const insert = db.prepare(`
    INSERT INTO rates (provider_id, corridor, rate, fee, source)
    VALUES (@provider_id, @corridor, @rate, @fee, @source)
  `);
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(rows);
}

// Get the latest rate for every provider for a given corridor
function getLatestRates(corridor) {
  return db.prepare(`
    SELECT r.provider_id, r.rate, r.fee, r.scraped_at
    FROM rates r
    INNER JOIN (
      SELECT provider_id, MAX(scraped_at) AS max_at
      FROM rates
      WHERE corridor = ?
      GROUP BY provider_id
    ) latest ON r.provider_id = latest.provider_id
           AND r.scraped_at  = latest.max_at
           AND r.corridor    = ?
    ORDER BY (r.rate * (1000 - r.fee) / 1000) DESC
  `).all(corridor, corridor);
}

// Get all latest rates for all corridors (for the frontend API)
function getAllLatestRates() {
  return db.prepare(`
    SELECT r.provider_id, r.corridor, r.rate, r.fee, r.scraped_at
    FROM rates r
    INNER JOIN (
      SELECT provider_id, corridor, MAX(scraped_at) AS max_at
      FROM rates
      GROUP BY provider_id, corridor
    ) latest ON r.provider_id = latest.provider_id
           AND r.corridor    = latest.corridor
           AND r.scraped_at  = latest.max_at
    ORDER BY r.corridor, (r.rate * (1000 - r.fee) / 1000) DESC
  `).all();
}

// Get best rate per corridor (for alert checking)
function getBestRatePerCorridor() {
  return db.prepare(`
    SELECT r.corridor,
           MAX(r.rate * (1000 - r.fee) / 1000) AS effective_rate
    FROM rates r
    INNER JOIN (
      SELECT provider_id, corridor, MAX(scraped_at) AS max_at
      FROM rates
      GROUP BY provider_id, corridor
    ) latest ON r.provider_id = latest.provider_id
           AND r.corridor    = latest.corridor
           AND r.scraped_at  = latest.max_at
    GROUP BY r.corridor
  `).all();
}

// Get last snapshot (for diffing to detect improvements)
function getSnapshot(corridor) {
  return db.prepare(
    "SELECT best_rate FROM rate_snapshots WHERE corridor = ?"
  ).get(corridor);
}

function saveSnapshot(corridor, bestRate) {
  db.prepare(`
    INSERT INTO rate_snapshots (corridor, best_rate, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(corridor) DO UPDATE SET
      best_rate  = excluded.best_rate,
      updated_at = excluded.updated_at
  `).run(corridor, bestRate);
}

// ── SUBSCRIBER FUNCTIONS ───────────────────────────────────

function upsertSubscriber(phone, corridor, amount, bestRate, lang) {
  db.prepare(`
    INSERT INTO subscribers (phone, corridor, amount, best_rate_at_signup, lang)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(phone, corridor) DO UPDATE SET
      amount              = excluded.amount,
      best_rate_at_signup = excluded.best_rate_at_signup,
      lang                = excluded.lang
  `).run(phone, corridor, amount, bestRate, lang);
}

function getSubscribersByCorridors(corridors) {
  const placeholders = corridors.map(() => "?").join(",");
  return db.prepare(
    `SELECT * FROM subscribers WHERE corridor IN (${placeholders})`
  ).all(...corridors);
}

function getAllSubscribers() {
  return db.prepare("SELECT * FROM subscribers ORDER BY created_at DESC").all();
}

function updateSubscriberRate(phone, corridor, newRate) {
  db.prepare(`
    UPDATE subscribers
    SET best_rate_at_signup = ?
    WHERE phone = ? AND corridor = ?
  `).run(newRate, phone, corridor);
}

module.exports = {
  saveRates,
  getLatestRates,
  getAllLatestRates,
  getBestRatePerCorridor,
  getSnapshot,
  saveSnapshot,
  upsertSubscriber,
  getSubscribersByCorridors,
  getAllSubscribers,
  updateSubscriberRate,
};