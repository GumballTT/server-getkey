const Database = require("better-sqlite3");

const db = new Database("keys.db");

db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        hwid TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0
    );
`);


// =====================================================
// AUTO MIGRATION
// =====================================================

// Kiểm tra bảng keys hiện tại
let keyColumns =
    db.prepare("PRAGMA table_info(keys)").all();


// Nếu database cũ chưa có hwid
if (!keyColumns.some(column => column.name === "hwid")) {

    db.exec(
        "ALTER TABLE keys ADD COLUMN hwid TEXT"
    );

    console.log(
        "Database migration: added keys.hwid"
    );

    keyColumns =
        db.prepare("PRAGMA table_info(keys)").all();
}


// Nếu database cũ chưa có used
if (!keyColumns.some(column => column.name === "used")) {

    db.exec(
        "ALTER TABLE keys ADD COLUMN used INTEGER NOT NULL DEFAULT 0"
    );

    console.log(
        "Database migration: added keys.used"
    );
}


// Kiểm tra bảng sessions
const sessionColumns =
    db.prepare(
        "PRAGMA table_info(sessions)"
    ).all();


// Nếu database cũ chưa có completed
if (
    !sessionColumns.some(
        column => column.name === "completed"
    )
) {

    db.exec(
        "ALTER TABLE sessions ADD COLUMN completed INTEGER NOT NULL DEFAULT 0"
    );

    console.log(
        "Database migration: added sessions.completed"
    );
}


module.exports = db;
