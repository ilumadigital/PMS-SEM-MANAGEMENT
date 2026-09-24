const crypto = require('crypto');
const db = require('../config/db');

const PROVIDER = 'hosthub';
const DEFAULT_BASES = {
    sandbox: 'https://eric.hosthub.com/api/2019-03-01',
    production: 'https://app.hosthub.com/api/2019-03-01',
};

let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS integration_credentials (
            id INT AUTO_INCREMENT PRIMARY KEY,
            provider VARCHAR(32) NOT NULL,
            environment VARCHAR(32) NOT NULL,
            api_key_ciphertext LONGTEXT NOT NULL,
            api_key_iv VARCHAR(64) NOT NULL,
            api_key_tag VARCHAR(64) NOT NULL,
            properties_json LONGTEXT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'connected',
            connected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_sync_at DATETIME NULL,
            last_webhook_at DATETIME NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_provider_environment (provider, environment)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key VARCHAR(120) PRIMARY KEY,
            setting_value TEXT NULL,
            updated_by INT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    tablesReady = true;
}

function integrationSecret() {
    const secret = process.env.INTEGRATION_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        const error = new Error('INTEGRATION_SECRET (or JWT_SECRET fallback) is required to store Hosthub credentials securely.');
        error.code = 'INTEGRATION_SECRET_MISSING';
        throw error;
    }
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', integrationSecret(), iv);
    const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
    };
}

function decryptSecret(record) {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        integrationSecret(),
        Buffer.from(record.api_key_iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(record.api_key_tag, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(record.api_key_ciphertext, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

function normalizeEnvironment(value) {
    const environment = String(value || 'sandbox').trim().toLowerCase();
    return environment === 'production' ? 'production' : 'sandbox';
}

function normalizeBaseUrl(value, environment) {
    return String(value || DEFAULT_BASES[environment] || DEFAULT_BASES.sandbox).trim().replace(/\/$/, '');
}

async function getActiveEnvironment() {
    await ensureTables();
    const rows = await db.query(
        'SELECT setting_value FROM app_settings WHERE setting_key=? LIMIT 1',
        ['hosthub.environment']
    );
    return normalizeEnvironment(rows[0]?.setting_value || process.env.HOSTHUB_ENVIRONMENT || 'sandbox');
}

async function getStoredCredential(environment) {
    await ensureTables();
    const rows = await db.query(
        `SELECT provider, environment, api_key_ciphertext, api_key_iv, api_key_tag,
                properties_json, status, connected_at, last_sync_at, updated_at
         FROM integration_credentials
         WHERE provider=? AND environment=? LIMIT 1`,
        [PROVIDER, environment]
    );
    return rows[0] || null;
}

async function getConfig({ includeSecret = true } = {}) {
    const environment = await getActiveEnvironment();
    const stored = await getStoredCredential(environment);
    let metadata = {};
    try { metadata = stored?.properties_json ? JSON.parse(stored.properties_json) : {}; } catch (_) {}

    const envApiKey = String(process.env.HOSTHUB_API_KEY || '').trim();
    const apiKey = stored
        ? (includeSecret ? decryptSecret(stored) : '')
        : (includeSecret ? envApiKey : '');

    return {
        environment,
        baseUrl: normalizeBaseUrl(metadata.baseUrl || process.env.HOSTHUB_API_BASE, environment),
        apiKey,
        configured: Boolean(stored || envApiKey),
        source: stored ? 'database' : (envApiKey ? 'environment' : 'none'),
        updatedAt: stored?.updated_at || null,
        lastSyncAt: stored?.last_sync_at || null,
    };
}

async function saveCredentials({ environment, apiKey, baseUrl, userId }) {
    await ensureTables();
    const env = normalizeEnvironment(environment);
    const key = String(apiKey || '').trim();
    if (!key) {
        const error = new Error('Hosthub API key is required.');
        error.code = 'HOSTHUB_API_KEY_REQUIRED';
        throw error;
    }

    const encrypted = encryptSecret(key);
    const normalizedBase = normalizeBaseUrl(baseUrl, env);
    await db.query(
        `INSERT INTO integration_credentials
         (provider, environment, api_key_ciphertext, api_key_iv, api_key_tag, properties_json, status, connected_at)
         VALUES (?,?,?,?,?,?, 'connected', NOW())
         ON DUPLICATE KEY UPDATE
           api_key_ciphertext=VALUES(api_key_ciphertext),
           api_key_iv=VALUES(api_key_iv),
           api_key_tag=VALUES(api_key_tag),
           properties_json=VALUES(properties_json),
           status='connected',
           connected_at=NOW()`,
        [PROVIDER, env, encrypted.ciphertext, encrypted.iv, encrypted.tag, JSON.stringify({ baseUrl: normalizedBase })]
    );
    await db.query(
        `INSERT INTO app_settings (setting_key, setting_value, updated_by)
         VALUES ('hosthub.environment', ?, ?)
         ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_by=VALUES(updated_by)`,
        [env, userId || null]
    );
    return getConfig({ includeSecret: false });
}

async function disconnect(environment) {
    await ensureTables();
    const env = normalizeEnvironment(environment || await getActiveEnvironment());
    await db.query('DELETE FROM integration_credentials WHERE provider=? AND environment=?', [PROVIDER, env]);
    return { success: true, environment: env };
}

function normalizeArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['data', 'results', 'items', 'rentals', 'bookings', 'events']) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
}

async function request(path, options = {}) {
    const config = await getConfig();
    if (!config.apiKey) {
        const error = new Error('Hosthub API key is not configured.');
        error.code = 'HOSTHUB_NOT_CONFIGURED';
        throw error;
    }

    const response = await fetch(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
        method: options.method || 'GET',
        headers: {
            Authorization: config.apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(Number(process.env.HOSTHUB_REQUEST_TIMEOUT_MS || 15000)),
    });

    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch (_error) { payload = raw; }

    if (!response.ok) {
        const error = new Error(`Hosthub API returned HTTP ${response.status}`);
        error.code = 'HOSTHUB_API_ERROR';
        error.status = response.status;
        error.payload = payload;
        throw error;
    }
    return payload;
}

async function getRentals() {
    const payload = await request('/rentals');
    return { raw: payload, rentals: normalizeArray(payload) };
}

async function getRentalCalendarEvents(rentalId, query = {}) {
    if (!rentalId) throw new Error('rentalId is required');
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const payload = await request(`/rentals/${encodeURIComponent(rentalId)}/calendar-events${suffix}`);
    return { raw: payload, events: normalizeArray(payload) };
}

async function testConnection() {
    const startedAt = Date.now();
    const { rentals } = await getRentals();
    const config = await getConfig({ includeSecret: false });
    if (config.source === 'database') {
        await db.query(
            'UPDATE integration_credentials SET last_sync_at=NOW() WHERE provider=? AND environment=?',
            [PROVIDER, config.environment]
        );
    }
    return {
        ok: true,
        environment: config.environment,
        baseUrl: config.baseUrl,
        rentalCount: rentals.length,
        latencyMs: Date.now() - startedAt,
        rentals: rentals.map((rental) => ({
            id: rental.encodedId || rental.encodedID || rental.id || rental._id || null,
            name: rental.name || rental.title || rental.nickname || null,
        })),
    };
}

module.exports = {
    getConfig,
    saveCredentials,
    disconnect,
    request,
    getRentals,
    getRentalCalendarEvents,
    testConnection,
};
