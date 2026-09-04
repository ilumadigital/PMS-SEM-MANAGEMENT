const db = require('../config/db');

const SOURCE = 'cloudbeds';
let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;

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

function isTransferAddon(addon) {
    const value = `${addon?.id || ''} ${addon?.name || ''}`.toLowerCase();
    return value.includes('transfer') || value.includes('shuttle');
}

function inferDirection(addon) {
    const value = `${addon?.id || ''} ${addon?.name || ''}`.toLowerCase();
    if (
        value.includes('departure') ||
        value.includes('dropoff') ||
        value.includes('drop-off') ||
        value.includes('checkout') ||
        value.includes('check-out')
    ) {
        return 'departure';
    }
    return 'arrival';
}

function roomIdFromReservation(reservation) {
    if (Array.isArray(reservation.roomIds) && reservation.roomIds.length) {
        return String(reservation.roomIds[0]);
    }
    return reservation.roomId ? String(reservation.roomId) : null;
}

function roomNumberFromReservation(reservation) {
    if (Array.isArray(reservation.roomNumbers) && reservation.roomNumbers.length) {
        return String(reservation.roomNumbers[0]);
    }
    return reservation.roomNumber ? String(reservation.roomNumber) : null;
}

async function syncLegacyReservationTimes(reservation, submitted) {
    // The legacy Reception module reads these columns directly from reservations.
    // Some Cloudbeds reservations may only exist in the live integration feed, so
    // this mirror is deliberately best-effort and must not block guest check-in.
    try {
        await db.query(
            `UPDATE reservations
             SET actual_arrival_time = ?, actual_departure_time = ?
             WHERE channel_reservation_id = ? AND source = ?`,
            [
                submitted.arrivalTime || null,
                submitted.departureTime || null,
                String(reservation.id),
                SOURCE,
            ]
        );
    } catch (error) {
        console.warn('[OPERATIONS] Legacy reservation time mirror skipped:', error.message);
    }
}

async function syncHousekeepingSchedule(portal, submitted) {
    const reservation = portal.reservation || {};

    await db.query(
        `INSERT INTO guest_housekeeping_schedule
            (source, external_reservation_id, guest_portal_id, property_id, property_name,
             room_id, room_number, guest_name, check_in_date, expected_check_in_time,
             check_out_date, expected_check_out_time, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
         ON DUPLICATE KEY UPDATE
            guest_portal_id = VALUES(guest_portal_id),
            property_id = VALUES(property_id),
            property_name = VALUES(property_name),
            room_id = VALUES(room_id),
            room_number = VALUES(room_number),
            guest_name = VALUES(guest_name),
            check_in_date = VALUES(check_in_date),
            expected_check_in_time = VALUES(expected_check_in_time),
            check_out_date = VALUES(check_out_date),
            expected_check_out_time = VALUES(expected_check_out_time),
            updated_at = NOW()`,
        [
            SOURCE,
            String(reservation.id),
            portal.id || null,
            reservation.propertyId || null,
            reservation.propertyName || null,
            roomIdFromReservation(reservation),
            roomNumberFromReservation(reservation),
            reservation.guestName || null,
            reservation.arrivalDate || null,
            submitted.arrivalTime || null,
            reservation.departureDate || null,
            submitted.departureTime || null,
        ]
    );
}

async function syncTransferRequests(portal, submitted, addons) {
    const reservation = portal.reservation || {};
    const transferAddons = (Array.isArray(addons) ? addons : []).filter(isTransferAddon);

    for (const addon of transferAddons) {
        const direction = inferDirection(addon);
        const isDeparture = direction === 'departure';
        const scheduledDate = isDeparture ? reservation.departureDate : reservation.arrivalDate;
        const scheduledTime = isDeparture ? submitted.departureTime : submitted.arrivalTime;
        const pickupLocation = isDeparture
            ? (reservation.propertyName || 'Property')
            : 'Airport / guest pickup point';
        const dropoffLocation = isDeparture
            ? 'Airport / guest drop-off point'
            : (reservation.propertyName || 'Property');

        await db.query(
            `INSERT INTO guest_transfer_requests
                (source, external_reservation_id, guest_portal_id, service_key, service_name,
                 direction, property_id, property_name, guest_name, guest_email, guest_phone,
                 scheduled_date, scheduled_time, pickup_location, dropoff_location, flight_info,
                 notes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unassigned')
             ON DUPLICATE KEY UPDATE
                guest_portal_id = VALUES(guest_portal_id),
                service_name = VALUES(service_name),
                property_id = VALUES(property_id),
                property_name = VALUES(property_name),
                guest_name = VALUES(guest_name),
                guest_email = VALUES(guest_email),
                guest_phone = VALUES(guest_phone),
                scheduled_date = VALUES(scheduled_date),
                scheduled_time = VALUES(scheduled_time),
                pickup_location = VALUES(pickup_location),
                dropoff_location = VALUES(dropoff_location),
                flight_info = VALUES(flight_info),
                notes = VALUES(notes),
                updated_at = NOW()`,
            [
                SOURCE,
                String(reservation.id),
                portal.id || null,
                String(addon.id || 'transfer'),
                addon.name || 'Transfer',
                direction,
                reservation.propertyId || null,
                reservation.propertyName || null,
                reservation.guestName || null,
                reservation.guestEmail || null,
                submitted.guestPhone || reservation.guestPhone || null,
                scheduledDate || null,
                scheduledTime || null,
                pickupLocation,
                dropoffLocation,
                !isDeparture ? (submitted.flightNumber || null) : null,
                submitted.specialRequests || null,
            ]
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

async function listTransfers() {
    await ensureTables();
    const rows = await db.query(`
        SELECT *
        FROM guest_transfer_requests
        WHERE status <> 'cancelled'
        ORDER BY scheduled_date ASC, scheduled_time ASC, created_at ASC
    `);

    return rows.map((row) => ({
        id: String(row.id),
        reservationId: String(row.external_reservation_id),
        guestPortalId: row.guest_portal_id ? String(row.guest_portal_id) : null,
        serviceKey: row.service_key,
        serviceName: row.service_name,
        direction: row.direction,
        propertyId: row.property_id,
        propertyName: row.property_name,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        guestPhone: row.guest_phone,
        scheduledDate: row.scheduled_date,
        pickupTime: row.scheduled_time,
        pickupLocation: row.pickup_location,
        dropoffLocation: row.dropoff_location,
        flightInfo: row.flight_info,
        passengers: row.passengers,
        luggage: row.luggage,
        driver: row.driver,
        vehicle: row.vehicle,
        notes: row.notes,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));
}

async function updateTransfer(id, payload) {
    await ensureTables();

    const allowed = {
        status: 'status',
        driver: 'driver',
        vehicle: 'vehicle',
        pickupTime: 'scheduled_time',
        pickupLocation: 'pickup_location',
        dropoffLocation: 'dropoff_location',
        flightInfo: 'flight_info',
        passengers: 'passengers',
        luggage: 'luggage',
        notes: 'notes',
    };

    const updates = [];
    const params = [];
    for (const [key, column] of Object.entries(allowed)) {
        if (payload[key] === undefined) continue;
        updates.push(`${column} = ?`);
        params.push(payload[key] === '' ? null : payload[key]);
    }

    if (!updates.length) {
        const error = new Error('No transfer fields were supplied for update.');
        error.status = 422;
        throw error;
    }

    params.push(String(id));
    await db.query(
        `UPDATE guest_transfer_requests
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = ?`,
        params
    );

    const rows = await db.query('SELECT * FROM guest_transfer_requests WHERE id = ? LIMIT 1', [String(id)]);
    if (!rows[0]) {
        const error = new Error('Transfer request not found.');
        error.status = 404;
        throw error;
    }

    return (await listTransfers()).find((item) => item.id === String(id)) || null;
}

async function listHousekeepingSchedule() {
    await ensureTables();
    const rows = await db.query(`
        SELECT *
        FROM guest_housekeeping_schedule
        ORDER BY check_out_date ASC, expected_check_out_time ASC, created_at ASC
    `);

    return rows.map((row) => ({
        id: String(row.id),
        reservationId: String(row.external_reservation_id),
        propertyId: row.property_id,
        propertyName: row.property_name,
        roomId: row.room_id,
        roomNumber: row.room_number,
        guestName: row.guest_name,
        checkInDate: row.check_in_date,
        checkInTime: row.expected_check_in_time,
        checkOutDate: row.check_out_date,
        checkOutTime: row.expected_check_out_time,
        status: row.status,
        updatedAt: row.updated_at,
    }));
}

module.exports = {
    syncGuestOperations,
    listTransfers,
    updateTransfer,
    listHousekeepingSchedule,
};
