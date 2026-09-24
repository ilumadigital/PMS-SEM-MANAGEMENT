const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { pool } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const realtimeService = require('./services/realtime.service');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('json replacer', (_key, value) => (
    typeof value === 'bigint' ? value.toString() : value
));

const webhookRoutes = require('./routes/webhook.routes');
const receptionRoutes = require('./routes/reception.routes');
const cleaningRoutes = require('./routes/cleaning.routes');
const cloudbedsRoutes = require('./routes/cloudbeds.routes');
const cloudbedsOperationsRoutes = require('./routes/cloudbedsOperations.routes');
const hosthubRoutes = require('./routes/hosthub.routes');
const guestPortalRoutes = require('./routes/guestPortal.routes');
const guestManagementRoutes = require('./routes/guestManagement.routes');
const operationsRoutes = require('./routes/operations.routes');
const managementRoutes = require('./routes/management.routes');
const adminRoutes = require('./routes/admin.routes');

app.use(cors());
app.use(express.json());
app.use('/api', (req, res, next) => {
    const method = String(req.method || 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isMutation) {
        res.on('finish', () => {
            if (res.statusCode < 400) {
                realtimeService.bumpRevision(`${method} ${req.originalUrl || req.url}`)
                    .catch((error) => console.error('[PMS REALTIME REVISION]', error.message));
            }
        });
    }
    next();
});
app.use('/api/webhooks', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reception', receptionRoutes);
app.use('/api/cleaning', cleaningRoutes);
app.use('/api/integrations/cloudbeds', cloudbedsRoutes);
app.use('/api/integrations/cloudbeds/operations', cloudbedsOperationsRoutes);
app.use('/api/integrations/hosthub', hosthubRoutes);
app.use('/api/guest-portal', guestPortalRoutes);
app.use('/api/guest-management', guestManagementRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/management', managementRoutes);
app.use('/api/admin', adminRoutes);

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

app.get('/api/test', (req, res) => {
    res.json({
        status: 'Online',
        message: 'SEM Operations Hub API is running smoothly',
        cloudbedsMode: process.env.CLOUDBEDS_ENVIRONMENT || 'sandbox',
        timestamp: new Date()
    });
});

app.listen(PORT, () => {
    const envMode = process.env.NODE_ENV || 'production';
    console.log(`🚀 [SERVER] Running in ${envMode} mode on port ${PORT}`);
});
