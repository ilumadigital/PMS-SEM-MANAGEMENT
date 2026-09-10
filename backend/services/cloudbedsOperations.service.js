const crypto = require('crypto');
const db = require('../config/db');

const PROVIDER = 'cloudbeds';
const ENVIRONMENT = process.env.CLOUDBEDS_ENVIRONMENT || 'sandbox';
const API_BASE = (process.env.CLOUDBEDS_API_BASE || 'https://api.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const AUTH_BASE = (process.env.CLOUDBEDS_AUTH_BASE || 'https://hotels.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const REDIRECT_URI = process.env.CLOUDBEDS_REDIRECT_URI || 'https://api.sem-management.com/api/integrations/cloudbeds/callback';
const FRONTEND_URL = (process.env.PMS_FRONTEND_URL || 'https://pms.sem-management.com').replace(/\/$/, '');
const AUTH_STATE_TTL_MINUTES = 10;

// Permission names are the exact Partner App permission identifiers Cloudbeds exposes.
// Keep this list aligned with the Partner App configuration so a re-authorization
// receives a key that can perform the write-back actions used by SEM PMS.
const FULL_AUTH_SCOPES = [
    'read:customFields',
    'write:customFields',
    'read:dashboard',
    'read:guest',
    'write:guest',
    'read:hotel',
    'read:housekeeping',
    'write:housekeeping',
    'read:reservation',
    'write:reservation',
    'read:resourceReservations',
    'write:resourceReservations',
    'read:room',
    'write:room',
    'read:roomblock',
    'write:roomblock',
    'read:addon',
    'read:item',
    'write:item',
    'read:currency',
    'read:payment',
    'read:rate',
    'read:taxesAndFees',
];

let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS cloudbeds_write_audit (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            actor_user_id VARCHAR(64) NULL,
            actor_role VARCHAR(64) NULL,
            operation VARCHAR(96) NOT NULL,
            entity_type VARCHAR(48) NOT NULL,
            external_id VARCHAR(128) NULL,
            property_id VARCHAR(128) NULL,
            endpoint VARCHAR(160) NOT NULL,
            request_json LONGTEXT NULL,
            response_json LONGTEXT NULL,
            status VARCHAR(24) NOT NULL,
            error_message TEXT NULL,
            request_id VARCHAR(128) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cb_audit_created (created_at),
            INDEX idx_cb_audit_entity (entity_type, external_id),
            INDEX idx_cb_audit_status (status)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS integration_webhook_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            provider VARCHAR(32) NOT NULL,
            event_name VARCHAR(160) NULL,
            property_id VARCHAR(128) NULL,
            external_id VARCHAR(128) NULL,
            payload_json LONGTEXT NOT NULL,
            received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_webhook_provider_received (provider, received_at),
            INDEX idx_webhook_external (external_id)
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
        const error = new Error('INTEGRATION_SECRET (or JWT_SECRET fallback) is required for Cloudbeds credentials.');
        error.code = 'INTEGRATION_SECRET_MISSING';
        error.status = 500;
        throw error;
    }
    return crypto.createHash('sha256').update(secret).digest();
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
    const stored = await getStoredIntegration();
    if (stored) return decryptSecret(stored);

    const allowEnvApiKey = String(process.env.CLOUDBEDS_ALLOW_ENV_API_KEY || 'false') === 'true';
    if (allowEnvApiKey && process.env.CLOUDBEDS_API_KEY) return process.env.CLOUDBEDS_API_KEY.trim();

    const error = new Error('Cloudbeds is not connected. Re-authorize the property first.');
    error.code = 'CLOUDBEDS_NOT_CONNECTED';
    error.status = 409;
    throw error;
}

function safeJson(value) {
    try { return JSON.stringify(value ?? null); }
    catch { return JSON.stringify({ serializationError: true }); }
}

function appendForm(params, key, value) {
    if (value === undefined) return;
    if (value === null) {
        params.append(key, '');
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => appendForm(params, `${key}[${index}]`, entry));
        return;
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
        Object.entries(value).forEach(([childKey, childValue]) => {
            appendForm(params, `${key}[${childKey}]`, childValue);
        });
        return;
    }
    params.append(key, typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value));
}

function buildForm(form = {}) {
    const params = new URLSearchParams();
    Object.entries(form).forEach(([key, value]) => appendForm(params, key, value));
    return params.toString();
}

async function apiRequest(path, { apiKey, baseUrl, method = 'GET', query, form } = {}) {
    const base = (baseUrl || API_BASE).replace(/\/$/, '');
    const url = new URL(`${base}${path}`);
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });

    const headers = { Accept: 'application/json' };
    if (apiKey) {
        headers['x-api-key'] = apiKey;
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const request = { method, headers };
    if (form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        request.body = buildForm(form);
    }

    const response = await fetch(url, request);
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; }
    catch { payload = { raw: text }; }

    if (!response.ok || payload?.success === false) {
        const error = new Error(
            payload?.message || payload?.error_description || payload?.error || `Cloudbeds API request failed with HTTP ${response.status}`
        );
        error.status = response.status;
        error.code = payload?.errorCode || payload?.code || 'CLOUDBEDS_WRITE_FAILED';
        error.requestId = response.headers.get('x-request-id') || null;
        error.cloudbedsPayload = payload;
        error.requestUrl = url.toString();
        throw error;
    }

    return {
        payload,
        requestId: response.headers.get('x-request-id') || null,
        requestUrl: url.toString(),
    };
}

async function resolveApiBases(apiKey) {
    const bases = [];
    const add = (value) => {
        const normalized = String(value || '').trim().replace(/\/$/, '');
        if (normalized && !bases.includes(normalized)) bases.push(normalized);
    };

    for (const metadataBase of [API_BASE, AUTH_BASE]) {
        try {
            const metadata = await apiRequest('/oauth/metadata', { apiKey, baseUrl: metadataBase });
            add(metadata.payload?.data?.api?.url);
        } catch (error) {
            console.warn('[CLOUDBEDS WRITE] metadata lookup failed:', metadataBase, error.message);
        }
    }
    add(API_BASE);
    add(AUTH_BASE);
    return bases;
}

async function requestAcrossBases(path, options = {}) {
    const apiKey = options.apiKey || await getApiKey();
    const bases = options.baseUrl ? [options.baseUrl] : await resolveApiBases(apiKey);
    let firstError = null;

    for (const baseUrl of bases) {
        try {
            const result = await apiRequest(path, { ...options, apiKey, baseUrl });
            return { ...result, apiBase: baseUrl };
        } catch (error) {
            firstError = firstError || error;
            if (![401, 403, 404].includes(Number(error.status))) throw error;
        }
    }
    throw firstError || new Error(`Cloudbeds endpoint ${path} is unavailable.`);
}

function actorFields(actor = {}) {
    return {
        userId: actor.userId || actor.id || null,
        role: actor.role || null,
    };
}

async function writeAudit({ actor, operation, entityType, externalId, propertyId, endpoint, request, response, status, error, requestId }) {
    await ensureTables();
    const who = actorFields(actor);
    await db.query(
        `INSERT INTO cloudbeds_write_audit
            (actor_user_id, actor_role, operation, entity_type, external_id, property_id, endpoint,
             request_json, response_json, status, error_message, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            who.userId ? String(who.userId) : null,
            who.role ? String(who.role) : null,
            operation,
            entityType,
            externalId ? String(externalId) : null,
            propertyId ? String(propertyId) : null,
            endpoint,
            safeJson(request),
            response === undefined ? null : safeJson(response),
            status,
            error?.message || null,
            requestId || error?.requestId || null,
        ]
    );
}

async function auditedWrite(meta, execute) {
    try {
        const result = await execute();
        await writeAudit({ ...meta, response: result.payload, status: 'synced', requestId: result.requestId });
        return result;
    } catch (error) {
        try { await writeAudit({ ...meta, status: 'failed', error }); }
        catch (auditError) { console.error('[CLOUDBEDS AUDIT] failed:', auditError.message); }
        throw error;
    }
}

function requiredString(value, name) {
    const result = String(value || '').trim();
    if (!result) {
        const error = new Error(`${name} is required.`);
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }
    return result;
}

function optionalDate(value, name) {
    if (value === undefined || value === null || value === '') return undefined;
    const text = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const error = new Error(`${name} must be YYYY-MM-DD.`);
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }
    return text;
}

function optionalTime(value) {
    if (value === undefined || value === null || value === '') return undefined;
    const text = String(value).slice(0, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
        const error = new Error('Estimated arrival time must use 24-hour HH:MM format.');
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }
    return text;
}

const STATUS_MAP = {
    confirmed: 'confirmed',
    pending_confirmation: 'not_confirmed',
    not_confirmed: 'not_confirmed',
    cancelled: 'canceled',
    canceled: 'canceled',
    in_house: 'checked_in',
    checked_in: 'checked_in',
    checked_out: 'checked_out',
    no_show: 'no_show',
};

async function verifyReservation(propertyId, reservationId) {
    try {
        const result = await requestAcrossBases('/getReservation', {
            query: { propertyID: propertyId, reservationID: reservationId, includeGuestRequirements: true },
        });
        return { verified: true, data: result.payload?.data || result.payload };
    } catch (error) {
        return { verified: false, verificationError: error.message };
    }
}

async function updateReservation(reservationId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const form = { propertyID: propertyId, reservationID: requiredString(reservationId, 'reservationId') };

    if (payload.arrivalTime !== undefined || payload.estimatedArrivalTime !== undefined) {
        form.estimatedArrivalTime = optionalTime(payload.arrivalTime ?? payload.estimatedArrivalTime) ?? '';
    }
    if (payload.status !== undefined) {
        const mapped = STATUS_MAP[String(payload.status).toLowerCase()];
        if (!mapped) {
            const error = new Error('Unsupported Cloudbeds reservation status.');
            error.code = 'VALIDATION_ERROR';
            error.status = 400;
            throw error;
        }
        form.status = mapped;
        form.sendStatusChangeEmail = Boolean(payload.sendStatusChangeEmail);
    }
    if (payload.checkoutDate !== undefined || payload.departureDate !== undefined) {
        form.checkoutDate = optionalDate(payload.checkoutDate ?? payload.departureDate, 'checkoutDate') ?? '';
    }
    if (Array.isArray(payload.customFields)) form.customFields = payload.customFields;
    if (Array.isArray(payload.rooms) && payload.rooms.length) form.rooms = payload.rooms;

    if (Object.keys(form).length === 2) {
        const error = new Error('No supported reservation changes were supplied.');
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }

    const endpoint = '/putReservation';
    const result = await auditedWrite({
        actor, operation: 'reservation.update', entityType: 'reservation', externalId: reservationId,
        propertyId, endpoint, request: form,
    }, () => requestAcrossBases(endpoint, { method: 'PUT', form }));

    return { synced: true, requestId: result.requestId, cloudbeds: result.payload, verification: await verifyReservation(propertyId, reservationId) };
}

async function assignRoom(reservationId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const newRoomId = requiredString(payload.newRoomId || payload.newRoomID, 'newRoomId');
    const form = {
        propertyID: propertyId,
        reservationID: requiredString(reservationId, 'reservationId'),
        newRoomID: newRoomId,
        adjustPrice: Boolean(payload.adjustPrice),
    };
    if (payload.roomTypeId || payload.roomTypeID) form.roomTypeID = String(payload.roomTypeId || payload.roomTypeID);
    if (payload.oldRoomId || payload.oldRoomID) form.oldRoomID = String(payload.oldRoomId || payload.oldRoomID);
    if (payload.subReservationId || payload.subReservationID) form.subReservationID = String(payload.subReservationId || payload.subReservationID);
    if (payload.reservationRoomId || payload.reservationRoomID) form.reservationRoomID = String(payload.reservationRoomId || payload.reservationRoomID);

    const endpoint = '/postRoomAssign';
    const result = await auditedWrite({
        actor, operation: 'reservation.room_assign', entityType: 'reservation', externalId: reservationId,
        propertyId, endpoint, request: form,
    }, () => requestAcrossBases(endpoint, { method: 'POST', form }));

    return { synced: true, requestId: result.requestId, cloudbeds: result.payload, verification: await verifyReservation(propertyId, reservationId) };
}

async function updateGuest(guestId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const form = { propertyID: propertyId, guestID: requiredString(guestId, 'guestId') };
    const fields = {
        firstName: 'guestFirstName', lastName: 'guestLastName', email: 'guestEmail', phone: 'guestPhone',
        cellPhone: 'guestCellPhone', address1: 'guestAddress', address2: 'guestAddress2', city: 'guestCity',
        country: 'guestCountry', nationality: 'guestNationality', state: 'guestState', zip: 'guestZip',
        birthday: 'guestBirthdate', documentType: 'guestDocumentType', documentNumber: 'guestDocumentNumber',
        documentIssueDate: 'guestDocumentIssueDate', documentIssuingCountry: 'guestDocumentIssuingCountry',
        documentExpirationDate: 'guestDocumentExpirationDate',
    };
    Object.entries(fields).forEach(([inputKey, apiKey]) => {
        if (payload[inputKey] !== undefined) form[apiKey] = payload[inputKey] ?? '';
    });
    if (Array.isArray(payload.customFields)) form.guestCustomFields = payload.customFields;

    if (Object.keys(form).length === 2) {
        const error = new Error('No supported guest changes were supplied.');
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }

    const endpoint = '/putGuest';
    const result = await auditedWrite({
        actor, operation: 'guest.update', entityType: 'guest', externalId: guestId,
        propertyId, endpoint, request: form,
    }, () => requestAcrossBases(endpoint, { method: 'PUT', form }));

    let verification;
    try {
        const verify = await requestAcrossBases('/getGuest', { query: { propertyID: propertyId, guestID: guestId } });
        verification = { verified: true, data: verify.payload?.data || verify.payload };
    } catch (error) { verification = { verified: false, verificationError: error.message }; }

    return { synced: true, requestId: result.requestId, cloudbeds: result.payload, verification };
}

async function updateHousekeeping(roomId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const form = { propertyID: propertyId, roomID: requiredString(roomId, 'roomId') };
    if (payload.roomCondition !== undefined) {
        const condition = String(payload.roomCondition || '').toLowerCase();
        if (!['dirty', 'clean', 'inspected'].includes(condition)) {
            const error = new Error('roomCondition must be dirty, clean or inspected.');
            error.code = 'VALIDATION_ERROR'; error.status = 400; throw error;
        }
        form.roomCondition = condition;
    }
    ['doNotDisturb', 'refusedService', 'vacantPickup'].forEach((key) => {
        if (payload[key] !== undefined) form[key] = Boolean(payload[key]);
    });
    if (payload.roomComments !== undefined || payload.comments !== undefined) {
        form.roomComments = String(payload.roomComments ?? payload.comments ?? '').slice(0, 2000);
    }

    if (Object.keys(form).length === 2) {
        const error = new Error('No housekeeping changes were supplied.');
        error.code = 'VALIDATION_ERROR'; error.status = 400; throw error;
    }

    const endpoint = '/postHousekeepingStatus';
    const result = await auditedWrite({
        actor, operation: 'housekeeping.update', entityType: 'room', externalId: roomId,
        propertyId, endpoint, request: form,
    }, () => requestAcrossBases(endpoint, { method: 'POST', form }));

    let verification;
    try {
        const verify = await requestAcrossBases('/getHousekeepingStatus', {
            query: { propertyID: propertyId, pageSize: 5000, pageNumber: 1 },
        });
        const rows = Array.isArray(verify.payload?.data) ? verify.payload.data : [];
        const room = rows.find((item) => String(item.roomID || item.roomId) === String(roomId));
        verification = { verified: Boolean(room), data: room || null };
    } catch (error) { verification = { verified: false, verificationError: error.message }; }

    return { synced: true, requestId: result.requestId, cloudbeds: result.payload, verification };
}

async function listRoomBlocks(propertyId) {
    const resolvedPropertyId = requiredString(propertyId, 'propertyId');
    const result = await requestAcrossBases('/getRoomBlocks', {
        query: { propertyID: resolvedPropertyId, pageSize: 5000, pageNumber: 1 },
    });
    return result.payload;
}

function normalizeBlockRooms(rooms) {
    if (!Array.isArray(rooms) || !rooms.length) {
        const error = new Error('At least one room is required for a room block.');
        error.code = 'VALIDATION_ERROR'; error.status = 400; throw error;
    }
    return rooms.map((room) => ({
        roomID: requiredString(room.roomID || room.roomId || room.id, 'roomId'),
        ...(room.roomTypeID || room.roomTypeId ? { roomTypeID: String(room.roomTypeID || room.roomTypeId) } : {}),
    }));
}

async function createRoomBlock(payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const type = String(payload.roomBlockType || 'out_of_service');
    if (!['blocked_dates', 'out_of_service', 'courtesy_hold'].includes(type)) {
        const error = new Error('Unsupported room block type.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error;
    }
    const form = {
        propertyID: propertyId,
        roomBlockType: type,
        roomBlockReason: requiredString(payload.roomBlockReason || payload.reason, 'roomBlockReason'),
        startDate: optionalDate(payload.startDate, 'startDate'),
        endDate: optionalDate(payload.endDate, 'endDate'),
        rooms: normalizeBlockRooms(payload.rooms),
    };
    if (!form.startDate || !form.endDate) {
        const error = new Error('startDate and endDate are required.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error;
    }
    ['firstName', 'lastName', 'email', 'phone', 'lengthOfHoldInHours'].forEach((key) => {
        if (payload[key] !== undefined && payload[key] !== '') form[key] = payload[key];
    });

    const endpoint = '/postRoomBlock';
    const result = await auditedWrite({
        actor, operation: 'roomblock.create', entityType: 'roomblock', externalId: null,
        propertyId, endpoint, request: form,
    }, () => requestAcrossBases(endpoint, { method: 'POST', form }));
    return { synced: true, requestId: result.requestId, cloudbeds: result.payload };
}

async function updateRoomBlock(roomBlockId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const form = { propertyID: propertyId, roomBlockID: requiredString(roomBlockId, 'roomBlockId') };
    if (payload.roomBlockReason !== undefined || payload.reason !== undefined) form.roomBlockReason = String(payload.roomBlockReason ?? payload.reason ?? '');
    if (payload.startDate !== undefined) form.startDate = optionalDate(payload.startDate, 'startDate') ?? '';
    if (payload.endDate !== undefined) form.endDate = optionalDate(payload.endDate, 'endDate') ?? '';
    if (payload.rooms !== undefined) form.rooms = normalizeBlockRooms(payload.rooms);
    ['firstName', 'lastName', 'email', 'phone', 'lengthOfHoldInHours'].forEach((key) => {
        if (payload[key] !== undefined) form[key] = payload[key] ?? '';
    });

    const endpoint = '/putRoomBlock';
    const result = await auditedWrite({
        actor, operation: 'roomblock.update', entityType: 'roomblock', externalId: roomBlockId,
        propertyId, endpoint, request: form,
    }, () => requestAcrossBases(endpoint, { method: 'PUT', form }));
    return { synced: true, requestId: result.requestId, cloudbeds: result.payload };
}

async function getReferenceData(payload = {}) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const result = {};
    const failures = {};

    const call = async (key, path, query = {}) => {
        try {
            const response = await requestAcrossBases(path, { query: { propertyID: propertyId, ...query } });
            result[key] = response.payload?.data ?? response.payload;
        } catch (error) { failures[key] = error.message; }
    };

    await Promise.all([
        call('taxesAndFees', '/getTaxesAndFees'),
        call('items', '/getItems', { pageSize: 500, pageNumber: 1 }),
        call('currency', '/getCurrencySettings'),
        payload.startDate && payload.endDate
            ? call('ratePlans', '/getRatePlans', {
                propertyIDs: propertyId,
                startDate: payload.startDate,
                endDate: payload.endDate,
                detailedRates: true,
                pageSize: 100,
                pageNumber: 1,
            })
            : Promise.resolve(),
    ]);

    // Add-ons are a newer endpoint using x-property-id. It is optional here; the PMS
    // continues to work if a property/account does not expose this endpoint.
    try {
        const apiKey = await getApiKey();
        const response = await fetch(`${API_BASE.replace('/api/v1.3', '')}/addons/v1/addons?limit=500&offset=0`, {
            headers: { Accept: 'application/json', 'x-api-key': apiKey, Authorization: `Bearer ${apiKey}`, 'x-property-id': propertyId },
        });
        const text = await response.text();
        const parsed = text ? JSON.parse(text) : {};
        if (response.ok) result.addons = parsed?.data ?? parsed;
        else failures.addons = parsed?.message || `HTTP ${response.status}`;
    } catch (error) { failures.addons = error.message; }

    return { propertyId, data: result, failures };
}

async function postCustomCharge(reservationId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const itemName = requiredString(payload.itemName || payload.name, 'itemName');
    const itemCategoryName = requiredString(payload.itemCategoryName || payload.category || 'SEM Services', 'itemCategoryName');
    const itemPrice = Number(payload.itemPrice ?? payload.price);
    if (!Number.isFinite(itemPrice) || itemPrice < 0) {
        const error = new Error('itemPrice must be a valid non-negative number.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error;
    }

    const item = {
        itemName,
        itemCategoryName,
        itemPrice,
        itemQuantity: Math.max(1, Number(payload.itemQuantity || payload.quantity || 1)),
    };
    if (payload.itemNote || payload.note) item.itemNote = String(payload.itemNote || payload.note).slice(0, 1000);
    if (payload.taxes) item.taxes = payload.taxes;

    const form = {
        propertyID: propertyId,
        reservationID: requiredString(reservationId, 'reservationId'),
        referenceID: payload.referenceId || payload.referenceID || `sem-${reservationId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        items: [item],
        itemPaid: false,
    };
    if (payload.roomId || payload.roomID) form.roomID = String(payload.roomId || payload.roomID);
    if (payload.subReservationId || payload.subReservationID) form.subReservationID = String(payload.subReservationId || payload.subReservationID);
    if (payload.guestId || payload.guestID) form.guestID = String(payload.guestId || payload.guestID);

    const endpoint = '/postCustomItem';
    const result = await auditedWrite({
        actor, operation: 'folio.custom_item', entityType: 'reservation', externalId: reservationId,
        propertyId, endpoint, request: form,
    }, () => requestAcrossBases(endpoint, { method: 'POST', form }));

    return { synced: true, requestId: result.requestId, referenceId: form.referenceID, cloudbeds: result.payload };
}

async function getAudit(limit = 100) {
    await ensureTables();
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    return db.query(
        `SELECT id, actor_user_id AS actorUserId, actor_role AS actorRole, operation,
                entity_type AS entityType, external_id AS externalId, property_id AS propertyId,
                endpoint, status, error_message AS errorMessage, request_id AS requestId, created_at AS createdAt
         FROM cloudbeds_write_audit
         ORDER BY id DESC
         LIMIT ${safeLimit}`
    );
}

async function recordWebhookEvent(payload = {}) {
    await ensureTables();
    const eventName = String(payload.event || payload.eventName || payload.type || 'unknown');
    const propertyId = payload.propertyId || payload.propertyID || null;
    const externalId = payload.reservationId || payload.reservationID || payload.roomId || payload.roomID || payload.roomBlockId || payload.roomBlockID || payload.guestId || payload.guestID || null;
    await db.query(
        `INSERT INTO integration_webhook_events (provider, event_name, property_id, external_id, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
        [PROVIDER, eventName, propertyId ? String(propertyId) : null, externalId ? String(externalId) : null, safeJson(payload)]
    );
    await db.query(
        `UPDATE integration_credentials SET last_webhook_at = NOW()
         WHERE provider = ? AND environment = ?`,
        [PROVIDER, ENVIRONMENT]
    );
    return { eventName, propertyId, externalId };
}

function getCapabilities() {
    return {
        provider: PROVIDER,
        environment: ENVIRONMENT,
        authScopes: FULL_AUTH_SCOPES,
        writes: {
            reservations: ['status', 'estimatedArrivalTime', 'checkoutDate', 'customFields', 'roomConfiguration'],
            roomAssignment: true,
            guests: true,
            housekeeping: ['dirty', 'clean', 'inspected', 'doNotDisturb', 'refusedService', 'vacantPickup', 'comments'],
            roomBlocks: ['blocked_dates', 'out_of_service', 'courtesy_hold'],
            customFolioItems: true,
            paymentWrite: false,
            deleteOperations: false,
        },
        reads: ['reservations', 'guests', 'rooms', 'housekeeping', 'dashboard', 'customFields', 'resourceReservations', 'rates', 'items', 'addons', 'currency', 'payments', 'taxesAndFees'],
    };
}

async function createAuthorizationUrl() {
    await ensureTables();
    const clientId = process.env.CLOUDBEDS_CLIENT_ID;
    const clientSecret = process.env.CLOUDBEDS_CLIENT_SECRET;
    if (!clientId || !clientSecret || !REDIRECT_URI) {
        const error = new Error('Cloudbeds client credentials are not configured on the server.');
        error.code = 'CLOUDBEDS_CONFIG_MISSING'; error.status = 500; throw error;
    }

    await db.query(
        `DELETE FROM integration_auth_states WHERE provider = ? AND environment = ? AND expires_at < NOW()`,
        [PROVIDER, ENVIRONMENT]
    );
    const state = crypto.randomBytes(32).toString('hex');
    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    const expiresAt = new Date(Date.now() + AUTH_STATE_TTL_MINUTES * 60 * 1000);
    await db.query(
        `INSERT INTO integration_auth_states (state_hash, provider, environment, created_at, expires_at)
         VALUES (?, ?, ?, NOW(), ?)`,
        [stateHash, PROVIDER, ENVIRONMENT, expiresAt]
    );

    const url = new URL(`${AUTH_BASE}/oauth`);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', FULL_AUTH_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return { url: url.toString(), state, scopes: FULL_AUTH_SCOPES };
}

module.exports = {
    FULL_AUTH_SCOPES,
    FRONTEND_URL,
    createAuthorizationUrl,
    getCapabilities,
    getReferenceData,
    updateReservation,
    assignRoom,
    updateGuest,
    updateHousekeeping,
    listRoomBlocks,
    createRoomBlock,
    updateRoomBlock,
    postCustomCharge,
    getAudit,
    recordWebhookEvent,
};
