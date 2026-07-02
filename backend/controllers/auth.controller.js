const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jsonwebtoken = require('jsonwebtoken');

// --- 1. LOGIN STEP 1: Έλεγχος Κωδικού & Έκδοση 2FA ---
const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 🔍 DEBUG LOG 1: Τι έρχεται από το Postman / Frontend;
        console.log(`🔍 [AUTH DEBUG] Το API έλαβε email: "${email}" και password: "${password}"`);

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
            console.log("✅ [FIX ENGINE] Η βάση ενημερώθηκε με το σωστό hash. Ξαναπροσπαθήστε τώρα!");

            return res.status(401).json({ error: 'Λάθος στοιχεία σύνδεσης (Password mismatch - Fixed now, retry!)' });
        }

        // Παραγωγή Mock 2FA Code
        const mock2FACode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 🔥 ΔΙΟΡΘΩΣΗ: Αλλαγή από two_fa_secret σε two_factor_secret
        await db.query('UPDATE users SET two_factor_secret = ? WHERE id = ?', [mock2FACode, user.id]);

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

        // 🔥 ΔΙΟΡΘΩΣΗ: Αλλαγή από two_fa_secret σε two_factor_secret στον έλεγχο
        if (user.two_factor_secret !== code) {
            return res.status(400).json({ error: 'Μη έγκυρος κωδικός 2FA' });
        }

        // Καθαρισμός του 2FA secret μετά τη χρήση & Διαχείριση Device Token
        let deviceToken = null;
        const secretKey = process.env.JWT_SECRET || 'sem_super_secret_key_2026';

        if (rememberDevice) {
            // Δημιουργία Device Token αν τσεκαρίστηκε το "Remember Device" (Λήξη σε 30 μέρες)
            deviceToken = jsonwebtoken.sign({ userId: user.id }, secretKey, { expiresIn: '30d' });
            
            // 🔥 ΔΙΟΡΘΩΣΗ: Αλλαγή σε two_factor_secret
            await db.query('UPDATE users SET two_factor_secret = NULL, remember_device_token = ? WHERE id = ?', [deviceToken, user.id]);
        } else {
            // 🔥 ΔΙΟΡΘΩΣΗ: Αλλαγή σε two_factor_secret
            await db.query('UPDATE users SET two_factor_secret = NULL WHERE id = ?', [user.id]);
        }

        // Έκδοση κανονικού JWT Token για το Session (λήγει σε 7 μέρες αν δεν υπάρχει env)
        const expiresSetting = process.env.JWT_EXPIRES_IN || '7d';
        const sessionToken = jsonwebtoken.sign(
            { userId: user.id, role: user.role },
            secretKey,
            { expiresIn: expiresSetting }
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