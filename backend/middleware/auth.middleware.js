const jsonwebtoken = require('jsonwebtoken');
const db = require('../config/db');

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            error: 'Δεν επιτρέπεται η πρόσβαση. Λείπει το Token.',
            message: 'Η συνεδρία σας έληξε. Συνδεθείτε ξανά.',
            code: 'AUTH_TOKEN_MISSING',
        });
    }

    let decoded;
    try {
        decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
    } catch (_error) {
        return res.status(401).json({
            error: 'Μη έγκυρο ή ληγμένο Token.',
            message: 'Η συνεδρία σας έληξε. Συνδεθείτε ξανά.',
            code: 'AUTH_TOKEN_INVALID',
        });
    }

    try {
        const users = await db.query(
            'SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1',
            [decoded.userId]
        );
        const user = users[0];
        if (!user || !user.is_active) {
            return res.status(401).json({
                error: 'Ο λογαριασμός δεν είναι ενεργός.',
                message: 'Επικοινωνήστε με τον διαχειριστή.',
                code: 'AUTH_USER_INACTIVE',
            });
        }

        // Resolve the current role from the database on every request so an
        // Administrator's role/activation changes take effect immediately,
        // even when an older JWT is still stored in the browser.
        req.user = {
            ...decoded,
            userId: user.id,
            role: String(user.role || '').toLowerCase(),
        };
        return next();
    } catch (error) {
        console.error('[AUTH USER LOOKUP]', error.message);
        return res.status(503).json({
            error: 'Authentication service unavailable.',
            message: 'Δοκιμάστε ξανά σε λίγο.',
            code: 'AUTH_USER_LOOKUP_FAILED',
        });
    }
};

const restrictTo = (...allowedRoles) => {
    const normalized = allowedRoles.map((role) => String(role).toLowerCase());
    return (req, res, next) => {
        if (!normalized.includes(String(req.user?.role || '').toLowerCase())) {
            return res.status(403).json({ error: 'Δεν έχετε δικαίωμα να εκτελέσετε αυτή την ενέργεια.' });
        }
        next();
    };
};

module.exports = { protect, restrictTo };
