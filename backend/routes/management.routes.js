const express = require('express');
const db = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();
const managerRoles = ['admin', 'management'];
const transferRoles = ['admin', 'management', 'reception', 'supervisor', 'dispatcher', 'driver'];
const editTransferRoles = ['admin', 'management', 'reception', 'dispatcher'];

const normalizeRole = (req) => String(req.user?.role || '').toLowerCase();

async function ensureTables() {
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

  await db.query(`CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(120) PRIMARY KEY,
    setting_value TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
}

const canUseTransfers = (req, res, next) => {
  if (!transferRoles.includes(normalizeRole(req))) return res.status(403).json({ error: 'Access denied.' });
  next();
};
const canEditTransfers = (req, res, next) => {
  if (!editTransferRoles.includes(normalizeRole(req))) return res.status(403).json({ error: 'Access denied.' });
  next();
};

router.use(protect);
router.use(async (req, res, next) => {
  try { await ensureTables(); next(); }
  catch (error) { console.error('[MANAGEMENT TABLE INIT]', error); res.status(500).json({ error: 'Could not initialize operations storage.' }); }
});

router.get('/transfers', canUseTransfers, async (req, res) => {
  try {
    const values = [];
    const where = [];
    if (req.query.status && req.query.status !== 'all') { where.push('status = ?'); values.push(req.query.status); }
    if (req.query.propertyId) { where.push('property_id = ?'); values.push(req.query.propertyId); }
    if (req.query.date) { where.push('DATE(scheduled_at) = ?'); values.push(req.query.date); }
    if (normalizeRole(req) === 'driver') {
      const driverName = req.query.driver || '';
      if (!driverName) return res.json([]);
      where.push('driver = ?'); values.push(driverName);
    }
    const sql = `SELECT * FROM transfers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY scheduled_at ASC, id ASC`;
    res.json(await db.query(sql, values));
  } catch (error) { console.error('[TRANSFERS LIST]', error); res.status(500).json({ error: 'Could not load transfers.' }); }
});

router.post('/transfers', canEditTransfers, async (req, res) => {
  const b = req.body || {};
  if (!b.guestName || !b.pickupLocation || !b.destination || !b.scheduledAt) return res.status(400).json({ error: 'Guest, pickup, destination and schedule are required.' });
  try {
    const result = await db.query(`INSERT INTO transfers
      (reservation_id, property_id, guest_name, guest_phone, transfer_type, pickup_location, destination, scheduled_at, passengers, luggage, flight_info, driver, vehicle, notes, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      b.reservationId || null, b.propertyId || null, b.guestName, b.guestPhone || null,
      b.transferType || 'airport_pickup', b.pickupLocation, b.destination, b.scheduledAt,
      Number(b.passengers || 1), Number(b.luggage || 0), b.flightInfo || null,
      b.driver || null, b.vehicle || null, b.notes || null,
      b.status || (b.driver && b.vehicle ? 'scheduled' : 'unassigned'), req.user.userId
    ]);
    const rows = await db.query('SELECT * FROM transfers WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) { console.error('[TRANSFER CREATE]', error); res.status(500).json({ error: 'Could not create transfer.' }); }
});

router.patch('/transfers/:id', canUseTransfers, async (req, res) => {
  const role = normalizeRole(req);
  const b = req.body || {};
  try {
    if (role === 'driver') {
      const allowed = ['on_the_way', 'completed', 'cancelled'];
      if (!allowed.includes(b.status)) return res.status(403).json({ error: 'Drivers may only update trip status.' });
      await db.query('UPDATE transfers SET status = ? WHERE id = ?', [b.status, req.params.id]);
    } else if (!editTransferRoles.includes(role)) {
      return res.status(403).json({ error: 'Read-only access.' });
    } else {
      const fields = {
        reservationId: 'reservation_id', propertyId: 'property_id', guestName: 'guest_name', guestPhone: 'guest_phone',
        transferType: 'transfer_type', pickupLocation: 'pickup_location', destination: 'destination', scheduledAt: 'scheduled_at',
        passengers: 'passengers', luggage: 'luggage', flightInfo: 'flight_info', driver: 'driver', vehicle: 'vehicle', notes: 'notes', status: 'status'
      };
      const sets = []; const values = [];
      Object.entries(fields).forEach(([key, column]) => { if (Object.prototype.hasOwnProperty.call(b, key)) { sets.push(`${column} = ?`); values.push(b[key] === '' ? null : b[key]); } });
      if (!sets.length) return res.status(400).json({ error: 'No supported fields supplied.' });
      values.push(req.params.id);
      await db.query(`UPDATE transfers SET ${sets.join(', ')} WHERE id = ?`, values);
    }
    const rows = await db.query('SELECT * FROM transfers WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Transfer not found.' });
    res.json(rows[0]);
  } catch (error) { console.error('[TRANSFER UPDATE]', error); res.status(500).json({ error: 'Could not update transfer.' }); }
});

router.delete('/transfers/:id', restrictTo(...managerRoles), async (req, res) => {
  try { await db.query('DELETE FROM transfers WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch (error) { res.status(500).json({ error: 'Could not delete transfer.' }); }
});

router.get('/supervisor', restrictTo('admin', 'management', 'supervisor'), async (_req, res) => {
  try {
    let cleaning = [];
    try {
      cleaning = await db.query(`SELECT ct.*, rm.internal_name, rm.room_type, r.check_in_date, r.check_out_date, r.special_requests
        FROM cleaning_tasks ct LEFT JOIN rooms rm ON ct.room_id = rm.id LEFT JOIN reservations r ON ct.reservation_id = r.id
        ORDER BY FIELD(ct.priority,'high','medium','normal','low'), r.check_in_date ASC`);
    } catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
    const transfers = await db.query(`SELECT * FROM transfers WHERE status NOT IN ('completed','cancelled') ORDER BY scheduled_at ASC`);
    res.json({ cleaningTasks: cleaning, transfers });
  } catch (error) { console.error('[SUPERVISOR]', error); res.status(500).json({ error: 'Could not load supervisor operations.' }); }
});

router.get('/reports', restrictTo('admin', 'management', 'supervisor'), async (req, res) => {
  try {
    const from = req.query.from || '1970-01-01';
    const to = req.query.to || '2999-12-31';
    const transfers = await db.query(`SELECT status, COUNT(*) total FROM transfers WHERE DATE(scheduled_at) BETWEEN ? AND ? GROUP BY status`, [from, to]);
    let cleaning = [];
    try { cleaning = await db.query(`SELECT status, COUNT(*) total FROM cleaning_tasks WHERE DATE(COALESCE(completed_at, started_at, CURRENT_DATE)) BETWEEN ? AND ? GROUP BY status`, [from, to]); }
    catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
    res.json({ transfers, cleaning, generatedAt: new Date() });
  } catch (error) { console.error('[REPORTS]', error); res.status(500).json({ error: 'Could not build reports.' }); }
});

router.get('/settings', restrictTo(...managerRoles), async (_req, res) => {
  try {
    const rows = await db.query('SELECT setting_key, setting_value, updated_at FROM app_settings ORDER BY setting_key');
    res.json(Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value])));
  } catch (error) { res.status(500).json({ error: 'Could not load settings.' }); }
});

router.put('/settings', restrictTo(...managerRoles), async (req, res) => {
  try {
    const entries = Object.entries(req.body || {}).filter(([key]) => /^[a-z0-9_.-]{2,120}$/i.test(key));
    for (const [key, value] of entries) {
      await db.query(`INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`, [key, String(value ?? ''), req.user.userId]);
    }
    res.json({ success: true, updated: entries.length });
  } catch (error) { res.status(500).json({ error: 'Could not save settings.' }); }
});

module.exports = router;
