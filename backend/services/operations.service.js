const db = require('../config/db');

const SOURCE = 'cloudbeds';
const HOUSEKEEPING_STATUSES = ['dirty', 'pending', 'in_progress', 'clean', 'inspected', 'no_show'];
const RESERVATION_STATUSES = ['confirmed', 'checked_in', 'checked_out', 'no_show', 'cancelled'];
let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS reservation_operations (
            source VARCHAR(32) NOT NULL,
            external_reservation_id VARCHAR(128) NOT NULL,
            local_status VARCHAR(32) NULL,
            online_checkin TINYINT(1) NULL,
            actual_arrival_time VARCHAR(16) NULL,
            actual_departure_time VARCHAR(16) NULL,
            guest_notes TEXT NULL,
            special_requests_json LONGTEXT NULL,
            updated_by VARCHAR(64) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (source, external_reservation_id)
        )
    `);
    try { await db.query(`ALTER TABLE reservation_operations ADD COLUMN IF NOT EXISTS local_status VARCHAR(32) NULL AFTER external_reservation_id`); } catch (_) {}
    try { await db.query(`ALTER TABLE reservation_operations ADD COLUMN IF NOT EXISTS online_checkin TINYINT(1) NULL AFTER local_status`); } catch (_) {}
    try { await db.query(`ALTER TABLE reservation_operations ADD COLUMN IF NOT EXISTS updated_by VARCHAR(64) NULL AFTER special_requests_json`); } catch (_) {}

    await db.query(`
        CREATE TABLE IF NOT EXISTS room_operations (
            source VARCHAR(32) NOT NULL,
            room_id VARCHAR(128) NOT NULL,
            property_id VARCHAR(128) NULL,
            room_number VARCHAR(128) NULL,
            housekeeping_status VARCHAR(32) NOT NULL DEFAULT 'dirty',
            refill TINYINT(1) NOT NULL DEFAULT 0,
            extra_linens VARCHAR(255) NULL,
            comments TEXT NULL,
            status_date DATE NOT NULL,
            updated_by VARCHAR(64) NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (source, room_id),
            INDEX idx_room_operations_date (status_date),
            INDEX idx_room_operations_property (property_id)
        )
    `);

    try { await db.query(`ALTER TABLE room_operations ADD COLUMN IF NOT EXISTS refill TINYINT(1) NOT NULL DEFAULT 0 AFTER housekeeping_status`); } catch (_) {}
    try { await db.query(`ALTER TABLE room_operations ADD COLUMN IF NOT EXISTS extra_linens VARCHAR(255) NULL AFTER refill`); } catch (_) {}

    await db.query(`
        CREATE TABLE IF NOT EXISTS housekeeping_assignments (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            property_id VARCHAR(128) NOT NULL,
            property_name VARCHAR(255) NULL,
            room_id VARCHAR(128) NOT NULL,
            room_number VARCHAR(128) NULL,
            room_type VARCHAR(255) NULL,
            task_date DATE NOT NULL,
            cleaner_user_id INT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            notes TEXT NULL,
            started_at DATETIME NULL,
            completed_at DATETIME NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'local',
            external_reservation_id VARCHAR(128) NULL,
            guest_name VARCHAR(255) NULL,
            arrival_date DATE NULL,
            arrival_time VARCHAR(16) NULL,
            priority VARCHAR(32) NOT NULL DEFAULT 'standard',
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_housekeeping_room_day (room_id, task_date),
            INDEX idx_housekeeping_cleaner_day (cleaner_user_id, task_date),
            INDEX idx_housekeeping_property_day (property_id, task_date),
            INDEX idx_housekeeping_external_reservation (source, external_reservation_id)
        )
    `);
    try { await db.query(`ALTER TABLE housekeeping_assignments MODIFY cleaner_user_id INT NULL`); } catch (_) {}
    try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'local' AFTER completed_at`); } catch (_) {}
    try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS external_reservation_id VARCHAR(128) NULL AFTER source`); } catch (_) {}
    try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255) NULL AFTER external_reservation_id`); } catch (_) {}
    try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS arrival_date DATE NULL AFTER guest_name`); } catch (_) {}
    try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS arrival_time VARCHAR(16) NULL AFTER arrival_date`); } catch (_) {}
    try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS priority VARCHAR(32) NOT NULL DEFAULT 'standard' AFTER arrival_time`); } catch (_) {}
    try { await db.query(`CREATE INDEX idx_housekeeping_external_reservation ON housekeeping_assignments (source, external_reservation_id)`); } catch (_) {}

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_housekeeping_schedule (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            source VARCHAR(32) NOT NULL,
            external_reservation_id VARCHAR(128) NOT NULL,
            guest_portal_id BIGINT NULL,
            property_id VARCHAR(128) NULL,
            property_name VARCHAR(255) NULL,
            room_id VARCHAR(128) NULL,
            room_number VARCHAR(128) NULL,
            guest_name VARCHAR(255) NULL,
            check_in_date DATE NULL,
            expected_check_in_time VARCHAR(16) NULL,
            check_out_date DATE NULL,
            expected_check_out_time VARCHAR(16) NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_housekeeping_reservation (source, external_reservation_id),
            INDEX idx_housekeeping_checkout (check_out_date, expected_check_out_time),
            INDEX idx_housekeeping_room (room_id)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_transfer_requests (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            source VARCHAR(32) NOT NULL,
            external_reservation_id VARCHAR(128) NOT NULL,
            guest_portal_id BIGINT NULL,
            service_key VARCHAR(128) NOT NULL,
            service_name VARCHAR(255) NULL,
            direction VARCHAR(32) NOT NULL DEFAULT 'arrival',
            property_id VARCHAR(128) NULL,
            property_name VARCHAR(255) NULL,
            guest_name VARCHAR(255) NULL,
            guest_email VARCHAR(255) NULL,
            guest_phone VARCHAR(64) NULL,
            scheduled_date DATE NULL,
            scheduled_time VARCHAR(16) NULL,
            pickup_location VARCHAR(255) NULL,
            dropoff_location VARCHAR(255) NULL,
            flight_info VARCHAR(128) NULL,
            passengers INT NULL,
            luggage INT NULL,
            driver VARCHAR(128) NULL,
            vehicle VARCHAR(128) NULL,
            notes TEXT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'unassigned',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_transfer_request (source, external_reservation_id, service_key, direction),
            INDEX idx_transfer_schedule (scheduled_date, scheduled_time),
            INDEX idx_transfer_status (status)
        )
    `);

    tablesReady = true;
}

function roomIdFromReservation(reservation) {
    if (Array.isArray(reservation.roomIds) && reservation.roomIds.length) return String(reservation.roomIds[0]);
    return reservation.roomId ? String(reservation.roomId) : null;
}
function roomNumberFromReservation(reservation) {
    if (Array.isArray(reservation.roomNumbers) && reservation.roomNumbers.length) return String(reservation.roomNumbers[0]);
    return reservation.roomNumber ? String(reservation.roomNumber) : null;
}

async function syncLegacyReservationTimes(reservation, submitted) {
    try {
        await db.query(
            `UPDATE reservations SET actual_arrival_time = ?, actual_departure_time = ? WHERE channel_reservation_id = ? AND source = ?`,
            [submitted.arrivalTime || null, submitted.departureTime || null, String(reservation.id), SOURCE]
        );
    } catch (error) {
        console.warn('[OPERATIONS] Legacy reservation time mirror skipped:', error.message);
    }
}

async function syncHousekeepingSchedule(portal, submitted) {
    const reservation = portal.reservation || {};
    await db.query(
        `INSERT INTO guest_housekeeping_schedule
            (source, external_reservation_id, guest_portal_id, property_id, property_name, room_id, room_number,
             guest_name, check_in_date, expected_check_in_time, check_out_date, expected_check_out_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
         ON DUPLICATE KEY UPDATE
            guest_portal_id=VALUES(guest_portal_id), property_id=VALUES(property_id), property_name=VALUES(property_name),
            room_id=VALUES(room_id), room_number=VALUES(room_number), guest_name=VALUES(guest_name),
            check_in_date=VALUES(check_in_date), expected_check_in_time=VALUES(expected_check_in_time),
            check_out_date=VALUES(check_out_date), expected_check_out_time=VALUES(expected_check_out_time), updated_at=NOW()`,
        [SOURCE, String(reservation.id), portal.id || null, reservation.propertyId || null, reservation.propertyName || null,
         roomIdFromReservation(reservation), roomNumberFromReservation(reservation), reservation.guestName || null,
         reservation.arrivalDate || null, submitted.arrivalTime || null, reservation.departureDate || null, submitted.departureTime || null]
    );
}

function isTransferAddon(addon) {
    const value = `${addon?.id || ''} ${addon?.name || ''}`.toLowerCase();
    return value.includes('transfer') || value.includes('shuttle');
}
function inferDirection(addon) {
    const value = `${addon?.id || ''} ${addon?.name || ''}`.toLowerCase();
    return value.includes('departure') || value.includes('dropoff') || value.includes('drop-off') || value.includes('checkout') || value.includes('check-out')
        ? 'departure' : 'arrival';
}
async function syncTransferRequests(portal, submitted, addons) {
    const reservation = portal.reservation || {};
    const transferAddons = (Array.isArray(addons) ? addons : []).filter(isTransferAddon);
    for (const addon of transferAddons) {
        const direction = inferDirection(addon);
        const isDeparture = direction === 'departure';
        await db.query(
            `INSERT INTO guest_transfer_requests
                (source, external_reservation_id, guest_portal_id, service_key, service_name, direction,
                 property_id, property_name, guest_name, guest_email, guest_phone, scheduled_date, scheduled_time,
                 pickup_location, dropoff_location, flight_info, notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unassigned')
             ON DUPLICATE KEY UPDATE
                guest_portal_id=VALUES(guest_portal_id), service_name=VALUES(service_name), property_id=VALUES(property_id),
                property_name=VALUES(property_name), guest_name=VALUES(guest_name), guest_email=VALUES(guest_email),
                guest_phone=VALUES(guest_phone), scheduled_date=VALUES(scheduled_date), scheduled_time=VALUES(scheduled_time),
                pickup_location=VALUES(pickup_location), dropoff_location=VALUES(dropoff_location),
                flight_info=VALUES(flight_info), notes=VALUES(notes), updated_at=NOW()`,
            [SOURCE, String(reservation.id), portal.id || null, String(addon.id || 'transfer'), addon.name || 'Transfer',
             direction, reservation.propertyId || null, reservation.propertyName || null, reservation.guestName || null,
             reservation.guestEmail || null, submitted.guestPhone || reservation.guestPhone || null,
             isDeparture ? reservation.departureDate : reservation.arrivalDate,
             isDeparture ? submitted.departureTime : submitted.arrivalTime,
             isDeparture ? (reservation.propertyName || 'Property') : 'Airport',
             isDeparture ? 'Airport' : (reservation.propertyName || 'Property'),
             !isDeparture ? (submitted.flightNumber || null) : null, submitted.specialRequests || null]
        );
    }
    return transferAddons.length;
}

async function syncGuestOperations(portal, submitted, addons) {
    await ensureTables();
    await syncHousekeepingSchedule(portal, submitted);
    await syncTransferRequests(portal, submitted, addons);
    await syncLegacyReservationTimes(portal.reservation || {}, submitted);
}


async function reconcileHousekeepingFromReservations(reservations = []) {
    await ensureTables();
    const active = (Array.isArray(reservations) ? reservations : []).filter((reservation) => {
        const status = String(reservation?.status || '').toLowerCase();
        return reservation?.departureDate && !['cancelled', 'canceled', 'no_show'].includes(status);
    });

    const arrivalsByRoomDate = new Map();
    for (const reservation of active) {
        const ids = Array.isArray(reservation.roomIds) && reservation.roomIds.length
            ? reservation.roomIds.map(String)
            : (reservation.roomId ? [String(reservation.roomId)] : []);
        for (const roomId of ids) {
            const key = `${roomId}|${reservation.arrivalDate || ''}`;
            if (!arrivalsByRoomDate.has(key)) arrivalsByRoomDate.set(key, reservation);
        }
    }

    for (const reservation of active) {
        const roomIds = Array.isArray(reservation.roomIds) && reservation.roomIds.length
            ? reservation.roomIds.map(String)
            : (reservation.roomId ? [String(reservation.roomId)] : []);
        const roomNumbers = Array.isArray(reservation.roomNumbers) && reservation.roomNumbers.length
            ? reservation.roomNumbers.map(String)
            : [reservation.roomNumber ? String(reservation.roomNumber) : ''];
        const roomTypes = Array.isArray(reservation.roomTypes) && reservation.roomTypes.length
            ? reservation.roomTypes.map(String)
            : [reservation.roomType ? String(reservation.roomType) : ''];

        for (let index = 0; index < roomIds.length; index += 1) {
            const roomId = roomIds[index];
            if (!roomId) continue;
            await db.query(
                `DELETE FROM housekeeping_assignments
                 WHERE source = ? AND external_reservation_id = ?
                   AND status IN ('pending','assigned')
                   AND (room_id <> ? OR task_date <> ?)`,
                [SOURCE, String(reservation.id), roomId, String(reservation.departureDate).slice(0, 10)]
            );
            const sameDayArrival = arrivalsByRoomDate.get(`${roomId}|${reservation.departureDate}`);
            const arrivalTime = sameDayArrival?.actualArrivalTime || sameDayArrival?.arrivalTime || null;
            const priority = sameDayArrival ? 'high' : 'standard';

            await db.query(
                `INSERT INTO housekeeping_assignments
                  (property_id, property_name, room_id, room_number, room_type, task_date, cleaner_user_id, status,
                   source, external_reservation_id, guest_name, arrival_date, arrival_time, priority)
                 VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   property_id=VALUES(property_id),
                   property_name=COALESCE(VALUES(property_name), property_name),
                   room_number=COALESCE(VALUES(room_number), room_number),
                   room_type=COALESCE(VALUES(room_type), room_type),
                   source=VALUES(source),
                   external_reservation_id=VALUES(external_reservation_id),
                   guest_name=VALUES(guest_name),
                   arrival_date=VALUES(arrival_date),
                   arrival_time=VALUES(arrival_time),
                   priority=VALUES(priority),
                   updated_at=NOW()`,
                [
                    String(reservation.propertyId || reservation.property?.id || 'unknown-property'),
                    reservation.propertyName || reservation.property?.name || null,
                    roomId,
                    roomNumbers[index] || roomNumbers[0] || null,
                    roomTypes[index] || roomTypes[0] || null,
                    String(reservation.departureDate).slice(0, 10),
                    SOURCE,
                    String(reservation.id),
                    reservation.guestName || null,
                    sameDayArrival?.arrivalDate || null,
                    arrivalTime,
                    priority,
                ]
            );

            const departureDate = String(reservation.departureDate).slice(0, 10);
            const today = new Date().toISOString().slice(0, 10);
            if (departureDate <= today) {
                await updateHousekeepingStatus(roomId, {
                    propertyId: String(reservation.propertyId || reservation.property?.id || 'unknown-property'),
                    roomNumber: roomNumbers[index] || roomNumbers[0] || null,
                    roomCondition: 'dirty',
                    statusDate: departureDate,
                }, { userId: 'reservation-sync', role: 'system' });
            }
        }
    }

    return { tasks: active.length };
}

async function cancelHousekeepingForReservation(reservationId) {
    await ensureTables();
    await db.query(
        `DELETE FROM housekeeping_assignments
         WHERE source = ? AND external_reservation_id = ? AND status IN ('pending','assigned')`,
        [SOURCE, String(reservationId)]
    );
    return { reservationId: String(reservationId), cancelled: true };
}

async function listReservationOperations() {
    await ensureTables();
    const rows = await db.query(`SELECT * FROM reservation_operations WHERE source = ? ORDER BY updated_at DESC`, [SOURCE]);
    return rows.map((row) => ({
        reservationId: String(row.external_reservation_id),
        status: row.local_status,
        onlineCheckin: row.online_checkin == null ? null : Boolean(row.online_checkin),
        actualArrivalTime: row.actual_arrival_time,
        actualDepartureTime: row.actual_departure_time,
        guestNotes: row.guest_notes,
        specialRequests: (() => { try { return JSON.parse(row.special_requests_json || 'null'); } catch { return row.special_requests_json; } })(),
        updatedAt: row.updated_at,
    }));
}

async function updateReservationOperation(reservationId, payload = {}, actor = {}) {
    await ensureTables();
    const requestedStatus = payload.status == null ? null : String(payload.status).toLowerCase();
    const status = requestedStatus === 'in_house' ? 'checked_in' : requestedStatus;
    if (status && !RESERVATION_STATUSES.includes(status)) {
        const error = new Error('Unsupported local reservation status.'); error.status = 422; throw error;
    }
    const arrival = payload.actualArrivalTime ?? payload.actual_arrival_time ?? payload.arrivalTime;
    const departure = payload.actualDepartureTime ?? payload.actual_departure_time ?? payload.departureTime;
    const notes = payload.guestNotes ?? payload.guest_notes ?? payload.notes;
    const special = payload.specialRequests ?? payload.special_requests;
    const onlineCheckin = payload.onlineCheckin ?? payload.online_checkin;
    await db.query(
        `INSERT INTO reservation_operations
          (source, external_reservation_id, local_status, online_checkin, actual_arrival_time, actual_departure_time, guest_notes, special_requests_json, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          local_status=COALESCE(VALUES(local_status),local_status),
          online_checkin=COALESCE(VALUES(online_checkin),online_checkin),
          actual_arrival_time=COALESCE(VALUES(actual_arrival_time),actual_arrival_time),
          actual_departure_time=COALESCE(VALUES(actual_departure_time),actual_departure_time),
          guest_notes=COALESCE(VALUES(guest_notes),guest_notes),
          special_requests_json=COALESCE(VALUES(special_requests_json),special_requests_json),
          updated_by=VALUES(updated_by), updated_at=NOW()`,
        [SOURCE, String(reservationId), status, onlineCheckin === undefined ? null : (onlineCheckin ? 1 : 0),
         arrival ?? null, departure ?? null, notes ?? null,
         special === undefined ? null : JSON.stringify(special), actor.userId ? String(actor.userId) : null]
    );
    const all = await listReservationOperations();
    return all.find((item) => item.reservationId === String(reservationId)) || null;
}

async function listHousekeepingStatus() {
    await ensureTables();
    const rows = await db.query(`SELECT * FROM room_operations WHERE source = ? ORDER BY property_id, room_number, room_id`, [SOURCE]);
    return rows.map((row) => ({
        roomId: String(row.room_id), propertyId: row.property_id, roomNumber: row.room_number,
        roomCondition: row.housekeeping_status, status: row.housekeeping_status,
        refill: Boolean(row.refill), extraLinens: row.extra_linens || '',
        comments: row.comments || '', date: row.status_date, updatedAt: row.updated_at,
    }));
}

async function updateHousekeepingStatus(roomId, payload = {}, actor = {}) {
    await ensureTables();
    const existingRows = await db.query(
        `SELECT * FROM room_operations WHERE source = ? AND room_id = ? LIMIT 1`,
        [SOURCE, String(roomId)]
    );
    const existing = existingRows[0] || null;
    const requestedStatus = payload.roomCondition ?? payload.status;
    const status = String(requestedStatus || existing?.housekeeping_status || 'dirty').toLowerCase();
    if (!HOUSEKEEPING_STATUSES.includes(status)) {
        const error = new Error('Housekeeping status must be Dirty, Pending, In Progress, Clean, Inspected or No Show.'); error.status = 422; throw error;
    }
    const statusDate = String(payload.statusDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const existingDate = existing?.status_date ? String(existing.status_date).slice(0, 10) : '';
    const existingIsToday = existingDate === statusDate;
    const refill = payload.refill === undefined ? (existingIsToday ? Boolean(existing?.refill) : false) : Boolean(payload.refill);
    const extraLinens = payload.extraLinens === undefined ? (existingIsToday ? (existing?.extra_linens || '') : '') : String(payload.extraLinens || '');
    const comments = payload.comments ?? payload.roomComments ?? existing?.comments ?? null;

    await db.query(
        `INSERT INTO room_operations
          (source, room_id, property_id, room_number, housekeeping_status, refill, extra_linens, comments, status_date, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
          property_id=VALUES(property_id), room_number=VALUES(room_number), housekeeping_status=VALUES(housekeeping_status),
          refill=VALUES(refill), extra_linens=VALUES(extra_linens), comments=VALUES(comments),
          status_date=VALUES(status_date), updated_by=VALUES(updated_by), updated_at=NOW()`,
        [SOURCE, String(roomId), payload.propertyId || existing?.property_id || null, payload.roomNumber || existing?.room_number || null,
         status, refill ? 1 : 0, extraLinens, comments, statusDate, actor.userId ? String(actor.userId) : null]
    );
    const all = await listHousekeepingStatus();
    return all.find((item) => item.roomId === String(roomId)) || null;
}

async function listTransfers() {
    await ensureTables();
    const rows = await db.query(`SELECT * FROM guest_transfer_requests WHERE status <> 'cancelled' ORDER BY scheduled_date ASC, scheduled_time ASC, created_at ASC`);
    return rows.map((row) => ({
        id: String(row.id), reservationId: String(row.external_reservation_id), guestPortalId: row.guest_portal_id ? String(row.guest_portal_id) : null,
        serviceKey: row.service_key, serviceName: row.service_name, direction: row.direction, propertyId: row.property_id,
        propertyName: row.property_name, guestName: row.guest_name, guestEmail: row.guest_email, guestPhone: row.guest_phone,
        scheduledDate: row.scheduled_date, pickupTime: row.scheduled_time, pickupLocation: row.pickup_location,
        dropoffLocation: row.dropoff_location, flightInfo: row.flight_info, passengers: row.passengers, luggage: row.luggage,
        driver: row.driver, vehicle: row.vehicle, notes: row.notes, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
}
async function updateTransfer(id, payload) {
    await ensureTables();
    const allowed = { status:'status', driver:'driver', vehicle:'vehicle', pickupTime:'scheduled_time', pickupLocation:'pickup_location', dropoffLocation:'dropoff_location', flightInfo:'flight_info', passengers:'passengers', luggage:'luggage', notes:'notes' };
    const updates=[]; const params=[];
    for (const [key,column] of Object.entries(allowed)) if (payload[key] !== undefined) { updates.push(`${column} = ?`); params.push(payload[key] === '' ? null : payload[key]); }
    if (!updates.length) { const error=new Error('No transfer fields were supplied for update.'); error.status=422; throw error; }
    params.push(String(id)); await db.query(`UPDATE guest_transfer_requests SET ${updates.join(', ')}, updated_at=NOW() WHERE id=?`, params);
    const rows=await db.query('SELECT id FROM guest_transfer_requests WHERE id=? LIMIT 1',[String(id)]);
    if (!rows[0]) { const error=new Error('Transfer request not found.'); error.status=404; throw error; }
    return (await listTransfers()).find((item)=>item.id===String(id)) || null;
}
async function listHousekeepingSchedule() {
    await ensureTables();
    const rows = await db.query(`SELECT * FROM guest_housekeeping_schedule ORDER BY check_out_date ASC, expected_check_out_time ASC, created_at ASC`);
    return rows.map((row)=>({id:String(row.id),reservationId:String(row.external_reservation_id),propertyId:row.property_id,propertyName:row.property_name,roomId:row.room_id,roomNumber:row.room_number,guestName:row.guest_name,checkInDate:row.check_in_date,checkInTime:row.expected_check_in_time,checkOutDate:row.check_out_date,checkOutTime:row.expected_check_out_time,status:row.status,updatedAt:row.updated_at}));
}

module.exports = {
    syncGuestOperations,
    listReservationOperations,
    updateReservationOperation,
    listHousekeepingStatus,
    updateHousekeepingStatus,
    listTransfers,
    updateTransfer,
    listHousekeepingSchedule,
    reconcileHousekeepingFromReservations,
    cancelHousekeepingForReservation,
};