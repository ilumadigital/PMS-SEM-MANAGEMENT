const db = require('../config/db');

// 📱 Λήψη Tasks για τον συνδεδεμένο Καθαριστή
const getMyTasks = async (req, res) => {
    const cleanerId = req.user.userId;

    try {
        const tasks = await db.query(
            `SELECT ct.*, rm.internal_name, rm.room_type, r.check_in_date, r.check_out_date, r.special_requests
             FROM cleaning_tasks ct
             JOIN rooms rm ON ct.room_id = rm.id
             JOIN reservations r ON ct.reservation_id = r.id
             WHERE ct.assigned_to = ? AND ct.status != 'completed'
             ORDER BY ct.priority DESC, r.check_in_date ASC`,
            [cleanerId]
        );

        res.status(200).json(tasks);
    } catch (error) {
        console.error('❌ [CLEANING TASKS ERROR]:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// 🔄 Live Αλλαγή Κατάστασης Καθαρισμού (Fat Buttons Logic)
const updateTaskStatus = async (req, res) => {
    const { id } = req.params; // Το ID του Task
    const { status } = req.body; // 'in_progress' ή 'completed'
    
    let timestampField = status === 'in_progress' ? 'started_at' : 'completed_at';

    try {
        // Ενημέρωση του status και του αντίστοιχου live timestamp
        await db.query(
            `UPDATE cleaning_tasks SET status = ?, ${timestampField} = CURRENT_TIMESTAMP WHERE id = ?`,
            [status, id]
        );

        console.log(`🧹 [CLEANING LIVE UPDATE]: Το task ID ${id} άλλαξε σε [${status.toUpperCase()}]`);
        res.status(200).json({ success: true, message: `Το task ενημερώθηκε σε ${status}.` });
    } catch (error) {
        console.error('❌ [CLEANING STATUS UPDATE ERROR]:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getMyTasks, updateTaskStatus };