const { getPool } = require('./db');

async function inspectTables() {
    try {
        const pool = await getPool();
        const tables = ['Gomrg', 'Hijz', 'Tbl_User', 'T1', 'RAP', 'ARM'];
        for (const t of tables) {
            const cols = await pool.request().query(`
                SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = '${t}'
            `);
            console.log(`=== TABLE: ${t} ===`);
            console.log(cols.recordset.map(c => c.COLUMN_NAME).join(', '));
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

inspectTables();
