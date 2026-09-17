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
    if (!pool) {
        pool = await sql.connect(config);
    }
    return pool;
}

module.exports = { getPool, sql };
