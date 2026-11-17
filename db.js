const sql = require('mssql');
const { loadDotEnv } = require('./security');

// Load local .env secrets if present (takes priority over fallback defaults)
loadDotEnv();

// Server 1 - Primary Central Database
const config190 = {
    user: process.env.DB190_USER || 'sa',
    password: process.env.DB190_PASSWORD || 'Nazhad@5759',
    server: process.env.DB190_HOST || '62.201.232.190',
    port: parseInt(process.env.DB190_PORT || '1433', 10),
    database: process.env.DB190_NAME || 'Car_Registraion',
    options: {
        encrypt: String(process.env.DB190_ENCRYPT || 'false').toLowerCase() === 'true',
        trustServerCertificate: String(process.env.DB190_TRUST_CERT || 'true').toLowerCase() === 'true',
        connectTimeout: 15000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Server 2 - Secondary / Traffic Headquarters Database
const config90 = {
    user: process.env.DB90_USER || 'sa',
    password: process.env.DB90_PASSWORD || 'Nazhad',
    server: process.env.DB90_HOST || '62.201.232.90',
    port: parseInt(process.env.DB90_PORT || '1433', 10),
    database: process.env.DB90_NAME || 'Car_Registraion',
    options: {
        encrypt: String(process.env.DB90_ENCRYPT || 'false').toLowerCase() === 'true',
        trustServerCertificate: String(process.env.DB90_TRUST_CERT || 'true').toLowerCase() === 'true',
        connectTimeout: 4000,
        requestTimeout: 10000
    },
    pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool190 = null;
let pool90 = null;

async function getPool() {
    if (pool190 && pool190.connected) {
        return pool190;
    }
    if (pool190) {
        try { await pool190.close(); } catch (e) { /* ignore close errors */ }
        pool190 = null;
    }
    pool190 = new sql.ConnectionPool(config190);
    await pool190.connect();
    pool190.on('error', (err) => {
        console.error('⚠️ SQL Pool 190 error (will reconnect on next request):', err.message);
        pool190 = null;
    });
    return pool190;
}

async function getPool90() {
    if (pool90 && pool90.connected) {
        return pool90;
    }
    if (pool90) {
        try { await pool90.close(); } catch (e) { /* ignore close errors */ }
        pool90 = null;
    }
    pool90 = new sql.ConnectionPool(config90);
    await pool90.connect();
    pool90.on('error', (err) => {
        console.error('⚠️ SQL Pool 90 error (will reconnect on next request):', err.message);
        pool90 = null;
    });
    return pool90;
}

module.exports = { getPool, getPool90, sql, config190, config90 };
