const express = require('express');
const db = require('../config/db');
const { protect } = require('../middleware/auth.middleware');
const guestPortalService = require('../services/guestPortal.service');
const notificationService = require('../services/notification.service');
const operationsService = require('../services/operations.service');

const router = express.Router();
const ATH_AIRPORT_LABEL = 'ATH Airport';
const managerRoles = ['admin', 'manager', 'management'];
const transferRoles = ['admin', 'manager', 'management', 'reception', 'supervisor', 'driversadmin', 'dispatcher', 'driver'];
const editTransferRoles = ['admin', 'manager', 'management', 'reception', 'driversadmin', 'dispatcher'];
const housekeepingAdminRoles = ['admin', 'manager', 'management', 'cleaneradmin'];
const housekeepingReadRoles = [...housekeepingAdminRoles, 'supervisor', 'cleaner', 'cleaning'];
const normalizeRole = (req) => String(req.user?.role || '').toLowerCase();
const allowRoles = (...roles) => (req, res, next) => roles.includes(normalizeRole(req)) ? next() : res.status(403).json({ error: 'Access denied.' });

async function currentUserName(req) {
  const users = await db.query('SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1', [req.user.userId]);
  if (!users.length) return '';
  return `${users[0].first_name || ''} ${users[0].last_name || ''}`.trim();
}

async function ensureTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS transfers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reservation_id VARCHAR(100) NULL,
    property_id VARCHAR(100) NULL,
    guest_name VARCHAR(160) NOT NULL,
    guest_phone VARCHAR(80) NULL,
    guest_email VARCHAR(190) NULL,
    transfer_type VARCHAR(40) NOT NULL DEFAULT 'airport_pickup',
    pickup_location VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    scheduled_at DATETIME NOT NULL,
    passengers INT NOT NULL DEFAULT 1,
    luggage INT NOT NULL DEFAULT 0,
    flight_info VARCHAR(120) NULL,
    driver VARCHAR(120) NULL,
    driver_user_id INT NULL,
    vehicle VARCHAR(120) NULL,
    notes TEXT NULL,
    free_shuttle TINYINT(1) NOT NULL DEFAULT 1,
    approximate_arrival_time_airport VARCHAR(16) NULL,
    cabin_luggages INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'unassigned',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_transfer_schedule (scheduled_at), INDEX idx_transfer_status (status), INDEX idx_transfer_property (property_id)
  )`);
  try { await db.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS guest_email VARCHAR(190) NULL AFTER guest_phone`); } catch (_) {}
  try { await db.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS free_shuttle TINYINT(1) NOT NULL DEFAULT 1 AFTER notes`); } catch (_) {}
  try { await db.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS approximate_arrival_time_airport VARCHAR(16) NULL AFTER free_shuttle`); } catch (_) {}
  try { await db.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS cabin_luggages INT NOT NULL DEFAULT 0 AFTER approximate_arrival_time_airport`); } catch (_) {}
  try { await db.query(`ALTER TABLE transfers ADD COLUMN IF NOT EXISTS driver_user_id INT NULL AFTER driver`); } catch (_) {}
  try { await db.query(`UPDATE transfers SET pickup_location = ? WHERE pickup_location IS NULL OR pickup_location <> ?`, [ATH_AIRPORT_LABEL, ATH_AIRPORT_LABEL]); } catch (_) {}
  await db.query(`CREATE TABLE IF NOT EXISTS housekeeping_assignments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    property_id VARCHAR(128) NOT NULL,
    property_name VARCHAR(255) NULL,
    room_id VARCHAR(128) NOT NULL,
    room_number VARCHAR(128) NULL,
    room_type VARCHAR(255) NULL,
    task_date DATE NOT NULL,
    cleaner_user_id INT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    notes TEXT NULL,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_housekeeping_room_day (room_id, task_date),
    INDEX idx_housekeeping_cleaner_day (cleaner_user_id, task_date),
    INDEX idx_housekeeping_property_day (property_id, task_date)
  )`);
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS property_name VARCHAR(255) NULL AFTER property_id`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS started_at DATETIME NULL AFTER notes`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL AFTER started_at`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments MODIFY cleaner_user_id INT NULL`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'local' AFTER completed_at`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS external_reservation_id VARCHAR(128) NULL AFTER source`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS guest_name VARCHAR(255) NULL AFTER external_reservation_id`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS arrival_date DATE NULL AFTER guest_name`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS arrival_time VARCHAR(16) NULL AFTER arrival_date`); } catch (_) {}
  try { await db.query(`ALTER TABLE housekeeping_assignments ADD COLUMN IF NOT EXISTS priority VARCHAR(32) NOT NULL DEFAULT 'standard' AFTER arrival_time`); } catch (_) {}
  await db.query(`CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(120) PRIMARY KEY, setting_value TEXT NULL, updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
}

router.use(protect);
router.use(async (req, res, next) => {
  try { await ensureTables(); next(); }
  catch (error) { console.error('[MANAGEMENT TABLE INIT]', error); res.status(500).json({ error: 'Could not initialize operations storage.' }); }
});

router.get('/staff', allowRoles('admin','manager','management','cleaneradmin','driversadmin','dispatcher'), async (req, res) => {
  try {
    const requested = String(req.query.role || '').toLowerCase();
    const roles = requested === 'cleaner' ? ['cleaner','cleaning'] : requested === 'driver' ? ['driver'] : [];
    if (!roles.length) return res.status(422).json({ error: 'role must be cleaner or driver.' });
    const placeholders = roles.map(() => '?').join(',');
    const rows = await db.query(
      `SELECT id, first_name, last_name, email, role FROM users WHERE is_active=1 AND role IN (${placeholders}) ORDER BY first_name,last_name,email`,
      roles
    );
    res.json(rows.map((row) => ({
      id: String(row.id),
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email,
      email: row.email,
      role: row.role,
    })));
  } catch (error) { console.error('[STAFF LIST]', error); res.status(500).json({ error: 'Could not load staff.' }); }
});

router.get('/housekeeping-assignments', allowRoles(...housekeepingReadRoles), async (req, res) => {
  try {
    const where=[]; const values=[];
    const role=normalizeRole(req);
    if (role === 'cleaner' || role === 'cleaning') { where.push('ha.cleaner_user_id = ?'); values.push(req.user.userId); }
    else if (req.query.cleanerUserId) { where.push('ha.cleaner_user_id = ?'); values.push(req.query.cleanerUserId); }
    if (req.query.propertyId) { where.push('ha.property_id = ?'); values.push(req.query.propertyId); }
    if (req.query.from) { where.push('ha.task_date >= ?'); values.push(req.query.from); }
    if (req.query.to) { where.push('ha.task_date <= ?'); values.push(req.query.to); }
    const rows = await db.query(
      `SELECT ha.*, u.first_name cleaner_first_name, u.last_name cleaner_last_name, u.email cleaner_email
       FROM housekeeping_assignments ha
       LEFT JOIN users u ON u.id = ha.cleaner_user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ha.task_date ASC, ha.room_number ASC, ha.id ASC`,
      values
    );
    res.json(rows.map((row) => ({
      ...row,
      cleaner_name: `${row.cleaner_first_name || ''} ${row.cleaner_last_name || ''}`.trim() || row.cleaner_email || 'Unassigned',
    })));
  } catch (error) { console.error('[HOUSEKEEPING ASSIGNMENTS LIST]', error); res.status(500).json({ error: 'Could not load housekeeping assignments.' }); }
});

router.post('/housekeeping-assignments', allowRoles(...housekeepingAdminRoles), async (req, res) => {
  const b=req.body || {};
  if (!b.propertyId || !b.roomId || !b.taskDate || !b.cleanerUserId) {
    return res.status(422).json({ error: 'Property, room, task date and cleaner are required.' });
  }
  try {
    const cleanerRows = await db.query(
      `SELECT id FROM users WHERE id=? AND is_active=1 AND role IN ('cleaner','cleaning') LIMIT 1`,
      [b.cleanerUserId]
    );
    if (!cleanerRows.length) return res.status(422).json({ error: 'Selected user is not an active cleaner.' });
    await db.query(
      `INSERT INTO housekeeping_assignments
       (property_id,property_name,room_id,room_number,room_type,task_date,cleaner_user_id,status,notes,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE cleaner_user_id=VALUES(cleaner_user_id), room_number=VALUES(room_number),
         room_type=VALUES(room_type), property_id=VALUES(property_id), property_name=VALUES(property_name), status='assigned', notes=VALUES(notes),
         created_by=VALUES(created_by), updated_at=NOW()`,
      [String(b.propertyId),b.propertyName||null,String(b.roomId),b.roomNumber||null,b.roomType||null,String(b.taskDate).slice(0,10),
       b.cleanerUserId,b.status||'assigned',b.notes||null,req.user.userId]
    );
    const rows=await db.query(
      `SELECT ha.*, u.first_name cleaner_first_name, u.last_name cleaner_last_name, u.email cleaner_email
       FROM housekeeping_assignments ha LEFT JOIN users u ON u.id=ha.cleaner_user_id
       WHERE ha.room_id=? AND ha.task_date=? LIMIT 1`,
      [String(b.roomId),String(b.taskDate).slice(0,10)]
    );
    const row=rows[0];
    res.status(201).json({...row, cleaner_name:`${row.cleaner_first_name||''} ${row.cleaner_last_name||''}`.trim() || row.cleaner_email || 'Cleaner'});
  } catch (error) { console.error('[HOUSEKEEPING ASSIGNMENT CREATE]', error); res.status(500).json({ error: 'Could not assign cleaner.' }); }
});

router.patch('/housekeeping-assignments/:id', allowRoles(...housekeepingReadRoles), async (req, res) => {
  const role=normalizeRole(req); const b=req.body || {};
  try {
    const existing=await db.query('SELECT * FROM housekeeping_assignments WHERE id=? LIMIT 1',[req.params.id]);
    if (!existing.length) return res.status(404).json({ error:'Assignment not found.' });
    if ((role==='cleaner'||role==='cleaning') && String(existing[0].cleaner_user_id)!==String(req.user.userId)) {
      return res.status(403).json({ error:'This room is not assigned to you.' });
    }
    const fields=[]; const values=[];
    const cleanerLimited = role==='cleaner'||role==='cleaning';
    if (b.status !== undefined) {
      const status=String(b.status);
      if (!['pending','assigned','in_progress','completed'].includes(status)) return res.status(422).json({ error:'Invalid assignment status.' });
      fields.push('status=?'); values.push(status);
      if (status === 'in_progress') {
        fields.push('started_at=COALESCE(started_at,NOW())');
        fields.push('completed_at=NULL');
      } else if (status === 'completed') {
        fields.push('completed_at=NOW()');
        fields.push('started_at=COALESCE(started_at,NOW())');
      } else if (status === 'assigned' || status === 'pending') {
        fields.push('started_at=NULL');
        fields.push('completed_at=NULL');
      }
    }
    if (!cleanerLimited && b.cleanerUserId !== undefined) { fields.push('cleaner_user_id=?'); values.push(b.cleanerUserId); }
    if (!cleanerLimited && b.taskDate !== undefined) { fields.push('task_date=?'); values.push(String(b.taskDate).slice(0,10)); }
    if (b.notes !== undefined) { fields.push('notes=?'); values.push(b.notes || null); }
    if (!fields.length) return res.status(422).json({ error:'No supported assignment fields supplied.' });
    values.push(req.params.id);
    await db.query(`UPDATE housekeeping_assignments SET ${fields.join(', ')}, updated_at=NOW() WHERE id=?`,values);
    const updatedRows = await db.query('SELECT * FROM housekeeping_assignments WHERE id=? LIMIT 1',[req.params.id]);
    const updatedTask = updatedRows[0];
    if (b.status !== undefined && updatedTask) {
      const localRoomState = String(b.status) === 'completed'
        ? 'clean'
        : String(b.status) === 'in_progress'
          ? 'in_progress'
          : 'dirty';
      // Housekeeping state is local-only: never write this status back to Cloudbeds.
      await operationsService.updateHousekeepingStatus(
        String(updatedTask.room_id),
        {
          propertyId: updatedTask.property_id,
          roomNumber: updatedTask.room_number,
          roomCondition: localRoomState,
          statusDate: updatedTask.task_date,
        },
        req.user || {}
      );
    }
    const rows=await db.query('SELECT * FROM housekeeping_assignments WHERE id=? LIMIT 1',[req.params.id]);
    res.json(rows[0]);
  } catch (error) { console.error('[HOUSEKEEPING ASSIGNMENT UPDATE]', error); res.status(500).json({ error:'Could not update housekeeping assignment.' }); }
});

router.delete('/housekeeping-assignments/:id', allowRoles(...housekeepingAdminRoles), async (req,res) => {
  try { await db.query('DELETE FROM housekeeping_assignments WHERE id=?',[req.params.id]); res.json({success:true}); }
  catch (error) { console.error('[HOUSEKEEPING ASSIGNMENT DELETE]',error); res.status(500).json({error:'Could not delete housekeeping assignment.'}); }
});

router.get('/transfers', allowRoles(...transferRoles), async (req, res) => {
  try {
    const values = []; const where = [];
    if (req.query.status && req.query.status !== 'all') { where.push('status = ?'); values.push(req.query.status); }
    if (req.query.propertyId) { where.push('property_id = ?'); values.push(req.query.propertyId); }
    if (req.query.date) { where.push('DATE(scheduled_at) = ?'); values.push(req.query.date); }
    if (normalizeRole(req) === 'driver') {
      const driverName = await currentUserName(req);
      where.push('(driver_user_id = ? OR (driver_user_id IS NULL AND LOWER(driver) = LOWER(?)))');
      values.push(req.user.userId, driverName || '__no_driver_name__');
    }
    const sql = `SELECT * FROM transfers ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY scheduled_at ASC, id ASC`;
    res.json(await db.query(sql, values));
  } catch (error) { console.error('[TRANSFERS LIST]', error); res.status(500).json({ error: 'Could not load transfers.' }); }
});

router.post('/transfers', allowRoles(...editTransferRoles), async (req, res) => {
  const b = req.body || {};
  if (!b.reservationId || !b.guestName || !b.scheduledAt) {
    return res.status(400).json({ error: 'Reservation, guest and airport arrival schedule are required.' });
  }
  try {
    const existing = await db.query(
      `SELECT id, status FROM transfers WHERE reservation_id = ? AND free_shuttle = 1 AND status <> 'cancelled' LIMIT 1`,
      [String(b.reservationId)]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'This reservation already has its one free shuttle.', transferId: existing[0].id });
    }
    const result = await db.query(`INSERT INTO transfers
      (reservation_id, property_id, guest_name, guest_phone, guest_email, transfer_type, pickup_location, destination, scheduled_at,
       passengers, luggage, flight_info, driver, driver_user_id, vehicle, notes, free_shuttle, approximate_arrival_time_airport, cabin_luggages, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`, [
      String(b.reservationId), b.propertyId || null, b.guestName, b.guestPhone || null, b.guestEmail || null, 'free_airport_shuttle',
      ATH_AIRPORT_LABEL, b.destination || 'Property', b.scheduledAt,
      Math.max(1, Number(b.passengers || 1)), Math.max(0, Number(b.luggages ?? b.luggage ?? 0)),
      b.flightInfo || null, b.driver || null, b.driverUserId || null, b.vehicle || null, b.notes || null,
      b.approximateArrivalTimeAirport || null, Math.max(0, Number(b.cabinLuggages || 0)),
      b.status || (b.driver && b.vehicle ? 'scheduled' : 'unassigned'), req.user.userId
    ]);
    const rows = await db.query('SELECT * FROM transfers WHERE id = ?', [result.insertId]);
    const transfer = rows[0];
    let customerNotification = { sent: false, status: 'not_attempted' };
    try {
      const portal = await guestPortalService.ensurePortalForReservation(b.reservationId);
      customerNotification = await notificationService.sendFreeShuttleConfirmation({
        to: b.guestEmail || portal.reservation?.guestEmail || '',
        guestName: b.guestName || portal.reservation?.guestName || 'Guest',
        propertyName: b.destination || portal.reservation?.propertyName || 'SEM Property',
        reservationId: String(b.reservationId),
        portalUrl: portal.portalUrl,
        transfer: {
          scheduledAt: b.scheduledAt,
          approximateArrivalTimeAirport: b.approximateArrivalTimeAirport || '',
          passengers: Math.max(1, Number(b.passengers || 1)),
          cabinLuggages: Math.max(0, Number(b.cabinLuggages || 0)),
          luggages: Math.max(0, Number(b.luggages ?? b.luggage ?? 0)),
          flightInfo: b.flightInfo || '',
        },
      });
    } catch (notifyError) {
      console.error('[FREE SHUTTLE GUEST EMAIL]', notifyError.message);
      customerNotification = { sent: false, status: 'failed', error: notifyError.message };
    }
    res.status(201).json({ ...transfer, customerNotification });
  } catch (error) { console.error('[TRANSFER CREATE]', error); res.status(500).json({ error: 'Could not create free shuttle.' }); }
});

router.patch('/transfers/:id', allowRoles(...transferRoles), async (req, res) => {
  const role = normalizeRole(req); const b = req.body || {};
  try {
    if (role === 'driver') {
      const allowed = ['on_the_way', 'completed', 'cancelled'];
      if (!allowed.includes(b.status)) return res.status(403).json({ error: 'Drivers may only update trip status.' });
      const driverName = await currentUserName(req);
      const result = await db.query(
        'UPDATE transfers SET status = ? WHERE id = ? AND (driver_user_id = ? OR (driver_user_id IS NULL AND LOWER(driver) = LOWER(?)))',
        [b.status, req.params.id, req.user.userId, driverName || '__no_driver_name__']
      );
      if (!result.affectedRows) return res.status(403).json({ error: 'This trip is not assigned to you.' });
    } else if (!editTransferRoles.includes(role)) return res.status(403).json({ error: 'Read-only access.' });
    else {
      const fields = { reservationId:'reservation_id', propertyId:'property_id', guestName:'guest_name', guestPhone:'guest_phone', guestEmail:'guest_email', transferType:'transfer_type', destination:'destination', scheduledAt:'scheduled_at', passengers:'passengers', luggage:'luggage', luggages:'luggage', cabinLuggages:'cabin_luggages', approximateArrivalTimeAirport:'approximate_arrival_time_airport', flightInfo:'flight_info', driver:'driver', driverUserId:'driver_user_id', vehicle:'vehicle', notes:'notes', status:'status' };
      const sets=[]; const values=[];
      Object.entries(fields).forEach(([key,column]) => { if (Object.prototype.hasOwnProperty.call(b,key)) { sets.push(`${column} = ?`); values.push(b[key] === '' ? null : b[key]); } });
      if (!sets.length) return res.status(400).json({ error: 'No supported fields supplied.' });
      values.push(req.params.id); await db.query(`UPDATE transfers SET ${sets.join(', ')} WHERE id = ?`, values);
    }
    const rows = await db.query('SELECT * FROM transfers WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Transfer not found.' });
    res.json(rows[0]);
  } catch (error) { console.error('[TRANSFER UPDATE]', error); res.status(500).json({ error: 'Could not update transfer.' }); }
});

router.delete('/transfers/:id', allowRoles(...managerRoles), async (req, res) => {
  try { await db.query('DELETE FROM transfers WHERE id = ?', [req.params.id]); res.json({ success: true }); }
  catch { res.status(500).json({ error: 'Could not delete transfer.' }); }
});

router.get('/supervisor', allowRoles('admin','manager','management','supervisor'), async (_req, res) => {
  try {
    const cleaning = await db.query(
      `SELECT ha.*,
              u.first_name cleaner_first_name,
              u.last_name cleaner_last_name,
              u.email cleaner_email
       FROM housekeeping_assignments ha
       LEFT JOIN users u ON u.id = ha.cleaner_user_id
       WHERE ha.task_date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY) AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)
       ORDER BY
         CASE ha.status WHEN 'in_progress' THEN 0 WHEN 'assigned' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
         ha.task_date ASC,
         ha.property_name ASC,
         ha.room_number ASC`
    );
    const cleaningTasks = cleaning.map((row) => ({
      ...row,
      cleaner_name: `${row.cleaner_first_name || ''} ${row.cleaner_last_name || ''}`.trim() || row.cleaner_email || 'Cleaner',
    }));
    const transfers = await db.query(`SELECT * FROM transfers WHERE status NOT IN ('completed','cancelled') ORDER BY scheduled_at ASC`);
    res.json({ cleaningTasks, transfers });
  } catch (error) { console.error('[SUPERVISOR]', error); res.status(500).json({ error: 'Could not load supervisor operations.' }); }
});

router.get('/reports', allowRoles('admin','manager','management','supervisor'), async (req, res) => {
  try {
    const from=req.query.from || '1970-01-01'; const to=req.query.to || '2999-12-31';
    const transfers=await db.query(`SELECT status, COUNT(*) total FROM transfers WHERE DATE(scheduled_at) BETWEEN ? AND ? GROUP BY status`,[from,to]);
    let cleaning=[];
    try { cleaning=await db.query(`SELECT status, COUNT(*) total FROM cleaning_tasks WHERE DATE(COALESCE(completed_at, started_at, CURRENT_DATE)) BETWEEN ? AND ? GROUP BY status`,[from,to]); }
    catch (error) { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; }
    res.json({ transfers, cleaning, generatedAt:new Date() });
  } catch (error) { console.error('[REPORTS]', error); res.status(500).json({ error: 'Could not build reports.' }); }
});

router.get('/settings', allowRoles('admin'), async (_req,res) => {
  try { const rows=await db.query('SELECT setting_key, setting_value FROM app_settings ORDER BY setting_key'); res.json(Object.fromEntries(rows.map((r)=>[r.setting_key,r.setting_value]))); }
  catch { res.status(500).json({ error:'Could not load settings.' }); }
});
router.put('/settings', allowRoles('admin'), async (req,res) => {
  try {
    const entries=Object.entries(req.body || {}).filter(([key])=>/^[a-z0-9_.-]{2,120}$/i.test(key));
    for (const [key,value] of entries) await db.query(`INSERT INTO app_settings (setting_key,setting_value,updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_by=VALUES(updated_by)`,[key,String(value ?? ''),req.user.userId]);
    res.json({ success:true, updated:entries.length });
  } catch { res.status(500).json({ error:'Could not save settings.' }); }
});

module.exports = router;
