const sql = require('mssql');

// Server 1 (62.201.232.190) - Primary Central Database
const config190 = {
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

// Server 2 (62.201.232.90) - Secondary / Traffic Headquarters Database
const config90 = {
    user: 'sa',
    password: 'Nazhad',
    server: '62.201.232.90',
    port: 1433,
    database: 'Car_Registraion',
    options: {
        encrypt: false,
        trustServerCertificate: true,
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
