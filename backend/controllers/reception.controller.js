const db = require('../config/db');

// 📅 Λήψη κρατήσεων για το Dashboard (Σημερινές Αφίξεις & Αναχωρήσεις)
const getDailyDashboard = async (req, res) => {
    try {
        // Παίρνουμε τις σημερινές αφίξεις και αναχωρήσεις
        const queries = {
            arrivals: `SELECT r.*, rm.internal_name, rm.room_type 
                       FROM reservations r 
                       JOIN rooms rm ON r.room_id = rm.id 
                       WHERE r.check_in_date = CURDATE() AND r.reservation_status != 'cancelled'`,
            departures: `SELECT r.*, rm.internal_name, rm.room_type 
                         FROM reservations r 
                         JOIN rooms rm ON r.room_id = rm.id 
                         WHERE r.check_out_date = CURDATE() AND r.reservation_status != 'cancelled'`
        };

        const arrivals = await db.query(queries.arrivals);
        const departures = await db.query(queries.departures);

        res.status(200).json({ arrivals, departures });
    } catch (error) {
        console.error('❌ [RECEPTION DASHBOARD ERROR]:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ✍️ Ενημέρωση Στοιχείων από τη Reception (Ώρες, Σημειώσεις, Special Requests)
const updateReservationDetails = async (req, res) => {
    const { id } = req.params; // Το ID της κράτησης
    const { actual_arrival_time, actual_departure_time, guest_notes, special_requests } = req.body;

    try {
        await db.query(
                `UPDATE reservations SET 
                    actual_arrival_time = ?, 
                    actual_departure_time = ?, 
                    guest_notes = ?, 
                    special_requests = ? 
                WHERE id = ?`,
            [actual_arrival_time, actual_departure_time, guest_notes, special_requests, id]
        );

        res.status(200).json({ success: true, message: 'Η κράτηση ενημερώθηκε επιτυχώς από τη Reception.' });
    } catch (error) {
        console.error('❌ [RECEPTION UPDATE ERROR]:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getDailyDashboard, updateReservationDetails };