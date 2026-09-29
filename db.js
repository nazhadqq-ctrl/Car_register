const sql = require('mssql');

const config = {
    user: 'sa',
    password: 'Nazhad@5759',
    server: '62.201.232.190',
    port: 1433,
    database: 'Car_Registraion',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        connectTimeout: 15000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool = null;

async function getPool() {
    if (pool && pool.connected) {
        return pool;
    }
    // If pool exists but is disconnected, close it cleanly
    if (pool) {
        try { await pool.close(); } catch (e) { /* ignore close errors */ }
        pool = null;
    }
    pool = await sql.connect(config);
    // Auto-clear pool on connection errors so next call reconnects
    pool.on('error', (err) => {
        console.error('⚠️ SQL Pool error (will reconnect on next request):', err.message);
        pool = null;
    });
    return pool;
}

module.exports = { getPool, sql };
