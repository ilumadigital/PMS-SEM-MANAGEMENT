const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../config/db');
const cloudbedsService = require('./cloudbeds.service');

const FRONTEND_URL = (process.env.PMS_FRONTEND_URL || 'https://pms.sem-management.com').replace(/\/$/, '');
const TOKEN_TTL_DAYS = Number(process.env.GUEST_PORTAL_TOKEN_TTL_DAYS || 90);

let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;

    await db.query(`CREATE TABLE IF NOT EXISTS guest_portals (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(32) NOT NULL,
        external_reservation_id VARCHAR(128) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        guest_email VARCHAR(255) NULL,
        guest_name VARCHAR(255) NULL,
        property_id VARCHAR(128) NULL,
        property_name VARCHAR(255) NULL,
        reservation_snapshot_json LONGTEXT NOT NULL,
        submitted_json LONGTEXT NULL,
        addon_requests_json LONGTEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'invited',
        sent_at DATETIME NULL,
        opened_at DATETIME NULL,
        completed_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_guest_portal_reservation (source, external_reservation_id),
        UNIQUE KEY uniq_guest_portal_token (token_hash),
        INDEX idx_guest_portal_expiry (expires_at)
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS guest_portal_messages (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        guest_portal_id BIGINT NOT NULL,
        channel VARCHAR(32) NOT NULL DEFAULT 'email',
        recipient VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NULL,
        status VARCHAR(32) NOT NULL,
        provider_message_id VARCHAR(255) NULL,
        error_message TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_guest_portal_messages_portal (guest_portal_id)
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS guest_portal_stay_info (
        source VARCHAR(32) NOT NULL DEFAULT 'cloudbeds',
        external_reservation_id VARCHAR(128) NOT NULL,
        room_access_code VARCHAR(255) NULL,
        building_access_code VARCHAR(255) NULL,
        wifi_name VARCHAR(255) NULL,
        wifi_password VARCHAR(255) NULL,
        property_address VARCHAR(500) NULL,
        checkin_instructions TEXT NULL,
        checkout_instructions TEXT NULL,
        parking_info TEXT NULL,
        hot_water_info TEXT NULL,
        emergency_contact VARCHAR(255) NULL,
        support_phone VARCHAR(255) NULL,
        useful_info TEXT NULL,
        access_released TINYINT(1) NOT NULL DEFAULT 0,
        updated_by INT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (source, external_reservation_id)
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS guest_service_catalog (
        id VARCHAR(80) PRIMARY KEY,
        name VARCHAR(180) NOT NULL,
        category VARCHAR(80) NOT NULL DEFAULT 'service',
        description TEXT NULL,
        price_label VARCHAR(100) NULL,
        price_amount DECIMAL(10,2) NULL,
        requires_schedule TINYINT(1) NOT NULL DEFAULT 0,
        available_prearrival TINYINT(1) NOT NULL DEFAULT 1,
        available_instay TINYINT(1) NOT NULL DEFAULT 1,
        active TINYINT(1) NOT NULL DEFAULT 1,
        sort_order INT NOT NULL DEFAULT 100,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS guest_service_requests (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        guest_portal_id BIGINT NOT NULL,
        service_id VARCHAR(80) NOT NULL,
        service_name VARCHAR(180) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        requested_for DATETIME NULL,
        guest_notes TEXT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'requested',
        price_amount DECIMAL(10,2) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_guest_service_portal (guest_portal_id),
        INDEX idx_guest_service_status (status)
    )`);

    await db.query(`CREATE TABLE IF NOT EXISTS transfers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        reservation_id VARCHAR(100) NULL,
        property_id VARCHAR(100) NULL,
        guest_name VARCHAR(160) NOT NULL,
        guest_phone VARCHAR(80) NULL,
        transfer_type VARCHAR(40) NOT NULL DEFAULT 'airport_pickup',
        pickup_location VARCHAR(255) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        scheduled_at DATETIME NOT NULL,
        passengers INT NOT NULL DEFAULT 1,
        luggage INT NOT NULL DEFAULT 0,
        flight_info VARCHAR(120) NULL,
        driver VARCHAR(120) NULL,
        vehicle VARCHAR(120) NULL,
        notes TEXT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'unassigned',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_transfer_schedule (scheduled_at),
        INDEX idx_transfer_status (status),
        INDEX idx_transfer_property (property_id)
    )`);

    const catalogCount = await db.query('SELECT COUNT(*) total FROM guest_service_catalog');
    if (Number(catalogCount[0]?.total || 0) === 0) {
        const seeds = [
            ['airport-transfer', 'Airport Transfer', 'mobility', 'Private airport pickup or drop-off arranged by SEM.', 'By request', null, 1, 10],
            ['port-transfer', 'Port Transfer', 'mobility', 'Private transfer to or from the port.', 'By request', null, 1, 20],
            ['private-driver', 'Private Driver', 'mobility', 'Private driver for a scheduled route or custom itinerary.', 'By request', null, 1, 30],
            ['early-checkin', 'Early Check-in', 'stay', 'Request access before the standard check-in time, subject to availability.', 'From €20', 20, 1, 40],
            ['late-checkout', 'Late Check-out', 'stay', 'Request a later departure time, subject to availability.', 'From €20', 20, 1, 50],
            ['extra-cleaning', 'Extra Cleaning', 'housekeeping', 'Additional cleaning service during your stay.', 'By request', null, 1, 60],
            ['linen-change', 'Fresh Linen & Towels', 'housekeeping', 'Request an extra linen or towel change.', 'By request', null, 0, 70],
            ['baby-cot', 'Baby Cot', 'stay', 'Request a baby cot for the property.', 'By request', null, 0, 80],
            ['luggage-storage', 'Luggage Assistance', 'stay', 'Request luggage storage or assistance before arrival or after departure.', 'By request', null, 1, 90],
            ['welcome-package', 'Welcome Package', 'experience', 'Arrange groceries, refreshments or a custom welcome setup.', 'By request', null, 0, 100],
            ['celebration-setup', 'Celebration Setup', 'experience', 'Flowers, birthday, anniversary or special occasion setup.', 'By request', null, 1, 110],
            ['local-experience', 'Local Experience', 'experience', 'Ask SEM to arrange activities, dining or a custom local experience.', 'By request', null, 1, 120],
        ];
        for (const seed of seeds) {
            await db.query(`INSERT INTO guest_service_catalog
                (id, name, category, description, price_label, price_amount, requires_schedule, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, seed);
        }
    }

    tablesReady = true;
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function safeJson(value, fallback) {
    try {
        if (!value) return fallback;
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
        return fallback;
    }
}

function publicReservationSnapshot(reservation) {
    return {
        id: reservation.id,
        guestName: reservation.guestName || 'Guest',
        guestEmail: reservation.guestEmail || '',
        guestPhone: reservation.guestPhone || '',
        propertyId: reservation.propertyId || '',
        propertyName: reservation.property?.name || 'SEM Property',
        propertyCity: reservation.property?.city || '',
        roomNumber: reservation.roomNumber || 'Unassigned',
        roomType: reservation.roomType || '',
        arrivalDate: reservation.arrivalDate || '',
        arrivalTime: reservation.arrivalTime || '',
        departureDate: reservation.departureDate || '',
        departureTime: reservation.departureTime || '',
        nights: reservation.nights || null,
        status: reservation.status || 'confirmed',
        source: reservation.source || 'cloudbeds',
    };
}

async function findReservation(reservationId) {
    const snapshot = await cloudbedsService.listReservations();
    return snapshot.reservations.find((item) => String(item.id) === String(reservationId)) || null;
}

function createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) return null;
    return nodemailer.createTransport({
        host,
        port,
        secure: String(process.env.SMTP_SECURE || 'false') === 'true' || port === 465,
        auth: { user, pass },
    });
}

function emailHtml({ guestName, propertyName, checkinUrl, portalUrl }) {
    const firstName = String(guestName || 'Guest').trim().split(/\s+/)[0] || 'Guest';
    return `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f4f7fb"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e4e9f0">
    <tr><td style="padding:28px 30px;background:#111827;color:#fff"><div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#93c5fd">SEM Guest Experience</div><h1 style="margin:10px 0 0;font-size:26px">Welcome ${firstName}</h1></td></tr>
    <tr><td style="padding:30px"><p style="margin:0 0 14px;font-size:16px;line-height:1.6">Your reservation at <strong>${propertyName}</strong> is confirmed.</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563">Complete your online check-in and keep this secure link. It becomes your SEM mini-site for room access, Wi-Fi, property information, transfers, services and requests throughout your stay.</p>
    <p style="margin:0 0 24px"><a href="${checkinUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Complete online check-in</a></p>
    <p style="margin:0;font-size:13px;color:#6b7280">Guest Portal: <a href="${portalUrl}" style="color:#2563eb">${portalUrl}</a></p>
    <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#9ca3af">This is a private link for your reservation. Please do not share it.</p></td></tr></table></td></tr></table></body></html>`;
}

async function createOrRefreshPortal(reservation) {
    await ensureTables();
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    const snapshot = publicReservationSnapshot(reservation);
    const departure = snapshot.departureDate ? new Date(`${snapshot.departureDate}T23:59:59`) : null;
    const departureExpiry = departure && !Number.isNaN(departure.getTime()) ? new Date(departure.getTime() + 14 * 86400000) : null;
    const defaultExpiry = new Date(Date.now() + TOKEN_TTL_DAYS * 86400000);
    const expiresAt = departureExpiry && departureExpiry > defaultExpiry ? departureExpiry : defaultExpiry;

    await db.query(`INSERT INTO guest_portals
        (source, external_reservation_id, token_hash, guest_email, guest_name, property_id, property_name, reservation_snapshot_json, status, expires_at)
        VALUES ('cloudbeds', ?, ?, ?, ?, ?, ?, ?, 'invited', ?)
        ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash), guest_email=VALUES(guest_email), guest_name=VALUES(guest_name),
        property_id=VALUES(property_id), property_name=VALUES(property_name), reservation_snapshot_json=VALUES(reservation_snapshot_json),
        expires_at=VALUES(expires_at), updated_at=NOW()`, [
        String(reservation.id), hash, snapshot.guestEmail || null, snapshot.guestName || null,
        snapshot.propertyId || null, snapshot.propertyName || null, JSON.stringify(snapshot), expiresAt,
    ]);

    const rows = await db.query(`SELECT id FROM guest_portals WHERE source='cloudbeds' AND external_reservation_id=? LIMIT 1`, [String(reservation.id)]);
    return { id: rows[0]?.id, token, reservation: snapshot, checkinUrl: `${FRONTEND_URL}/guest/${token}/check-in`, portalUrl: `${FRONTEND_URL}/guest/${token}`, expiresAt };
}

async function sendInstructions(reservationId) {
    const reservation = await findReservation(reservationId);
    if (!reservation) throw Object.assign(new Error('Reservation was not found in the connected Cloudbeds property.'), { status: 404, code: 'RESERVATION_NOT_FOUND' });
    if (!reservation.guestEmail) throw Object.assign(new Error('This reservation has no guest email in Cloudbeds.'), { status: 422, code: 'GUEST_EMAIL_MISSING' });

    const portal = await createOrRefreshPortal(reservation);
    const transporter = createTransporter();
    if (!transporter) {
        await db.query(`INSERT INTO guest_portal_messages (guest_portal_id, recipient, subject, status, error_message) VALUES (?, ?, ?, 'not_configured', ?)`,
            [portal.id, reservation.guestEmail, 'Your SEM Guest Portal', 'SMTP is not configured on the backend.']);
        return { ...portal, emailSent: false, emailStatus: 'not_configured', message: 'Secure guest link created, but SMTP is not configured.' };
    }

    const from = process.env.GUEST_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
    const subject = `Your SEM Guest Portal – ${portal.reservation.propertyName}`;
    try {
        const info = await transporter.sendMail({ from, to: reservation.guestEmail, subject, html: emailHtml({ guestName: reservation.guestName, propertyName: portal.reservation.propertyName, checkinUrl: portal.checkinUrl, portalUrl: portal.portalUrl }) });
        await db.query(`UPDATE guest_portals SET sent_at=NOW(), status=IF(status='completed','completed','invited') WHERE id=?`, [portal.id]);
        await db.query(`INSERT INTO guest_portal_messages (guest_portal_id, recipient, subject, status, provider_message_id) VALUES (?, ?, ?, 'sent', ?)`, [portal.id, reservation.guestEmail, subject, info.messageId || null]);
        return { ...portal, emailSent: true, emailStatus: 'sent' };
    } catch (error) {
        await db.query(`INSERT INTO guest_portal_messages (guest_portal_id, recipient, subject, status, error_message) VALUES (?, ?, ?, 'failed', ?)`, [portal.id, reservation.guestEmail, subject, String(error.message || error)]);
        throw Object.assign(error, { status: 502, code: 'GUEST_EMAIL_SEND_FAILED' });
    }
}

function mapStayInfo(row, includeSecrets) {
    if (!row) return { accessReleased: false };
    const released = Boolean(row.access_released);
    return {
        accessReleased: released,
        roomAccessCode: includeSecrets || released ? row.room_access_code || '' : '',
        buildingAccessCode: includeSecrets || released ? row.building_access_code || '' : '',
        wifiName: includeSecrets || released ? row.wifi_name || '' : '',
        wifiPassword: includeSecrets || released ? row.wifi_password || '' : '',
        propertyAddress: row.property_address || '',
        checkinInstructions: includeSecrets || released ? row.checkin_instructions || '' : '',
        checkoutInstructions: row.checkout_instructions || '',
        parkingInfo: row.parking_info || '',
        hotWaterInfo: row.hot_water_info || '',
        emergencyContact: row.emergency_contact || '',
        supportPhone: row.support_phone || '',
        usefulInfo: row.useful_info || '',
        updatedAt: row.updated_at || null,
    };
}

function mapCatalog(row) {
    return {
        id: row.id, name: row.name, category: row.category, description: row.description || '',
        priceLabel: row.price_label || (row.price_amount != null ? `€${Number(row.price_amount).toFixed(2)}` : 'By request'),
        priceAmount: row.price_amount == null ? null : Number(row.price_amount), requiresSchedule: Boolean(row.requires_schedule),
        availablePrearrival: Boolean(row.available_prearrival), availableInstay: Boolean(row.available_instay), active: Boolean(row.active), sortOrder: Number(row.sort_order || 100),
    };
}

function mapServiceRequest(row) {
    return { id: String(row.id), serviceId: row.service_id, serviceName: row.service_name, quantity: Number(row.quantity || 1), requestedFor: row.requested_for, guestNotes: row.guest_notes || '', status: row.status, priceAmount: row.price_amount == null ? null : Number(row.price_amount), createdAt: row.created_at };
}

function mapTransfer(row) {
    return { id: String(row.id), type: row.transfer_type, pickupLocation: row.pickup_location, destination: row.destination, scheduledAt: row.scheduled_at, passengers: Number(row.passengers || 1), luggage: Number(row.luggage || 0), flightInfo: row.flight_info || '', driver: row.driver || '', vehicle: row.vehicle || '', notes: row.notes || '', status: row.status, createdAt: row.created_at };
}

async function loadPortalRow(token) {
    await ensureTables();
    const rows = await db.query(`SELECT * FROM guest_portals WHERE token_hash=? AND expires_at>=NOW() LIMIT 1`, [tokenHash(token)]);
    const row = rows[0];
    if (!row) throw Object.assign(new Error('This guest link is invalid or has expired.'), { status: 404, code: 'GUEST_PORTAL_LINK_INVALID' });
    return row;
}

async function getPortalByToken(token, markOpened = true) {
    const row = await loadPortalRow(token);
    if (markOpened && !row.opened_at) await db.query(`UPDATE guest_portals SET opened_at=NOW(), status=IF(status='invited','opened',status) WHERE id=?`, [row.id]);

    const [stayRows, catalogRows, requestRows, transferRows] = await Promise.all([
        db.query(`SELECT * FROM guest_portal_stay_info WHERE source=? AND external_reservation_id=? LIMIT 1`, [row.source, row.external_reservation_id]),
        db.query(`SELECT * FROM guest_service_catalog WHERE active=1 ORDER BY sort_order, name`),
        db.query(`SELECT * FROM guest_service_requests WHERE guest_portal_id=? ORDER BY created_at DESC`, [row.id]),
        db.query(`SELECT * FROM transfers WHERE reservation_id=? ORDER BY scheduled_at DESC`, [row.external_reservation_id]),
    ]);

    const reservation = safeJson(row.reservation_snapshot_json, {});
    const submitted = safeJson(row.submitted_json, {});
    const checkinComplete = row.status === 'completed';
    return {
        id: row.id, status: row.status, reservation, submitted,
        addonRequests: safeJson(row.addon_requests_json, []), sentAt: row.sent_at, openedAt: row.opened_at, completedAt: row.completed_at, expiresAt: row.expires_at,
        stayInfo: mapStayInfo(stayRows[0], false),
        services: catalogRows.map(mapCatalog).filter((item) => checkinComplete ? item.availableInstay : item.availablePrearrival),
        addons: catalogRows.map(mapCatalog).filter((item) => item.availablePrearrival),
        serviceRequests: requestRows.map(mapServiceRequest),
        transfers: transferRows.map(mapTransfer),
        phase: checkinComplete ? 'stay' : 'prearrival',
    };
}

async function saveCheckin(token, payload) {
    const portal = await getPortalByToken(token, false);
    const submitted = {
        guestPhone: String(payload.guestPhone || portal.reservation.guestPhone || ''),
        arrivalTime: String(payload.arrivalTime || ''), departureTime: String(payload.departureTime || ''),
        arrivalMethod: String(payload.arrivalMethod || ''), flightNumber: String(payload.flightNumber || ''),
        specialRequests: String(payload.specialRequests || ''), termsAccepted: Boolean(payload.termsAccepted),
    };
    const addons = Array.isArray(payload.addonRequests) ? payload.addonRequests : [];
    if (!submitted.arrivalTime || !submitted.departureTime) throw Object.assign(new Error('Arrival and departure times are required.'), { status: 422, code: 'CHECKIN_TIMES_REQUIRED' });
    if (!submitted.termsAccepted) throw Object.assign(new Error('The guest must accept the house rules and terms before completing check-in.'), { status: 422, code: 'TERMS_REQUIRED' });

    await db.query(`UPDATE guest_portals SET submitted_json=?, addon_requests_json=?, status='completed', completed_at=NOW() WHERE id=?`, [JSON.stringify(submitted), JSON.stringify(addons), portal.id]);
    await cloudbedsService.saveReservationOperations(portal.reservation.id, {
        arrivalTime: submitted.arrivalTime, departureTime: submitted.departureTime,
        specialRequests: [submitted.specialRequests, submitted.arrivalMethod ? `Arrival method: ${submitted.arrivalMethod}` : '', submitted.flightNumber ? `Flight: ${submitted.flightNumber}` : '', ...addons.map((addon) => `Add-on request: ${addon.name || addon.id}`)].filter(Boolean),
    });

    for (const addon of addons) {
        const existing = await db.query(`SELECT id FROM guest_service_requests WHERE guest_portal_id=? AND service_id=? LIMIT 1`, [portal.id, addon.id]);
        if (!existing.length) await createServiceRequest(token, { serviceId: addon.id, quantity: 1, guestNotes: 'Requested during online check-in' });
    }
    return getPortalByToken(token, false);
}

async function createServiceRequest(token, payload) {
    const row = await loadPortalRow(token);
    const serviceRows = await db.query(`SELECT * FROM guest_service_catalog WHERE id=? AND active=1 LIMIT 1`, [String(payload.serviceId || '')]);
    const service = serviceRows[0];
    if (!service) throw Object.assign(new Error('This service is not currently available.'), { status: 404, code: 'SERVICE_NOT_AVAILABLE' });
    const quantity = Math.max(1, Math.min(20, Number(payload.quantity || 1)));
    const requestedFor = payload.requestedFor ? new Date(payload.requestedFor) : null;
    if (service.requires_schedule && (!requestedFor || Number.isNaN(requestedFor.getTime()))) throw Object.assign(new Error('Please select a date and time for this service.'), { status: 422, code: 'SERVICE_SCHEDULE_REQUIRED' });
    const result = await db.query(`INSERT INTO guest_service_requests (guest_portal_id, service_id, service_name, quantity, requested_for, guest_notes, status, price_amount) VALUES (?, ?, ?, ?, ?, ?, 'requested', ?)`, [row.id, service.id, service.name, quantity, requestedFor, String(payload.guestNotes || ''), service.price_amount]);
    const rows = await db.query(`SELECT * FROM guest_service_requests WHERE id=?`, [result.insertId]);
    return mapServiceRequest(rows[0]);
}

async function createTransferRequest(token, payload) {
    const row = await loadPortalRow(token);
    const reservation = safeJson(row.reservation_snapshot_json, {});
    const pickupLocation = String(payload.pickupLocation || '').trim();
    const destination = String(payload.destination || '').trim();
    const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
    if (!pickupLocation || !destination || !scheduledAt || Number.isNaN(scheduledAt.getTime())) throw Object.assign(new Error('Pickup, destination and date/time are required.'), { status: 422, code: 'TRANSFER_FIELDS_REQUIRED' });
    const result = await db.query(`INSERT INTO transfers (reservation_id, property_id, guest_name, guest_phone, transfer_type, pickup_location, destination, scheduled_at, passengers, luggage, flight_info, notes, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unassigned', NULL)`, [
        row.external_reservation_id, row.property_id || reservation.propertyId || null, row.guest_name || reservation.guestName || 'Guest',
        safeJson(row.submitted_json, {}).guestPhone || reservation.guestPhone || null, String(payload.transferType || 'airport_pickup'), pickupLocation, destination, scheduledAt,
        Math.max(1, Number(payload.passengers || 1)), Math.max(0, Number(payload.luggage || 0)), String(payload.flightInfo || ''), String(payload.notes || ''),
    ]);
    const rows = await db.query(`SELECT * FROM transfers WHERE id=?`, [result.insertId]);
    return mapTransfer(rows[0]);
}

async function getReservationPortalStatus(reservationId) {
    await ensureTables();
    const rows = await db.query(`SELECT status, guest_email, sent_at, opened_at, completed_at, expires_at FROM guest_portals WHERE source='cloudbeds' AND external_reservation_id=? LIMIT 1`, [String(reservationId)]);
    return rows[0] || null;
}

async function getReservationManagement(reservationId) {
    await ensureTables();
    const [portalRows, stayRows, catalogRows] = await Promise.all([
        db.query(`SELECT id,status,guest_email,sent_at,opened_at,completed_at,expires_at FROM guest_portals WHERE source='cloudbeds' AND external_reservation_id=? LIMIT 1`, [String(reservationId)]),
        db.query(`SELECT * FROM guest_portal_stay_info WHERE source='cloudbeds' AND external_reservation_id=? LIMIT 1`, [String(reservationId)]),
        db.query(`SELECT * FROM guest_service_catalog ORDER BY sort_order,name`),
    ]);
    let requests = []; let transfers = [];
    if (portalRows[0]) requests = await db.query(`SELECT * FROM guest_service_requests WHERE guest_portal_id=? ORDER BY created_at DESC`, [portalRows[0].id]);
    transfers = await db.query(`SELECT * FROM transfers WHERE reservation_id=? ORDER BY scheduled_at DESC`, [String(reservationId)]);
    return { portal: portalRows[0] || null, stayInfo: mapStayInfo(stayRows[0], true), catalog: catalogRows.map(mapCatalog), serviceRequests: requests.map(mapServiceRequest), transfers: transfers.map(mapTransfer) };
}

async function saveStayInfo(reservationId, payload, userId) {
    await ensureTables();
    const p = payload || {};
    await db.query(`INSERT INTO guest_portal_stay_info
        (source,external_reservation_id,room_access_code,building_access_code,wifi_name,wifi_password,property_address,checkin_instructions,checkout_instructions,parking_info,hot_water_info,emergency_contact,support_phone,useful_info,access_released,updated_by)
        VALUES ('cloudbeds',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE room_access_code=VALUES(room_access_code),building_access_code=VALUES(building_access_code),wifi_name=VALUES(wifi_name),wifi_password=VALUES(wifi_password),property_address=VALUES(property_address),checkin_instructions=VALUES(checkin_instructions),checkout_instructions=VALUES(checkout_instructions),parking_info=VALUES(parking_info),hot_water_info=VALUES(hot_water_info),emergency_contact=VALUES(emergency_contact),support_phone=VALUES(support_phone),useful_info=VALUES(useful_info),access_released=VALUES(access_released),updated_by=VALUES(updated_by)`, [
        String(reservationId), p.roomAccessCode || null, p.buildingAccessCode || null, p.wifiName || null, p.wifiPassword || null,
        p.propertyAddress || null, p.checkinInstructions || null, p.checkoutInstructions || null, p.parkingInfo || null, p.hotWaterInfo || null,
        p.emergencyContact || null, p.supportPhone || null, p.usefulInfo || null, p.accessReleased ? 1 : 0, userId || null,
    ]);
    const rows = await db.query(`SELECT * FROM guest_portal_stay_info WHERE source='cloudbeds' AND external_reservation_id=?`, [String(reservationId)]);
    return mapStayInfo(rows[0], true);
}

async function saveCatalog(items) {
    await ensureTables();
    if (!Array.isArray(items)) throw Object.assign(new Error('Catalog must be an array.'), { status: 422, code: 'CATALOG_INVALID' });
    for (const item of items) {
        if (!item.id || !item.name) continue;
        await db.query(`INSERT INTO guest_service_catalog (id,name,category,description,price_label,price_amount,requires_schedule,available_prearrival,available_instay,active,sort_order)
            VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),description=VALUES(description),price_label=VALUES(price_label),price_amount=VALUES(price_amount),requires_schedule=VALUES(requires_schedule),available_prearrival=VALUES(available_prearrival),available_instay=VALUES(available_instay),active=VALUES(active),sort_order=VALUES(sort_order)`, [
            String(item.id), String(item.name), String(item.category || 'service'), String(item.description || ''), String(item.priceLabel || ''), item.priceAmount === '' || item.priceAmount == null ? null : Number(item.priceAmount),
            item.requiresSchedule ? 1 : 0, item.availablePrearrival === false ? 0 : 1, item.availableInstay === false ? 0 : 1, item.active === false ? 0 : 1, Number(item.sortOrder || 100),
        ]);
    }
    return (await db.query(`SELECT * FROM guest_service_catalog ORDER BY sort_order,name`)).map(mapCatalog);
}

async function updateServiceRequestStatus(requestId, status) {
    const allowed = ['requested','confirmed','in_progress','completed','declined','cancelled'];
    if (!allowed.includes(status)) throw Object.assign(new Error('Invalid request status.'), { status: 422, code: 'REQUEST_STATUS_INVALID' });
    await db.query(`UPDATE guest_service_requests SET status=? WHERE id=?`, [status, requestId]);
    const rows = await db.query(`SELECT * FROM guest_service_requests WHERE id=?`, [requestId]);
    if (!rows.length) throw Object.assign(new Error('Service request not found.'), { status: 404, code: 'REQUEST_NOT_FOUND' });
    return mapServiceRequest(rows[0]);
}

module.exports = {
    sendInstructions, getPortalByToken, saveCheckin, createServiceRequest, createTransferRequest,
    getReservationPortalStatus, getReservationManagement, saveStayInfo, saveCatalog, updateServiceRequestStatus,
};
