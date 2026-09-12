const db = require('../config/db');
const cloudbedsOperations = require('../services/cloudbedsOperations.service');
const guestPortalService = require('../services/guestPortal.service');
const operationsService = require('../services/operations.service');

const cloudbedsStatus = (value) => {
    const status = String(value || '').toLowerCase();
    if (status === 'canceled') return 'cancelled';
    if (status === 'checked_in') return 'in_house';
    return status || 'confirmed';
};

const cloudbedsReservationId = (payload = {}, fallback = null) => (
    payload.reservationID ||
    payload.reservationId ||
    payload.data?.reservationID ||
    payload.data?.reservationId ||
    payload.data?.id ||
    payload.resource?.reservationID ||
    payload.resource?.reservationId ||
    fallback ||
    null
);

const scheduleGuestJourney = (reservationId, eventName) => {
    if (!reservationId) return;
    const event = String(eventName || '').toLowerCase();
    const isNewReservation = (
        /(reservation|booking).*(created|create|new)/.test(event) ||
        /(created|create|new).*(reservation|booking)/.test(event) ||
        event === 'reservation.created' ||
        event === 'reservation/created'
    );
    if (!isNewReservation) return;

    setTimeout(() => {
        guestPortalService.sendAutomaticReservationEmails(String(reservationId))
            .then((result) => console.log('📧 [GUEST JOURNEY]', reservationId, result?.bookingConfirmation?.status || result?.reason || 'processed'))
            .catch((error) => console.error('❌ [GUEST JOURNEY WEBHOOK]:', reservationId, error.message));
    }, 1200);
};

const handleCloudbeds = async (payload, res) => {
    const eventMeta = await cloudbedsOperations.recordWebhookEvent(payload || {});
    console.log(`📥 [CLOUDBEDS WEBHOOK] ${eventMeta.eventName}`, eventMeta.externalId || '');

    // Modern Cloudbeds webhooks are event notifications. The PMS live snapshot is
    // always re-fetched from Cloudbeds (and frontend refreshes automatically), so
    // acknowledge these immediately instead of trying to treat every event as a
    // full reservation object and accidentally returning 404/retry storms.
    if (payload?.event) {
        const reservationId = cloudbedsReservationId(payload, eventMeta.externalId);
        scheduleGuestJourney(reservationId, payload.event);

        const eventName = String(payload.event || '').toLowerCase();
        if (eventName.includes('housekeeping/room_condition_changed')) {
            const roomId = payload.roomId || payload.roomID;
            const propertyId = payload.propertyId || payload.propertyID;
            const condition = String(payload.condition || '').toLowerCase();
            if (roomId && ['dirty', 'clean', 'inspected'].includes(condition)) {
                await operationsService.updateHousekeepingStatus(
                    String(roomId),
                    {
                        propertyId: propertyId ? String(propertyId) : null,
                        roomCondition: condition,
                    },
                    { userId: 'cloudbeds-webhook', role: 'system' }
                );
            }
        }

        return res.status(200).json({
            success: true,
            accepted: true,
            event: payload.event,
            externalId: reservationId || eventMeta.externalId || null,
            message: 'Cloudbeds event accepted; live PMS data will be re-fetched from Cloudbeds.',
        });
    }

    // Backwards-compatible support for older/full reservation webhook payloads.
    const externalRoomId = payload.roomID || payload.roomId || payload.roomTypeID || payload.roomTypeId;
    const channelResId = payload.reservationID || payload.reservationId;
    if (!externalRoomId || !channelResId) {
        return res.status(200).json({ success: true, accepted: true, message: 'Cloudbeds payload recorded.' });
    }

    const rooms = await db.query(
        'SELECT id FROM rooms WHERE external_id = ? AND sync_source = ?',
        [externalRoomId, 'cloudbeds']
    );
    if (!rooms.length) {
        console.warn(`⚠️ [CLOUDBEDS WEBHOOK] No legacy local room mapping for ${externalRoomId}; event still accepted.`);
        return res.status(200).json({ success: true, accepted: true, mapped: false });
    }

    const roomId = rooms[0].id;
    const otaRef = payload.otaReferenceNumber || payload.thirdPartyIdentifier || null;
    const guestName = payload.guestName || `${payload.guestFirstName || ''} ${payload.guestLastName || ''}`.trim() || 'Unknown Guest';
    const guestEmail = payload.guestEmail || null;
    const guestPhone = payload.guestPhone || payload.guestCellPhone || null;
    const checkIn = payload.startDate || payload.checkInDate || null;
    const checkOut = payload.endDate || payload.checkOutDate || null;
    const status = cloudbedsStatus(payload.status || payload.reservationStatus);

    const existing = await db.query(
        'SELECT id FROM reservations WHERE channel_reservation_id = ? AND source = ?',
        [channelResId, 'cloudbeds']
    );

    let createdReservation = false;
    if (existing.length) {
        await db.query(
            `UPDATE reservations SET room_id = ?, ota_reference_number = ?, guest_name = ?,
             guest_email = COALESCE(?, guest_email), guest_phone = COALESCE(?, guest_phone),
             check_in_date = COALESCE(?, check_in_date), check_out_date = COALESCE(?, check_out_date),
             reservation_status = ? WHERE id = ?`,
            [roomId, otaRef, guestName, guestEmail, guestPhone, checkIn, checkOut, status, existing[0].id]
        );
    } else if (checkIn && checkOut) {
        createdReservation = true;
        const result = await db.query(
            `INSERT INTO reservations
             (room_id, channel_reservation_id, source, ota_reference_number, guest_name, guest_email,
              guest_phone, check_in_date, check_out_date, reservation_status)
             VALUES (?, ?, 'cloudbeds', ?, ?, ?, ?, ?, ?, ?)`,
            [roomId, channelResId, otaRef, guestName, guestEmail, guestPhone, checkIn, checkOut, status]
        );
        if (status === 'confirmed') {
            await db.query(
                `INSERT INTO cleaning_tasks (room_id, reservation_id, status, priority)
                 VALUES (?, ?, 'pending', 'standard')`,
                [roomId, Number(result.insertId)]
            );
        }
    }

    if (createdReservation) scheduleGuestJourney(channelResId, 'reservation.created');
    return res.status(200).json({ success: true, accepted: true, mapped: true });
};

const handleHosthub = async (payload, res) => {
    const externalRoomId = payload.calendar_id;
    const channelResId = payload.booking_id;
    const otaRef = payload.channel_reference || null;
    const guestName = payload.guest_name || 'Unknown Guest';
    const guestEmail = payload.guest_email || null;
    const guestPhone = payload.guest_phone || null;
    const checkIn = payload.from_date;
    const checkOut = payload.to_date;
    const status = payload.status === 'cancelled' ? 'cancelled' : 'confirmed';

    const rooms = await db.query('SELECT id FROM rooms WHERE external_id = ? AND sync_source = ?', [externalRoomId, 'hosthub']);
    if (!rooms.length) return res.status(404).json({ error: 'Room mapping not found' });
    const roomId = rooms[0].id;

    const existing = await db.query(
        'SELECT id FROM reservations WHERE channel_reservation_id = ? AND source = ?',
        [channelResId, 'hosthub']
    );

    if (existing.length) {
        await db.query(
            `UPDATE reservations SET room_id = ?, ota_reference_number = ?, guest_name = ?,
             check_in_date = ?, check_out_date = ?, reservation_status = ? WHERE id = ?`,
            [roomId, otaRef, guestName, checkIn, checkOut, status, existing[0].id]
        );
    } else {
        const result = await db.query(
            `INSERT INTO reservations
             (room_id, channel_reservation_id, source, ota_reference_number, guest_name, guest_email,
              guest_phone, check_in_date, check_out_date, reservation_status)
             VALUES (?, ?, 'hosthub', ?, ?, ?, ?, ?, ?, ?)`,
            [roomId, channelResId, otaRef, guestName, guestEmail, guestPhone, checkIn, checkOut, status]
        );
        if (status === 'confirmed') {
            await db.query(
                `INSERT INTO cleaning_tasks (room_id, reservation_id, status, priority)
                 VALUES (?, ?, 'pending', 'standard')`,
                [roomId, Number(result.insertId)]
            );
        }
    }

    return res.status(200).json({ success: true, message: 'Hosthub webhook processed' });
};

const handleWebhook = async (req, res) => {
    const source = String(req.params.source || '').toLowerCase();
    const payload = req.body || {};

    try {
        if (source === 'cloudbeds') return await handleCloudbeds(payload, res);
        if (source === 'hosthub') return await handleHosthub(payload, res);
        return res.status(400).json({ error: 'Unsupported webhook source' });
    } catch (error) {
        console.error('❌ [WEBHOOK ERROR]:', error);
        // Cloudbeds webhooks are notifications; if the audit write failed because
        // the database is temporarily unavailable, return 500 so Cloudbeds retries.
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { handleWebhook };
