const sql = require('mssql');
const cfg = {
    user: 'sa', password: 'Nazhad@5759', server: '62.201.232.190', port: 1433,
    database: 'Car_Registraion',
    options: { encrypt: false, trustServerCertificate: true }
};
sql.connect(cfg).then(p => {
    return Promise.all([
        p.request().query("SELECT User_id, Place_ FROM Tbl_User WHERE AA='Yes' ORDER BY User_id"),
        p.request().query("SELECT DISTINCT Place_ FROM Tbl_User WHERE Place_ IS NOT NULL AND Place_ NOT IN ('*','') ORDER BY Place_")
    ]);
}).then(([users, places]) => {
    console.log('USERS:', JSON.stringify(users.recordset));
    console.log('PLACES:', JSON.stringify(places.recordset.map(x => x.Place_)));
    process.exit();
}).catch(e => { console.log(e.message); process.exit(); });
