const crypto = require('crypto');
const db = require('../config/db');

const PROVIDER = 'cloudbeds';
const ENVIRONMENT = process.env.CLOUDBEDS_ENVIRONMENT || 'sandbox';
const API_BASE = (process.env.CLOUDBEDS_API_BASE || 'https://api.cloudbeds.com/api/v1.3').replace(/\/$/, '');
const AUTH_BASE = (process.env.CLOUDBEDS_AUTH_BASE || 'https://hotels.cloudbeds.com/api/v1.3').replace(/\/$/, '');

let auditReady = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const asArray = (value) => value ? (Array.isArray(value) ? value : [value]) : [];

function pick(object, keys, fallback = null) {
    for (const key of keys) {
        const value = String(key).split('.').reduce((current, part) => current?.[part], object);
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
}

function required(value, name) {
    const text = String(value || '').trim();
    if (!text) {
        const error = new Error(`${name} is required.`);
        error.code = 'VALIDATION_ERROR';
        error.status = 400;
        throw error;
    }
    return text;
}

function safeJson(value) {
    try { return JSON.stringify(value ?? null); }
    catch { return JSON.stringify({ serializationError: true }); }
}

async function ensureAuditTable() {
    if (auditReady) return;
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
    auditReady = true;
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

function buildForm(form = {}) {
    const body = new URLSearchParams();
    Object.entries(form).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        body.append(key, typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value));
    });
    return body.toString();
}

async function apiRequest(path, { apiKey, baseUrl, method = 'GET', query, form } = {}) {
    const url = new URL(`${String(baseUrl || API_BASE).replace(/\/$/, '')}${path}`);
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
        apiBase: String(baseUrl || API_BASE).replace(/\/$/, ''),
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
            console.warn('[CLOUDBEDS ROOM ASSIGN] metadata lookup failed:', metadataBase, error.message);
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

async function audit({ actor, operation, reservationId, propertyId, endpoint, request, response, status, error, requestId }) {
    try {
        await ensureAuditTable();
        await db.query(
            `INSERT INTO cloudbeds_write_audit
              (actor_user_id, actor_role, operation, entity_type, external_id, property_id, endpoint,
               request_json, response_json, status, error_message, request_id)
             VALUES (?, ?, ?, 'reservation', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                actor?.userId || actor?.id || null,
                actor?.role || null,
                operation,
                reservationId,
                propertyId,
                endpoint,
                safeJson(request),
                response === undefined ? null : safeJson(response),
                status,
                error?.message || null,
                requestId || error?.requestId || null,
            ]
        );
    } catch (auditError) {
        console.error('[CLOUDBEDS ROOM ASSIGN AUDIT]', auditError.message);
    }
}

function extractDataArray(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.data)) return payload.data.data;
    if (Array.isArray(payload?.results)) return payload.results;
    return [];
}

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
    })).filter((room, index, all) => {
        const key = `${room.subReservationId}|${room.roomId}|${room.roomTypeId}|${room.startDate}|${room.endDate}`;
        return all.findIndex((candidate) =>
            `${candidate.subReservationId}|${candidate.roomId}|${candidate.roomTypeId}|${candidate.startDate}|${candidate.endDate}` === key
        ) === index;
    });
}

async function getReservation(propertyId, reservationId) {
    const response = await requestAcrossBases('/getReservation', {
        query: {
            propertyID: propertyId,
            reservationID: reservationId,
            includeGuestRequirements: true,
        },
    });
    return response.payload?.data || response.payload || {};
}

async function getReservationRoomDetails(propertyId, subReservationId) {
    if (!subReservationId) return null;
    try {
        const response = await requestAcrossBases('/getReservationRoomDetails', {
            query: { propertyID: propertyId, subReservationID: subReservationId },
        });
        return response.payload?.data || response.payload || null;
    } catch (error) {
        if ([400, 404].includes(Number(error.status))) return null;
        throw error;
    }
}

async function getInventory(propertyId, startDate, endDate) {
    const query = { propertyIDs: propertyId, pageSize: 500, pageNumber: 1, includeRoomRelations: 1 };
    if (startDate && endDate) {
        query.startDate = startDate;
        query.endDate = endDate;
    }
    const response = await requestAcrossBases('/getRooms', { query });
    return flattenRooms(response.payload);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
    return Boolean(aStart && aEnd && bStart && bEnd && aStart < bEnd && bStart < aEnd);
}

async function findConflicts(propertyId, roomId, startDate, endDate, reservationId) {
    if (!roomId || !startDate || !endDate) return [];
    const rows = [];
    for (const status of ['confirmed', 'checked_in', 'not_confirmed']) {
        try {
            const response = await requestAcrossBases('/getReservations', {
                query: {
                    propertyID: propertyId,
                    roomID: roomId,
                    status,
                    includeAllRooms: true,
                    pageSize: 100,
                    pageNumber: 1,
                },
            });
            rows.push(...extractDataArray(response.payload));
        } catch (error) {
            if (![400, 404].includes(Number(error.status))) throw error;
        }
    }

    const seen = new Set();
    return rows.filter((reservation) => {
        const id = String(pick(reservation, ['reservationID', 'reservationId', 'id'], '') || '');
        if (!id || id === String(reservationId) || seen.has(id)) return false;
        const start = String(pick(reservation, ['startDate', 'checkInDate'], '') || '').slice(0, 10);
        const end = String(pick(reservation, ['endDate', 'checkOutDate'], '') || '').slice(0, 10);
        if (!overlaps(start, end, startDate, endDate)) return false;
        seen.add(id);
        return true;
    }).map((reservation) => ({
        reservationId: String(pick(reservation, ['reservationID', 'reservationId', 'id'], '')),
        guestName: String(pick(reservation, ['guestName'], 'Existing guest') || 'Existing guest'),
        startDate: String(pick(reservation, ['startDate', 'checkInDate'], '') || '').slice(0, 10),
        endDate: String(pick(reservation, ['endDate', 'checkOutDate'], '') || '').slice(0, 10),
        status: String(pick(reservation, ['status', 'reservationStatus'], '') || ''),
    }));
}

async function verifyRoomAssignment(propertyId, reservationId, targetRoomId, subReservationId) {
    const delays = [0, 300, 700, 1300, 2200];
    let lastReservation = null;
    let lastAssignments = [];
    let roomDetails = null;

    for (const delay of delays) {
        if (delay) await sleep(delay);

        lastReservation = await getReservation(propertyId, reservationId);
        lastAssignments = reservationAssignments(lastReservation);
        const reservationMatch = lastAssignments.find((assignment) =>
            String(assignment.roomId) === String(targetRoomId) &&
            (!subReservationId || !assignment.subReservationId || String(assignment.subReservationId) === String(subReservationId))
        );
        if (reservationMatch) {
            return {
                verified: true,
                source: 'getReservation',
                data: lastReservation,
                assignments: lastAssignments,
                assignment: reservationMatch,
            };
        }

        if (subReservationId) {
            roomDetails = await getReservationRoomDetails(propertyId, subReservationId);
            if (String(pick(roomDetails, ['roomID', 'roomId'], '') || '') === String(targetRoomId)) {
                return {
                    verified: true,
                    source: 'getReservationRoomDetails',
                    data: lastReservation,
                    assignments: lastAssignments,
                    roomDetails,
                };
            }
        }
    }

    return {
        verified: false,
        data: lastReservation,
        assignments: lastAssignments,
        roomDetails,
    };
}

function chooseCurrentAssignment(assignments, payload, reservationId) {
    const requestedSub = String(payload.subReservationId || payload.subReservationID || '');
    const requestedOldRoom = String(payload.oldRoomId || payload.oldRoomID || '');

    return assignments.find((item) => requestedSub && String(item.subReservationId) === requestedSub) ||
        assignments.find((item) => requestedOldRoom && String(item.roomId) === requestedOldRoom) ||
        assignments.find((item) => item.roomId) ||
        assignments.find((item) => item.subReservationId === String(reservationId)) ||
        assignments[0] || {};
}

function uniqueForms(forms) {
    const seen = new Set();
    return forms.filter((form) => {
        const key = safeJson(form);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function decoratePermissionError(error) {
    if (![401, 403].includes(Number(error?.status))) return error;
    const decorated = new Error(
        'Cloudbeds rejected the room write. Re-authorize the Cloudbeds connection after confirming write:reservation and write:room are enabled for the Partner App.'
    );
    decorated.code = 'CLOUDBEDS_WRITE_PERMISSION_REQUIRED';
    decorated.status = 403;
    decorated.requestId = error.requestId || null;
    decorated.details = { originalMessage: error.message };
    return decorated;
}

async function assignRoom(reservationId, payload = {}, actor = {}) {
    const propertyId = required(payload.propertyId || payload.propertyID, 'propertyId');
    const id = required(reservationId, 'reservationId');
    const newRoomId = required(payload.newRoomId || payload.newRoomID, 'newRoomId');

    const current = await getReservation(propertyId, id);
    const assignments = reservationAssignments(current);
    const currentAssignment = chooseCurrentAssignment(assignments, payload, id);

    if (String(currentAssignment.roomId || '') === newRoomId) {
        const inventory = await getInventory(propertyId);
        const room = inventory.find((item) => String(item.id) === newRoomId) || {
            id: newRoomId,
            roomNumber: currentAssignment.roomNumber || '',
            roomTypeId: currentAssignment.roomTypeId || '',
            roomType: currentAssignment.roomType || '',
        };
        return {
            synced: true,
            alreadyAssigned: true,
            reservationId: id,
            propertyId,
            room,
            verification: { verified: true, source: 'initial-read', data: current, assignments },
        };
    }

    const inventory = await getInventory(propertyId);
    const target = inventory.find((room) => String(room.id) === newRoomId);
    if (!target) {
        const error = new Error('Target room was not found in the live Cloudbeds inventory.');
        error.code = 'CLOUDBEDS_ROOM_NOT_FOUND';
        error.status = 404;
        throw error;
    }

    const startDate = String(current.startDate || currentAssignment.startDate || '').slice(0, 10);
    const endDate = String(current.endDate || currentAssignment.endDate || '').slice(0, 10);

    if (startDate && endDate) {
        const conflicts = await findConflicts(propertyId, newRoomId, startDate, endDate, id);
        if (conflicts.length) {
            const error = new Error(`Room ${target.roomNumber || newRoomId} is already occupied for part of this stay.`);
            error.code = 'CLOUDBEDS_ROOM_NOT_AVAILABLE';
            error.status = 409;
            error.details = { conflicts, room: target, startDate, endDate };
            throw error;
        }

        const availableRooms = await getInventory(propertyId, startDate, endDate);
        if (!availableRooms.some((room) => String(room.id) === newRoomId)) {
            const error = new Error(`Room ${target.roomNumber || newRoomId} is blocked or unavailable for ${startDate} → ${endDate}.`);
            error.code = 'CLOUDBEDS_ROOM_NOT_AVAILABLE';
            error.status = 409;
            error.details = { conflicts: [], room: target, startDate, endDate };
            throw error;
        }
    }

    const subReservationId = String(
        payload.subReservationId || payload.subReservationID || currentAssignment.subReservationId ||
        (assignments.length <= 1 ? id : '')
    );
    const reservationRoomId = String(
        payload.reservationRoomId || payload.reservationRoomID || currentAssignment.reservationRoomId || ''
    );
    const oldRoomId = String(currentAssignment.roomId || payload.oldRoomId || payload.oldRoomID || '');
    const roomTypeId = required(payload.roomTypeId || payload.roomTypeID || target.roomTypeId, 'roomTypeID');

    const standardForm = {
        propertyID: propertyId,
        reservationID: id,
        ...(subReservationId ? { subReservationID: subReservationId } : {}),
        newRoomID: newRoomId,
        roomTypeID: roomTypeId,
        ...(oldRoomId ? { oldRoomID: oldRoomId } : {}),
        adjustPrice: Boolean(payload.adjustPrice),
    };

    // Cloudbeds' current reference documents reservationRoomID as mandatory for unassign,
    // while older/third-party schemas still expect it for assignment. Try the documented
    // reassignment shape first, then a compatibility shape only if needed.
    const forms = [standardForm];
    if (reservationRoomId) forms.push({ ...standardForm, reservationRoomID: reservationRoomId });
    if (assignments.length <= 1 && standardForm.subReservationID) {
        const withoutSub = { ...standardForm };
        delete withoutSub.subReservationID;
        forms.push(withoutSub);
        if (reservationRoomId) forms.push({ ...withoutSub, reservationRoomID: reservationRoomId });
    }

    const attempts = [];
    for (const form of uniqueForms(forms)) {
        let writeResult;
        try {
            writeResult = await requestAcrossBases('/postRoomAssign', { method: 'POST', form });
            await audit({
                actor,
                operation: 'reservation.room_assign',
                reservationId: id,
                propertyId,
                endpoint: '/postRoomAssign',
                request: form,
                response: writeResult.payload,
                status: 'synced',
                requestId: writeResult.requestId,
            });
        } catch (rawError) {
            const error = decoratePermissionError(rawError);
            await audit({
                actor,
                operation: 'reservation.room_assign',
                reservationId: id,
                propertyId,
                endpoint: '/postRoomAssign',
                request: form,
                status: 'failed',
                error,
            });
            attempts.push({ form, error: error.message, code: error.code, requestId: error.requestId || null });
            if (error.code === 'CLOUDBEDS_WRITE_PERMISSION_REQUIRED') throw error;
            continue;
        }

        const verification = await verifyRoomAssignment(propertyId, id, newRoomId, subReservationId);
        if (verification.verified) {
            return {
                synced: true,
                reservationId: id,
                propertyId,
                requestId: writeResult.requestId,
                apiBase: writeResult.apiBase,
                room: target,
                previousRoom: currentAssignment,
                verification,
                cloudbeds: writeResult.payload,
                attempts,
            };
        }

        attempts.push({
            form,
            error: 'Cloudbeds returned success but the physical room was not changed after verification.',
            code: 'CLOUDBEDS_ROOM_ASSIGNMENT_NOT_APPLIED',
            requestId: writeResult.requestId || null,
        });
        await audit({
            actor,
            operation: 'reservation.room_assign.verify',
            reservationId: id,
            propertyId,
            endpoint: '/getReservation',
            request: { targetRoomID: newRoomId, subReservationID: subReservationId || null },
            response: verification,
            status: 'failed',
            error: new Error('Physical room assignment was not visible after Cloudbeds returned success.'),
            requestId: writeResult.requestId,
        });
    }

    const error = new Error(
        `Cloudbeds did not apply the room change to ${target.roomNumber || newRoomId}. No local PMS success was recorded.`
    );
    error.code = 'CLOUDBEDS_ROOM_ASSIGNMENT_NOT_APPLIED';
    error.status = 409;
    error.details = {
        reservationId: id,
        propertyId,
        requestedRoom: target,
        previousRoom: currentAssignment,
        attempts,
    };
    throw error;
}

module.exports = { assignRoom };
