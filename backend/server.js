const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { pool } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

const webhookRoutes = require('./routes/webhook.routes');

// --- GLOBAL MIDDLEWARES ---
app.use(cors());
app.use(express.json()); // Απαραίτητο για να διαβάζει JSON payloads από Cloudbeds/Hosthub
// --- API ROUTES ---
app.use('/api/webhooks', webhookRoutes);

// --- ΔΟΚΙΜΗ ΣΥΝΔΕΣΗΣ ΜΕ MARIADB ---
async function testDatabaseConnection() {
    let conn;
    try {
        conn = await pool.getConnection();
        console.log('✅ [DATABASE] Επιτυχής σύνδεση στη MariaDB (Docker Container)!');
    } catch (err) {
        console.error('❌ [DATABASE] Αδυναμία σύνδεσης στη βάση δεδομένων:', err.message);
        console.error('Σιγουρευτείτε ότι το Docker Container τρέχει κανονικά.');
        process.exit(1); // Κλείσιμο του server αν δεν υπάρχει βάση δεδομένων
    } finally {
        if (conn) conn.release();
    }
}

testDatabaseConnection();

// --- ΒΑΣΙΚΟ TEST ROUTE ---
app.get('/api/test', (req, res) => {
    res.json({ 
        status: "Online", 
        message: "SEM Operations Hub API is running smoothly (Phase A)",
        timestamp: new Date()
    });
});

// --- ΕΚΚΙΝΗΣΗ SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 [SERVER] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});