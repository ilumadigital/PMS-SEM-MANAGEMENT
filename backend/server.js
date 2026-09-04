const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { pool } = require('./config/db');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 5000;

const webhookRoutes = require('./routes/webhook.routes');
const receptionRoutes = require('./routes/reception.routes');
const cleaningRoutes = require('./routes/cleaning.routes');
const cloudbedsRoutes = require('./routes/cloudbeds.routes');
const guestPortalRoutes = require('./routes/guestPortal.routes');

// --- GLOBAL MIDDLEWARES ---
app.use(cors());
app.use(express.json()); // Απαραίτητο για να διαβάζει JSON payloads από Cloudbeds/Hosthub
// --- API ROUTES ---
app.use('/api/webhooks', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reception', receptionRoutes);
app.use('/api/cleaning', cleaningRoutes);
app.use('/api/integrations/cloudbeds', cloudbedsRoutes);
app.use('/api/guest-portal', guestPortalRoutes);

// --- ΔΟΚΙΜΗ ΣΥΝΔΕΣΗΣ ΜΕ MARIADB ---
async function testDatabaseConnection() {
    let conn;
    try {
        conn = await pool.getConnection();
        console.log('✅ [DATABASE] Επιτυχής σύνδεση στη MariaDB (Docker Container)!');
    } catch (err) {
        console.warn('⚠️ [DATABASE] Αδυναμία σύνδεσης στη βάση δεδομένων:', err.message);
        console.warn('Η υπηρεσία θα συνεχίσει να τρέχει και το callback endpoint θα είναι διαθέσιμο, αλλά οι λειτουργίες που χρειάζονται DB θα είναι προσωρινά μη διαθέσιμες.');
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
        cloudbedsMode: process.env.CLOUDBEDS_ENVIRONMENT || 'sandbox',
        timestamp: new Date()
    });
});

// --- ΕΚΚΙΝΗΣΗ SERVER ---
app.listen(PORT, () => {
    const envMode = process.env.NODE_ENV || 'production';
    console.log(`🚀 [SERVER] Running in ${envMode} mode on port ${PORT}`);
});