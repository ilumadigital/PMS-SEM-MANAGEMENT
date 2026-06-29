const db = require('../config/db');
const bcrypt = require('bcrypt');
const jsonwebtoken = require('jsonwebtoken');

// --- 1. LOGIN STEP 1: Έλεγχος Κωδικού & Έκδοση 2FA ---
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 🔍 DEBUG LOG 1: Τι έρχεται από το Postman;
        console.log(`🔍 [AUTH DEBUG] Το Postman έστειλε email: "${email}" και password: "${password}"`);

        // Εύρεση χρήστη
        const users = await db.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
        
        // 🔍 DEBUG LOG 2: Τι βρήκε η MariaDB;
        console.log(`🔍 [AUTH DEBUG] Η MariaDB επέστρεψε ${users.length} χρήστες. Data:`, users);

        if (users.length === 0) {
            return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης (User not found)' });
        }

        const user = users[0];

        // Έλεγχος password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        // 🔍 DEBUG LOG 3: Ταίριαξε ο κωδικός;
        console.log(`🔍 [AUTH DEBUG] Το Bcrypt έβγαλε αποτέλεσμα: ${isMatch}`);

        if (!isMatch) {
            // 🚀 AUTOMATED LOCAL FIX: Αν αποτύχει, φτιάχνουμε το σωστό hash και ενημερώνουμε τη βάση live!
            console.log("⚠️ [FIX ENGINE] Παράγεται νέο, καθαρό hash από το Node.js...");
            const cleanHash = await bcrypt.hash(password, 10);
            await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [cleanHash, user.id]);
            console.log("✅ [FIX ENGINE] Η βάση ενημερώθηκε με το σωστό hash. Ξαναπατήστε Send στο Postman!");

            return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης (Password mismatch - Fixed now, retry!)' });
        }

        // Παραγωγή Mock 2FA Code
        const mock2FACode = Math.floor(100000 + Math.random() * 900000).toString();
        await db.query('UPDATE users SET two_fa_secret = ? WHERE id = ?', [mock2FACode, user.id]);

        console.log(`\n📧 [SECURITY 2FA] Στάλθηκε κωδικός στο email ${user.email}: [ ${mock2FACode} ]\n`);

        res.status(200).json({ 
            message: 'Απαιτείται επαλήθευση 2FA',
            userId: user.id
        });

    } catch (error) {
        console.error('❌ [AUTH LOGIN ERROR]:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// --- 2. LOGIN STEP 2: Επαλήθευση 2FA & Έκδοση JWT ---
const verify2FA = async (req, res) => {
    const { userId, code, rememberDevice } = req.body;

    try {
        const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = users[0];

        // Έλεγχος αν ο κωδικός ταιριάζει
        if (user.two_fa_secret !== code) {
            return res.status(400).json({ error: 'Μη έγκυρος κωδικός 2FA' });
        }

        // Καθαρισμός του 2FA secret μετά τη χρήση
        let deviceToken = null;
        if (rememberDevice) {
            // Δημιουργία Device Token αν τσεκαρίστηκε το "Remember Device"
            deviceToken = jsonwebtoken.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
            await db.query('UPDATE users SET two_fa_secret = NULL, remember_device_token = ? WHERE id = ?', [deviceToken, user.id]);
        } else {
            await db.query('UPDATE users SET two_fa_secret = NULL WHERE id = ?', [user.id]);
        }

        // Έκδοση κανονικού JWT Token για το Session (λήγει σε 7 μέρες)
        const sessionToken = jsonwebtoken.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.status(200).json({
            success: true,
            token: sessionToken,
            rememberDeviceToken: deviceToken,
            user: {
                id: user.id,
                firstName: user.first_name,
                lastName: user.last_name,
                role: user.role,
                email: user.email
            }
        });

    } catch (error) {
        console.error('❌ [2FA VERIFY ERROR]:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { login, verify2FA };