const crypto = require('crypto');
const db = require('../config/db');

const PROVIDER = 'cloudbeds';
const ENVIRONMENT = process.env.CLOUDBEDS_ENVIRONMENT || 'sandbox';
const API_BASE = (process.env.CLOUDBEDS_API_BASE || 'https://api.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const AUTH_BASE = (process.env.CLOUDBEDS_AUTH_BASE || 'https://hotels.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const REDIRECT_URI = process.env.CLOUDBEDS_REDIRECT_URI || 'https://api.sem-management.com/api/integrations/cloudbeds/callback';
const PAGE_SIZE = 100;

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

async function cloudbedsRequest(path, { apiKey, method = 'GET', query, form } = {}) {
    const base = path === '/access_token' ? AUTH_BASE : API_BASE;
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

    let payload;
    try {
        payload = text ? JSON.parse(text) : {};
    } catch {
        payload = { raw: text };
    }

    if (!response.ok || payload?.success === false) {
        const message =
            payload?.message ||
            payload?.error_description ||
            payload?.error ||
            `Cloudbeds API request failed with HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.cloudbedsPayload = payload;
        throw error;
    }

    return payload;
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

async function saveIntegration(apiKey, properties) {
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
         VALUES (?, ?, ?, ?, ?, ?, 'connected', NOW())
         ON DUPLICATE KEY UPDATE
            api_key_ciphertext = VALUES(api_key_ciphertext),
            api_key_iv = VALUES(api_key_iv),
            api_key_tag = VALUES(api_key_tag),
            properties_json = VALUES(properties_json),
            status = 'connected',
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

async function getApiKey() {
    if (process.env.CLOUDBEDS_API_KEY) {
        return process.env.CLOUDBEDS_API_KEY.trim();
    }

    const integration = await getStoredIntegration();
    if (!integration) {
        const error = new Error('Cloudbeds sandbox is not connected yet.');
        error.code = 'CLOUDBEDS_NOT_CONNECTED';
        error.status = 409;
        throw error;
    }

    return decryptSecret(integration);
}

async function exchangeAuthorizationCode(code) {
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
        const error = new Error('Cloudbeds did not return a valid API key.');
        error.code = 'CLOUDBEDS_INVALID_API_KEY';
        throw error;
    }

    const properties = await getHotels(apiKey);
    if (!properties.length) {
        const error = new Error('Cloudbeds returned no properties for this sandbox connection.');
        error.code = 'CLOUDBEDS_NO_PROPERTIES';
        throw error;
    }

    await saveIntegration(apiKey, properties);

    return { environment: ENVIRONMENT, properties };
}

async function getConnectionStatus() {
    try {
        const apiKey = await getApiKey();
        const properties = await getHotels(apiKey);
        const stored = await getStoredIntegration();

        return {
            connected: true,
            environment: ENVIRONMENT,
            source: process.env.CLOUDBEDS_API_KEY ? 'environment' : 'automatic_delivery',
            properties,
            lastSyncAt: stored?.last_sync_at || null,
            lastWebhookAt: stored?.last_webhook_at || null,
        };
    } catch (error) {
        if (error.code === 'CLOUDBEDS_NOT_CONNECTED') {
            return {
                connected: false,
                environment: ENVIRONMENT,
                properties: [],
                lastSyncAt: null,
                lastWebhookAt: null,
            };
        }
        throw error;
    }
}

async function fetchReservationsPage(apiKey, propertyId, pageNumber) {
    return cloudbedsRequest('/getReservations', {
        apiKey,
        query: {
            propertyID: propertyId,
            includeGuestsDetails: 'true',
            includeGuestRequirements: 'true',
            includeCustomFields: 'true',
            includeAllRooms: 'true',
            sortByRecent: 'true',
            pageSize: PAGE_SIZE,
            pageNumber,
        },
    });
}

async function fetchAllReservations(apiKey, properties) {
    const all = [];

    for (const property of properties) {
        for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
            const payload = await fetchReservationsPage(apiKey, property.id, pageNumber);
            const pageItems = extractDataArray(payload);

            all.push(...pageItems.map((item) => ({ ...item, __property: property })));

            if (pageItems.length < PAGE_SIZE) break;
        }
    }

    return all;
}

function normalizeStatus(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'checked_in') return 'in_house';
    if (normalized === 'not_confirmed' || normalized === 'in_progress') return 'pending_confirmation';
    if (normalized === 'canceled') return 'cancelled';
    return normalized || 'confirmed';
}

function normalizeReservation(reservation) {
    const guestCollection = [
        ...asArray(reservation.guests),
        ...asArray(reservation.guestList),
        ...asArray(reservation.guestDetails),
    ];
    const primaryGuest = guestCollection[0] || reservation.guest || reservation.primaryGuest || {};

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
        guestName,
        propertyId: String(property.id),
        roomId,
        roomNumber,
        roomType: roomTypeNames.join(', '),
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
        nights: pick(reservation, ['nights'], null),
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

async function listReservations() {
    const apiKey = await getApiKey();
    const properties = await getHotels(apiKey);
    const rawReservations = await fetchAllReservations(apiKey, properties);

    const normalized = rawReservations
        .map(normalizeReservation)
        .filter((reservation) => reservation.id);

    const operations = await getOperationsMap(normalized.map((reservation) => reservation.id));
    const reservations = normalized.map((reservation) =>
        applyOperations(reservation, operations.get(reservation.id))
    );

    await ensureTables();
    await db.query(
        `UPDATE integration_credentials
         SET last_sync_at = NOW()
         WHERE provider = ? AND environment = ?`,
        [PROVIDER, ENVIRONMENT]
    );

    return {
        environment: ENVIRONMENT,
        properties,
        reservations,
        count: reservations.length,
    };
}

async function saveReservationOperations(reservationId, payload) {
    await ensureTables();

    const arrivalTime = payload.actual_arrival_time ?? payload.arrivalTime ?? null;
    const departureTime = payload.actual_departure_time ?? payload.departureTime ?? null;
    const guestNotes = payload.guest_notes ?? payload.guestNotes ?? '';
    const specialRequests = payload.special_requests ?? payload.specialRequests ?? [];

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

function buildAuthorizationUrl() {
    const clientId = process.env.CLOUDBEDS_CLIENT_ID;
    if (!clientId) {
        const error = new Error('CLOUDBEDS_CLIENT_ID is not configured on the server.');
        error.code = 'CLOUDBEDS_CONFIG_MISSING';
        throw error;
    }

    const url = new URL(`${AUTH_BASE}/oauth`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', '');
    return url.toString();
}

module.exports = {
    ENVIRONMENT,
    REDIRECT_URI,
    buildAuthorizationUrl,
    exchangeAuthorizationCode,
    getConnectionStatus,
    listReservations,
    saveReservationOperations,
};
