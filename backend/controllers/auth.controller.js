const crypto = require('crypto');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jsonwebtoken = require('jsonwebtoken');
const { sendTwoFactorCode } = require('../services/notification.service');

const TWO_FACTOR_TTL_MS = 10 * 60 * 1000;

function jwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        const error = new Error('JWT_SECRET is required.');
        error.code = 'JWT_SECRET_MISSING';
        throw error;
    }
    return secret;
}

function twoFactorDigest(userId, code, expiresAt) {
    return crypto
        .createHmac('sha256', jwtSecret())
        .update(`${userId}:${code}:${expiresAt}`)
        .digest('hex');
}

function encodeTwoFactorSecret(userId, code) {
    const expiresAt = Date.now() + TWO_FACTOR_TTL_MS;
    return `v1:${expiresAt}:${twoFactorDigest(userId, code, expiresAt)}`;
}

function verifyTwoFactorSecret(userId, code, stored) {
    const [version, expiresRaw, digest] = String(stored || '').split(':');
    if (version !== 'v1' || !expiresRaw || !digest) return false;

    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

    const expected = twoFactorDigest(userId, code, expiresAt);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(digest, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicUser(user) {
    return {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        email: user.email,
    };
}

function createSessionToken(user) {
    return jsonwebtoken.sign(
        { userId: user.id, role: user.role },
        jwtSecret(),
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

function trustedDeviceMatches(user, deviceToken) {
    if (!deviceToken || !user.remember_device_token) return false;
    if (String(deviceToken) !== String(user.remember_device_token)) return false;

    try {
        const decoded = jsonwebtoken.verify(deviceToken, jwtSecret());
        return String(decoded.userId) === String(user.id) && decoded.type === 'trusted-device';
    } catch {
        return false;
    }
}

const login = async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const deviceToken = req.body?.deviceToken || null;

    try {
        const users = await db.query(
            'SELECT * FROM users WHERE LOWER(email) = ? AND is_active = 1 LIMIT 1',
            [email]
        );

        if (!users.length) {
            return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης' });
        }

        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης' });
        }

        if (trustedDeviceMatches(user, deviceToken)) {
            const token = createSessionToken(user);
            return res.status(200).json({
                success: true,
                authenticated: true,
                trustedDevice: true,
                token,
                user: publicUser(user),
            });
        }

        const code = crypto.randomInt(100000, 1000000).toString();
        const encodedSecret = encodeTwoFactorSecret(user.id, code);

        try {
            await sendTwoFactorCode({
                to: user.email,
                code,
                firstName: user.first_name,
            });
        } catch (mailError) {
            console.error('❌ [2FA EMAIL ERROR]:', mailError.message);
            return res.status(503).json({
                error: 'Δεν ήταν δυνατή η αποστολή του κωδικού 2FA μέσω email. Ελέγξτε τη ρύθμιση SMTP.',
                code: mailError.code || 'TWO_FACTOR_EMAIL_FAILED',
            });
        }

        await db.query(
            'UPDATE users SET two_factor_secret = ? WHERE id = ?',
            [encodedSecret, user.id]
        );

        return res.status(200).json({
            success: true,
            authenticated: false,
            requires2FA: true,
            message: 'Απαιτείται επαλήθευση 2FA',
            userId: user.id,
            emailHint: user.email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2'),
        });
    } catch (error) {
        console.error('❌ [AUTH LOGIN ERROR]:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const verify2FA = async (req, res) => {
    const { userId, code, rememberDevice } = req.body || {};

    try {
        const users = await db.query(
            'SELECT * FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
            [userId]
        );
        if (!users.length) return res.status(404).json({ error: 'User not found' });

        const user = users[0];
        const normalizedCode = String(code || '').trim();

        if (!/^\d{6}$/.test(normalizedCode) || !verifyTwoFactorSecret(user.id, normalizedCode, user.two_factor_secret)) {
            return res.status(400).json({ error: 'Μη έγκυρος ή ληγμένος κωδικός 2FA' });
        }

        let deviceToken = null;
        if (rememberDevice) {
            deviceToken = jsonwebtoken.sign(
                { userId: user.id, type: 'trusted-device' },
                jwtSecret(),
                { expiresIn: process.env.TRUSTED_DEVICE_EXPIRES_IN || '30d' }
            );
            await db.query(
                'UPDATE users SET two_factor_secret = NULL, remember_device_token = ? WHERE id = ?',
                [deviceToken, user.id]
            );
        } else {
            await db.query(
                'UPDATE users SET two_factor_secret = NULL WHERE id = ?',
                [user.id]
            );
        }

        const token = createSessionToken(user);

        return res.status(200).json({
            success: true,
            authenticated: true,
            token,
            rememberDeviceToken: deviceToken,
            user: publicUser(user),
        });
    } catch (error) {
        console.error('❌ [2FA VERIFY ERROR]:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const cloudbedsCallback = async (_req, res) => {
    return res.status(410).send(
        'This legacy callback is disabled. Use /api/integrations/cloudbeds/callback.'
    );
};

module.exports = { login, verify2FA, cloudbedsCallback };
