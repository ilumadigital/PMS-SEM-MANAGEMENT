const crypto = require('crypto');
const db = require('../config/db');
const operations = require('./cloudbedsOperations.service');

const PROVIDER = 'cloudbeds';
const ENVIRONMENT = process.env.CLOUDBEDS_ENVIRONMENT || 'sandbox';
const API_BASE = (process.env.CLOUDBEDS_API_BASE || 'https://api.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const AUTH_BASE = (process.env.CLOUDBEDS_AUTH_BASE || 'https://hotels.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const PAYMENT_METHODS = new Set(['cash', 'credit', 'ebanking', 'pay_pal']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const asArray = (value) => value ? (Array.isArray(value) ? value : [value]) : [];

let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;
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

async function getApiKey() {
    const rows = await db.query(
        `SELECT * FROM integration_credentials WHERE provider = ? AND environment = ? LIMIT 1`,
        [PROVIDER, ENVIRONMENT]
    );
    if (rows[0]) return decryptSecret(rows[0]);

    const allowEnvApiKey = String(process.env.CLOUDBEDS_ALLOW_ENV_API_KEY || 'false') === 'true';
    if (allowEnvApiKey && process.env.CLOUDBEDS_API_KEY) return process.env.CLOUDBEDS_API_KEY.trim();

    const error = new Error('Cloudbeds is not connected. Re-authorize the property first.');
    error.code = 'CLOUDBEDS_NOT_CONNECTED';
    error.status = 409;
    throw error;
}

function required(value, name) {
    const text = String(value ?? '').trim();
    if (!text) {
        const error = new Error(`${name} is required to create a Cloudbeds reservation.`);
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }
    return text;
}

function normalizeDate(value, name) {
    const text = required(value, name).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const error = new Error(`${name} must use YYYY-MM-DD format.`);
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }
    return text;
}

function normalizeTime(value) {
    if (value === undefined || value === null || value === '') return null;
    const text = String(value).slice(0, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
        const error = new Error('Arrival time must use HH:MM format.');
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }
    return text;
}

function pick(object, keys, fallback = null) {
    for (const key of keys) {
        const value = String(key).split('.').reduce((current, part) => current?.[part], object);
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
}

function safeJson(value) {
    try { return JSON.stringify(value ?? null); }
    catch { return JSON.stringify({ serializationError: true }); }
}

function appendForm(params, key, value) {
    if (value === undefined || value === null) return;
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

function buildForm(form) {
    const params = new URLSearchParams();
    Object.entries(form || {}).forEach(([key, value]) => appendForm(params, key, value));
    return params.toString();
}

function sanitizeCloudbedsPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload || null;
    const clone = { ...payload };
    delete clone.cardToken;
    delete clone.paymentAuthorizationCode;
    return clone;
}

async function apiRequest(path, { apiKey, baseUrl, method = 'GET', query, form } = {}) {
    const base = String(baseUrl || API_BASE).replace(/\/$/, '');
    const url = new URL(`${base}${path}`);
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });

    const headers = { Accept: 'application/json' };
    if (apiKey) {
        headers['x-api-key'] = apiKey;
        headers.Authorization = `Bearer ${apiKey}`;
    }
    const request = { method, headers, cache: 'no-store' };
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
            payload?.message || payload?.error_description || payload?.error ||
            `Cloudbeds API request failed with HTTP ${response.status}`
        );
        error.status = response.status || 502;
        error.code = payload?.errorCode || payload?.code || 'CLOUDBEDS_RESERVATION_CREATE_FAILED';
        error.requestId = response.headers.get('x-request-id') || null;
        error.details = {
            stage: path === '/postReservation' ? 'postReservation' : 'cloudbedsReadback',
            cloudbeds: sanitizeCloudbedsPayload(payload),
        };
        throw error;
    }

    return {
        payload,
        requestId: response.headers.get('x-request-id') || null,
        apiBase: base,
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
            console.warn('[CLOUDBEDS RESERVATION CREATE] metadata lookup failed:', metadataBase, error.message);
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
            return await apiRequest(path, { ...options, apiKey, baseUrl });
        } catch (error) {
            firstError = firstError || error;
            if (![401, 403, 404].includes(Number(error.status))) throw error;
        }
    }

    throw firstError || new Error(`Cloudbeds endpoint ${path} is unavailable.`);
}

async function audit({ actor, reservationId, propertyId, endpoint, request, response, status, error, requestId }) {
    try {
        await ensureTables();
        await db.query(
            `INSERT INTO cloudbeds_write_audit
              (actor_user_id, actor_role, operation, entity_type, external_id, property_id, endpoint,
               request_json, response_json, status, error_message, request_id)
             VALUES (?, ?, 'reservation.create.v2', 'reservation', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                actor?.userId || actor?.id || null,
                actor?.role || null,
                reservationId || null,
                propertyId || null,
                endpoint,
                safeJson(request),
                response === undefined ? null : safeJson(sanitizeCloudbedsPayload(response)),
                status,
                error?.message || null,
                requestId || error?.requestId || null,
            ]
        );
    } catch (auditError) {
        console.error('[CLOUDBEDS RESERVATION CREATE AUDIT]', auditError.message);
    }
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
        subReservationId: String(pick(room, ['subReservationID', 'subReservationId'], '') || ''),
        reservationRoomId: String(pick(room, ['reservationRoomID', 'reservationRoomId'], '') || ''),
    }));
}

async function readReservation(propertyId, reservationId) {
    const response = await requestAcrossBases('/getReservation', {
        query: { propertyID: propertyId, reservationID: reservationId, includeGuestRequirements: true },
    });
    return response.payload?.data || response.payload || {};
}

async function verifyReservation(propertyId, reservationId, roomId) {
    const delays = [0, 300, 800, 1600];
    let lastError = null;
    for (const delay of delays) {
        if (delay) await sleep(delay);
        try {
            const reservation = await readReservation(propertyId, reservationId);
            const assignments = reservationAssignments(reservation);
            return {
                verified: true,
                physicalRoomVerified: assignments.some((item) => String(item.roomId) === String(roomId)),
                reservation,
                assignments,
            };
        } catch (error) {
            lastError = error;
            if (![400, 404].includes(Number(error.status))) break;
        }
    }
    return {
        verified: false,
        physicalRoomVerified: false,
        verificationError: lastError?.message || 'Cloudbeds reservation read-back is not available yet.',
        assignments: [],
    };
}

function reservationIdFrom(payload) {
    return String(
        payload?.reservationID ||
        payload?.reservationId ||
        payload?.data?.reservationID ||
        payload?.data?.reservationId ||
        payload?.data?.id ||
        payload?.id ||
        ''
    ).trim();
}

function normalizePaymentMethod(value) {
    const method = String(value || 'cash').trim().toLowerCase();
    if (!PAYMENT_METHODS.has(method)) {
        const error = new Error('Payment method must be cash, credit, ebanking or pay_pal.');
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }
    return method;
}

async function createReservation(payload = {}, actor = {}) {
    await ensureTables();

    const propertyId = required(payload.propertyId || payload.propertyID, 'propertyId');
    const startDate = normalizeDate(payload.startDate, 'startDate');
    const endDate = normalizeDate(payload.endDate, 'endDate');
    if (startDate >= endDate) {
        const error = new Error('Check-out must be after check-in.');
        error.code = 'INVALID_STAY_DATES';
        error.status = 400;
        throw error;
    }

    const roomId = required(payload.roomId || payload.roomID, 'roomId');
    const firstName = required(payload.firstName || payload.guestFirstName, 'guestFirstName');
    const lastName = required(payload.lastName || payload.guestLastName, 'guestLastName');
    const email = required(payload.email || payload.guestEmail, 'guestEmail');
    const guestZip = required(payload.zip || payload.guestZip, 'guestZip');
    const guestCountry = required(payload.country || payload.guestCountry || 'GR', 'guestCountry').toUpperCase().slice(0, 2);
    const guestNationality = String(payload.nationality || payload.guestNationality || guestCountry).toUpperCase().slice(0, 2);
    const paymentMethod = normalizePaymentMethod(payload.paymentMethod);
    const adults = Math.max(1, Number(payload.adults || 1));
    const children = Math.max(0, Number(payload.children || 0));
    const requestKey = String(payload.requestKey || `sem-${crypto.randomUUID()}`).slice(0, 96);

    const existing = await db.query(
        `SELECT reservation_id, status FROM cloudbeds_reservation_create_guard WHERE request_key = ? LIMIT 1`,
        [requestKey]
    );
    if (existing[0]?.reservation_id) {
        const reservationId = String(existing[0].reservation_id);
        const verification = await verifyReservation(propertyId, reservationId, roomId);
        return {
            synced: true,
            idempotentReplay: true,
            reservationId,
            requestKey,
            partial: !verification.physicalRoomVerified,
            physicalRoomVerified: verification.physicalRoomVerified,
            verification,
        };
    }

    // The green room badge in the UI is only advisory. Recheck immediately before
    // POST so a concurrent booking can never slip through between selection/create.
    const availability = await operations.getAvailability({
        propertyId,
        startDate,
        endDate,
        adults,
        children,
        roomId,
    });
    const target = (availability.inventory || []).find((room) => String(room.id) === String(roomId));
    if (!target) {
        const error = new Error('Selected physical room no longer exists in the live Cloudbeds inventory.');
        error.code = 'CLOUDBEDS_ROOM_NOT_FOUND';
        error.status = 404;
        throw error;
    }
    if (!availability.roomAvailable || !(availability.availableRooms || []).some((room) => String(room.id) === String(roomId))) {
        const error = new Error(`Room ${target.roomNumber || roomId} is no longer available for ${startDate} → ${endDate}. Refresh and choose another room.`);
        error.code = 'CLOUDBEDS_ROOM_NOT_AVAILABLE';
        error.status = 409;
        error.details = { stage: 'availability', conflicts: availability.conflicts || [], room: target };
        throw error;
    }

    const roomTypeId = required(payload.roomTypeId || payload.roomTypeID || target.roomTypeId, 'roomTypeID');
    const roomTypeAvailability = (availability.availableRoomTypes || []).find((item) => String(item.roomTypeId) === String(roomTypeId));
    if ((availability.availableRoomTypes || []).length > 0 && (!roomTypeAvailability || Number(roomTypeAvailability.roomsAvailable || 0) < 1)) {
        const error = new Error(`Cloudbeds reports no sellable inventory for room type ${target.roomType || roomTypeId} on these dates.`);
        error.code = 'CLOUDBEDS_ROOM_TYPE_NOT_AVAILABLE';
        error.status = 409;
        error.details = { stage: 'roomTypeAvailability', room: target, availableRoomTypes: availability.availableRoomTypes };
        throw error;
    }

    await db.query(
        `INSERT INTO cloudbeds_reservation_create_guard
            (request_key, property_id, room_id, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, 'started')
         ON DUPLICATE KEY UPDATE updated_at = NOW(), status = IF(reservation_id IS NULL, 'started', status)`,
        [requestKey, propertyId, roomId, startDate, endDate]
    );

    // Cloudbeds v1.3 supports roomID directly inside rooms/adults/children. Using it
    // here creates the reservation and requested physical-room relationship in the
    // same operation instead of first creating a room-type booking and racing a
    // second assignment request afterwards.
    const roomLine = { roomTypeID: roomTypeId, roomID: roomId, quantity: 1 };
    const suppliedRateId = payload.roomRateId || payload.roomRateID || payload.rateId || payload.rateID;
    if (suppliedRateId) roomLine.roomRateID = String(suppliedRateId);

    const form = {
        propertyID: propertyId,
        startDate,
        endDate,
        guestFirstName: firstName,
        guestLastName: lastName,
        guestCountry,
        guestNationality,
        guestZip,
        guestEmail: email,
        rooms: [roomLine],
        adults: [{ roomTypeID: roomTypeId, roomID: roomId, quantity: adults }],
        children: [{ roomTypeID: roomTypeId, roomID: roomId, quantity: children }],
        paymentMethod,
        sendEmailConfirmation: payload.sendEmailConfirmation !== false,
    };

    const phone = String(payload.phone || payload.guestPhone || '').trim();
    if (phone) form.guestPhone = phone;
    const arrivalTime = normalizeTime(payload.arrivalTime || payload.estimatedArrivalTime);
    if (arrivalTime) form.estimatedArrivalTime = arrivalTime;
    if (payload.sourceId || payload.sourceID) form.sourceID = String(payload.sourceId || payload.sourceID);
    if (payload.thirdPartyIdentifier) form.thirdPartyIdentifier = String(payload.thirdPartyIdentifier);
    if (Array.isArray(payload.customFields) && payload.customFields.length) form.customFields = payload.customFields;

    let created;
    try {
        created = await requestAcrossBases('/postReservation', { method: 'POST', form });
        await audit({
            actor,
            reservationId: null,
            propertyId,
            endpoint: '/postReservation',
            request: form,
            response: created.payload,
            status: 'synced',
            requestId: created.requestId,
        });
    } catch (error) {
        await db.query(
            `UPDATE cloudbeds_reservation_create_guard SET status = 'failed' WHERE request_key = ? AND reservation_id IS NULL`,
            [requestKey]
        );
        if ([401, 403].includes(Number(error.status))) {
            error.code = 'CLOUDBEDS_RESERVATION_WRITE_PERMISSION_REQUIRED';
            error.message = 'Cloudbeds rejected reservation creation. Re-authorize the integration with write:reservation permission.';
        }
        await audit({
            actor,
            reservationId: null,
            propertyId,
            endpoint: '/postReservation',
            request: form,
            status: 'failed',
            error,
        });
        throw error;
    }

    const reservationId = reservationIdFrom(created.payload);
    if (!reservationId) {
        const error = new Error('Cloudbeds accepted the create request but did not return a reservation ID. Do not submit again until the audit is checked.');
        error.code = 'CLOUDBEDS_RESERVATION_ID_MISSING';
        error.status = 502;
        error.requestId = created.requestId || null;
        error.details = { stage: 'postReservationResponse', cloudbeds: sanitizeCloudbedsPayload(created.payload) };
        await db.query(`UPDATE cloudbeds_reservation_create_guard SET status = 'response_missing_id' WHERE request_key = ?`, [requestKey]);
        throw error;
    }

    await db.query(
        `UPDATE cloudbeds_reservation_create_guard SET reservation_id = ?, status = 'created' WHERE request_key = ?`,
        [reservationId, requestKey]
    );

    const verification = await verifyReservation(propertyId, reservationId, roomId);
    await db.query(
        `UPDATE cloudbeds_reservation_create_guard SET status = ? WHERE request_key = ?`,
        [verification.physicalRoomVerified ? 'completed' : 'created_unassigned', requestKey]
    );

    return {
        synced: true,
        reservationId,
        requestKey,
        physicalRoomVerified: verification.physicalRoomVerified,
        partial: !verification.physicalRoomVerified,
        room: target,
        roomTypeId,
        paymentMethod,
        verification,
        cloudbeds: sanitizeCloudbedsPayload(created.payload),
        requestId: created.requestId || null,
    };
}

module.exports = { createReservation };
