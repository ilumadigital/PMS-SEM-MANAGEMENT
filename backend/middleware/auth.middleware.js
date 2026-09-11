const jsonwebtoken = require('jsonwebtoken');

// 🔐 Middleware για έλεγχο αν ο χρήστης είναι συνδεδεμένος
const protect = (req, res, next) => {
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

    try {
        // Επαλήθευση Token
        const decoded = jsonwebtoken.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Προσθήκη των στοιχείων του χρήστη (id, role) στο request object
        next();
    } catch (error) {
        return res.status(401).json({
            error: 'Μη έγκυρο ή ληγμένο Token.',
            message: 'Η συνεδρία σας έληξε. Συνδεθείτε ξανά.',
            code: 'AUTH_TOKEN_INVALID',
        });
    }
};

// 👮 Middleware για περιορισμό πρόσβασης με βάση τον ρόλο (RBAC)
const restrictTo = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Δεν έχετε δικαίωμα να εκτελέσετε αυτή την ενέργεια.' });
        }
        next();
    };
};

module.exports = { protect, restrictTo };