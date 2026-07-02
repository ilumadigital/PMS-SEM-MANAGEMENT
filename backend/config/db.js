const mariadb = require('mariadb');
require('dotenv').config();

// Δημιουργία του Connection Pool με βάση τις μεταβλητές του .env
const pool = mariadb.createPool({
     host: process.env.DB_HOST || 'localhost', 
     user: process.env.DB_USER || 'root', 
     password: process.env.DB_PASSWORD || 'root',
     database: process.env.DB_NAME || 'sem_pms_db',
     port: process.env.DB_PORT || 3306,
     connectionLimit: 10
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