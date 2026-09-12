const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { protect, restrictTo } = require('../middleware/auth.middleware');

const router = express.Router();

const ROLE_CATALOG = [
  { key: 'admin', label: 'Administrator', description: 'Full access including developer settings, integrations and user management.' },
  { key: 'manager', label: 'Manager', description: 'Full company operational access without developer settings.' },
  { key: 'reception', label: 'Front Desk', description: 'Front desk, reservations, guests, rooms and guest portal.' },
  { key: 'supervisor', label: 'Supervisor', description: 'Operational supervision, housekeeping, transfers and reports.' },
  { key: 'cleaneradmin', label: 'Cleaner Admin', description: 'Full housekeeping management and cleaner assignments.' },
  { key: 'cleaner', label: 'Cleaner', description: 'Only assigned housekeeping schedule and assigned rooms.' },
  { key: 'driversadmin', label: 'Drivers Admin', description: 'Transfer management and driver assignments.' },
  { key: 'driver', label: 'Driver', description: 'Only assigned shuttle schedule and trip status.' },
];

const ALLOWED_ROLES = new Set(ROLE_CATALOG.map((role) => role.key));
let roleStorageReady = false;

async function ensureUserRoleStorage() {
  if (roleStorageReady) return;
  await db.query(`ALTER TABLE users MODIFY COLUMN role VARCHAR(40) NOT NULL`);
  await db.query(`UPDATE users SET role='manager' WHERE role='management'`);
  await db.query(`UPDATE users SET role='cleaner' WHERE role='cleaning'`);
  await db.query(`UPDATE users SET role='driversadmin' WHERE role='dispatcher'`);
  roleStorageReady = true;
}

router.use(protect, restrictTo('admin'));
router.use(async (_req, res, next) => {
  try { await ensureUserRoleStorage(); next(); }
  catch (error) { console.error('[ADMIN ROLE STORAGE]', error); res.status(500).json({ success:false, message:'Could not prepare user role storage.' }); }
});

router.get('/roles', (_req, res) => {
  res.json({ success: true, data: ROLE_CATALOG });
});

router.get('/users', async (_req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, first_name, last_name, email, role, is_active
       FROM users
       ORDER BY is_active DESC, first_name ASC, last_name ASC, email ASC`
    );
    res.json({
      success: true,
      data: rows.map((row) => ({
        id: String(row.id),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        email: row.email || '',
        role: row.role || '',
        isActive: Boolean(row.is_active),
      })),
    });
  } catch (error) {
    console.error('[ADMIN USERS LIST]', error);
    res.status(500).json({ success: false, message: 'Could not load users.' });
  }
});

router.post('/users', async (req, res) => {
  const body = req.body || {};
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const role = String(body.role || '').trim().toLowerCase();

  if (!firstName || !email || !password || !ALLOWED_ROLES.has(role)) {
    return res.status(422).json({ success: false, message: 'First name, email, password and a valid role are required.' });
  }
  if (password.length < 8) {
    return res.status(422).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
    if (existing.length) return res.status(409).json({ success: false, message: 'A user with this email already exists.' });

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [firstName, lastName || null, email, hash, role]
    );

    res.status(201).json({
      success: true,
      data: { id: String(result.insertId), firstName, lastName, email, role, isActive: true },
    });
  } catch (error) {
    console.error('[ADMIN USER CREATE]', error);
    res.status(500).json({ success: false, message: 'Could not create user.' });
  }
});

router.patch('/users/:id', async (req, res) => {
  const body = req.body || {};
  const fields = [];
  const values = [];

  if (body.firstName !== undefined) { fields.push('first_name = ?'); values.push(String(body.firstName || '').trim()); }
  if (body.lastName !== undefined) { fields.push('last_name = ?'); values.push(String(body.lastName || '').trim() || null); }
  if (body.email !== undefined) { fields.push('email = ?'); values.push(String(body.email || '').trim().toLowerCase()); }
  if (body.role !== undefined) {
    const role = String(body.role || '').trim().toLowerCase();
    if (!ALLOWED_ROLES.has(role)) return res.status(422).json({ success: false, message: 'Invalid role.' });
    fields.push('role = ?'); values.push(role);
  }
  if (body.isActive !== undefined) { fields.push('is_active = ?'); values.push(body.isActive ? 1 : 0); }
  if (body.password !== undefined && String(body.password || '').length) {
    const password = String(body.password);
    if (password.length < 8) return res.status(422).json({ success: false, message: 'Password must be at least 8 characters.' });
    fields.push('password_hash = ?'); values.push(await bcrypt.hash(password, 12));
    fields.push('remember_device_token = NULL');
    fields.push('two_factor_secret = NULL');
  }

  if (!fields.length) return res.status(422).json({ success: false, message: 'No supported user fields supplied.' });

  try {
    values.push(req.params.id);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    const rows = await db.query('SELECT id, first_name, last_name, email, role, is_active FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
    const row = rows[0];
    res.json({
      success: true,
      data: {
        id: String(row.id), firstName: row.first_name || '', lastName: row.last_name || '',
        email: row.email || '', role: row.role || '', isActive: Boolean(row.is_active),
      },
    });
  } catch (error) {
    console.error('[ADMIN USER UPDATE]', error);
    if (String(error.code || '').includes('DUP')) return res.status(409).json({ success: false, message: 'That email is already in use.' });
    res.status(500).json({ success: false, message: 'Could not update user.' });
  }
});

module.exports = router;
