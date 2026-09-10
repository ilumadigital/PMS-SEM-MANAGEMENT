const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('../config/db');
const cloudbedsService = require('./cloudbeds.service');

const FRONTEND_URL = (process.env.PMS_FRONTEND_URL || 'https://pms.sem-management.com').replace(/\/$/, '');
const TOKEN_TTL_DAYS = Number(process.env.GUEST_PORTAL_TOKEN_TTL_DAYS || 30);

const DEFAULT_CATALOG = [
    {
        serviceKey: 'airport-transfer',
        name: 'Airport Transfer',
        description: 'Private pickup or drop-off with route, flight and passenger details.',
        category: 'mobility',
        priceLabel: 'By request',
        actionType: 'transfer',
        sortOrder: 10,
    },
    {
        serviceKey: 'port-transfer',
        name: 'Port Transfer',
        description: 'Private transfer to or from the port with luggage support.',
        category: 'mobility',
        priceLabel: 'By request',
        actionType: 'transfer',
        sortOrder: 20,
    },
    {
        serviceKey: 'private-driver',
        name: 'Private Driver',
        description: 'Request a private driver for a local ride or custom route.',
        category: 'mobility',
        priceLabel: 'By request',
        actionType: 'transfer',
        sortOrder: 30,
    },
    {
        serviceKey: 'early-checkin',
        name: 'Early Check-in',
        description: 'Request access before the standard check-in time, subject to availability.',
        category: 'stay',
        priceLabel: 'From €20',
        actionType: 'request',
        sortOrder: 40,
    },
    {
        serviceKey: 'late-checkout',
        name: 'Late Check-out',
        description: 'Request a later departure time, subject to availability.',
        category: 'stay',
        priceLabel: 'From €20',
        actionType: 'request',
        sortOrder: 50,
    },
    {
        serviceKey: 'extra-cleaning',
        name: 'Extra Cleaning',
        description: 'Request an additional cleaning visit during your stay.',
        category: 'housekeeping',
        priceLabel: 'By request',
        actionType: 'request',
        sortOrder: 60,
    },
    {
        serviceKey: 'linen-refresh',
        name: 'Fresh Linen & Towels',
        description: 'Request a fresh linen or towel set for your accommodation.',
        category: 'housekeeping',
        priceLabel: 'By request',
        actionType: 'request',
        sortOrder: 70,
    },
    {
        serviceKey: 'luggage-assistance',
        name: 'Luggage Assistance',
        description: 'Ask the SEM team for luggage-related assistance before or after your stay.',
        category: 'concierge',
        priceLabel: 'By request',
        actionType: 'request',
        sortOrder: 80,
    },
    {
        serviceKey: 'concierge-request',
        name: 'Concierge Request',
        description: 'Tell us what you need and the SEM team will follow up with you.',
        category: 'concierge',
        priceLabel: 'Personal quote',
        actionType: 'request',
        sortOrder: 90,
    },
];

const EMPTY_STAY_CONTENT = {
    roomAccessCode: '',
    buildingAccessCode: '',
    lockboxCode: '',
    wifiName: '',
    wifiPassword: '',
    propertyAddress: '',
    checkinInstructions: '',
    checkoutInstructions: '',
    parkingInfo: '',
    hotWaterInfo: '',
    houseRules: '',
    contactPhone: '',
    emergencyPhone: '',
    usefulInfo: '',
    accessPublished: false,
    servicesEnabled: true,
};

let tablesReady = false;

async function ensureTables() {
    if (tablesReady) return;

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_portals (
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
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_portal_messages (
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
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_stay_content (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            source VARCHAR(32) NOT NULL DEFAULT 'cloudbeds',
            external_reservation_id VARCHAR(128) NOT NULL,
            content_ciphertext LONGTEXT NOT NULL,
            access_published TINYINT(1) NOT NULL DEFAULT 0,
            services_enabled TINYINT(1) NOT NULL DEFAULT 1,
            updated_by INT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_guest_stay_content (source, external_reservation_id)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_service_catalog (
            service_key VARCHAR(80) PRIMARY KEY,
            name VARCHAR(160) NOT NULL,
            description TEXT NULL,
            category VARCHAR(60) NOT NULL DEFAULT 'stay',
            price_label VARCHAR(80) NULL,
            action_type VARCHAR(32) NOT NULL DEFAULT 'request',
            active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 100,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS guest_service_requests (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            guest_portal_id BIGINT NOT NULL,
            external_reservation_id VARCHAR(128) NOT NULL,
            service_key VARCHAR(80) NOT NULL,
            service_name VARCHAR(160) NOT NULL,
            category VARCHAR(60) NOT NULL DEFAULT 'stay',
            quantity INT NOT NULL DEFAULT 1,
            notes TEXT NULL,
            request_origin VARCHAR(32) NOT NULL DEFAULT 'portal',
            request_json LONGTEXT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'requested',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_guest_requests_portal (guest_portal_id),
            INDEX idx_guest_requests_reservation (external_reservation_id),
            INDEX idx_guest_requests_status (status)
        )
    `);

    await ensureTransfersTable();

    for (const service of DEFAULT_CATALOG) {
        await db.query(
            `INSERT IGNORE INTO guest_service_catalog
                (service_key, name, description, category, price_label, action_type, active, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
            [
                service.serviceKey,
                service.name,
                service.description,
                service.category,
                service.priceLabel,
                service.actionType,
                service.sortOrder,
            ]
        );
    }

    tablesReady = true;
}

async function ensureTransfersTable() {
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

function contentKey() {
    const secret = process.env.GUEST_PORTAL_DATA_SECRET || process.env.JWT_SECRET || process.env.DB_PASSWORD || 'sem-guest-portal-development-key';
    return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptContent(content) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', contentKey(), iv);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(content), 'utf8'),
        cipher.final(),
    ]);
    return JSON.stringify({
        v: 1,
        alg: 'aes-256-gcm',
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: encrypted.toString('base64'),
    });
}

function decryptContent(value) {
    const parsed = safeJson(value, null);
    if (!parsed) return { ...EMPTY_STAY_CONTENT };

    if (parsed.v !== 1 || !parsed.iv || !parsed.tag || !parsed.data) {
        return { ...EMPTY_STAY_CONTENT, ...parsed };
    }

    try {
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            contentKey(),
            Buffer.from(parsed.iv, 'base64')
        );
        decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(parsed.data, 'base64')),
            decipher.final(),
        ]).toString('utf8');
        return { ...EMPTY_STAY_CONTENT, ...safeJson(decrypted, {}) };
    } catch (error) {
        console.error('❌ [GUEST CONTENT DECRYPT]:', error.message);
        return { ...EMPTY_STAY_CONTENT };
    }
}

function cleanText(value, maxLength = 4000) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeStayContent(payload = {}, current = EMPTY_STAY_CONTENT) {
    const stringFields = [
        'roomAccessCode',
        'buildingAccessCode',
        'lockboxCode',
        'wifiName',
        'wifiPassword',
        'propertyAddress',
        'checkinInstructions',
        'checkoutInstructions',
        'parkingInfo',
        'hotWaterInfo',
        'houseRules',
        'contactPhone',
        'emergencyPhone',
        'usefulInfo',
    ];

    const next = { ...EMPTY_STAY_CONTENT, ...current };
    for (const field of stringFields) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
            next[field] = cleanText(payload[field], field.includes('Code') || field.includes('Password') ? 255 : 6000);
        }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'accessPublished')) {
        next.accessPublished = Boolean(payload.accessPublished);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'servicesEnabled')) {
        next.servicesEnabled = Boolean(payload.servicesEnabled);
    }
    return next;
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
    return `<!doctype html>
<html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f4f7fb">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e4e9f0">
        <tr><td style="padding:28px 30px;background:#111827;color:#fff">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#93c5fd">SEM Guest Experience</div>
          <h1 style="margin:10px 0 0;font-size:26px">Welcome ${firstName}</h1>
        </td></tr>
        <tr><td style="padding:30px">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.6">Your reservation at <strong>${propertyName}</strong> is confirmed.</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563">Complete your pre-arrival details and optional service requests. The same secure link then becomes your SEM Stay Hub, where you can view released room access and Wi-Fi details, book transfers and request services during your stay.</p>
          <p style="margin:0 0 24px"><a href="${checkinUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px">Complete online check-in</a></p>
          <p style="margin:0;font-size:13px;color:#6b7280">Guest Portal: <a href="${portalUrl}" style="color:#0284c7">${portalUrl}</a></p>
          <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#9ca3af">This is a private secure link for your reservation. Please do not share it.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function portalExpiry(snapshot) {
    const ttlExpiry = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    if (!snapshot.departureDate) return ttlExpiry;
    const stayExpiry = new Date(`${snapshot.departureDate}T23:59:59`);
    if (Number.isNaN(stayExpiry.getTime())) return ttlExpiry;
    stayExpiry.setDate(stayExpiry.getDate() + 3);
    return stayExpiry > ttlExpiry ? stayExpiry : ttlExpiry;
}

async function createOrRefreshPortal(reservation) {
    await ensureTables();

    const token = crypto.randomBytes(32).toString('base64url');
    const hash = tokenHash(token);
    const snapshot = publicReservationSnapshot(reservation);
    const expiresAt = portalExpiry(snapshot);

    await db.query(
        `INSERT INTO guest_portals
            (source, external_reservation_id, token_hash, guest_email, guest_name, property_id, property_name,
             reservation_snapshot_json, status, expires_at)
         VALUES ('cloudbeds', ?, ?, ?, ?, ?, ?, ?, 'invited', ?)
         ON DUPLICATE KEY UPDATE
            token_hash = VALUES(token_hash),
            guest_email = VALUES(guest_email),
            guest_name = VALUES(guest_name),
            property_id = VALUES(property_id),
            property_name = VALUES(property_name),
            reservation_snapshot_json = VALUES(reservation_snapshot_json),
            expires_at = VALUES(expires_at),
            updated_at = NOW()`,
        [
            String(reservation.id),
            hash,
            snapshot.guestEmail || null,
            snapshot.guestName || null,
            snapshot.propertyId || null,
            snapshot.propertyName || null,
            JSON.stringify(snapshot),
            expiresAt,
        ]
    );

    const rows = await db.query(
        `SELECT id FROM guest_portals WHERE source = 'cloudbeds' AND external_reservation_id = ? LIMIT 1`,
        [String(reservation.id)]
    );

    return {
        id: rows[0]?.id,
        token,
        reservation: snapshot,
        checkinUrl: `${FRONTEND_URL}/guest/${token}/check-in`,
        portalUrl: `${FRONTEND_URL}/guest/${token}`,
        expiresAt,
    };
}

async function sendInstructions(reservationId) {
    const reservation = await findReservation(reservationId);
    if (!reservation) {
        const error = new Error('Reservation was not found in the connected Cloudbeds property.');
        error.status = 404;
        error.code = 'RESERVATION_NOT_FOUND';
        throw error;
    }

    if (!reservation.guestEmail) {
        const error = new Error('This reservation has no guest email in Cloudbeds.');
        error.status = 422;
        error.code = 'GUEST_EMAIL_MISSING';
        throw error;
    }

    const portal = await createOrRefreshPortal(reservation);
    const transporter = createTransporter();

    if (!transporter) {
        await db.query(
            `INSERT INTO guest_portal_messages (guest_portal_id, recipient, subject, status, error_message)
             VALUES (?, ?, ?, 'not_configured', ?)`,
            [portal.id, reservation.guestEmail, 'Complete your online check-in', 'SMTP is not configured on the backend.']
        );

        return {
            ...portal,
            emailSent: false,
            emailStatus: 'not_configured',
            message: 'Secure guest link created, but SMTP is not configured.',
        };
    }

    const from = process.env.GUEST_EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
    const subject = `Complete your online check-in – ${portal.reservation.propertyName}`;

    try {
        const info = await transporter.sendMail({
            from,
            to: reservation.guestEmail,
            subject,
            html: emailHtml({
                guestName: reservation.guestName,
                propertyName: portal.reservation.propertyName,
                checkinUrl: portal.checkinUrl,
                portalUrl: portal.portalUrl,
            }),
        });

        await db.query(`UPDATE guest_portals SET sent_at = NOW(), status = 'invited' WHERE id = ?`, [portal.id]);
        await db.query(
            `INSERT INTO guest_portal_messages
                (guest_portal_id, recipient, subject, status, provider_message_id)
             VALUES (?, ?, ?, 'sent', ?)`,
            [portal.id, reservation.guestEmail, subject, info.messageId || null]
        );

        return { ...portal, emailSent: true, emailStatus: 'sent' };
    } catch (error) {
        await db.query(
            `INSERT INTO guest_portal_messages
                (guest_portal_id, recipient, subject, status, error_message)
             VALUES (?, ?, ?, 'failed', ?)`,
            [portal.id, reservation.guestEmail, subject, String(error.message || error)]
        );
        error.status = 502;
        error.code = 'GUEST_EMAIL_SEND_FAILED';
        throw error;
    }
}

async function getStayContent(reservationId) {
    await ensureTables();
    const rows = await db.query(
        `SELECT content_ciphertext, access_published, services_enabled
         FROM guest_stay_content
         WHERE source = 'cloudbeds' AND external_reservation_id = ? LIMIT 1`,
        [String(reservationId)]
    );
    if (!rows.length) return { ...EMPTY_STAY_CONTENT };
    const content = decryptContent(rows[0].content_ciphertext);
    return {
        ...EMPTY_STAY_CONTENT,
        ...content,
        accessPublished: Boolean(rows[0].access_published),
        servicesEnabled: Boolean(rows[0].services_enabled),
    };
}

async function saveStayContent(reservationId, payload, userId) {
    await ensureTables();
    const current = await getStayContent(reservationId);
    const content = normalizeStayContent(payload, current);
    const encrypted = encryptContent(content);

    await db.query(
        `INSERT INTO guest_stay_content
            (source, external_reservation_id, content_ciphertext, access_published, services_enabled, updated_by)
         VALUES ('cloudbeds', ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            content_ciphertext = VALUES(content_ciphertext),
            access_published = VALUES(access_published),
            services_enabled = VALUES(services_enabled),
            updated_by = VALUES(updated_by),
            updated_at = NOW()`,
        [
            String(reservationId),
            encrypted,
            content.accessPublished ? 1 : 0,
            content.servicesEnabled ? 1 : 0,
            userId || null,
        ]
    );

    return getReservationConfig(reservationId);
}

async function listCatalog(includeInactive = false) {
    await ensureTables();
    const rows = await db.query(
        `SELECT service_key, name, description, category, price_label, action_type, active, sort_order
         FROM guest_service_catalog
         ${includeInactive ? '' : 'WHERE active = 1'}
         ORDER BY sort_order ASC, name ASC`
    );
    return rows.map((row) => ({
        serviceKey: row.service_key,
        id: row.service_key,
        name: row.name,
        description: row.description || '',
        category: row.category,
        priceLabel: row.price_label || 'By request',
        actionType: row.action_type,
        active: Boolean(row.active),
        sortOrder: Number(row.sort_order || 100),
    }));
}

async function updateCatalogItem(serviceKey, payload) {
    await ensureTables();
    const rows = await db.query('SELECT * FROM guest_service_catalog WHERE service_key = ? LIMIT 1', [serviceKey]);
    if (!rows.length) {
        const error = new Error('Guest service was not found.');
        error.status = 404;
        error.code = 'GUEST_SERVICE_NOT_FOUND';
        throw error;
    }
    const current = rows[0];
    const actionType = ['request', 'transfer'].includes(payload.actionType) ? payload.actionType : current.action_type;
    const category = cleanText(payload.category ?? current.category, 60) || 'stay';
    const name = cleanText(payload.name ?? current.name, 160) || current.name;
    const description = cleanText(payload.description ?? current.description, 2000);
    const priceLabel = cleanText(payload.priceLabel ?? current.price_label, 80);
    const active = Object.prototype.hasOwnProperty.call(payload, 'active') ? Boolean(payload.active) : Boolean(current.active);
    const sortOrder = Object.prototype.hasOwnProperty.call(payload, 'sortOrder')
        ? clampNumber(payload.sortOrder, 0, 9999, Number(current.sort_order || 100))
        : Number(current.sort_order || 100);

    await db.query(
        `UPDATE guest_service_catalog
         SET name = ?, description = ?, category = ?, price_label = ?, action_type = ?, active = ?, sort_order = ?
         WHERE service_key = ?`,
        [name, description, category, priceLabel, actionType, active ? 1 : 0, sortOrder, serviceKey]
    );
    return (await listCatalog(true)).find((item) => item.serviceKey === serviceKey);
}

async function getRequestsForPortal(portalId) {
    if (!portalId) return [];
    const rows = await db.query(
        `SELECT id, service_key, service_name, category, quantity, notes, request_origin, request_json, status, created_at, updated_at
         FROM guest_service_requests
         WHERE guest_portal_id = ?
         ORDER BY created_at DESC, id DESC`,
        [portalId]
    );
    return rows.map((row) => ({
        id: String(row.id),
        serviceKey: row.service_key,
        serviceName: row.service_name,
        category: row.category,
        quantity: Number(row.quantity || 1),
        notes: row.notes || '',
        origin: row.request_origin,
        details: safeJson(row.request_json, {}),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));
}

function experiencePhase(reservation, portalStatus) {
    if (portalStatus !== 'completed') return 'checkin_pending';
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (reservation.arrivalDate && todayKey < reservation.arrivalDate) return 'pre_arrival';
    if (reservation.departureDate && todayKey > reservation.departureDate) return 'post_stay';
    return 'in_stay';
}

async function getPortalByToken(token, markOpened = true) {
    await ensureTables();
    const rows = await db.query(
        `SELECT * FROM guest_portals
         WHERE token_hash = ? AND expires_at >= NOW()
         LIMIT 1`,
        [tokenHash(token)]
    );

    const row = rows[0];
    if (!row) {
        const error = new Error('This guest link is invalid or has expired.');
        error.status = 404;
        error.code = 'GUEST_PORTAL_LINK_INVALID';
        throw error;
    }

    if (markOpened && !row.opened_at) {
        await db.query(
            `UPDATE guest_portals SET opened_at = NOW(), status = IF(status = 'invited', 'opened', status) WHERE id = ?`,
            [row.id]
        );
        if (row.status === 'invited') row.status = 'opened';
        row.opened_at = new Date();
    }

    const reservation = safeJson(row.reservation_snapshot_json, {});
    const stayContent = await getStayContent(row.external_reservation_id);
    const canRevealAccess = row.status === 'completed' && stayContent.accessPublished;
    const catalog = stayContent.servicesEnabled ? await listCatalog(false) : [];
    const requests = await getRequestsForPortal(row.id);

    return {
        id: String(row.id),
        status: row.status,
        phase: experiencePhase(reservation, row.status),
        reservation,
        submitted: safeJson(row.submitted_json, {}),
        addonRequests: safeJson(row.addon_requests_json, []),
        sentAt: row.sent_at,
        openedAt: row.opened_at,
        completedAt: row.completed_at,
        expiresAt: row.expires_at,
        servicesEnabled: stayContent.servicesEnabled,
        catalog,
        addons: catalog,
        serviceRequests: requests,
        access: canRevealAccess
            ? {
                published: true,
                roomAccessCode: stayContent.roomAccessCode,
                buildingAccessCode: stayContent.buildingAccessCode,
                lockboxCode: stayContent.lockboxCode,
                wifiName: stayContent.wifiName,
                wifiPassword: stayContent.wifiPassword,
                instructions: stayContent.checkinInstructions,
            }
            : {
                published: false,
                message: row.status !== 'completed'
                    ? 'Complete online check-in to unlock stay access information.'
                    : 'Your access details have not been released by the SEM team yet.',
            },
        stayInfo: {
            propertyAddress: stayContent.propertyAddress,
            checkoutInstructions: stayContent.checkoutInstructions,
            parkingInfo: stayContent.parkingInfo,
            hotWaterInfo: stayContent.hotWaterInfo,
            houseRules: stayContent.houseRules,
            contactPhone: stayContent.contactPhone,
            emergencyPhone: stayContent.emergencyPhone,
            usefulInfo: stayContent.usefulInfo,
        },
    };
}

async function saveCheckin(token, payload) {
    const portal = await getPortalByToken(token, false);
    const submitted = {
        guestPhone: cleanText(payload.guestPhone || portal.reservation.guestPhone || '', 80),
        arrivalTime: cleanText(payload.arrivalTime, 10),
        departureTime: cleanText(payload.departureTime, 10),
        arrivalMethod: cleanText(payload.arrivalMethod, 60),
        flightNumber: cleanText(payload.flightNumber, 80),
        specialRequests: cleanText(payload.specialRequests, 3000),
        termsAccepted: Boolean(payload.termsAccepted),
    };

    if (!submitted.arrivalTime || !submitted.departureTime) {
        const error = new Error('Arrival and departure times are required.');
        error.status = 422;
        error.code = 'CHECKIN_TIMES_REQUIRED';
        throw error;
    }
    if (!submitted.termsAccepted) {
        const error = new Error('The guest must accept the house rules and terms before completing check-in.');
        error.status = 422;
        error.code = 'TERMS_REQUIRED';
        throw error;
    }

    const requestedIds = Array.isArray(payload.addonRequests)
        ? payload.addonRequests.map((item) => String(item?.serviceKey || item?.id || '')).filter(Boolean)
        : [];
    const catalog = await listCatalog(false);
    const canonicalAddons = catalog.filter((service) => requestedIds.includes(service.serviceKey));

    await db.query(
        `UPDATE guest_portals
         SET submitted_json = ?, addon_requests_json = ?, status = 'completed', completed_at = COALESCE(completed_at, NOW())
         WHERE id = ?`,
        [JSON.stringify(submitted), JSON.stringify(canonicalAddons), portal.id]
    );

    await db.query(
        `DELETE FROM guest_service_requests WHERE guest_portal_id = ? AND request_origin = 'checkin'`,
        [portal.id]
    );

    for (const addon of canonicalAddons) {
        await db.query(
            `INSERT INTO guest_service_requests
                (guest_portal_id, external_reservation_id, service_key, service_name, category, quantity, notes, request_origin, request_json, status)
             VALUES (?, ?, ?, ?, ?, 1, '', 'checkin', ?, 'requested')`,
            [portal.id, String(portal.reservation.id), addon.serviceKey, addon.name, addon.category, JSON.stringify({ priceLabel: addon.priceLabel })]
        );
    }

    await cloudbedsService.saveReservationOperations(portal.reservation.id, {
        arrivalTime: submitted.arrivalTime,
        departureTime: submitted.departureTime,
        specialRequests: [
            submitted.specialRequests,
            submitted.arrivalMethod ? `Arrival method: ${submitted.arrivalMethod}` : '',
            submitted.flightNumber ? `Flight: ${submitted.flightNumber}` : '',
            ...canonicalAddons.map((addon) => `Add-on request: ${addon.name}`),
        ].filter(Boolean),
    });

    return getPortalByToken(token, false);
}

async function requireCompletedPortal(token) {
    const portal = await getPortalByToken(token, false);
    if (portal.status !== 'completed') {
        const error = new Error('Complete online check-in before requesting stay services.');
        error.status = 403;
        error.code = 'GUEST_CHECKIN_REQUIRED';
        throw error;
    }
    if (!portal.servicesEnabled) {
        const error = new Error('Guest services are currently disabled for this reservation.');
        error.status = 403;
        error.code = 'GUEST_SERVICES_DISABLED';
        throw error;
    }
    return portal;
}

async function createServiceRequest(token, payload) {
    await ensureTables();
    const portal = await requireCompletedPortal(token);
    const serviceKey = cleanText(payload.serviceKey || payload.id, 80);
    const catalog = await listCatalog(false);
    const service = catalog.find((item) => item.serviceKey === serviceKey);
    if (!service) {
        const error = new Error('This guest service is not currently available.');
        error.status = 404;
        error.code = 'GUEST_SERVICE_NOT_AVAILABLE';
        throw error;
    }
    if (service.actionType === 'transfer') {
        const error = new Error('Use the transfer booking form so we receive route, time and passenger details.');
        error.status = 422;
        error.code = 'TRANSFER_DETAILS_REQUIRED';
        throw error;
    }

    const quantity = clampNumber(payload.quantity, 1, 20, 1);
    const notes = cleanText(payload.notes, 3000);
    const details = payload.details && typeof payload.details === 'object' ? payload.details : {};

    const result = await db.query(
        `INSERT INTO guest_service_requests
            (guest_portal_id, external_reservation_id, service_key, service_name, category, quantity, notes, request_origin, request_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'portal', ?, 'requested')`,
        [portal.id, String(portal.reservation.id), service.serviceKey, service.name, service.category, quantity, notes, JSON.stringify(details)]
    );

    return {
        requestId: String(result.insertId),
        portal: await getPortalByToken(token, false),
    };
}

function normalizeSqlDateTime(value) {
    const text = cleanText(value, 40);
    if (!text) return '';
    const normalized = text.replace('T', ' ');
    return normalized.length === 16 ? `${normalized}:00` : normalized.slice(0, 19);
}

async function createTransferRequest(token, payload) {
    await ensureTables();
    const portal = await requireCompletedPortal(token);
    const pickupLocation = cleanText(payload.pickupLocation, 255);
    const destination = cleanText(payload.destination, 255);
    const scheduledAt = normalizeSqlDateTime(payload.scheduledAt);
    if (!pickupLocation || !destination || !scheduledAt) {
        const error = new Error('Pickup location, destination and date/time are required.');
        error.status = 422;
        error.code = 'TRANSFER_FIELDS_REQUIRED';
        throw error;
    }

    const allowedTypes = ['airport_pickup', 'airport_dropoff', 'port_transfer', 'private_driver'];
    const transferType = allowedTypes.includes(payload.transferType) ? payload.transferType : 'airport_pickup';
    const passengers = clampNumber(payload.passengers, 1, 30, 1);
    const luggage = clampNumber(payload.luggage, 0, 30, 0);
    const flightInfo = cleanText(payload.flightInfo, 120);
    const notes = cleanText(payload.notes, 3000);
    const guestPhone = cleanText(payload.guestPhone || portal.submitted?.guestPhone || portal.reservation.guestPhone || '', 80);

    const result = await db.query(
        `INSERT INTO transfers
            (reservation_id, property_id, guest_name, guest_phone, transfer_type, pickup_location, destination, scheduled_at,
             passengers, luggage, flight_info, driver, vehicle, notes, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 'unassigned', NULL)`,
        [
            String(portal.reservation.id),
            portal.reservation.propertyId || null,
            portal.reservation.guestName || 'Guest',
            guestPhone || null,
            transferType,
            pickupLocation,
            destination,
            scheduledAt,
            passengers,
            luggage,
            flightInfo || null,
            notes || null,
        ]
    );

    const transferId = String(result.insertId);
    const serviceName = transferType === 'port_transfer'
        ? 'Port Transfer'
        : transferType === 'private_driver'
            ? 'Private Driver'
            : 'Airport Transfer';

    await db.query(
        `INSERT INTO guest_service_requests
            (guest_portal_id, external_reservation_id, service_key, service_name, category, quantity, notes, request_origin, request_json, status)
         VALUES (?, ?, ?, ?, 'mobility', 1, ?, 'portal', ?, 'requested')`,
        [
            portal.id,
            String(portal.reservation.id),
            transferType,
            serviceName,
            notes,
            JSON.stringify({
                transferId,
                pickupLocation,
                destination,
                scheduledAt,
                passengers,
                luggage,
                flightInfo,
            }),
        ]
    );

    return {
        transfer: {
            id: transferId,
            status: 'unassigned',
            transferType,
            pickupLocation,
            destination,
            scheduledAt,
            passengers,
            luggage,
            flightInfo,
        },
        portal: await getPortalByToken(token, false),
    };
}

async function getReservationPortalStatus(reservationId) {
    await ensureTables();
    const rows = await db.query(
        `SELECT status, guest_email, sent_at, opened_at, completed_at, expires_at
         FROM guest_portals
         WHERE source = 'cloudbeds' AND external_reservation_id = ?
         LIMIT 1`,
        [String(reservationId)]
    );
    const content = await getStayContent(reservationId);
    return {
        ...(rows[0] || {}),
        accessPublished: Boolean(content.accessPublished),
        servicesEnabled: Boolean(content.servicesEnabled),
    };
}

async function getReservationConfig(reservationId) {
    await ensureTables();
    const portalRows = await db.query(
        `SELECT id, status, guest_email, sent_at, opened_at, completed_at, expires_at
         FROM guest_portals
         WHERE source = 'cloudbeds' AND external_reservation_id = ? LIMIT 1`,
        [String(reservationId)]
    );
    const portal = portalRows[0] || null;
    const content = await getStayContent(reservationId);
    const requests = portal ? await getRequestsForPortal(portal.id) : [];
    const transfers = await db.query(
        `SELECT id, transfer_type, pickup_location, destination, scheduled_at, passengers, luggage, flight_info, driver, vehicle, status, created_at
         FROM transfers WHERE reservation_id = ? ORDER BY scheduled_at DESC, id DESC`,
        [String(reservationId)]
    );

    return {
        content,
        portal: portal ? {
            id: String(portal.id),
            status: portal.status,
            guestEmail: portal.guest_email,
            sentAt: portal.sent_at,
            openedAt: portal.opened_at,
            completedAt: portal.completed_at,
            expiresAt: portal.expires_at,
        } : null,
        serviceRequests: requests,
        transfers: transfers.map((item) => ({
            id: String(item.id),
            transferType: item.transfer_type,
            pickupLocation: item.pickup_location,
            destination: item.destination,
            scheduledAt: item.scheduled_at,
            passengers: Number(item.passengers || 1),
            luggage: Number(item.luggage || 0),
            flightInfo: item.flight_info || '',
            driver: item.driver || '',
            vehicle: item.vehicle || '',
            status: item.status,
            createdAt: item.created_at,
        })),
    };
}

module.exports = {
    sendInstructions,
    getPortalByToken,
    saveCheckin,
    createServiceRequest,
    createTransferRequest,
    getReservationPortalStatus,
    getReservationConfig,
    saveStayContent,
    listCatalog,
    updateCatalogItem,
};
