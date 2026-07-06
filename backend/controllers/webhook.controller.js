const db = require('../config/db');

// Κεντρικός Controller για τα Webhooks
const handleWebhook = async (req, res) => {
    const { source } = req.params; // 'cloudbeds' ή 'hosthub'
    const payload = req.body;

    try {
        console.log(`📥 [WEBHOOK] Ελήφθη payload από: ${source.toUpperCase()}`);

        // 1. Normalization (Ευθυγράμμιση) των δεδομένων ανάλογα με την πηγή
        let externalRoomId, channelResId, otaRef, guestName, guestEmail, guestPhone, checkIn, checkOut, status;

        if (source === 'cloudbeds') {
            externalRoomId = payload.roomID || payload.roomTypeId;
            channelResId = payload.reservationID;
            otaRef = payload.otaReferenceNumber || null;
            guestName = `${payload.guestFirstName || ''} ${payload.guestLastName || ''}`.trim();
            guestEmail = payload.guestEmail || null;
            guestPhone = payload.guestPhone || null;
            checkIn = payload.startDate; // YYYY-MM-DD
            checkOut = payload.endDate;   // YYYY-MM-DD
            status = payload.status === 'canceled' ? 'cancelled' : 'confirmed';
        } 
        else if (source === 'hosthub') {
            externalRoomId = payload.calendar_id;
            channelResId = payload.booking_id;
            otaRef = payload.channel_reference || null;
            guestName = payload.guest_name || 'Unknown Guest';
            checkIn = payload.from_date;
            checkOut = payload.to_date;
            status = payload.status === 'cancelled' ? 'cancelled' : 'confirmed';
        }

        // 2. Εύρεση του internal_room_id στη βάση μας
        const rooms = await db.query(
            'SELECT id FROM rooms WHERE external_id = ? AND sync_source = ?', 
            [externalRoomId, source]
        );

        if (rooms.length === 0) {
            console.error(`⚠️ [WEBHOOK] Το external_id "${externalRoomId}" δεν αντιστοιχεί σε κανένα δωμάτιο στη MariaDB.`);
            return res.status(404).json({ error: 'Room mapping not found' });
        }
        const roomId = rooms[0].id;

        // 3. Έλεγχος αν η κράτηση υπάρχει ήδη (για Update αντί για Insert)
        const existingRes = await db.query(
            'SELECT id FROM reservations WHERE channel_reservation_id = ? AND source = ?',
            [channelResId, source]
        );

        let reservationId;

        if (existingRes.length > 0) {
            // --- UPDATE ΥΦΙΣΤΑΜΕΝΗΣ ΚΡΑΤΗΣΗΣ ---
            reservationId = existingRes[0].id;
            await db.query(
                `UPDATE reservations SET 
                    room_id = ?, ota_reference_number = ?, guest_name = ?, 
                    check_in_date = ?, check_out_date = ?, reservation_status = ?
                 WHERE id = ?`,
                [roomId, otaRef, guestName, checkIn, checkOut, status, reservationId]
            );
            console.log(`🔄 [WEBHOOK] Η κράτηση ${channelResId} ενημερώθηκε επιτυχώς.`);
        } 
        else {
            // --- INSERT ΝΕΑΣ ΚΡΑΤΗΣΗΣ ---
            const result = await db.query(
                `INSERT INTO reservations 
                    (room_id, channel_reservation_id, source, ota_reference_number, guest_name, guest_email, guest_phone, check_in_date, check_out_date, reservation_status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [roomId, channelResId, source, otaRef, guestName, guestEmail, guestPhone, checkIn, checkOut, status]
            );
            // Στον mariadb node driver, το insertId έρχεται ως BigInt ή property
            reservationId = Number(result.insertId);
            console.log(`✨ [WEBHOOK] Νέα κράτηση καταχωρήθηκε στη βάση με εσωτερικό ID: ${reservationId}`);

            // 4. ΑΥΤΟΜΑΤΗ ΔΗΜΙΟΥΡΓΙΑ CLEANING TASK (Μόνο αν είναι confirmed)
            if (status === 'confirmed') {
                await db.query(
                    `INSERT INTO cleaning_tasks (room_id, reservation_id, status, priority) 
                     VALUES (?, ?, 'pending', 'standard')`,
                    [roomId, reservationId]
                );
                console.log(`🧹 [AUTOMATION] Δημιουργήθηκε αυτόματα εκκρεμής καθαρισμός για το δωμάτιο ID: ${roomId}`);
            }
        }

        res.status(200).json({ success: true, message: 'Webhook processed' });

    } catch (error) {
        console.error('❌ [WEBHOOK ERROR]:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    handleWebhook
};