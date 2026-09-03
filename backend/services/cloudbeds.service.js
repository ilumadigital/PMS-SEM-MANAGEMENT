const crypto = require('crypto');
const db = require('../config/db');

const PROVIDER = 'cloudbeds';
const ENVIRONMENT = process.env.CLOUDBEDS_ENVIRONMENT || 'sandbox';
const API_BASE = (process.env.CLOUDBEDS_API_BASE || 'https://api.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const AUTH_BASE = (process.env.CLOUDBEDS_AUTH_BASE || 'https://hotels.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const REDIRECT_URI = process.env.CLOUDBEDS_REDIRECT_URI || 'https://api.sem-management.com/api/integrations/cloudbeds/callback';
const FRONTEND_URL = (process.env.PMS_FRONTEND_URL || 'https://pms.sem-management.com').replace(/\/$/, '');
const PAGE_SIZE = 100;
const AUTH_STATE_TTL_MINUTES = 10;
const REQUIRED_SCOPES = [
    'read:reservation',
    'read:guest',
    'read:room',
    'read:dashboard',
    'read:housekeeping',
    'read:hotel',
];

const DEFAULT_AUTH_SCOPES = [
    'read:customFields',
    'read:dashboard',
    'read:guest',
    'read:hotel',
    'read:housekeeping',
    'read:reservation',
    'read:resourceReservations',
    'read:room',
];

function authorizationScopes() {
    const configured = String(process.env.CLOUDBEDS_AUTH_SCOPES || '')
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean);

    return configured.length ? uniqueStrings(configured) : DEFAULT_AUTH_SCOPES;
}

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
        CREATE TABLE IF NOT EXISTS reservation_operations (
            source VARCHAR(32) NOT NULL,
            external_reservation_id VARCHAR(128) NOT NULL,
            actual_arrival_time VARCHAR(16) NULL,
            actual_departure_time VARCHAR(16) NULL,
            guest_notes TEXT NULL,
            special_requests_json LONGTEXT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (source, external_reservation_id)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS integration_auth_states (
            state_hash CHAR(64) PRIMARY KEY,
            provider VARCHAR(32) NOT NULL,
            environment VARCHAR(32) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            INDEX idx_auth_state_provider (provider, environment, expires_at)
        )
    `);

    tablesReady = true;
}

function integrationSecret() {
    const secret = process.env.INTEGRATION_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        const error = new Error('INTEGRATION_SECRET (or JWT_SECRET fallback) is required to store Cloudbeds credentials securely.');
        error.code = 'INTEGRATION_SECRET_MISSING';
        throw error;
    }
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptSecret(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', integrationSecret(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
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

async function cloudbedsRequest(path, { apiKey, method = 'GET', query, form, baseUrl } = {}) {
    const base = (baseUrl || (path === '/access_token' ? AUTH_BASE : API_BASE)).replace(/\/$/, '');
    const url = new URL(`${base}${path}`);

    if (query) {
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, String(value));
        }
    }

    const headers = { Accept: 'application/json' };
    const request = { method, headers };

    if (apiKey) {
        // Cloudbeds documents both forms for cbat_ API keys. The OpenAPI PMS
        // schema declares x-api-key, while the partner automatic-delivery guide
        // shows Authorization: Bearer. Sending both avoids host/proxy differences.
        headers['x-api-key'] = apiKey;
        headers.Authorization = `Bearer ${apiKey}`;
    }

    if (form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        request.body = new URLSearchParams(
            Object.fromEntries(
                Object.entries(form).filter(([, value]) => value !== undefined && value !== null)
            )
        ).toString();
    }

    const response = await fetch(url, request);
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';

    let payload;
    try {
        payload = text ? JSON.parse(text) : {};
    } catch {
        payload = { raw: text };
    }

    const nonJsonSuccess =
        response.ok &&
        text &&
        !contentType.toLowerCase().includes('json') &&
        payload?.raw !== undefined;

    if (!response.ok || payload?.success === false || nonJsonSuccess) {
        const message =
            payload?.message ||
            payload?.error_description ||
            payload?.error ||
            (nonJsonSuccess
                ? `Cloudbeds returned a non-JSON response for ${url.pathname}`
                : `Cloudbeds API request failed with HTTP ${response.status}`);
        const error = new Error(message);
        error.status = response.status;
        error.cloudbedsPayload = payload;
        error.requestId = response.headers.get('x-request-id') || null;
        error.requestUrl = url.toString();
        error.contentType = contentType;
        throw error;
    }

    return payload;
}

function normalizeApiBase(value) {
    return String(value || '').trim().replace(/\/$/, '');
}

async function resolvePropertyApiBases(apiKey) {
    const candidates = [];
    const add = (value) => {
        const normalized = normalizeApiBase(value);
        if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    };

    // Cloudbeds documents /oauth/metadata as the source of truth for property
    // localization. Try both documented hosts because API-key examples use the
    // hotels host while the endpoint reference uses api.cloudbeds.com.
    for (const metadataBase of [API_BASE, AUTH_BASE]) {
        try {
            const metadata = await cloudbedsRequest('/oauth/metadata', {
                apiKey,
                baseUrl: metadataBase,
            });
            add(metadata?.data?.api?.url);
        } catch (error) {
            console.warn(
                '[CLOUDBEDS] metadata lookup failed on',
                metadataBase,
                error.message,
                error.requestId || ''
            );
        }
    }

    add(API_BASE);
    add(AUTH_BASE);
    return candidates;
}

function safeError(error) {
    return {
        status: error?.status || null,
        code: error?.code || null,
        message: error?.message || 'Unknown Cloudbeds error',
        requestId: error?.requestId || null,
        requestUrl: error?.requestUrl || null,
        contentType: error?.contentType || null,
    };
}

async function tryCloudbeds(path, options) {
    try {
        const payload = await cloudbedsRequest(path, options);
        return { ok: true, payload, error: null };
    } catch (error) {
        return { ok: false, payload: null, error: safeError(error), rawError: error };
    }
}

function propertiesFromTokenResources(resources) {
    return asArray(resources)
        .filter((resource) => resource?.type === 'property' && resource?.id)
        .map((resource) => ({
            id: String(resource.id),
            name: 'Cloudbeds Sandbox Property',
            city: '',
        }));
}

function extractDataArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    if (Array.isArray(payload?.data?.results)) return payload.data.results;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
}

function pick(object, paths, fallback = null) {
    for (const path of paths) {
        const value = path.split('.').reduce((current, key) => current?.[key], object);
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
}

function asArray(value) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values) {
    return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function flattenStrings(value) {
    if (value === undefined || value === null) return [];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [String(value)];
    }
    if (Array.isArray(value)) return value.flatMap(flattenStrings);
    if (typeof value === 'object') {
        return Object.entries(value).flatMap(([key, nested]) => {
            if (nested === undefined || nested === null || nested === '' || nested === false) return [];
            if (typeof nested === 'object') return flattenStrings(nested);
            return [`${key}: ${nested}`];
        });
    }
    return [];
}

function propertyFromHotel(hotel) {
    return {
        id: String(pick(hotel, ['propertyID', 'propertyId', 'id'], '')),
        name: String(pick(hotel, ['propertyName', 'name'], 'Cloudbeds Sandbox Property')),
        city: pick(hotel, ['propertyCity', 'city'], ''),
    };
}

function allowedPropertyIds() {
    const enforce = String(process.env.CLOUDBEDS_ENFORCE_PROPERTY_ALLOWLIST || 'false') === 'true';
    if (!enforce) return [];

    return (process.env.CLOUDBEDS_ALLOWED_PROPERTY_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
}

function filterAllowedProperties(properties) {
    const allowed = allowedPropertyIds();
    if (!allowed.length) return properties;

    const allowedSet = new Set(allowed);
    const filtered = properties.filter((property) => allowedSet.has(String(property.id)));

    if (!filtered.length) {
        const error = new Error('The connected Cloudbeds account does not match CLOUDBEDS_ALLOWED_PROPERTY_IDS.');
        error.code = 'CLOUDBEDS_PROPERTY_NOT_ALLOWED';
        throw error;
    }

    return filtered;
}

async function getHotels(apiKey) {
    const payload = await cloudbedsRequest('/getHotels', {
        apiKey,
        query: { pageSize: 100, pageNumber: 1 },
    });

    return filterAllowedProperties(
        extractDataArray(payload)
            .map(propertyFromHotel)
            .filter((property) => property.id)
    );
}

async function saveIntegration(apiKey, properties = []) {
    await ensureTables();

    const existingRows = await db.query(
        `SELECT properties_json FROM integration_credentials
         WHERE provider = ? AND environment = ?
         LIMIT 1`,
        [PROVIDER, ENVIRONMENT]
    );

    const sandboxOnly = String(process.env.CLOUDBEDS_SANDBOX_ONLY || 'true') !== 'false';
    const allowRebind = String(process.env.CLOUDBEDS_ALLOW_REBIND || 'false') === 'true';

    if (sandboxOnly && !allowRebind && existingRows[0]?.properties_json) {
        let existingProperties = [];
        try {
            existingProperties = JSON.parse(existingRows[0].properties_json) || [];
        } catch {
            existingProperties = [];
        }

        const existingIds = uniqueStrings(existingProperties.map((property) => property.id)).sort();
        const nextIds = uniqueStrings(properties.map((property) => property.id)).sort();

        if (existingIds.length && JSON.stringify(existingIds) !== JSON.stringify(nextIds)) {
            const error = new Error(
                'Cloudbeds sandbox is already bound to a different test property. Set CLOUDBEDS_ALLOW_REBIND=true only if you intentionally want to replace it.'
            );
            error.code = 'CLOUDBEDS_SANDBOX_ALREADY_BOUND';
            error.status = 409;
            throw error;
        }
    }

    const encrypted = encryptSecret(apiKey);

    await db.query(
        `INSERT INTO integration_credentials
            (provider, environment, api_key_ciphertext, api_key_iv, api_key_tag, properties_json, status, connected_at)
         VALUES (?, ?, ?, ?, ?, ?, 'authorized', NOW())
         ON DUPLICATE KEY UPDATE
            api_key_ciphertext = VALUES(api_key_ciphertext),
            api_key_iv = VALUES(api_key_iv),
            api_key_tag = VALUES(api_key_tag),
            properties_json = VALUES(properties_json),
            status = 'authorized',
            connected_at = NOW()`,
        [
            PROVIDER,
            ENVIRONMENT,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.tag,
            JSON.stringify(properties),
        ]
    );
}

async function getStoredIntegration() {
    await ensureTables();
    const rows = await db.query(
        `SELECT * FROM integration_credentials
         WHERE provider = ? AND environment = ?
         LIMIT 1`,
        [PROVIDER, ENVIRONMENT]
    );
    return rows[0] || null;
}

async function deleteStoredIntegration() {
    await ensureTables();
    await db.query(
        `DELETE FROM integration_credentials
         WHERE provider = ? AND environment = ?`,
        [PROVIDER, ENVIRONMENT]
    );
}

function authStateHash(state) {
    return crypto.createHash('sha256').update(String(state)).digest('hex');
}

async function createAuthorizationState() {
    await ensureTables();
    const state = crypto.randomBytes(32).toString('hex');
    const stateHash = authStateHash(state);

    await db.query(
        `DELETE FROM integration_auth_states
         WHERE provider = ? AND environment = ? AND expires_at < NOW()`,
        [PROVIDER, ENVIRONMENT]
    );

    const expiresAt = new Date(Date.now() + AUTH_STATE_TTL_MINUTES * 60 * 1000);
    await db.query(
        `INSERT INTO integration_auth_states
            (state_hash, provider, environment, created_at, expires_at)
         VALUES (?, ?, ?, NOW(), ?)`,
        [stateHash, PROVIDER, ENVIRONMENT, expiresAt]
    );

    return state;
}

async function consumeAuthorizationState(state) {
    if (!state) {
        const error = new Error('Missing Cloudbeds authorization state.');
        error.code = 'CLOUDBEDS_STATE_MISSING';
        error.status = 400;
        throw error;
    }

    await ensureTables();
    const stateHash = authStateHash(state);
    const rows = await db.query(
        `SELECT state_hash
         FROM integration_auth_states
         WHERE state_hash = ?
           AND provider = ?
           AND environment = ?
           AND used_at IS NULL
           AND expires_at >= NOW()
         LIMIT 1`,
        [stateHash, PROVIDER, ENVIRONMENT]
    );

    if (!rows[0]) {
        // Marketplace Flow A reaches our callback without first visiting our
        // /connect route. Cloudbeds supplies its own random state in that flow.
        // Accept it only when we have no outstanding app-initiated auth request.
        const pendingRows = await db.query(
            `SELECT COUNT(*) AS pending
             FROM integration_auth_states
             WHERE provider = ?
               AND environment = ?
               AND used_at IS NULL
               AND expires_at >= NOW()`,
            [PROVIDER, ENVIRONMENT]
        );

        if (Number(pendingRows[0]?.pending || 0) === 0) {
            return { externalMarketplaceFlow: true };
        }

        const error = new Error('Cloudbeds authorization state is invalid or expired. Start the connection again.');
        error.code = 'CLOUDBEDS_STATE_INVALID';
        error.status = 400;
        throw error;
    }

    await db.query(
        `UPDATE integration_auth_states
         SET used_at = NOW()
         WHERE state_hash = ?`,
        [stateHash]
    );

    return { externalMarketplaceFlow: false };
}

async function getApiKey() {
    const integration = await getStoredIntegration();
    if (integration) {
        return decryptSecret(integration);
    }

    // Automatic API-key delivery is the production path. A manually supplied
    // CLOUDBEDS_API_KEY is ignored unless explicitly enabled, preventing a stale
    // sandbox key in backend.env from silently taking over a fresh connection.
    const allowEnvApiKey = String(process.env.CLOUDBEDS_ALLOW_ENV_API_KEY || 'false') === 'true';
    if (allowEnvApiKey && process.env.CLOUDBEDS_API_KEY) {
        return process.env.CLOUDBEDS_API_KEY.trim();
    }

    const error = new Error('Cloudbeds sandbox is not connected yet.');
    error.code = 'CLOUDBEDS_NOT_CONNECTED';
    error.status = 409;
    throw error;
}

async function getVerifiedAppState(apiKey, propertyIds = []) {
    const apiBases = await resolvePropertyApiBases(apiKey);
    const targets = propertyIds.length ? [...propertyIds, null] : [null];
    const attempts = [];

    for (const apiBase of apiBases) {
        for (const propertyId of targets) {
            const result = await tryCloudbeds('/getAppState', {
                apiKey,
                baseUrl: apiBase,
                query: { propertyID: propertyId },
            });

            if (result.ok) {
                return {
                    verified: true,
                    appState: result.payload?.data?.app_state || 'enabled',
                    apiBase,
                    propertyId: propertyId || '',
                    attempts,
                };
            }

            attempts.push({
                apiBase,
                propertyId: propertyId || '',
                error: result.error,
            });

            if (result.error?.status === 401 || result.error?.status === 403) {
                continue;
            }
        }
    }

    const revoked = attempts.length > 0 && attempts.every(
        (attempt) => [401, 403].includes(Number(attempt.error?.status))
    );

    return {
        verified: false,
        revoked,
        appState: revoked ? 'disabled' : 'unknown',
        apiBase: apiBases[0] || API_BASE,
        propertyId: '',
        attempts,
    };
}

async function disableRemoteAppState(apiKey, propertyIds = []) {
    const apiBases = await resolvePropertyApiBases(apiKey);
    const targets = propertyIds.length ? [...propertyIds, null] : [null];
    const attempts = [];

    for (const apiBase of apiBases) {
        for (const propertyId of targets) {
            const result = await tryCloudbeds('/postAppState', {
                apiKey,
                baseUrl: apiBase,
                method: 'POST',
                form: {
                    propertyID: propertyId,
                    app_state: 'disabled',
                },
            });

            if (result.ok) {
                return {
                    success: true,
                    apiBase,
                    propertyId: propertyId || '',
                    attempts,
                };
            }

            attempts.push({
                apiBase,
                propertyId: propertyId || '',
                error: result.error,
            });

            // If Cloudbeds already revoked the key, the local session should still
            // be removed; there is nothing left to disable remotely.
            if ([401, 403].includes(Number(result.error?.status))) {
                continue;
            }
        }
    }

    const alreadyRevoked = attempts.length > 0 && attempts.every(
        (attempt) => [401, 403].includes(Number(attempt.error?.status))
    );

    return {
        success: alreadyRevoked,
        alreadyRevoked,
        attempts,
    };
}

async function disconnectIntegration() {
    const stored = await getStoredIntegration();
    if (!stored) {
        return { disconnected: true, alreadyDisconnected: true };
    }

    const properties = parseStoredProperties(stored);
    let apiKey;

    try {
        apiKey = decryptSecret(stored);
    } catch (error) {
        await deleteStoredIntegration();
        return {
            disconnected: true,
            localCredentialRemoved: true,
            warning: 'Stored Cloudbeds credential could not be decrypted and was removed locally.',
        };
    }

    const propertyIds = uniqueStrings(properties.map((property) => property.id));
    const remote = await disableRemoteAppState(apiKey, propertyIds);

    if (!remote.success) {
        const error = new Error(
            'Cloudbeds could not be disconnected remotely. Reauthorization was stopped to avoid leaving two active sessions.'
        );
        error.code = 'CLOUDBEDS_DISCONNECT_FAILED';
        error.status = 502;
        error.details = remote.attempts;
        throw error;
    }

    await deleteStoredIntegration();

    return {
        disconnected: true,
        remote,
    };
}

async function exchangeAuthorizationCode(code, state) {
    await consumeAuthorizationState(state);

    if (ENVIRONMENT !== 'sandbox' && String(process.env.CLOUDBEDS_SANDBOX_ONLY || 'true') !== 'false') {
        const error = new Error('This build is locked to Cloudbeds sandbox mode.');
        error.code = 'CLOUDBEDS_SANDBOX_ONLY';
        throw error;
    }

    const clientId = process.env.CLOUDBEDS_CLIENT_ID;
    const clientSecret = process.env.CLOUDBEDS_CLIENT_SECRET;

    if (!clientId || !clientSecret || !REDIRECT_URI) {
        const error = new Error('Cloudbeds client credentials are not configured on the server.');
        error.code = 'CLOUDBEDS_CONFIG_MISSING';
        throw error;
    }

    const tokenPayload = await cloudbedsRequest('/access_token', {
        method: 'POST',
        form: {
            grant_type: 'urn:ietf:params:oauth:grant-type:api-key',
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI,
            code,
        },
    });

    const apiKey = tokenPayload?.access_token;
    if (!apiKey || !String(apiKey).startsWith('cbat_')) {
        const error = new Error('Cloudbeds did not return a valid automatic-delivery API key.');
        error.code = 'CLOUDBEDS_INVALID_API_KEY';
        throw error;
    }

    const tokenResources = asArray(tokenPayload?.resources)
        .filter((resource) => resource?.type && resource?.id)
        .map((resource) => ({
            type: String(resource.type),
            id: String(resource.id),
        }));
    const properties = propertiesFromTokenResources(tokenPayload?.resources);
    await saveIntegration(apiKey, properties);

    let snapshot;
    try {
        snapshot = await listPmsSnapshot();
    } catch (error) {
        // Keep the newly-issued key so diagnostics can be viewed in the PMS, but
        // never present the connection as data-ready when validation failed.
        return {
            environment: ENVIRONMENT,
            properties,
            ready: false,
            validationError: safeError(error),
            requiredScopes: REQUIRED_SCOPES,
            authorizationScopes: authorizationScopes(),
            tokenResources,
            propertyResourceCaptured: properties.length > 0,
        };
    }

    return {
        environment: ENVIRONMENT,
        properties: snapshot.properties,
        ready: snapshot.dataStatus === 'ready',
        dataStatus: snapshot.dataStatus,
        requiresReauthorization: snapshot.requiresReauthorization,
        diagnostics: snapshot.diagnostics,
        requiredScopes: REQUIRED_SCOPES,
        tokenResources,
        propertyResourceCaptured: properties.length > 0,
    };
}

async function getConnectionStatus() {
    const stored = await getStoredIntegration();

    if (!stored) {
        const allowEnvApiKey = String(process.env.CLOUDBEDS_ALLOW_ENV_API_KEY || 'false') === 'true';
        if (!allowEnvApiKey || !process.env.CLOUDBEDS_API_KEY) {
            return {
                connected: false,
                connectionVerified: false,
                appState: 'disabled',
                environment: ENVIRONMENT,
                source: null,
                properties: [],
                requiredScopes: REQUIRED_SCOPES,
                lastSyncAt: null,
                lastWebhookAt: null,
            };
        }
    }

    let apiKey;
    try {
        apiKey = await getApiKey();
    } catch (error) {
        if (error.code === 'CLOUDBEDS_NOT_CONNECTED') {
            return {
                connected: false,
                connectionVerified: false,
                appState: 'disabled',
                environment: ENVIRONMENT,
                source: null,
                properties: [],
                requiredScopes: REQUIRED_SCOPES,
                lastSyncAt: null,
                lastWebhookAt: null,
            };
        }
        throw error;
    }

    const properties = parseStoredProperties(stored);
    const propertyIds = uniqueStrings(properties.map((property) => property.id));
    const verification = await getVerifiedAppState(apiKey, propertyIds);

    if (verification.revoked || verification.appState === 'disabled') {
        if (stored) await deleteStoredIntegration();

        return {
            connected: false,
            connectionVerified: true,
            appState: 'disabled',
            environment: ENVIRONMENT,
            source: null,
            properties: [],
            requiredScopes: REQUIRED_SCOPES,
            lastSyncAt: null,
            lastWebhookAt: null,
        };
    }

    const authorized = verification.verified && verification.appState === 'enabled';
    const dataStatus =
        stored?.status === 'ready'
            ? 'ready'
            : stored?.status === 'needs_attention'
                ? 'empty'
                : null;
    const connected = authorized && dataStatus === 'ready';

    return {
        connected,
        authorized,
        connectionVerified: verification.verified,
        appState: verification.appState,
        dataStatus,
        environment: ENVIRONMENT,
        source: stored ? 'automatic_delivery' : 'environment',
        properties,
        connectedPropertyIds: propertyIds,
        requiredScopes: REQUIRED_SCOPES,
        verificationApiBase: verification.apiBase,
        verificationAttempts: verification.verified ? undefined : verification.attempts,
        lastSyncAt: stored?.last_sync_at || null,
        lastWebhookAt: stored?.last_webhook_at || null,
    };
}

function isScopeError(error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || '').toLowerCase();
    return [401, 403].includes(status) && (
        message.includes('scope') ||
        message.includes('permission') ||
        message.includes('not granted')
    );
}

function reservationQuery(endpoint, propertyId, pageNumber, includeDetails, extra = {}) {
    const query = {
        propertyID: propertyId,
        sortByRecent: true,
        pageSize: PAGE_SIZE,
        pageNumber,
        ...extra,
    };

    if (includeDetails) {
        query.includeGuestsDetails = true;
        query.includeGuestRequirements = true;
        query.includeCustomFields = true;
        if (endpoint === '/getReservations') {
            query.includeAllRooms = true;
        }
    }

    return query;
}

async function fetchReservationPage(apiKey, apiBase, endpoint, propertyId, pageNumber, includeDetails, extra = {}) {
    const supportsDetailFlags = endpoint === '/getReservations';
    const effectiveDetails = includeDetails && supportsDetailFlags;
    const options = {
        apiKey,
        baseUrl: apiBase,
        query: reservationQuery(endpoint, propertyId, pageNumber, effectiveDetails, extra),
    };

    if (!effectiveDetails) {
        return cloudbedsRequest(endpoint, options);
    }

    try {
        return await cloudbedsRequest(endpoint, options);
    } catch (error) {
        // Guest/custom-field detail flags may require additional scopes. If the
        // property only granted read:reservation we still load the bookings.
        if (isScopeError(error)) {
            return cloudbedsRequest(endpoint, {
                apiKey,
                baseUrl: apiBase,
                query: reservationQuery(endpoint, propertyId, pageNumber, false, extra),
            });
        }
        throw error;
    }
}

async function probeReservations(apiKey, apiBases, propertyIds = []) {
    const attempts = [];
    const targetValues = [];

    if (propertyIds.length) {
        targetValues.push(propertyIds.join(','));
        for (const propertyId of propertyIds) targetValues.push(propertyId);
    }
    targetValues.push(null);

    const uniqueTargets = [...new Set(targetValues.map((value) => value || '__none__'))]
        .map((value) => value === '__none__' ? null : value);

    let firstSuccessfulEmpty = null;
    let firstError = null;

    const today = new Date();
    const rangeStart = new Date(today);
    rangeStart.setFullYear(rangeStart.getFullYear() - 2);
    const rangeEnd = new Date(today);
    rangeEnd.setFullYear(rangeEnd.getFullYear() + 3);
    const toDate = (date) => date.toISOString().slice(0, 10);

    for (const apiBase of apiBases) {
        for (const endpoint of ['/getReservations', '/getReservationsWithRateDetails']) {
            for (const propertyId of uniqueTargets) {
                const queryVariants = endpoint === '/getReservations'
                    ? [
                        { label: 'all', extra: {} },
                        {
                            label: 'checkin-window',
                            extra: {
                                checkInFrom: toDate(rangeStart),
                                checkInTo: toDate(rangeEnd),
                            },
                        },
                    ]
                    : [{ label: 'all', extra: {} }];

                for (const variant of queryVariants) {
                    const result = await tryCloudbeds(endpoint, {
                        apiKey,
                        baseUrl: apiBase,
                        query: reservationQuery(endpoint, propertyId, 1, false, variant.extra),
                    });

                    if (!result.ok) {
                        attempts.push({
                            apiBase,
                            endpoint,
                            propertyId,
                            query: variant.label,
                            ok: false,
                            error: result.error,
                        });
                        firstError = firstError || result.rawError;
                        continue;
                    }

                    const items = extractDataArray(result.payload);
                    attempts.push({
                        apiBase,
                        endpoint,
                        propertyId,
                        query: variant.label,
                        ok: true,
                        count: items.length,
                        total: result.payload?.total ?? result.payload?.count ?? null,
                    });

                    const target = {
                        apiBase,
                        endpoint,
                        propertyId,
                        extra: variant.extra,
                        queryLabel: variant.label,
                    };

                    if (items.length > 0) {
                        return { target, attempts };
                    }

                    firstSuccessfulEmpty = firstSuccessfulEmpty || target;
                }
            }
        }
    }

    if (firstSuccessfulEmpty) {
        return { target: firstSuccessfulEmpty, attempts };
    }

    if (firstError) throw firstError;

    const error = new Error('Cloudbeds did not return a usable reservations response.');
    error.code = 'CLOUDBEDS_RESERVATIONS_UNAVAILABLE';
    error.status = 502;
    throw error;
}

async function fetchAllReservations(apiKey, apiBases, propertyIds = []) {
    const probe = await probeReservations(apiKey, apiBases, propertyIds);
    const { apiBase, endpoint, propertyId, extra = {} } = probe.target;
    const all = [];

    for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
        let payload;
        try {
            payload = await fetchReservationPage(
                apiKey,
                apiBase,
                endpoint,
                propertyId,
                pageNumber,
                true,
                extra
            );
        } catch (error) {
            if (isScopeError(error)) {
                const scopeError = new Error(
                    'Cloudbeds is connected, but Reservations READ was not granted by the property.'
                );
                scopeError.code = 'CLOUDBEDS_RESERVATION_SCOPE_REQUIRED';
                scopeError.status = 403;
                throw scopeError;
            }
            throw error;
        }

        const pageItems = extractDataArray(payload);
        all.push(...pageItems);

        if (pageItems.length < PAGE_SIZE) break;
    }

    return {
        reservations: all,
        apiBase,
        endpoint,
        propertyId,
        attempts: probe.attempts,
    };
}

function extractGuestRecords(payload) {
    if (Array.isArray(payload?.data)) return payload.data;
    if (payload?.data && typeof payload.data === 'object') {
        return Object.entries(payload.data).map(([guestId, guest]) => ({
            ...(guest || {}),
            guestID: guest?.guestID || guestId,
        }));
    }
    return [];
}

function extractRoomRecords(payload) {
    const groups = extractDataArray(payload);
    return groups.flatMap((group) =>
        asArray(group?.rooms).map((room) => ({
            ...room,
            propertyID: room?.propertyID || group?.propertyID || '',
        }))
    );
}

function normalizeGuestRecord(guest) {
    const firstName = String(pick(guest, ['guestFirstName', 'firstName'], '') || '');
    const lastName = String(pick(guest, ['guestLastName', 'lastName'], '') || '');
    const name = String(
        pick(guest, ['guestName', 'name'], `${firstName} ${lastName}`.trim() || 'Unknown Guest')
    );
    const phone = String(
        pick(guest, ['guestCellPhone', 'guestPhone', 'cellPhone', 'phone'], '') || ''
    );

    const startDate = String(pick(guest, ['startDate', 'checkInDate'], '') || '').slice(0, 10);
    const endDate = String(pick(guest, ['endDate', 'checkOutDate'], '') || '').slice(0, 10);

    return {
        id: String(pick(guest, ['guestID', 'guestId', 'profileID', 'profileId'], name)),
        guestId: String(pick(guest, ['guestID', 'guestId'], '')),
        profileId: String(pick(guest, ['profileID', 'profileId'], '')),
        propertyId: String(pick(guest, ['propertyID', 'propertyId'], '') || ''),
        reservationId: String(pick(guest, ['reservationID', 'reservationId'], '') || ''),
        roomId: String(pick(guest, ['roomID', 'roomId'], '') || ''),
        roomNumber: String(pick(guest, ['roomName', 'roomNumber'], '') || ''),
        roomTypeId: String(pick(guest, ['roomTypeID', 'roomTypeId'], '') || ''),
        status: normalizeStatus(pick(guest, ['status', 'reservationStatus'], 'confirmed')),
        rawStatus: String(pick(guest, ['status', 'reservationStatus'], '') || ''),
        arrivalDate: startDate,
        departureDate: endDate,
        name,
        firstName,
        lastName,
        email: String(pick(guest, ['guestEmail', 'email'], '') || ''),
        phone,
        country: String(pick(guest, ['guestCountry', 'country'], '') || ''),
        city: String(pick(guest, ['guestCity', 'city'], '') || ''),
        isMainGuest: Boolean(pick(guest, ['isMainGuest'], false)),
        isAnonymized: Boolean(pick(guest, ['isAnonymized'], false)),
        bookings: 0,
        source: 'cloudbeds',
    };
}

function normalizeRoomRecord(room) {
    return {
        id: String(pick(room, ['roomID', 'roomId', 'id'], '')),
        propertyId: String(pick(room, ['propertyID', 'propertyId'], '')),
        roomNumber: String(pick(room, ['roomName', 'roomNumber', 'name'], '') || ''),
        roomTypeId: String(pick(room, ['roomTypeID', 'roomTypeId'], '') || ''),
        roomType: String(pick(room, ['roomTypeName', 'roomTypeNameShort', 'roomType'], '') || ''),
        maxGuests: Number(pick(room, ['maxGuests'], 0) || 0),
        isPrivate: pick(room, ['isPrivate'], null),
        isVirtual: Boolean(pick(room, ['isVirtual'], false)),
        blocked: Boolean(pick(room, ['roomBlocked'], false)),
        housekeepingStatus: 'not_tracked',
        occupancyStatus: 'unknown',
        nextArrivalBookingId: null,
        currentGuest: null,
        lastUpdatedAt: 'Cloudbeds',
    };
}

function normalizeHousekeepingRecord(item) {
    const condition = String(pick(item, ['roomCondition'], '') || '');
    const occupied = Boolean(pick(item, ['roomOccupied'], false));
    const blocked = Boolean(pick(item, ['roomBlocked'], false));

    let status = condition || 'unknown';
    if (blocked) status = 'out_of_order';
    else if (pick(item, ['doNotDisturb'], false)) status = 'do_not_disturb';
    else if (pick(item, ['refusedService'], false)) status = 'refused_service';
    else if (pick(item, ['vacantPickup'], false)) status = 'vacant_pickup';
    else if (condition) status = occupied ? `occupied_${condition}` : `vacant_${condition}`;

    return {
        roomId: String(pick(item, ['roomID', 'roomId'], '')),
        roomNumber: String(pick(item, ['roomName', 'roomNumber'], '') || ''),
        roomTypeId: String(pick(item, ['roomTypeID', 'roomTypeId'], '') || ''),
        roomType: String(pick(item, ['roomTypeName'], '') || ''),
        roomCondition: condition,
        roomOccupied: occupied,
        roomBlocked: blocked,
        frontdeskStatus: String(pick(item, ['frontdeskStatus'], '') || ''),
        housekeeperId: String(pick(item, ['housekeeperID'], '') || ''),
        housekeeper: String(pick(item, ['housekeeper'], '') || ''),
        doNotDisturb: Boolean(pick(item, ['doNotDisturb'], false)),
        refusedService: Boolean(pick(item, ['refusedService'], false)),
        vacantPickup: Boolean(pick(item, ['vacantPickup'], false)),
        comments: String(pick(item, ['roomComments'], '') || ''),
        status,
        date: String(pick(item, ['date'], '') || ''),
    };
}

async function fetchResourceFromBases(apiKey, apiBases, path, query, extractor) {
    const attempts = [];
    let firstEmpty = null;

    for (const apiBase of apiBases) {
        const result = await tryCloudbeds(path, { apiKey, baseUrl: apiBase, query });

        if (!result.ok) {
            attempts.push({ apiBase, path, ok: false, error: result.error });
            continue;
        }

        const items = extractor(result.payload);
        attempts.push({
            apiBase,
            path,
            ok: true,
            count: Array.isArray(items) ? items.length : 0,
        });

        const response = { apiBase, payload: result.payload, items, attempts };
        if (Array.isArray(items) && items.length) return response;
        firstEmpty = firstEmpty || response;
    }

    return firstEmpty || { apiBase: apiBases[0] || API_BASE, payload: null, items: [], attempts };
}

async function fetchPropertyDetails(apiKey, apiBases, propertyIds = []) {
    const properties = [];
    const attempts = [];

    for (const propertyId of propertyIds) {
        let resolved = null;

        for (const apiBase of apiBases) {
            const result = await tryCloudbeds('/getHotelDetails', {
                apiKey,
                baseUrl: apiBase,
                query: { propertyID: propertyId },
            });

            if (!result.ok) {
                attempts.push({
                    apiBase,
                    path: '/getHotelDetails',
                    propertyId,
                    ok: false,
                    error: result.error,
                });
                continue;
            }

            const hotel = result.payload?.data;
            const property =
                hotel && typeof hotel === 'object' && !Array.isArray(hotel)
                    ? propertyFromHotel(hotel)
                    : null;

            attempts.push({
                apiBase,
                path: '/getHotelDetails',
                propertyId,
                ok: true,
                count: property?.id ? 1 : 0,
            });

            if (property?.id) {
                properties.push(property);
                resolved = property;
                break;
            }
        }

        if (!resolved) {
            properties.push({
                id: String(propertyId),
                name: 'Cloudbeds Sandbox Property',
                city: '',
            });
        }
    }

    return { properties, attempts };
}

async function discoverCloudbedsResources(apiKey, apiBases, propertyIds = []) {
    const propertyCsv = propertyIds.length ? propertyIds.join(',') : null;

    const [detailsResult, hotelsResult, roomsResult, guestsResult] = await Promise.all([
        fetchPropertyDetails(apiKey, apiBases, propertyIds),
        fetchResourceFromBases(
            apiKey,
            apiBases,
            '/getHotels',
            { propertyIDs: propertyCsv, pageSize: 100, pageNumber: 1 },
            (payload) => extractDataArray(payload).map(propertyFromHotel).filter((property) => property.id)
        ),
        fetchResourceFromBases(
            apiKey,
            apiBases,
            '/getRooms',
            { propertyIDs: propertyCsv, pageSize: 100, pageNumber: 1 },
            (payload) => extractRoomRecords(payload).map(normalizeRoomRecord).filter((room) => room.id)
        ),
        fetchResourceFromBases(
            apiKey,
            apiBases,
            '/getGuestList',
            { propertyIDs: propertyCsv, pageSize: 100, pageNumber: 1 },
            (payload) => extractGuestRecords(payload).map(normalizeGuestRecord)
        ),
    ]);

    const propertyMap = new Map();

    for (const property of detailsResult.properties) {
        propertyMap.set(String(property.id), property);
    }
    for (const property of hotelsResult.items) {
        propertyMap.set(String(property.id), property);
    }
    for (const room of roomsResult.items) {
        if (room.propertyId && !propertyMap.has(room.propertyId)) {
            propertyMap.set(room.propertyId, {
                id: room.propertyId,
                name: 'Cloudbeds Sandbox Property',
                city: '',
            });
        }
    }

    return {
        properties: Array.from(propertyMap.values()),
        rooms: roomsResult.items,
        guests: guestsResult.items,
        preferredApiBase:
            roomsResult.items.length ? roomsResult.apiBase :
            guestsResult.items.length ? guestsResult.apiBase :
            hotelsResult.items.length ? hotelsResult.apiBase :
            apiBases[0] || API_BASE,
        attempts: [
            ...detailsResult.attempts,
            ...hotelsResult.attempts,
            ...roomsResult.attempts,
            ...guestsResult.attempts,
        ],
    };
}

async function fetchHousekeeping(apiKey, apiBases, propertyIds = []) {
    const targets = propertyIds.length ? propertyIds : [null];
    const all = [];
    const attempts = [];

    for (const propertyId of targets) {
        const result = await fetchResourceFromBases(
            apiKey,
            apiBases,
            '/getHousekeepingStatus',
            { propertyID: propertyId, pageSize: 5000, pageNumber: 1 },
            (payload) => extractDataArray(payload).map(normalizeHousekeepingRecord)
        );
        all.push(...result.items);
        attempts.push(...result.attempts);
    }

    return { items: all, attempts };
}

async function fetchDashboardSnapshot(apiKey, apiBases, propertyIds = []) {
    const targets = propertyIds.length ? propertyIds : [null];
    const items = [];
    const attempts = [];

    for (const propertyId of targets) {
        let resolved = null;

        for (const apiBase of apiBases) {
            const result = await tryCloudbeds('/getDashboard', {
                apiKey,
                baseUrl: apiBase,
                query: { propertyID: propertyId },
            });

            if (!result.ok) {
                attempts.push({ apiBase, path: '/getDashboard', propertyId, ok: false, error: result.error });
                continue;
            }

            attempts.push({ apiBase, path: '/getDashboard', propertyId, ok: true });
            resolved = {
                propertyId: propertyId || '',
                ...(result.payload?.data || {}),
            };
            break;
        }

        if (resolved) items.push(resolved);
    }

    const totals = items.reduce(
        (acc, item) => ({
            roomsOccupied: acc.roomsOccupied + Number(item.roomsOccupied || 0),
            percentageOccupied: items.length === 1
                ? Number(item.percentageOccupied || 0)
                : acc.percentageOccupied,
            arrivals: acc.arrivals + Number(item.arrivals || 0),
            departures: acc.departures + Number(item.departures || 0),
            inHouse: acc.inHouse + Number(item.inHouse || 0),
        }),
        { roomsOccupied: 0, percentageOccupied: 0, arrivals: 0, departures: 0, inHouse: 0 }
    );

    return { items, totals, attempts };
}

function normalizeStatus(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'checked_in') return 'in_house';
    if (normalized === 'not_confirmed' || normalized === 'in_progress') return 'pending_confirmation';
    if (normalized === 'canceled') return 'cancelled';
    return normalized || 'confirmed';
}

function normalizeReservation(reservation) {
    const guestListEntries =
        reservation.guestList && !Array.isArray(reservation.guestList) && typeof reservation.guestList === 'object'
            ? Object.values(reservation.guestList)
            : asArray(reservation.guestList);

    const guestCollection = [
        ...asArray(reservation.guests),
        ...guestListEntries,
        ...asArray(reservation.guestDetails),
    ];

    const mainGuestId = String(pick(reservation, ['guestID', 'guestId'], '') || '');
    const primaryGuest =
        guestCollection.find((guest) => String(pick(guest, ['guestID', 'guestId'], '')) === mainGuestId) ||
        guestCollection.find((guest) => pick(guest, ['isMainGuest'], false)) ||
        guestCollection[0] ||
        reservation.guest ||
        reservation.primaryGuest ||
        {};

    const firstName = pick(reservation, [
        'guestFirstName',
        'firstName',
        'guest.firstName',
        'primaryGuest.firstName',
    ], pick(primaryGuest, ['guestFirstName', 'firstName'], ''));

    const lastName = pick(reservation, [
        'guestLastName',
        'lastName',
        'guest.lastName',
        'primaryGuest.lastName',
    ], pick(primaryGuest, ['guestLastName', 'lastName'], ''));

    const guestName = String(
        pick(reservation, ['guestName', 'primaryGuestName'], `${firstName} ${lastName}`.trim() || 'Unknown Guest')
    );

    const guestEmail = String(
        pick(
            reservation,
            ['guestEmail', 'email', 'guest.email', 'primaryGuest.email'],
            pick(primaryGuest, ['guestEmail', 'email'], '')
        ) || ''
    );

    const guestPhone = String(
        pick(
            reservation,
            ['guestPhone', 'phone', 'guest.phone', 'primaryGuest.phone'],
            pick(primaryGuest, ['guestPhone', 'phone'], '')
        ) || ''
    );

    const roomCollection = [
        ...asArray(reservation.rooms),
        ...asArray(reservation.roomList),
        ...asArray(reservation.assignedRooms),
    ];

    const roomNumbers = uniqueStrings([
        pick(reservation, ['roomName', 'roomNumber'], ''),
        ...roomCollection.map((room) => pick(room, ['roomName', 'roomNumber', 'name'], '')),
    ]);

    const roomIds = uniqueStrings([
        pick(reservation, ['roomID', 'roomId'], ''),
        ...roomCollection.map((room) => pick(room, ['roomID', 'roomId', 'id'], '')),
    ]);

    const roomTypeNames = uniqueStrings([
        pick(reservation, ['roomTypeName', 'roomTypeNameShort'], ''),
        ...roomCollection.map((room) => pick(room, ['roomTypeName', 'roomTypeNameShort', 'roomType'], '')),
    ]);

    const property = reservation.__property || {
        id: String(pick(reservation, ['propertyID', 'propertyId'], '')),
        name: String(pick(reservation, ['propertyName'], 'Cloudbeds Sandbox Property')),
    };

    const status = normalizeStatus(pick(reservation, ['status', 'reservationStatus'], 'confirmed'));
    const arrivalTime = pick(reservation, ['estimatedArrivalTime', 'arrivalTime', 'checkInTime'], null);
    const departureTime = pick(reservation, ['estimatedDepartureTime', 'departureTime', 'checkOutTime'], null);

    const specialRequests = uniqueStrings([
        ...flattenStrings(reservation.guestRequirements),
        ...flattenStrings(reservation.customFields),
    ]);

    const reservationId = String(pick(reservation, ['reservationID', 'reservationId', 'id'], ''));
    const roomNumber = roomNumbers.join(', ') || 'Unassigned';
    const roomId = roomIds[0] || `cloudbeds-unassigned-${reservationId}`;

    const missingFields = [];
    if (!arrivalTime) missingFields.push('arrivalTime');
    if (!departureTime) missingFields.push('departureTime');

    return {
        id: reservationId,
        source: 'cloudbeds',
        sourceReference: String(
            pick(reservation, [
                'thirdPartyIdentifier',
                'sourceReservationId',
                'sourceReservationID',
                'otaReferenceNumber',
                'reservationID',
                'reservationId',
            ], reservationId)
        ),
        syncStatus: 'synced',
        syncEvent: 'live_cloudbeds',
        guestId: String(
            pick(
                reservation,
                ['guestID', 'guestId'],
                pick(primaryGuest, ['guestID', 'guestId'], '')
            ) || ''
        ),
        profileId: String(
            pick(
                reservation,
                ['profileID', 'profileId'],
                pick(primaryGuest, ['profileID', 'profileId'], '')
            ) || ''
        ),
        guestName,
        guestEmail,
        guestPhone,
        propertyId: String(property.id),
        roomId,
        roomIds,
        roomNumber,
        roomNumbers,
        roomType: roomTypeNames.join(', '),
        roomTypes: roomTypeNames,
        arrivalDate: pick(reservation, ['startDate', 'checkInDate'], ''),
        arrivalTime,
        departureDate: pick(reservation, ['endDate', 'checkOutDate'], ''),
        departureTime,
        status,
        rawStatus: pick(reservation, ['status', 'reservationStatus'], ''),
        checkinStatus: status === 'in_house' ? 'completed' : 'pending',
        checkoutStatus: status === 'checked_out' ? 'completed' : null,
        guestNotes: String(pick(reservation, ['notes', 'guestNotes'], '') || ''),
        specialRequests,
        shuttleRequested: false,
        shuttleRequestId: null,
        missingFields,
        bookingDate: pick(reservation, ['dateCreated', 'bookingDate', 'createdAt'], ''),
        nights: (() => {
            const explicit = pick(reservation, ['nights'], null);
            if (explicit !== null && explicit !== undefined && explicit !== '') return Number(explicit);
            const start = pick(reservation, ['startDate', 'checkInDate'], '');
            const end = pick(reservation, ['endDate', 'checkOutDate'], '');
            if (!start || !end) return null;
            const diff = Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000);
            return Number.isFinite(diff) && diff >= 0 ? diff : null;
        })(),
        totalPrice: pick(reservation, ['total', 'grandTotal', 'reservationTotal'], null),
        cloudbedsSource: pick(reservation, ['sourceName', 'source', 'bookingSource'], ''),
        property: {
            id: String(property.id),
            name: String(property.name || 'Cloudbeds Sandbox Property'),
            city: property.city || '',
        },
        room: {
            id: roomId,
            roomNumber,
            roomType: roomTypeNames.join(', '),
            housekeepingStatus: 'not tracked',
        },
    };
}

async function getOperationsMap(reservationIds) {
    await ensureTables();
    const ids = uniqueStrings(reservationIds);
    if (!ids.length) return new Map();

    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.query(
        `SELECT * FROM reservation_operations
         WHERE source = ? AND external_reservation_id IN (${placeholders})`,
        [PROVIDER, ...ids]
    );

    return new Map(
        rows.map((row) => [
            String(row.external_reservation_id),
            {
                arrivalTime: row.actual_arrival_time || null,
                departureTime: row.actual_departure_time || null,
                guestNotes: row.guest_notes || '',
                specialRequests: (() => {
                    try {
                        return row.special_requests_json ? JSON.parse(row.special_requests_json) : [];
                    } catch {
                        return [];
                    }
                })(),
            },
        ])
    );
}

function applyOperations(reservation, operations) {
    if (!operations) return reservation;

    const merged = {
        ...reservation,
        arrivalTime: operations.arrivalTime || reservation.arrivalTime,
        departureTime: operations.departureTime || reservation.departureTime,
        guestNotes: operations.guestNotes || reservation.guestNotes,
        specialRequests: uniqueStrings([
            ...reservation.specialRequests,
            ...asArray(operations.specialRequests),
        ]),
    };

    merged.missingFields = [];
    if (!merged.arrivalTime) merged.missingFields.push('arrivalTime');
    if (!merged.departureTime) merged.missingFields.push('departureTime');

    return merged;
}

function reservationsFromGuestRecords(guests, rooms, properties) {
    const reservationMap = new Map();
    const roomMap = new Map(rooms.map((room) => [String(room.id), room]));
    const propertyMap = new Map(properties.map((property) => [String(property.id), property]));

    for (const guest of guests) {
        if (!guest.reservationId) continue;

        const reservationId = String(guest.reservationId);
        const existing = reservationMap.get(reservationId);
        const preferGuest = !existing || guest.isMainGuest;

        if (!existing) {
            const room = guest.roomId ? roomMap.get(String(guest.roomId)) : null;
            const resolvedPropertyId = guest.propertyId || room?.propertyId || '';
            const property = resolvedPropertyId ? propertyMap.get(String(resolvedPropertyId)) : null;
            const start = guest.arrivalDate || '';
            const end = guest.departureDate || '';
            let nights = null;
            if (start && end) {
                const diff = Math.round(
                    (new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86400000
                );
                if (Number.isFinite(diff) && diff >= 0) nights = diff;
            }

            reservationMap.set(reservationId, {
                id: reservationId,
                source: 'cloudbeds',
                sourceReference: reservationId,
                syncStatus: 'synced',
                syncEvent: 'cloudbeds_guest_list_fallback',
                fallbackSource: 'getGuestList',
                guestId: guest.guestId || '',
                profileId: guest.profileId || '',
                guestName: guest.name || 'Unknown Guest',
                guestEmail: guest.email || '',
                guestPhone: guest.phone || '',
                propertyId: resolvedPropertyId,
                roomId: guest.roomId || `cloudbeds-unassigned-${reservationId}`,
                roomIds: guest.roomId ? [guest.roomId] : [],
                roomNumber: guest.roomNumber || room?.roomNumber || 'Unassigned',
                roomNumbers: guest.roomNumber || room?.roomNumber ? [guest.roomNumber || room?.roomNumber] : [],
                roomType: room?.roomType || '',
                roomTypes: room?.roomType ? [room.roomType] : [],
                arrivalDate: start,
                arrivalTime: null,
                departureDate: end,
                departureTime: null,
                status: guest.status || 'confirmed',
                rawStatus: guest.rawStatus || '',
                checkinStatus: guest.status === 'in_house' ? 'completed' : 'pending',
                checkoutStatus: guest.status === 'checked_out' ? 'completed' : null,
                guestNotes: '',
                specialRequests: [],
                shuttleRequested: false,
                shuttleRequestId: null,
                missingFields: ['arrivalTime', 'departureTime'],
                bookingDate: '',
                nights,
                totalPrice: null,
                cloudbedsSource: 'Cloudbeds',
                property: {
                    id: resolvedPropertyId,
                    name: property?.name || 'Cloudbeds Sandbox Property',
                    city: property?.city || '',
                },
                room: {
                    id: guest.roomId || '',
                    roomNumber: guest.roomNumber || room?.roomNumber || 'Unassigned',
                    roomType: room?.roomType || '',
                    housekeepingStatus: room?.housekeepingStatus || 'not tracked',
                },
            });
        } else if (preferGuest) {
            reservationMap.set(reservationId, {
                ...existing,
                guestId: guest.guestId || existing.guestId,
                profileId: guest.profileId || existing.profileId,
                guestName: guest.name || existing.guestName,
                guestEmail: guest.email || existing.guestEmail,
                guestPhone: guest.phone || existing.guestPhone,
                roomId: guest.roomId || existing.roomId,
                roomIds: guest.roomId ? [guest.roomId] : existing.roomIds,
                roomNumber: guest.roomNumber || existing.roomNumber,
                roomNumbers: guest.roomNumber ? [guest.roomNumber] : existing.roomNumbers,
                arrivalDate: guest.arrivalDate || existing.arrivalDate,
                departureDate: guest.departureDate || existing.departureDate,
                status: guest.status || existing.status,
                rawStatus: guest.rawStatus || existing.rawStatus,
            });
        }
    }

    return Array.from(reservationMap.values());
}

function parseStoredProperties(record) {
    if (!record?.properties_json) return [];
    try {
        const parsed = JSON.parse(record.properties_json);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function mergeProperties(...lists) {
    const map = new Map();

    for (const property of lists.flat()) {
        if (!property?.id) continue;
        const id = String(property.id);
        const current = map.get(id) || {};
        map.set(id, {
            id,
            name:
                property.name && property.name !== 'Cloudbeds Sandbox Property'
                    ? property.name
                    : current.name || property.name || 'Cloudbeds Sandbox Property',
            city: property.city || current.city || '',
        });
    }

    return filterAllowedProperties(Array.from(map.values()));
}

function deriveGuestsFromReservations(reservations) {
    const map = new Map();

    for (const reservation of reservations) {
        const key =
            reservation.guestId ||
            reservation.guestEmail ||
            reservation.guestPhone ||
            reservation.guestName ||
            reservation.id;

        if (!map.has(String(key))) {
            map.set(String(key), {
                id: String(key),
                guestId: reservation.guestId || '',
                profileId: reservation.profileId || '',
                name: reservation.guestName || 'Unknown Guest',
                email: reservation.guestEmail || '',
                phone: reservation.guestPhone || '',
                country: '',
                city: '',
                reservationId: reservation.id,
                isMainGuest: true,
                isAnonymized: false,
                bookings: 0,
                source: 'cloudbeds',
            });
        }

        map.get(String(key)).bookings += 1;
    }

    return Array.from(map.values());
}

function mergeGuests(directGuests, reservations) {
    const derived = deriveGuestsFromReservations(reservations);
    const map = new Map();

    const keysFor = (guest) =>
        uniqueStrings([
            guest.guestId,
            guest.profileId,
            guest.email && String(guest.email).toLowerCase(),
            guest.phone,
            guest.name,
            guest.id,
        ]);

    for (const guest of directGuests) {
        const key = keysFor(guest)[0] || guest.id;
        map.set(String(key), { ...guest, bookings: 0 });
    }

    const findExistingKey = (guest) => {
        const candidateKeys = keysFor(guest);
        for (const [existingKey, existing] of map.entries()) {
            const existingKeys = new Set(keysFor(existing));
            if (candidateKeys.some((key) => existingKeys.has(key))) return existingKey;
        }
        return null;
    };

    for (const guest of derived) {
        const existingKey = findExistingKey(guest);
        if (existingKey) {
            const current = map.get(existingKey);
            map.set(existingKey, {
                ...current,
                name: current.name || guest.name,
                email: current.email || guest.email,
                phone: current.phone || guest.phone,
                bookings: Number(current.bookings || 0) + Number(guest.bookings || 0),
            });
        } else {
            map.set(String(guest.id), guest);
        }
    }

    return Array.from(map.values()).sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''))
    );
}

function deriveRoomsFromReservations(reservations) {
    const map = new Map();

    for (const reservation of reservations) {
        const ids = reservation.roomIds?.length
            ? reservation.roomIds
            : [reservation.roomId || `unassigned-${reservation.id}`];
        const numbers = reservation.roomNumbers?.length
            ? reservation.roomNumbers
            : [reservation.roomNumber || 'Unassigned'];
        const types = reservation.roomTypes?.length
            ? reservation.roomTypes
            : [reservation.roomType || ''];

        const count = Math.max(ids.length, numbers.length, 1);
        for (let index = 0; index < count; index += 1) {
            const id = String(ids[index] || `${ids[0]}-${index + 1}`);
            if (id.startsWith('cloudbeds-unassigned-') || id.startsWith('unassigned-')) continue;

            if (!map.has(id)) {
                map.set(id, {
                    id,
                    propertyId: reservation.propertyId || '',
                    roomNumber: String(numbers[index] || numbers[0] || ''),
                    roomTypeId: '',
                    roomType: String(types[index] || types[0] || ''),
                    maxGuests: 0,
                    isPrivate: null,
                    isVirtual: false,
                    blocked: false,
                    housekeepingStatus: 'not_tracked',
                    occupancyStatus: 'unknown',
                    nextArrivalBookingId: null,
                    currentGuest: null,
                    lastUpdatedAt: 'Cloudbeds',
                });
            }
        }
    }

    return Array.from(map.values());
}

function decorateRooms(officialRooms, reservations, housekeeping) {
    const today = new Date().toISOString().slice(0, 10);
    const baseRooms = officialRooms.length ? officialRooms : deriveRoomsFromReservations(reservations);
    const housekeepingMap = new Map(
        housekeeping.filter((item) => item.roomId).map((item) => [String(item.roomId), item])
    );

    return baseRooms.map((room) => {
        const roomReservations = reservations
            .filter((reservation) => {
                const ids = reservation.roomIds?.length
                    ? reservation.roomIds.map(String)
                    : [String(reservation.roomId || '')];
                return ids.includes(String(room.id));
            })
            .filter((reservation) => reservation.status !== 'cancelled')
            .sort((a, b) => String(a.arrivalDate || '').localeCompare(String(b.arrivalDate || '')));

        const inHouse = roomReservations.find(
            (reservation) =>
                reservation.status === 'in_house' ||
                (
                    reservation.arrivalDate &&
                    reservation.departureDate &&
                    reservation.arrivalDate <= today &&
                    reservation.departureDate > today
                )
        );

        const checkoutToday = roomReservations.find(
            (reservation) => reservation.departureDate === today
        );
        const arrivingToday = roomReservations.find(
            (reservation) => reservation.arrivalDate === today
        );
        const nextArrival = roomReservations.find(
            (reservation) => reservation.arrivalDate >= today
        );
        const hk = housekeepingMap.get(String(room.id));

        return {
            ...room,
            occupancyStatus: checkoutToday
                ? 'checkout_today'
                : inHouse
                    ? 'occupied'
                    : arrivingToday
                        ? 'arriving_today'
                        : 'vacant',
            currentGuest: inHouse?.guestName || null,
            nextArrivalBookingId: nextArrival?.id || null,
            housekeepingStatus: hk?.status || room.housekeepingStatus || 'not_tracked',
            housekeeping: hk || null,
        };
    });
}

function fallbackDashboard(reservations, rooms) {
    const today = new Date().toISOString().slice(0, 10);
    const arrivals = reservations.filter(
        (reservation) => reservation.arrivalDate === today && reservation.status !== 'cancelled'
    ).length;
    const departures = reservations.filter(
        (reservation) => reservation.departureDate === today && reservation.status !== 'cancelled'
    ).length;
    const inHouse = reservations.filter(
        (reservation) =>
            reservation.status === 'in_house' ||
            (
                reservation.arrivalDate &&
                reservation.departureDate &&
                reservation.arrivalDate <= today &&
                reservation.departureDate > today &&
                reservation.status !== 'cancelled'
            )
    ).length;
    const occupiedRooms = rooms.filter((room) =>
        ['occupied', 'checkout_today'].includes(room.occupancyStatus)
    ).length;

    return {
        roomsOccupied: occupiedRooms,
        percentageOccupied: rooms.length ? Math.round((occupiedRooms / rooms.length) * 100) : 0,
        arrivals,
        departures,
        inHouse,
    };
}

async function listPmsSnapshot() {
    const apiKey = await getApiKey();
    const stored = await getStoredIntegration();
    const storedProperties = parseStoredProperties(stored);
    const apiBases = await resolvePropertyApiBases(apiKey);

    const initialPropertyIds = uniqueStrings(storedProperties.map((property) => property.id));
    const resources = await discoverCloudbedsResources(apiKey, apiBases, initialPropertyIds);
    const discoveredPropertyIds = uniqueStrings([
        ...initialPropertyIds,
        ...resources.properties.map((property) => property.id),
        ...resources.rooms.map((room) => room.propertyId),
    ]);

    let fetched;
    try {
        fetched = await fetchAllReservations(apiKey, apiBases, discoveredPropertyIds);
    } catch (error) {
        fetched = {
            reservations: [],
            apiBase: resources.preferredApiBase || apiBases[0] || API_BASE,
            endpoint: '/getReservations',
            propertyId: discoveredPropertyIds[0] || null,
            attempts: [{
                apiBase: resources.preferredApiBase || apiBases[0] || API_BASE,
                endpoint: '/getReservations',
                propertyId: discoveredPropertyIds[0] || null,
                ok: false,
                error: safeError(error),
            }],
        };
    }

    let rawReservations = fetched.reservations;

    const allowed = allowedPropertyIds();
    if (allowed.length) {
        const allowedSet = new Set(allowed);
        rawReservations = rawReservations.filter((reservation) =>
            allowedSet.has(String(pick(reservation, ['propertyID', 'propertyId'], '')))
        );
    }

    const reservationProperties = rawReservations
        .map((reservation) => ({
            id: String(pick(reservation, ['propertyID', 'propertyId'], '')),
            name: String(pick(reservation, ['propertyName'], 'Cloudbeds Sandbox Property')),
            city: String(pick(reservation, ['propertyCity'], '') || ''),
        }))
        .filter((property) => property.id);

    const properties = mergeProperties(
        storedProperties,
        resources.properties,
        reservationProperties
    );

    const propertyMap = new Map(properties.map((property) => [property.id, property]));
    let normalized = rawReservations
        .map((reservation) => {
            const propertyId = String(pick(reservation, ['propertyID', 'propertyId'], ''));
            return normalizeReservation({
                ...reservation,
                __property: propertyMap.get(propertyId) || {
                    id: propertyId,
                    name: 'Cloudbeds Sandbox Property',
                    city: '',
                },
            });
        })
        .filter((reservation) => reservation.id);

    // If getReservations is empty but Guest READ is available, Cloudbeds'
    // getGuestList still provides reservationID, status, dates and room assignment.
    // Use it as a real Cloudbeds fallback instead of showing an empty PMS.
    if (!normalized.length && resources.guests.length) {
        normalized = reservationsFromGuestRecords(
            resources.guests,
            resources.rooms,
            properties
        );
    }

    const operations = await getOperationsMap(normalized.map((reservation) => reservation.id));
    let reservations = normalized.map((reservation) =>
        applyOperations(reservation, operations.get(reservation.id))
    );

    const directGuestMap = new Map();
    for (const guest of resources.guests) {
        if (guest.guestId) directGuestMap.set(String(guest.guestId), guest);
        if (guest.reservationId) directGuestMap.set(`reservation:${guest.reservationId}`, guest);
    }

    reservations = reservations.map((reservation) => {
        const guest =
            (reservation.guestId && directGuestMap.get(String(reservation.guestId))) ||
            directGuestMap.get(`reservation:${reservation.id}`);

        if (!guest) return reservation;

        return {
            ...reservation,
            guestId: reservation.guestId || guest.guestId || '',
            profileId: reservation.profileId || guest.profileId || '',
            guestName: reservation.guestName && reservation.guestName !== 'Unknown Guest'
                ? reservation.guestName
                : guest.name,
            guestEmail: reservation.guestEmail || guest.email || '',
            guestPhone: reservation.guestPhone || guest.phone || '',
        };
    });

    const finalPropertyIds = uniqueStrings([
        ...properties.map((property) => property.id),
        ...reservations.map((reservation) => reservation.propertyId),
    ]);

    const orderedBases = uniqueStrings([
        fetched.apiBase,
        resources.preferredApiBase,
        ...apiBases,
    ]);

    const [housekeepingResult, dashboardResult] = await Promise.all([
        fetchHousekeeping(apiKey, orderedBases, finalPropertyIds),
        fetchDashboardSnapshot(apiKey, orderedBases, finalPropertyIds),
    ]);

    const rooms = decorateRooms(resources.rooms, reservations, housekeepingResult.items);
    const guests = mergeGuests(resources.guests, reservations);
    const dashboard =
        dashboardResult.items.length > 0
            ? dashboardResult.totals
            : fallbackDashboard(reservations, rooms);

    const allAttempts = [
        ...resources.attempts,
        ...fetched.attempts,
        ...housekeepingResult.attempts,
        ...dashboardResult.attempts,
    ];

    const missingScopes = uniqueStrings(
        allAttempts
            .filter((attempt) => [401, 403].includes(Number(attempt?.error?.status)))
            .map((attempt) => {
                const path = attempt.path || attempt.endpoint || '';
                if (path.includes('Reservations')) return 'read:reservation';
                if (path.includes('Guest')) return 'read:guest';
                if (path.includes('Rooms')) return 'read:room';
                if (path.includes('Housekeeping')) return 'read:housekeeping';
                if (path.includes('Dashboard')) return 'read:dashboard';
                if (path.includes('Hotels')) return 'read:hotel';
                return null;
            })
    );

    const attemptSummary = allAttempts.map((attempt) => ({
        path: attempt.path || attempt.endpoint || '',
        apiBase: attempt.apiBase || '',
        propertyId: attempt.propertyId || '',
        query: attempt.query || '',
        ok: Boolean(attempt.ok),
        count: Number(attempt.count || 0),
        total: attempt.total ?? null,
        status: attempt.error?.status || null,
        message: attempt.error?.message || null,
        requestId: attempt.error?.requestId || null,
        contentType: attempt.error?.contentType || null,
    }));

    const failedCalls = attemptSummary.filter((attempt) => !attempt.ok);
    const successfulEmptyCalls = attemptSummary.filter(
        (attempt) => attempt.ok && Number(attempt.count || 0) === 0
    );

    const hasPmsData =
        reservations.length > 0 ||
        guests.length > 0 ||
        rooms.length > 0 ||
        housekeepingResult.items.length > 0;

    const requiresReauthorization =
        !hasPmsData &&
        finalPropertyIds.length === 0 &&
        initialPropertyIds.length === 0;

    await ensureTables();
    await db.query(
        `UPDATE integration_credentials
         SET properties_json = ?,
             status = ?,
             last_sync_at = NOW()
         WHERE provider = ? AND environment = ?`,
        [
            JSON.stringify(properties),
            hasPmsData ? 'ready' : 'needs_attention',
            PROVIDER,
            ENVIRONMENT,
        ]
    );

    return {
        environment: ENVIRONMENT,
        properties,
        reservations,
        guests,
        rooms,
        housekeeping: housekeepingResult.items,
        dashboard,
        count: reservations.length,
        dataStatus: hasPmsData ? 'ready' : 'empty',
        requiresReauthorization,
        cloudbedsApiBase: fetched.apiBase,
        cloudbedsReservationEndpoint: fetched.endpoint,
        connectedPropertyIds: finalPropertyIds,
        diagnostics: {
            apiBases,
            storedPropertyIds: initialPropertyIds,
            chosenApiBase: fetched.apiBase,
            reservationEndpoint: fetched.endpoint,
            reservationQuery: fetched.attempts.find(
                (attempt) =>
                    attempt.ok &&
                    attempt.apiBase === fetched.apiBase &&
                    attempt.endpoint === fetched.endpoint &&
                    (attempt.count || 0) > 0
            )?.query || 'all',
            reservationAttempts: fetched.attempts,
            resourceAttempts: resources.attempts,
            missingScopes,
            failedCalls,
            successfulEmptyCalls,
            counts: {
                reservations: reservations.length,
                guests: guests.length,
                rooms: rooms.length,
                housekeeping: housekeepingResult.items.length,
            },
        },
    };
}

async function listReservations() {
    const snapshot = await listPmsSnapshot();
    return {
        environment: snapshot.environment,
        properties: snapshot.properties,
        reservations: snapshot.reservations,
        count: snapshot.count,
        cloudbedsApiBase: snapshot.cloudbedsApiBase,
        cloudbedsReservationEndpoint: snapshot.cloudbedsReservationEndpoint,
        connectedPropertyIds: snapshot.connectedPropertyIds,
        diagnostics: snapshot.diagnostics,
    };
}

async function saveReservationOperations(reservationId, payload) {
    await ensureTables();

    const existingRows = await db.query(
        `SELECT actual_arrival_time, actual_departure_time, guest_notes, special_requests_json
         FROM reservation_operations
         WHERE source = ? AND external_reservation_id = ?
         LIMIT 1`,
        [PROVIDER, String(reservationId)]
    );
    const existing = existingRows[0] || {};

    const hasArrival = payload.actual_arrival_time !== undefined || payload.arrivalTime !== undefined;
    const hasDeparture = payload.actual_departure_time !== undefined || payload.departureTime !== undefined;
    const hasNotes = payload.guest_notes !== undefined || payload.guestNotes !== undefined;
    const hasRequests = payload.special_requests !== undefined || payload.specialRequests !== undefined;

    const arrivalTime = hasArrival
        ? (payload.actual_arrival_time ?? payload.arrivalTime ?? null)
        : (existing.actual_arrival_time ?? null);
    const departureTime = hasDeparture
        ? (payload.actual_departure_time ?? payload.departureTime ?? null)
        : (existing.actual_departure_time ?? null);
    const guestNotes = hasNotes
        ? (payload.guest_notes ?? payload.guestNotes ?? '')
        : (existing.guest_notes ?? '');

    let existingRequests = [];
    try {
        existingRequests = existing.special_requests_json
            ? JSON.parse(existing.special_requests_json)
            : [];
    } catch {
        existingRequests = [];
    }

    const specialRequests = hasRequests
        ? (payload.special_requests ?? payload.specialRequests ?? [])
        : existingRequests;

    await db.query(
        `INSERT INTO reservation_operations
            (source, external_reservation_id, actual_arrival_time, actual_departure_time, guest_notes, special_requests_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            actual_arrival_time = VALUES(actual_arrival_time),
            actual_departure_time = VALUES(actual_departure_time),
            guest_notes = VALUES(guest_notes),
            special_requests_json = VALUES(special_requests_json)`,
        [
            PROVIDER,
            String(reservationId),
            arrivalTime || null,
            departureTime || null,
            String(guestNotes || ''),
            JSON.stringify(asArray(specialRequests)),
        ]
    );

    return {
        reservationId: String(reservationId),
        arrivalTime: arrivalTime || null,
        departureTime: departureTime || null,
        guestNotes: String(guestNotes || ''),
        specialRequests: asArray(specialRequests),
    };
}

function buildAuthorizationUrl(state) {
    const clientId = process.env.CLOUDBEDS_CLIENT_ID;
    const clientSecret = process.env.CLOUDBEDS_CLIENT_SECRET;

    if (!clientId || !clientSecret || !REDIRECT_URI) {
        const error = new Error(
            'Cloudbeds automatic delivery requires CLOUDBEDS_CLIENT_ID, CLOUDBEDS_CLIENT_SECRET and CLOUDBEDS_REDIRECT_URI.'
        );
        error.code = 'CLOUDBEDS_CONFIG_MISSING';
        throw error;
    }

    const url = new URL(`${AUTH_BASE}/oauth`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', authorizationScopes().join(' '));
    if (state) url.searchParams.set('state', state);
    return url.toString();
}

async function createAuthorizationUrl() {
    const state = await createAuthorizationState();
    return {
        url: buildAuthorizationUrl(state),
        state,
    };
}

function getRuntimeConfiguration() {
    const automaticDelivery = Boolean(
        process.env.CLOUDBEDS_CLIENT_ID &&
        process.env.CLOUDBEDS_CLIENT_SECRET &&
        REDIRECT_URI
    );

    return {
        environment: ENVIRONMENT,
        sandboxOnly: String(process.env.CLOUDBEDS_SANDBOX_ONLY || 'true') !== 'false',
        automaticDelivery,
        apiBase: API_BASE,
        authBase: AUTH_BASE,
        redirectUri: REDIRECT_URI,
        frontendUrl: FRONTEND_URL,
        envApiKeyEnabled: String(process.env.CLOUDBEDS_ALLOW_ENV_API_KEY || 'false') === 'true',
        propertyAllowlistEnabled: String(process.env.CLOUDBEDS_ENFORCE_PROPERTY_ALLOWLIST || 'false') === 'true',
        propertyAllowlistCount: allowedPropertyIds().length,
        requiredScopes: REQUIRED_SCOPES,
        authorizationScopes: authorizationScopes(),
    };
}

module.exports = {
    ENVIRONMENT,
    REDIRECT_URI,
    FRONTEND_URL,
    REQUIRED_SCOPES,
    buildAuthorizationUrl,
    createAuthorizationUrl,
    disconnectIntegration,
    exchangeAuthorizationCode,
    getConnectionStatus,
    getRuntimeConfiguration,
    listPmsSnapshot,
    listReservations,
    saveReservationOperations,
};
