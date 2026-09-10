const crypto = require('crypto');
const db = require('../config/db');

const PROVIDER = 'cloudbeds';
const ENVIRONMENT = process.env.CLOUDBEDS_ENVIRONMENT || 'sandbox';
const API_BASE = (process.env.CLOUDBEDS_API_BASE || 'https://api.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const AUTH_BASE = (process.env.CLOUDBEDS_AUTH_BASE || 'https://hotels.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const REDIRECT_URI = process.env.CLOUDBEDS_REDIRECT_URI || 'https://api.sem-management.com/api/integrations/cloudbeds/callback';
const FRONTEND_URL = (process.env.PMS_FRONTEND_URL || 'https://pms.sem-management.com').replace(/\/$/, '');
const AUTH_STATE_TTL_MINUTES = 10;

const FULL_AUTH_SCOPES = [
    'read:customFields', 'write:customFields', 'read:dashboard',
    'read:guest', 'write:guest', 'read:hotel',
    'read:housekeeping', 'write:housekeeping',
    'read:reservation', 'write:reservation',
    'read:resourceReservations', 'write:resourceReservations',
    'read:room', 'write:room', 'read:roomblock', 'write:roomblock',
    'read:addon', 'read:item', 'write:item', 'read:currency',
    'read:payment', 'read:rate', 'read:taxesAndFees',
];

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
    await db.query(`
        CREATE TABLE IF NOT EXISTS cloudbeds_reservation_create_guard (
            request_key VARCHAR(96) PRIMARY KEY,
            property_id VARCHAR(128) NOT NULL,
            room_id VARCHAR(128) NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            reservation_id VARCHAR(128) NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'started',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    tablesReady = true;
}

function integrationSecret() {
    const secret = process.env.INTEGRATION_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        const error = new Error('INTEGRATION_SECRET (or JWT_SECRET fallback) is required for Cloudbeds credentials.');
        error.code = 'INTEGRATION_SECRET_MISSING'; error.status = 500; throw error;
    }
    return crypto.createHash('sha256').update(secret).digest();
}

function decryptSecret(record) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', integrationSecret(), Buffer.from(record.api_key_iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.api_key_tag, 'base64'));
    return Buffer.concat([
        decipher.update(Buffer.from(record.api_key_ciphertext, 'base64')),
        decipher.final(),
    ]).toString('utf8');
}

async function getStoredIntegration() {
    await ensureTables();
    const rows = await db.query(
        `SELECT * FROM integration_credentials WHERE provider = ? AND environment = ? LIMIT 1`,
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
    error.code = 'CLOUDBEDS_NOT_CONNECTED'; error.status = 409; throw error;
}

function safeJson(value) {
    try { return JSON.stringify(value ?? null); }
    catch { return JSON.stringify({ serializationError: true }); }
}

function appendForm(params, key, value) {
    if (value === undefined) return;
    if (value === null) { params.append(key, ''); return; }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => appendForm(params, `${key}[${index}]`, entry));
        return;
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
        Object.entries(value).forEach(([childKey, childValue]) => appendForm(params, `${key}[${childKey}]`, childValue));
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
    if (apiKey) { headers['x-api-key'] = apiKey; headers.Authorization = `Bearer ${apiKey}`; }
    const request = { method, headers };
    if (form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        request.body = buildForm(form);
    }
    const response = await fetch(url, request);
    const text = await response.text();
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok || payload?.success === false) {
        const error = new Error(payload?.message || payload?.error_description || payload?.error || `Cloudbeds API request failed with HTTP ${response.status}`);
        error.status = response.status;
        error.code = payload?.errorCode || payload?.code || 'CLOUDBEDS_WRITE_FAILED';
        error.requestId = response.headers.get('x-request-id') || null;
        error.cloudbedsPayload = payload;
        error.requestUrl = url.toString();
        throw error;
    }
    return { payload, requestId: response.headers.get('x-request-id') || null, requestUrl: url.toString() };
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
            console.warn('[CLOUDBEDS] metadata lookup failed:', metadataBase, error.message);
        }
    }
    add(API_BASE); add(AUTH_BASE); return bases;
}

async function requestAcrossBases(path, options = {}) {
    const apiKey = options.apiKey || await getApiKey();
    const bases = options.baseUrl ? [options.baseUrl] : await resolveApiBases(apiKey);
    let firstError = null;
    for (const baseUrl of bases) {
        try { return { ...(await apiRequest(path, { ...options, apiKey, baseUrl })), apiBase: baseUrl }; }
        catch (error) {
            firstError = firstError || error;
            if (![401, 403, 404].includes(Number(error.status))) throw error;
        }
    }
    throw firstError || new Error(`Cloudbeds endpoint ${path} is unavailable.`);
}

function actorFields(actor = {}) { return { userId: actor.userId || actor.id || null, role: actor.role || null }; }

async function writeAudit({ actor, operation, entityType, externalId, propertyId, endpoint, request, response, status, error, requestId }) {
    await ensureTables();
    const who = actorFields(actor);
    await db.query(
        `INSERT INTO cloudbeds_write_audit
          (actor_user_id, actor_role, operation, entity_type, external_id, property_id, endpoint,
           request_json, response_json, status, error_message, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [who.userId ? String(who.userId) : null, who.role ? String(who.role) : null, operation, entityType,
         externalId ? String(externalId) : null, propertyId ? String(propertyId) : null, endpoint,
         safeJson(request), response === undefined ? null : safeJson(response), status,
         error?.message || null, requestId || error?.requestId || null]
    );
}

async function auditedWrite(meta, execute) {
    try {
        const result = await execute();
        await writeAudit({ ...meta, response: result.payload, status: 'synced', requestId: result.requestId });
        return result;
    } catch (error) {
        try { await writeAudit({ ...meta, status: 'failed', error }); } catch (auditError) { console.error('[CLOUDBEDS AUDIT]', auditError.message); }
        throw error;
    }
}

function requiredString(value, name) {
    const result = String(value || '').trim();
    if (!result) { const error = new Error(`${name} is required.`); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    return result;
}
function optionalDate(value, name) {
    if (value === undefined || value === null || value === '') return undefined;
    const text = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) { const error = new Error(`${name} must be YYYY-MM-DD.`); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    return text;
}
function optionalTime(value) {
    if (value === undefined || value === null || value === '') return undefined;
    const text = String(value).slice(0, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) { const error = new Error('Arrival time must use 24-hour HH:MM format.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    return text;
}
function asArray(value) { return value ? (Array.isArray(value) ? value : [value]) : []; }
function extractDataArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
}
function pick(object, keys, fallback = null) {
    for (const key of keys) {
        const value = String(key).split('.').reduce((current, part) => current?.[part], object);
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
}
function validateStay(startDate, endDate) {
    const start = optionalDate(startDate, 'startDate');
    const end = optionalDate(endDate, 'endDate');
    if (!start || !end || start >= end) {
        const error = new Error('Check-out must be after check-in.');
        error.code = 'INVALID_STAY_DATES'; error.status = 400; throw error;
    }
    return { startDate: start, endDate: end };
}
function overlaps(aStart, aEnd, bStart, bEnd) { return Boolean(aStart && aEnd && bStart && bEnd && aStart < bEnd && bStart < aEnd); }

function flattenRooms(payload) {
    return extractDataArray(payload).flatMap((group) => {
        const inherited = {
            propertyId: String(pick(group, ['propertyID', 'propertyId'], '') || ''),
            roomTypeId: String(pick(group, ['roomTypeID', 'roomTypeId'], '') || ''),
            roomType: String(pick(group, ['roomTypeName', 'roomTypeNameShort', 'roomType'], '') || ''),
        };
        const nested = asArray(group?.rooms);
        const candidates = nested.length ? nested : (pick(group, ['roomID', 'roomId'], '') ? [group] : []);
        return candidates.map((room) => ({
            id: String(pick(room, ['roomID', 'roomId', 'id'], '') || ''),
            roomNumber: String(pick(room, ['roomName', 'roomNumber', 'name'], '') || ''),
            roomTypeId: String(pick(room, ['roomTypeID', 'roomTypeId'], inherited.roomTypeId) || inherited.roomTypeId),
            roomType: String(pick(room, ['roomTypeName', 'roomTypeNameShort', 'roomType'], inherited.roomType) || inherited.roomType),
            propertyId: String(pick(room, ['propertyID', 'propertyId'], inherited.propertyId) || inherited.propertyId),
            blocked: Boolean(pick(room, ['roomBlocked'], false)),
            maxGuests: Number(pick(room, ['maxGuests'], pick(group, ['maxGuests'], 0)) || 0),
        })).filter((room) => room.id);
    });
}

function reservationAssignments(reservation) {
    const source = [
        ...asArray(reservation?.assigned),
        ...asArray(reservation?.unassigned),
        ...asArray(reservation?.rooms),
        ...asArray(reservation?.roomList),
    ];
    return source.map((room) => ({
        roomId: String(pick(room, ['roomID', 'roomId'], '') || ''),
        roomNumber: String(pick(room, ['roomName', 'roomNumber'], '') || ''),
        roomTypeId: String(pick(room, ['roomTypeID', 'roomTypeId'], '') || ''),
        roomType: String(pick(room, ['roomTypeName', 'roomTypeNameShort'], '') || ''),
        subReservationId: String(pick(room, ['subReservationID', 'subReservationId'], '') || ''),
        reservationRoomId: String(pick(room, ['reservationRoomID', 'reservationRoomId'], '') || ''),
        startDate: String(pick(room, ['startDate', 'checkInDate'], reservation?.startDate || '') || '').slice(0, 10),
        endDate: String(pick(room, ['endDate', 'checkOutDate'], reservation?.endDate || '') || '').slice(0, 10),
        adults: Number(pick(room, ['adults'], 1) || 1),
        children: Number(pick(room, ['children'], 0) || 0),
        roomRate: pick(room, ['roomRate'], undefined),
        rateId: String(pick(room, ['rateID', 'rateId'], '') || ''),
    })).filter((room, index, all) => {
        const key = `${room.subReservationId}|${room.roomId}|${room.roomTypeId}|${room.startDate}|${room.endDate}`;
        return all.findIndex((candidate) => `${candidate.subReservationId}|${candidate.roomId}|${candidate.roomTypeId}|${candidate.startDate}|${candidate.endDate}` === key) === index;
    });
}

const STATUS_MAP = {
    confirmed: 'confirmed', pending_confirmation: 'not_confirmed', not_confirmed: 'not_confirmed',
    cancelled: 'canceled', canceled: 'canceled', in_house: 'checked_in', checked_in: 'checked_in',
    checked_out: 'checked_out', no_show: 'no_show',
};

async function getReservationRaw(propertyId, reservationId) {
    const result = await requestAcrossBases('/getReservation', { query: { propertyID: propertyId, reservationID: reservationId, includeGuestRequirements: true } });
    return result.payload?.data || result.payload || {};
}
async function verifyReservation(propertyId, reservationId) {
    try { return { verified: true, data: await getReservationRaw(propertyId, reservationId) }; }
    catch (error) { return { verified: false, verificationError: error.message }; }
}

async function fetchAllPhysicalRooms(propertyId, stay) {
    const query = { propertyIDs: propertyId, pageSize: 500, pageNumber: 1, includeRoomRelations: 1 };
    if (stay?.startDate && stay?.endDate) { query.startDate = stay.startDate; query.endDate = stay.endDate; }
    const result = await requestAcrossBases('/getRooms', { query });
    return flattenRooms(result.payload);
}

async function findRoomConflicts(propertyId, roomId, startDate, endDate, excludeReservationId) {
    if (!roomId) return [];
    const statuses = ['confirmed', 'checked_in', 'not_confirmed'];
    const rows = [];
    for (const status of statuses) {
        try {
            const result = await requestAcrossBases('/getReservations', {
                query: { propertyID: propertyId, roomID: roomId, status, includeAllRooms: true, pageSize: 100, pageNumber: 1 },
            });
            rows.push(...extractDataArray(result.payload));
        } catch (error) {
            if (![400, 404].includes(Number(error.status))) throw error;
        }
    }
    const seen = new Set();
    return rows.filter((reservation) => {
        const id = String(pick(reservation, ['reservationID', 'reservationId', 'id'], '') || '');
        if (!id || id === String(excludeReservationId || '') || seen.has(id)) return false;
        const start = String(pick(reservation, ['startDate', 'checkInDate'], '') || '').slice(0, 10);
        const end = String(pick(reservation, ['endDate', 'checkOutDate'], '') || '').slice(0, 10);
        if (!overlaps(start, end, startDate, endDate)) return false;
        seen.add(id); return true;
    }).map((reservation) => ({
        reservationId: String(pick(reservation, ['reservationID', 'reservationId', 'id'], '')),
        guestName: String(pick(reservation, ['guestName'], 'Existing guest') || 'Existing guest'),
        startDate: String(pick(reservation, ['startDate', 'checkInDate'], '') || '').slice(0, 10),
        endDate: String(pick(reservation, ['endDate', 'checkOutDate'], '') || '').slice(0, 10),
        status: String(pick(reservation, ['status', 'reservationStatus'], '') || ''),
    }));
}

function availabilityRoomTypes(payload) {
    const rows = extractDataArray(payload);
    return rows.flatMap((property) => {
        if (Array.isArray(property?.roomTypes)) return property.roomTypes;
        if (property?.roomTypeID || property?.roomTypeId) return [property];
        return [];
    }).map((roomType) => ({
        roomTypeId: String(pick(roomType, ['roomTypeID', 'roomTypeId'], '') || ''),
        roomType: String(pick(roomType, ['roomTypeName', 'roomTypeNameShort', 'name'], '') || ''),
        roomsAvailable: Number(pick(roomType, ['roomsAvailable', 'available'], 0) || 0),
        roomRate: Number(pick(roomType, ['roomRate', 'rate', 'price'], 0) || 0),
        totalRate: Number(pick(roomType, ['totalRate', 'total'], 0) || 0),
    })).filter((row) => row.roomTypeId);
}

async function getAvailability(payload = {}) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const stay = validateStay(payload.startDate, payload.endDate);
    const adults = Math.max(1, Number(payload.adults || 1));
    const children = Math.max(0, Number(payload.children || 0));
    const [inventory, availableRooms, availableTypesResult] = await Promise.all([
        fetchAllPhysicalRooms(propertyId),
        fetchAllPhysicalRooms(propertyId, stay),
        requestAcrossBases('/getAvailableRoomTypes', {
            query: { propertyIDs: propertyId, startDate: stay.startDate, endDate: stay.endDate, rooms: 1, adults, children, detailedRates: true, pageSize: 100, pageNumber: 1 },
        }),
    ]);
    const targetRoomId = String(payload.roomId || payload.roomID || '');
    const conflicts = targetRoomId ? await findRoomConflicts(propertyId, targetRoomId, stay.startDate, stay.endDate, payload.excludeReservationId) : [];
    const availableIds = new Set(availableRooms.map((room) => room.id));
    const roomAvailable = targetRoomId
        ? (conflicts.length === 0 && (availableIds.has(targetRoomId) || String(payload.excludeReservationId || '').length > 0))
        : null;
    return {
        propertyId, ...stay, adults, children, inventory, availableRooms,
        availableRoomTypes: availabilityRoomTypes(availableTypesResult.payload),
        roomAvailable, conflicts,
    };
}

async function getCalendarData(payload = {}) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const inventory = await fetchAllPhysicalRooms(propertyId);
    const result = { propertyId, inventory, roomBlocks: [], sources: [] };
    try {
        const sources = await requestAcrossBases('/getSources', { query: { propertyIDs: propertyId } });
        result.sources = extractDataArray(sources.payload);
    } catch (error) { result.sourcesError = error.message; }
    try {
        const blocks = await requestAcrossBases('/getRoomBlocks', { query: { propertyID: propertyId, pageSize: 5000, pageNumber: 1 } });
        result.roomBlocks = extractDataArray(blocks.payload);
    } catch (error) { result.roomBlocksError = error.message; }
    return result;
}

async function getReservationDetails(reservationId, payload = {}) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const reservation = await getReservationRaw(propertyId, reservationId);
    let guest = null;
    const guestId = payload.guestId || payload.guestID || pick(reservation, ['guestID', 'guestId'], '');
    if (guestId) {
        try {
            const result = await requestAcrossBases('/getGuest', { query: { propertyID: propertyId, guestID: guestId, reservationID: reservationId } });
            guest = result.payload?.data || result.payload || null;
        } catch (error) { guest = null; }
    }
    return { reservation, assignments: reservationAssignments(reservation), guest };
}

async function updateReservation(reservationId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const id = requiredString(reservationId, 'reservationId');
    const current = await getReservationRaw(propertyId, id);
    const currentAssignments = reservationAssignments(current);
    const form = { propertyID: propertyId, reservationID: id };

    if (payload.arrivalTime !== undefined || payload.estimatedArrivalTime !== undefined) {
        form.estimatedArrivalTime = optionalTime(payload.arrivalTime ?? payload.estimatedArrivalTime) ?? '';
    }
    if (payload.status !== undefined) {
        const mapped = STATUS_MAP[String(payload.status).toLowerCase()];
        if (!mapped) { const error = new Error('Unsupported Cloudbeds reservation status.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
        form.status = mapped; form.sendStatusChangeEmail = Boolean(payload.sendStatusChangeEmail);
    }

    const wantsStart = payload.startDate !== undefined || payload.arrivalDate !== undefined;
    const wantsEnd = payload.endDate !== undefined || payload.departureDate !== undefined || payload.checkoutDate !== undefined;
    const wantsOccupancy = payload.adults !== undefined || payload.children !== undefined;
    const newStart = optionalDate(payload.startDate ?? payload.arrivalDate ?? current.startDate, 'startDate') || String(current.startDate || '').slice(0, 10);
    const newEnd = optionalDate(payload.endDate ?? payload.departureDate ?? payload.checkoutDate ?? current.endDate, 'endDate') || String(current.endDate || '').slice(0, 10);

    if (wantsStart || wantsEnd || wantsOccupancy) {
        validateStay(newStart, newEnd);
        for (const assignment of currentAssignments.filter((item) => item.roomId)) {
            const conflicts = await findRoomConflicts(propertyId, assignment.roomId, newStart, newEnd, id);
            if (conflicts.length) {
                const error = new Error(`Room ${assignment.roomNumber || assignment.roomId} is already occupied for part of the new stay.`);
                error.code = 'CLOUDBEDS_DATE_CONFLICT'; error.status = 409; error.details = { conflicts, room: assignment }; throw error;
            }
        }
        if (wantsEnd) form.checkoutDate = newEnd;
        if (wantsStart || wantsOccupancy) {
            if (!currentAssignments.length) {
                const error = new Error('Cloudbeds did not return the reservation room configuration needed to change the check-in date.');
                error.code = 'CLOUDBEDS_ROOM_CONFIGURATION_MISSING'; error.status = 409; throw error;
            }
            form.rooms = currentAssignments.map((assignment) => {
                const room = {
                    roomTypeID: requiredString(assignment.roomTypeId, 'roomTypeID'),
                    startDate: newStart,
                    endDate: newEnd,
                    adults: Math.max(1, Number(payload.adults ?? assignment.adults ?? 1)),
                    children: Math.max(0, Number(payload.children ?? assignment.children ?? 0)),
                };
                if (assignment.subReservationId) room.subReservationID = assignment.subReservationId;
                if (assignment.rateId) room.rateID = assignment.rateId;
                if (assignment.roomRate !== undefined && assignment.roomRate !== null && assignment.roomRate !== '') room.roomRate = assignment.roomRate;
                return room;
            });
        }
    }
    if (Array.isArray(payload.customFields)) form.customFields = payload.customFields;
    if (Array.isArray(payload.rooms) && payload.rooms.length) form.rooms = payload.rooms;
    if (Object.keys(form).length === 2) { const error = new Error('No supported reservation changes were supplied.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }

    const endpoint = '/putReservation';
    const result = await auditedWrite({ actor, operation: 'reservation.update', entityType: 'reservation', externalId: id, propertyId, endpoint, request: form },
        () => requestAcrossBases(endpoint, { method: 'PUT', form }));
    const verification = await verifyReservation(propertyId, id);
    if (verification.verified && (wantsStart || wantsEnd)) {
        const actualStart = String(verification.data?.startDate || '').slice(0, 10);
        const actualEnd = String(verification.data?.endDate || '').slice(0, 10);
        if ((wantsStart && actualStart !== newStart) || (wantsEnd && actualEnd !== newEnd)) {
            const error = new Error(`Cloudbeds accepted the request but the stay dates did not change to ${newStart} → ${newEnd}.`);
            error.code = 'CLOUDBEDS_RESERVATION_CHANGE_NOT_APPLIED'; error.status = 409;
            error.details = { expected: { startDate: newStart, endDate: newEnd }, actual: { startDate: actualStart, endDate: actualEnd } };
            throw error;
        }
    }
    return { synced: true, requestId: result.requestId, cloudbeds: result.payload, verification };
}

async function assignRoom(reservationId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const id = requiredString(reservationId, 'reservationId');
    const newRoomId = requiredString(payload.newRoomId || payload.newRoomID, 'newRoomId');
    const current = await getReservationRaw(propertyId, id);
    const assignments = reservationAssignments(current);
    const inventory = await fetchAllPhysicalRooms(propertyId);
    const target = inventory.find((room) => String(room.id) === String(newRoomId));
    if (!target) { const error = new Error('Target room was not found in the live Cloudbeds inventory.'); error.code = 'CLOUDBEDS_ROOM_NOT_FOUND'; error.status = 404; throw error; }
    const currentAssignment = assignments.find((item) => String(item.roomId) === String(payload.oldRoomId || payload.oldRoomID || '')) || assignments.find((item) => item.roomId) || assignments[0] || {};
    const startDate = String(current.startDate || currentAssignment.startDate || '').slice(0, 10);
    const endDate = String(current.endDate || currentAssignment.endDate || '').slice(0, 10);
    if (startDate && endDate && String(currentAssignment.roomId || '') !== String(newRoomId)) {
        const conflicts = await findRoomConflicts(propertyId, newRoomId, startDate, endDate, id);
        if (conflicts.length) { const error = new Error(`Room ${target.roomNumber || newRoomId} is not available for this stay.`); error.code = 'CLOUDBEDS_ROOM_NOT_AVAILABLE'; error.status = 409; error.details = { conflicts, room: target }; throw error; }
        const available = await fetchAllPhysicalRooms(propertyId, { startDate, endDate });
        if (!available.some((room) => String(room.id) === String(newRoomId))) {
            const error = new Error(`Room ${target.roomNumber || newRoomId} is not returned as available by Cloudbeds for ${startDate} → ${endDate}.`);
            error.code = 'CLOUDBEDS_ROOM_NOT_AVAILABLE'; error.status = 409; throw error;
        }
    }
    const form = {
        propertyID: propertyId,
        reservationID: id,
        newRoomID: newRoomId,
        roomTypeID: requiredString(payload.roomTypeId || payload.roomTypeID || target.roomTypeId, 'roomTypeID'),
        adjustPrice: Boolean(payload.adjustPrice),
    };
    if (currentAssignment.roomId && String(currentAssignment.roomId) !== String(newRoomId)) form.oldRoomID = String(currentAssignment.roomId);
    if (payload.subReservationId || payload.subReservationID || currentAssignment.subReservationId) form.subReservationID = String(payload.subReservationId || payload.subReservationID || currentAssignment.subReservationId);
    if (payload.reservationRoomId || payload.reservationRoomID || currentAssignment.reservationRoomId) form.reservationRoomID = String(payload.reservationRoomId || payload.reservationRoomID || currentAssignment.reservationRoomId);

    const endpoint = '/postRoomAssign';
    const result = await auditedWrite({ actor, operation: 'reservation.room_assign', entityType: 'reservation', externalId: id, propertyId, endpoint, request: form },
        () => requestAcrossBases(endpoint, { method: 'POST', form }));
    const verification = await verifyReservation(propertyId, id);
    if (verification.verified) {
        const applied = reservationAssignments(verification.data).some((item) => String(item.roomId) === String(newRoomId));
        if (!applied) {
            const error = new Error(`Cloudbeds returned success, but room ${target.roomNumber || newRoomId} is not assigned after verification.`);
            error.code = 'CLOUDBEDS_ROOM_ASSIGNMENT_NOT_APPLIED'; error.status = 409;
            error.details = { requestedRoom: target, currentAssignments: reservationAssignments(verification.data) };
            await writeAudit({ actor, operation: 'reservation.room_assign.verify', entityType: 'reservation', externalId: id, propertyId, endpoint: '/getReservation', request: { newRoomID: newRoomId }, status: 'failed', error });
            throw error;
        }
    }
    return { synced: true, requestId: result.requestId, cloudbeds: result.payload, verification, room: target };
}

async function updateGuest(guestId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const form = { propertyID: propertyId, guestID: requiredString(guestId, 'guestId') };
    const fields = {
        firstName: 'guestFirstName', lastName: 'guestLastName', gender: 'guestGender', email: 'guestEmail',
        phone: 'guestPhone', cellPhone: 'guestCellPhone', address1: 'guestAddress1', address2: 'guestAddress2',
        city: 'guestCity', country: 'guestCountry', nationality: 'guestNationality', state: 'guestState', zip: 'guestZip',
        birthday: 'guestBirthDate', birthDate: 'guestBirthDate', documentType: 'guestDocumentType', documentNumber: 'guestDocumentNumber',
        documentIssueDate: 'guestDocumentIssueDate', documentIssuingCountry: 'guestDocumentIssuingCountry',
        documentExpirationDate: 'guestDocumentExpirationDate',
    };
    Object.entries(fields).forEach(([inputKey, apiKey]) => { if (payload[inputKey] !== undefined) form[apiKey] = payload[inputKey] ?? ''; });
    if (Array.isArray(payload.customFields)) form.guestCustomFields = payload.customFields;
    if (Object.keys(form).length === 2) { const error = new Error('No supported guest changes were supplied.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    const endpoint = '/putGuest';
    const result = await auditedWrite({ actor, operation: 'guest.update', entityType: 'guest', externalId: guestId, propertyId, endpoint, request: form },
        () => requestAcrossBases(endpoint, { method: 'PUT', form }));
    let verification;
    try {
        const verify = await requestAcrossBases('/getGuest', { query: { propertyID: propertyId, guestID: guestId } });
        verification = { verified: true, data: verify.payload?.data || verify.payload };
    } catch (error) { verification = { verified: false, verificationError: error.message }; }
    return { synced: true, requestId: result.requestId, cloudbeds: result.payload, verification };
}

async function createReservation(payload, actor) {
    await ensureTables();
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const { startDate, endDate } = validateStay(payload.startDate, payload.endDate);
    const roomId = requiredString(payload.roomId || payload.roomID, 'roomId');
    const adults = Math.max(1, Number(payload.adults || 1));
    const children = Math.max(0, Number(payload.children || 0));
    const requestKey = String(payload.requestKey || `sem-${crypto.randomUUID()}`).slice(0, 96);

    const existingGuard = await db.query(`SELECT reservation_id, status FROM cloudbeds_reservation_create_guard WHERE request_key = ? LIMIT 1`, [requestKey]);
    if (existingGuard[0]?.reservation_id) {
        return { synced: true, idempotentReplay: true, reservationId: String(existingGuard[0].reservation_id) };
    }

    const availability = await getAvailability({ propertyId, startDate, endDate, adults, children, roomId });
    const target = availability.inventory.find((room) => String(room.id) === String(roomId));
    if (!target) { const error = new Error('Selected room does not exist in Cloudbeds.'); error.code = 'CLOUDBEDS_ROOM_NOT_FOUND'; error.status = 404; throw error; }
    if (!availability.roomAvailable || !availability.availableRooms.some((room) => String(room.id) === String(roomId))) {
        const error = new Error(`Room ${target.roomNumber || roomId} is already occupied or blocked for the selected dates.`);
        error.code = 'CLOUDBEDS_ROOM_NOT_AVAILABLE'; error.status = 409; error.details = { conflicts: availability.conflicts, room: target, startDate, endDate }; throw error;
    }

    await db.query(
        `INSERT INTO cloudbeds_reservation_create_guard (request_key, property_id, room_id, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, 'started')
         ON DUPLICATE KEY UPDATE updated_at = NOW()`,
        [requestKey, propertyId, roomId, startDate, endDate]
    );

    const roomTypeId = requiredString(payload.roomTypeId || payload.roomTypeID || target.roomTypeId, 'roomTypeID');
    const roomLine = { roomTypeID: roomTypeId, quantity: 1 };
    if (payload.rateId || payload.rateID) roomLine.rateID = String(payload.rateId || payload.rateID);
    if (payload.roomRate !== undefined && payload.roomRate !== '') roomLine.roomRate = Number(payload.roomRate);
    const form = {
        propertyID: propertyId,
        startDate,
        endDate,
        guestFirstName: requiredString(payload.firstName || payload.guestFirstName, 'guestFirstName'),
        guestLastName: requiredString(payload.lastName || payload.guestLastName, 'guestLastName'),
        guestCountry: String(payload.country || payload.guestCountry || 'GR').toUpperCase().slice(0, 2),
        guestZip: String(payload.zip || payload.guestZip || ''),
        guestEmail: requiredString(payload.email || payload.guestEmail, 'guestEmail'),
        guestPhone: String(payload.phone || payload.guestPhone || ''),
        rooms: [roomLine],
        adults: [{ roomTypeID: roomTypeId, quantity: adults }],
        children: [{ roomTypeID: roomTypeId, quantity: children }],
        sendEmailConfirmation: payload.sendEmailConfirmation !== false,
    };
    if (payload.nationality || payload.guestNationality) form.guestNationality = String(payload.nationality || payload.guestNationality).toUpperCase().slice(0, 2);
    if (payload.arrivalTime || payload.estimatedArrivalTime) form.estimatedArrivalTime = optionalTime(payload.arrivalTime || payload.estimatedArrivalTime);
    if (payload.sourceId || payload.sourceID) form.sourceID = String(payload.sourceId || payload.sourceID);
    if (payload.thirdPartyIdentifier) form.thirdPartyIdentifier = String(payload.thirdPartyIdentifier);
    if (payload.paymentMethod) form.paymentMethod = String(payload.paymentMethod);
    if (Array.isArray(payload.customFields)) form.customFields = payload.customFields;

    const endpoint = '/postReservation';
    let created;
    try {
        created = await auditedWrite({ actor, operation: 'reservation.create', entityType: 'reservation', externalId: null, propertyId, endpoint, request: form },
            () => requestAcrossBases(endpoint, { method: 'POST', form }));
    } catch (error) {
        await db.query(`UPDATE cloudbeds_reservation_create_guard SET status = 'failed' WHERE request_key = ?`, [requestKey]);
        throw error;
    }
    const reservationId = String(created.payload?.reservationID || created.payload?.data?.reservationID || created.payload?.id || '');
    if (!reservationId) {
        const error = new Error('Cloudbeds created a reservation but did not return a reservation ID.');
        error.code = 'CLOUDBEDS_RESERVATION_ID_MISSING'; error.status = 502; throw error;
    }
    await db.query(`UPDATE cloudbeds_reservation_create_guard SET reservation_id = ?, status = 'created' WHERE request_key = ?`, [reservationId, requestKey]);

    let assignment = null;
    let assignmentError = null;
    try {
        assignment = await assignRoom(reservationId, { propertyId, newRoomId: roomId, roomTypeId, adjustPrice: Boolean(payload.adjustPrice) }, actor);
        await db.query(`UPDATE cloudbeds_reservation_create_guard SET status = 'completed' WHERE request_key = ?`, [requestKey]);
    } catch (error) {
        assignmentError = { code: error.code, message: error.message, requestId: error.requestId || null };
        await db.query(`UPDATE cloudbeds_reservation_create_guard SET status = 'created_unassigned' WHERE request_key = ?`, [requestKey]);
    }
    return {
        synced: true,
        reservationId,
        requestKey,
        partial: Boolean(assignmentError),
        assignment,
        assignmentError,
        cloudbeds: created.payload,
        verification: await verifyReservation(propertyId, reservationId),
    };
}

async function updateHousekeeping(roomId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const form = { propertyID: propertyId, roomID: requiredString(roomId, 'roomId') };
    if (payload.roomCondition !== undefined) {
        const condition = String(payload.roomCondition || '').toLowerCase();
        if (!['dirty', 'clean', 'inspected'].includes(condition)) { const error = new Error('roomCondition must be dirty, clean or inspected.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
        form.roomCondition = condition;
    }
    ['doNotDisturb', 'refusedService', 'vacantPickup'].forEach((key) => { if (payload[key] !== undefined) form[key] = Boolean(payload[key]); });
    if (payload.roomComments !== undefined || payload.comments !== undefined) form.roomComments = String(payload.roomComments ?? payload.comments ?? '').slice(0, 2000);
    if (Object.keys(form).length === 2) { const error = new Error('No housekeeping changes were supplied.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    const endpoint = '/postHousekeepingStatus';
    const result = await auditedWrite({ actor, operation: 'housekeeping.update', entityType: 'room', externalId: roomId, propertyId, endpoint, request: form },
        () => requestAcrossBases(endpoint, { method: 'POST', form }));
    return { synced: true, requestId: result.requestId, cloudbeds: result.payload };
}

async function listRoomBlocks(propertyId) {
    const resolvedPropertyId = requiredString(propertyId, 'propertyId');
    const result = await requestAcrossBases('/getRoomBlocks', { query: { propertyID: resolvedPropertyId, pageSize: 5000, pageNumber: 1 } });
    return result.payload;
}
function normalizeBlockRooms(rooms) {
    if (!Array.isArray(rooms) || !rooms.length) { const error = new Error('At least one room is required for a room block.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    return rooms.map((room) => ({ roomID: requiredString(room.roomID || room.roomId || room.id, 'roomId'), ...(room.roomTypeID || room.roomTypeId ? { roomTypeID: String(room.roomTypeID || room.roomTypeId) } : {}) }));
}
async function createRoomBlock(payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const rawType = String(payload.roomBlockType || 'out_of_service');
    const type = rawType === 'blocked_dates' ? 'blocked' : rawType;
    if (!['blocked', 'out_of_service', 'courtesy_hold'].includes(type)) { const error = new Error('Unsupported room block type.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    const form = { propertyID: propertyId, roomBlockType: type, roomBlockReason: requiredString(payload.roomBlockReason || payload.reason, 'roomBlockReason'), startDate: optionalDate(payload.startDate, 'startDate'), endDate: optionalDate(payload.endDate, 'endDate'), rooms: normalizeBlockRooms(payload.rooms) };
    if (!form.startDate || !form.endDate) { const error = new Error('startDate and endDate are required.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    ['firstName', 'lastName', 'email', 'phone', 'lengthOfHoldInHours'].forEach((key) => { if (payload[key] !== undefined && payload[key] !== '') form[key] = payload[key]; });
    const endpoint = '/postRoomBlock';
    const result = await auditedWrite({ actor, operation: 'roomblock.create', entityType: 'roomblock', externalId: null, propertyId, endpoint, request: form }, () => requestAcrossBases(endpoint, { method: 'POST', form }));
    return { synced: true, requestId: result.requestId, cloudbeds: result.payload };
}
async function updateRoomBlock(roomBlockId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const form = { propertyID: propertyId, roomBlockID: requiredString(roomBlockId, 'roomBlockId') };
    if (payload.roomBlockReason !== undefined || payload.reason !== undefined) form.roomBlockReason = String(payload.roomBlockReason ?? payload.reason ?? '');
    if (payload.startDate !== undefined) form.startDate = optionalDate(payload.startDate, 'startDate') ?? '';
    if (payload.endDate !== undefined) form.endDate = optionalDate(payload.endDate, 'endDate') ?? '';
    if (payload.rooms !== undefined) form.rooms = normalizeBlockRooms(payload.rooms);
    ['firstName', 'lastName', 'email', 'phone', 'lengthOfHoldInHours'].forEach((key) => { if (payload[key] !== undefined) form[key] = payload[key] ?? ''; });
    const endpoint = '/putRoomBlock';
    const result = await auditedWrite({ actor, operation: 'roomblock.update', entityType: 'roomblock', externalId: roomBlockId, propertyId, endpoint, request: form }, () => requestAcrossBases(endpoint, { method: 'PUT', form }));
    return { synced: true, requestId: result.requestId, cloudbeds: result.payload };
}

async function getReferenceData(payload = {}) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const result = {}; const failures = {};
    const call = async (key, path, query = {}) => {
        try { const response = await requestAcrossBases(path, { query: { propertyID: propertyId, ...query } }); result[key] = response.payload?.data ?? response.payload; }
        catch (error) { failures[key] = error.message; }
    };
    await Promise.all([
        call('taxesAndFees', '/getTaxesAndFees'),
        call('items', '/getItems', { pageSize: 500, pageNumber: 1 }),
        call('currency', '/getCurrencySettings'),
        call('sources', '/getSources', { propertyIDs: propertyId }),
        payload.startDate && payload.endDate ? call('ratePlans', '/getRatePlans', { propertyIDs: propertyId, startDate: payload.startDate, endDate: payload.endDate, adults: payload.adults || 1, children: payload.children || 0, detailedRates: true, pageSize: 100, pageNumber: 1 }) : Promise.resolve(),
    ]);
    return { propertyId, data: result, failures };
}

async function postCustomCharge(reservationId, payload, actor) {
    const propertyId = requiredString(payload.propertyId || payload.propertyID, 'propertyId');
    const itemName = requiredString(payload.itemName || payload.name, 'itemName');
    const itemCategoryName = requiredString(payload.itemCategoryName || payload.category || 'SEM Services', 'itemCategoryName');
    const itemPrice = Number(payload.itemPrice ?? payload.price);
    if (!Number.isFinite(itemPrice) || itemPrice < 0) { const error = new Error('itemPrice must be a valid non-negative number.'); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; }
    const item = { itemName, itemCategoryName, itemPrice, itemQuantity: Math.max(1, Number(payload.itemQuantity || payload.quantity || 1)) };
    if (payload.itemNote || payload.note) item.itemNote = String(payload.itemNote || payload.note).slice(0, 1000);
    if (payload.taxes) item.taxes = payload.taxes;
    const form = { propertyID: propertyId, reservationID: requiredString(reservationId, 'reservationId'), referenceID: payload.referenceId || payload.referenceID || `sem-${reservationId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, items: [item], itemPaid: false };
    if (payload.roomId || payload.roomID) form.roomID = String(payload.roomId || payload.roomID);
    if (payload.subReservationId || payload.subReservationID) form.subReservationID = String(payload.subReservationId || payload.subReservationID);
    if (payload.guestId || payload.guestID) form.guestID = String(payload.guestId || payload.guestID);
    const endpoint = '/postCustomItem';
    const result = await auditedWrite({ actor, operation: 'folio.custom_item', entityType: 'reservation', externalId: reservationId, propertyId, endpoint, request: form }, () => requestAcrossBases(endpoint, { method: 'POST', form }));
    return { synced: true, requestId: result.requestId, referenceId: form.referenceID, cloudbeds: result.payload };
}

async function getAudit(limit = 100) {
    await ensureTables();
    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    return db.query(`SELECT id, actor_user_id AS actorUserId, actor_role AS actorRole, operation, entity_type AS entityType, external_id AS externalId, property_id AS propertyId, endpoint, status, error_message AS errorMessage, request_id AS requestId, created_at AS createdAt FROM cloudbeds_write_audit ORDER BY id DESC LIMIT ${safeLimit}`);
}

async function recordWebhookEvent(payload = {}) {
    await ensureTables();
    const eventName = String(payload.event || payload.eventName || payload.type || 'unknown');
    const propertyId = payload.propertyId || payload.propertyID || null;
    const externalId = payload.reservationId || payload.reservationID || payload.roomId || payload.roomID || payload.roomBlockId || payload.roomBlockID || payload.guestId || payload.guestID || null;
    await db.query(`INSERT INTO integration_webhook_events (provider, event_name, property_id, external_id, payload_json) VALUES (?, ?, ?, ?, ?)`, [PROVIDER, eventName, propertyId ? String(propertyId) : null, externalId ? String(externalId) : null, safeJson(payload)]);
    await db.query(`UPDATE integration_credentials SET last_webhook_at = NOW() WHERE provider = ? AND environment = ?`, [PROVIDER, ENVIRONMENT]);
    return { eventName, propertyId, externalId };
}

function getCapabilities() {
    return {
        provider: PROVIDER, environment: ENVIRONMENT, authScopes: FULL_AUTH_SCOPES,
        writes: {
            reservations: ['create', 'status', 'estimatedArrivalTime', 'checkInDate', 'checkOutDate', 'guestCounts', 'customFields', 'roomConfiguration'],
            roomAssignment: true, guests: true,
            housekeeping: ['dirty', 'clean', 'inspected', 'doNotDisturb', 'refusedService', 'vacantPickup', 'comments'],
            roomBlocks: ['blocked', 'out_of_service', 'courtesy_hold'], customFolioItems: true,
            paymentWrite: false, deleteOperations: false,
        },
        reads: ['availability', 'calendarInventory', 'reservations', 'guests', 'rooms', 'housekeeping', 'dashboard', 'rates', 'sources', 'items', 'currency', 'payments', 'taxesAndFees'],
    };
}

async function createAuthorizationUrl() {
    await ensureTables();
    const clientId = process.env.CLOUDBEDS_CLIENT_ID;
    const clientSecret = process.env.CLOUDBEDS_CLIENT_SECRET;
    if (!clientId || !clientSecret || !REDIRECT_URI) { const error = new Error('Cloudbeds client credentials are not configured on the server.'); error.code = 'CLOUDBEDS_CONFIG_MISSING'; error.status = 500; throw error; }
    await db.query(`DELETE FROM integration_auth_states WHERE provider = ? AND environment = ? AND expires_at < NOW()`, [PROVIDER, ENVIRONMENT]);
    const state = crypto.randomBytes(32).toString('hex');
    const stateHash = crypto.createHash('sha256').update(state).digest('hex');
    const expiresAt = new Date(Date.now() + AUTH_STATE_TTL_MINUTES * 60 * 1000);
    await db.query(`INSERT INTO integration_auth_states (state_hash, provider, environment, created_at, expires_at) VALUES (?, ?, ?, NOW(), ?)`, [stateHash, PROVIDER, ENVIRONMENT, expiresAt]);
    const url = new URL(`${AUTH_BASE}/oauth`);
    url.searchParams.set('client_id', clientId); url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('response_type', 'code'); url.searchParams.set('scope', FULL_AUTH_SCOPES.join(' ')); url.searchParams.set('state', state);
    return { url: url.toString(), state, scopes: FULL_AUTH_SCOPES };
}

module.exports = {
    FULL_AUTH_SCOPES, FRONTEND_URL, createAuthorizationUrl, getCapabilities,
    getReferenceData, getAvailability, getCalendarData, getReservationDetails,
    createReservation, updateReservation, assignRoom, updateGuest, updateHousekeeping,
    listRoomBlocks, createRoomBlock, updateRoomBlock, postCustomCharge,
    getAudit, recordWebhookEvent,
};
