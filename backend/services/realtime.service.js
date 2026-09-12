const db = require('../config/db');

let ready = false;

async function ensureTable() {
    if (ready) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS pms_realtime_state (
            id TINYINT NOT NULL PRIMARY KEY,
            revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
            last_source VARCHAR(255) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    await db.query(`
        INSERT INTO pms_realtime_state (id, revision, last_source)
        VALUES (1, 1, 'bootstrap')
        ON DUPLICATE KEY UPDATE id = id
    `);
    ready = true;
}

async function getRevision() {
    await ensureTable();
    const rows = await db.query('SELECT revision, last_source, updated_at FROM pms_realtime_state WHERE id = 1 LIMIT 1');
    const row = rows[0] || {};
    return {
        revision: String(row.revision || '1'),
        lastSource: row.last_source || null,
        updatedAt: row.updated_at || null,
    };
}

async function bumpRevision(source = 'pms') {
    await ensureTable();
    await db.query(
        `UPDATE pms_realtime_state
         SET revision = revision + 1, last_source = ?, updated_at = NOW()
         WHERE id = 1`,
        [String(source || 'pms').slice(0, 255)]
    );
    return getRevision();
}

module.exports = { getRevision, bumpRevision };
