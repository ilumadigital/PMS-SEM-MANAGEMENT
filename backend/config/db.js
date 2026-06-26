const mariadb = require('mariadb');
require('dotenv').config();

// Δημιουργία του Connection Pool με βάση τις μεταβλητές του .env
const pool = mariadb.createPool({
     host: process.env.DB_HOST,
     user: process.env.DB_USER,
     password: process.env.DB_PASS,
     database: process.env.DB_NAME,
     port: parseInt(process.env.DB_PORT) || 3306,
     connectionLimit: 10, // Μέγιστος αριθμός ταυτόχρονων συνδέσεων
     acquireTimeout: 10000
});

// Helper συνάρτηση για να εκτελούμε queries πεντάκαθαρα στους controllers
async function query(sql, params) {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(sql, params);
        return rows;
    } catch (err) {
        console.error("❌ Σφάλμα κατά την εκτέλεση του Query:", err.message);
        throw err;
    } finally {
        if (conn) conn.release(); // Επιστροφή της σύνδεσης στο pool
    }
}

module.exports = {
    pool,
    query
};