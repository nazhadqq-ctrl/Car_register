const express = require('express');
const session = require('express-session');
const path = require('path');
const { getPool, sql } = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'TrafficCheck_Secret_2024',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));

// ─── AUTH MIDDLEWARE ────────────────────────────────────────────────
function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.status(401).json({ success: false, message: 'غیرمجاز' });
}

// ─── LOGIN API ───────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ success: false, message: 'ناوی یوزەر و پاسۆرد داواکراوە' });
        }
        const pool = await getPool();
        const result = await pool.request()
            .input('uid', sql.NVarChar, username.trim())
            .input('pwd', sql.NVarChar, password.trim())
            .query(`SELECT * FROM Tbl_User WHERE User_id = @uid AND Password = @pwd AND AA = 'Yes'`);

        if (result.recordset.length === 0) {
            return res.json({ success: false, message: 'ناوی یوزەر یان پاسۆردەکە هەڵەیە' });
        }

        const user = result.recordset[0];
        req.session.user = {
            id: user.id,
            username: user.User_id,
            name: user.User_Name || user.User_id,
            permission: user.Permission,
            place: user.Place_ || ''
        };
        res.json({ success: true, user: req.session.user });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'کێشەی سێرڤەر' });
    }
});

// ─── GET ALL USERS (for autocomplete) ───────────────────────────────
app.get('/api/users', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query(`SELECT User_id, Place_ FROM Tbl_User WHERE AA = 'Yes' ORDER BY User_id`);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── LOGOUT ─────────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ─── SESSION CHECK ───────────────────────────────────────────────────
app.get('/api/me', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// ─── SEARCH VEHICLES ─────────────────────────────────────────────────
app.get('/api/search', requireAuth, async (req, res) => {
    try {
        const { q, field } = req.query;
        if (!q) return res.json([]);

        const pool = await getPool();
        let query = '';
        const term = `%${q}%`;

        // T1 columns: A=PlateNo, B=Province, C=Type(bash), D=Office, E=Barad,
        // G=Owner, I=CarModel, J=CarCategory, K=Fuel, L=Color, M=Gear,
        // N=Doors, O=Cylinders, P=Year, Q=Seats, R=Chassis, FF=User, GG=Checker
        
        switch(field) {
            case 'chassis':
                query = `SELECT TOP 50 id,A,B,C,D,E,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,FF,GG,DD FROM T1 WHERE R LIKE @term ORDER BY DD DESC`;
                break;
            case 'plate':
                query = `SELECT TOP 50 id,A,B,C,D,E,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,FF,GG,DD FROM T1 WHERE A LIKE @term ORDER BY DD DESC`;
                break;
            case 'owner':
                query = `SELECT TOP 50 id,A,B,C,D,E,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,FF,GG,DD FROM T1 WHERE G LIKE @term ORDER BY DD DESC`;
                break;
            case 'color':
                query = `SELECT TOP 50 id,A,B,C,D,E,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,FF,GG,DD FROM T1 WHERE L LIKE @term ORDER BY DD DESC`;
                break;
            case 'model':
                query = `SELECT TOP 50 id,A,B,C,D,E,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,FF,GG,DD FROM T1 WHERE I LIKE @term ORDER BY DD DESC`;
                break;
            case 'type':
                query = `SELECT TOP 50 id,A,B,C,D,E,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,FF,GG,DD FROM T1 WHERE C LIKE @term ORDER BY DD DESC`;
                break;
            default:
                // Search all fields
                query = `SELECT TOP 100 id,A,B,C,D,E,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,FF,GG,DD FROM T1 
                         WHERE A LIKE @term OR G LIKE @term OR R LIKE @term OR I LIKE @term OR L LIKE @term 
                         OR C LIKE @term OR T LIKE @term
                         ORDER BY DD DESC`;
        }

        const result = await pool.request()
            .input('term', sql.NVarChar, term)
            .query(query);

        // Map columns to readable names
        const mapped = result.recordset.map(r => ({
            id: r.id,
            plateNo: r.A,
            province: r.B,
            type: r.C,        // تایبەت / بار
            office: r.D,
            barad: r.E,
            owner: r.G,
            action: r.H,      // بەناوکردن / تۆماری یەکەم جار
            model: r.I,
            category: r.J,    // صالون / استیشن / براد
            fuel: r.K,
            color: r.L,
            gear: r.M,
            doors: r.N,
            cylinders: r.O,
            year: r.P,
            seats: r.Q,
            chassis: r.R,
            mobile: r.T,
            enteredBy: r.FF,
            checker: r.GG,
            date: r.DD
        }));

        res.json(mapped);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET VEHICLE DETAIL ──────────────────────────────────────────────
app.get('/api/vehicle/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT * FROM T1 WHERE id = @id`);
        if (result.recordset.length === 0) return res.status(404).json({ error: 'نەدۆزرایەوە' });
        res.json(result.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET COLORS LIST ─────────────────────────────────────────────────
app.get('/api/colors', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`SELECT Colors FROM Tbl_Color ORDER BY Colors`);
        res.json(result.recordset.map(r => r.Colors));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET PROVINCES LIST ──────────────────────────────────────────────
app.get('/api/provinces', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`SELECT par FROM parz ORDER BY par`);
        res.json(result.recordset.map(r => r.par));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET BARADS LIST ─────────────────────────────────────────────────
app.get('/api/barads', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT TOP 50 E 
            FROM T1 
            WHERE E IS NOT NULL AND LEN(E) > 3 AND E NOT IN ('-','.') 
            ORDER BY E
        `);
        res.json(result.recordset.map(r => r.E.trim()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── STATS ───────────────────────────────────────────────────────────
app.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [total, today, byType] = await Promise.all([
            pool.request().query(`SELECT COUNT(*) as cnt FROM T1`),
            pool.request().query(`SELECT COUNT(*) as cnt FROM T1 WHERE CAST(DD as date) = CAST(GETDATE() as date)`),
            pool.request().query(`SELECT C as type_, COUNT(*) as cnt FROM T1 WHERE C IS NOT NULL GROUP BY C ORDER BY cnt DESC`)
        ]);
        res.json({
            total: total.recordset[0].cnt,
            today: today.recordset[0].cnt,
            byType: byType.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET SUSPICIOUS VEHICLES (RAP) ──────────────────────────────────
app.get('/api/suspicious', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query(`SELECT TOP 200 id,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S FROM RAP ORDER BY O DESC`);
        
        const mapped = result.recordset.map(r => ({
            id: r.id,
            plateNo: r.A,
            province: r.B,
            type: r.C,
            model: r.D,
            year: r.E,
            color: r.F,
            chassis: r.G,
            oldChassis: r.I,
            barad: r.M,
            note: r.N,
            date: r.O,
            checker: r.R
        }));
        res.json(mapped);
    } catch (err) {
        console.error('Suspicious error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GOMRG (CUSTOMS) ────────────────────────────────────────────────
app.get('/api/gomrg', requireAuth, async (req, res) => {
    try {
        const { q } = req.query;
        const pool = await getPool();
        let query = `SELECT TOP 100 id, car_n, shassy, Full_name, car_type, model, resoon, date_insert, user_, place, parezga, bash FROM Gomrg `;
        if (q && q.trim()) {
            query += `WHERE shassy LIKE @term OR car_n LIKE @term OR Full_name LIKE @term OR resoon LIKE @term `;
        }
        query += `ORDER BY id DESC`;

        const request = pool.request();
        if (q && q.trim()) {
            request.input('term', sql.NVarChar, `%${q.trim()}%`);
        }
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Gomrg error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/gomrg', requireAuth, async (req, res) => {
    try {
        const { car_n, shassy, Full_name, car_type, model, resoon, place, parezga, bash } = req.body;
        const pool = await getPool();
        const user = req.session.user.name || req.session.user.username;
        await pool.request()
            .input('car_n', sql.NVarChar, car_n || '')
            .input('shassy', sql.NVarChar, shassy || '')
            .input('Full_name', sql.NVarChar, Full_name || '')
            .input('car_type', sql.NVarChar, car_type || '')
            .input('model', sql.NVarChar, model || '')
            .input('resoon', sql.NVarChar, resoon || '')
            .input('place', sql.NVarChar, place || '')
            .input('parezga', sql.NVarChar, parezga || '')
            .input('bash', sql.NVarChar, bash || '')
            .input('user_', sql.NVarChar, user)
            .query(`INSERT INTO Gomrg (car_n, shassy, Full_name, car_type, model, resoon, place, parezga, bash, user_, date_insert)
                    VALUES (@car_n, @shassy, @Full_name, @car_type, @model, @resoon, @place, @parezga, @bash, @user_, GETDATE())`);
        res.json({ success: true, message: 'بە سەرکەوتوویی لە گومرگ تۆمارکرا' });
    } catch (err) {
        console.error('Add Gomrg error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── HIJZ (IMPOUND / SEIZURE) ───────────────────────────────────────
app.get('/api/hijz', requireAuth, async (req, res) => {
    try {
        const { q } = req.query;
        const pool = await getPool();
        let query = `SELECT TOP 100 idd, Auto_No, Place_, Car_Plet, Date_Releasing, Reg_Name, car_Note, UUser FROM Hijz `;
        if (q && q.trim()) {
            query += `WHERE Reg_Name LIKE @term OR Auto_No LIKE @term OR car_Note LIKE @term OR Place_ LIKE @term `;
        }
        query += `ORDER BY idd DESC`;

        const request = pool.request();
        if (q && q.trim()) {
            request.input('term', sql.NVarChar, `%${q.trim()}%`);
        }
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Hijz error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/hijz', requireAuth, async (req, res) => {
    try {
        const { Auto_No, Place_, Car_Plet, Date_Releasing, Reg_Name, car_Note } = req.body;
        const pool = await getPool();
        const user = req.session.user.name || req.session.user.username;
        await pool.request()
            .input('Auto_No', sql.NVarChar, Auto_No || '')
            .input('Place_', sql.NVarChar, Place_ || '')
            .input('Car_Plet', sql.NVarChar, Car_Plet || 'تایبەت')
            .input('Date_Releasing', sql.NVarChar, Date_Releasing || new Date().toISOString().slice(0, 10))
            .input('Reg_Name', sql.NVarChar, (Reg_Name || '').trim().toUpperCase())
            .input('car_Note', sql.NVarChar, car_Note || '')
            .input('UUser', sql.NVarChar, user)
            .query(`INSERT INTO Hijz (Auto_No, Place_, Car_Plet, Date_Releasing, Reg_Name, car_Note, UUser)
                    VALUES (@Auto_No, @Place_, @Car_Plet, @Date_Releasing, @Reg_Name, @car_Note, @UUser)`);
        res.json({ success: true, message: 'نیشانەی حیجز بە سەرکەوتوویی دانرا' });
    } catch (err) {
        console.error('Add Hijz error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/hijz/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`DELETE FROM Hijz WHERE idd = @id`);
        res.json({ success: true, message: 'حیجزەکە بە سەرکەوتوویی لابرا' });
    } catch (err) {
        console.error('Delete Hijz error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── FIND VEHICLE FOR REGISTRATION FORM ─────────────────────────────
app.get('/api/register/find', requireAuth, async (req, res) => {
    try {
        const { plate, chassis } = req.query;
        if (!plate && !chassis) return res.json(null);
        const pool = await getPool();
        const request = pool.request();
        let query = 'SELECT TOP 1 * FROM T1 WHERE ';
        if (plate && plate.trim()) {
            query += 'A = @plate ';
            request.input('plate', sql.NVarChar, plate.trim());
        } else if (chassis && chassis.trim()) {
            query += 'R = @chassis ';
            request.input('chassis', sql.NVarChar, chassis.trim().toUpperCase());
        }
        query += 'ORDER BY id DESC';
        const result = await request.query(query);
        res.json(result.recordset[0] || null);
    } catch (err) {
        console.error('Find vehicle error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── REGISTER NEW VEHICLE (T1) ───────────────────────────────────────
app.post('/api/register', requireAuth, async (req, res) => {
    try {
        const {
            A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U,
            V, W, X, Y, Z, AA, BB, CC, II, JJ, GG, DD
        } = req.body;

        if (!A && !R) {
            return res.status(400).json({ success: false, message: 'پێویستە لانی کەم ژمارەی تابلۆ یان شاسی دیاری بکرێت' });
        }

        const pool = await getPool();
        const user = req.session.user.name || req.session.user.username;

        // Check if chassis exists in Hijz
        let warnings = [];
        if (R && R.trim()) {
            const chCheck = await pool.request()
                .input('ch', sql.NVarChar, R.trim().toUpperCase())
                .query(`SELECT TOP 1 * FROM Hijz WHERE Reg_Name = @ch`);
            if (chCheck.recordset.length > 0) {
                warnings.push(`ئاگاداری: ئەم شاسییە (${R}) لە لیستی حیجز تۆمارکراوە!`);
            }
        }

        await pool.request()
            .input('A', sql.NVarChar, A || '')
            .input('B', sql.NVarChar, B || '')
            .input('C', sql.NVarChar, C || 'تایبەت')
            .input('D', sql.NVarChar, D || req.session.user.place || '')
            .input('E', sql.NVarChar, E || '')
            .input('F', sql.NVarChar, F || '*')
            .input('G', sql.NVarChar, G || '')
            .input('H', sql.NVarChar, H || 'تۆماری یەکەم جار')
            .input('I', sql.NVarChar, I || '')
            .input('J', sql.NVarChar, J || '')
            .input('K', sql.NVarChar, K || 'بەنزین')
            .input('L', sql.NVarChar, L || '')
            .input('M', sql.NVarChar, M || 'ئۆتۆماتیک')
            .input('N', sql.NVarChar, N != null ? String(N) : '0')
            .input('O', sql.NVarChar, O != null ? String(O) : '0')
            .input('P', sql.NVarChar, P != null ? String(P) : '0')
            .input('Q', sql.NVarChar, Q != null ? String(Q) : '0')
            .input('R', sql.NVarChar, (R || '').trim().toUpperCase())
            .input('S', sql.NVarChar, S || '*')
            .input('T', sql.NVarChar, T || '0')
            .input('U', sql.NVarChar, U || '')
            .input('V', sql.NVarChar, V || '')
            .input('W', sql.NVarChar, W || '*')
            .input('X', sql.NVarChar, X || '')
            .input('Y', sql.NVarChar, Y != null ? String(Y) : '0')
            .input('Z', sql.NVarChar, Z || '')
            .input('AA', sql.NVarChar, AA || '*')
            .input('BB', sql.NVarChar, BB || '')
            .input('CC', sql.NVarChar, CC != null ? String(CC) : '0')
            .input('II', sql.NVarChar, II != null ? String(II) : '25000')
            .input('JJ', sql.NVarChar, JJ != null ? String(JJ) : '0')
            .input('FF', sql.NVarChar, user)
            .input('GG', sql.NVarChar, GG || '')
            .input('DD', sql.NVarChar, DD || new Date().toISOString().slice(0, 10))
            .query(`INSERT INTO T1 (A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, BB, CC, II, JJ, FF, GG, DD, EE)
                    VALUES (@A, @B, @C, @D, @E, @F, @G, @H, @I, @J, @K, @L, @M, @N, @O, @P, @Q, @R, @S, @T, @U, @V, @W, @X, @Y, @Z, @AA, @BB, @CC, @II, @JJ, @FF, @GG, @DD, GETDATE())`);

        res.json({ success: true, message: 'ئوتومبێل بە سەرکەوتوویی تۆمارکرا', warnings });
    } catch (err) {
        console.error('Register vehicle error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── UPDATE VEHICLE IN T1 (ڕاستکردنەوەی زانیاری) ───────────────────────
app.put('/api/register/:id', requireAuth, async (req, res) => {
    try {
        const id = req.params.id;
        const {
            A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U,
            V, W, X, Y, Z, AA, BB, CC, II, JJ, GG, DD
        } = req.body;

        const pool = await getPool();
        const user = req.session.user.name || req.session.user.username;

        await pool.request()
            .input('id', sql.Int, id)
            .input('A', sql.NVarChar, A || '')
            .input('B', sql.NVarChar, B || '')
            .input('C', sql.NVarChar, C || 'تایبەت')
            .input('D', sql.NVarChar, D || '')
            .input('E', sql.NVarChar, E || '')
            .input('F', sql.NVarChar, F || '*')
            .input('G', sql.NVarChar, G || '')
            .input('H', sql.NVarChar, H || '')
            .input('I', sql.NVarChar, I || '')
            .input('J', sql.NVarChar, J || '')
            .input('K', sql.NVarChar, K || '')
            .input('L', sql.NVarChar, L || '')
            .input('M', sql.NVarChar, M || '')
            .input('N', sql.NVarChar, N != null ? String(N) : '0')
            .input('O', sql.NVarChar, O != null ? String(O) : '0')
            .input('P', sql.NVarChar, P != null ? String(P) : '0')
            .input('Q', sql.NVarChar, Q != null ? String(Q) : '0')
            .input('R', sql.NVarChar, (R || '').trim().toUpperCase())
            .input('S', sql.NVarChar, S || '*')
            .input('T', sql.NVarChar, T || '0')
            .input('U', sql.NVarChar, U || '')
            .input('V', sql.NVarChar, V || '')
            .input('W', sql.NVarChar, W || '*')
            .input('X', sql.NVarChar, X || '')
            .input('Y', sql.NVarChar, Y != null ? String(Y) : '0')
            .input('Z', sql.NVarChar, Z || '')
            .input('AA', sql.NVarChar, AA || '*')
            .input('BB', sql.NVarChar, BB || '')
            .input('CC', sql.NVarChar, CC != null ? String(CC) : '0')
            .input('II', sql.NVarChar, II != null ? String(II) : '25000')
            .input('JJ', sql.NVarChar, JJ != null ? String(JJ) : '0')
            .input('GG', sql.NVarChar, GG || '')
            .query(`UPDATE T1 SET
                        A=@A, B=@B, C=@C, D=@D, E=@E, F=@F, G=@G, H=@H, I=@I, J=@J,
                        K=@K, L=@L, M=@M, N=@N, O=@O, P=@P, Q=@Q, R=@R, S=@S, T=@T,
                        U=@U, V=@V, W=@W, X=@X, Y=@Y, Z=@Z, AA=@AA, BB=@BB, CC=@CC,
                        II=@II, JJ=@JJ, GG=@GG
                    WHERE id = @id`);

        res.json({ success: true, message: 'زانیاری ئوتومبێل بە سەرکەوتوویی نوێکرایەوە' });
    } catch (err) {
        console.error('Update vehicle error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── DUPLICATES & ERRORS ─────────────────────────────────────────────
app.get('/api/duplicates', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [dupChassis, dupPlates] = await Promise.all([
            pool.request().query(`
                SELECT TOP 50 R as chassis, COUNT(*) as cnt, MAX(I) as model, MAX(L) as color, MAX(G) as owner
                FROM T1 
                WHERE R IS NOT NULL AND R NOT IN ('', '*', '-', '.') 
                GROUP BY R 
                HAVING COUNT(*) > 1 
                ORDER BY cnt DESC
            `),
            pool.request().query(`
                SELECT TOP 50 A as plate, B as province, COUNT(*) as cnt, MAX(I) as model, MAX(G) as owner
                FROM T1 
                WHERE A IS NOT NULL AND A NOT IN ('', '*', '-', '.') 
                GROUP BY A, B 
                HAVING COUNT(*) > 1 
                ORDER BY cnt DESC
            `)
        ]);
        res.json({
            chassisDuplicates: dupChassis.recordset,
            plateDuplicates: dupPlates.recordset
        });
    } catch (err) {
        console.error('Duplicates error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── PERSONAL USER RECORDS ───────────────────────────────────────────
app.get('/api/personal-records', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const user = req.session.user.name || req.session.user.username;
        const uid = req.session.user.username;
        const result = await pool.request()
            .input('u1', sql.NVarChar, user)
            .input('u2', sql.NVarChar, uid)
            .query(`
                SELECT TOP 100 id, A as plateNo, B as province, C as type, I as model, L as color, R as chassis, G as owner, DD as date
                FROM T1 
                WHERE FF = @u1 OR FF = @u2
                ORDER BY DD DESC
            `);
        const stats = await pool.request()
            .input('u1', sql.NVarChar, user)
            .input('u2', sql.NVarChar, uid)
            .query(`
                SELECT 
                    COUNT(*) as totalEntered,
                    SUM(CASE WHEN CAST(DD as date) = CAST(GETDATE() as date) THEN 1 ELSE 0 END) as todayEntered
                FROM T1 
                WHERE FF = @u1 OR FF = @u2
            `);
        res.json({
            records: result.recordset,
            stats: stats.recordset[0] || { totalEntered: 0, todayEntered: 0 }
        });
    } catch (err) {
        console.error('Personal records error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── STAFF & PLACES ──────────────────────────────────────────────────
app.get('/api/staff-list', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const [users, places] = await Promise.all([
            pool.request().query(`SELECT id, User_id, User_Name, Place_, Permission, AA FROM Tbl_User ORDER BY User_id`),
            pool.request().query(`SELECT DISTINCT Place_ FROM Tbl_User WHERE Place_ IS NOT NULL AND Place_ NOT IN ('*', '') ORDER BY Place_`)
        ]);
        res.json({
            users: users.recordset,
            places: places.recordset.map(x => x.Place_)
        });
    } catch (err) {
        console.error('Staff error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── ADVANCED SEARCH ─────────────────────────────────────────────────
app.get('/api/advanced-search', requireAuth, async (req, res) => {
    try {
        const { plate, chassis, model, color, fuel, cylinders, year, province, type, owner } = req.query;
        const pool = await getPool();
        const request = pool.request();
        let conditions = [];

        if (plate) { conditions.push('A LIKE @plate'); request.input('plate', sql.NVarChar, `%${plate.trim()}%`); }
        if (chassis) { conditions.push('R LIKE @chassis'); request.input('chassis', sql.NVarChar, `%${chassis.trim()}%`); }
        if (model) { conditions.push('I LIKE @model'); request.input('model', sql.NVarChar, `%${model.trim()}%`); }
        if (color) { conditions.push('L LIKE @color'); request.input('color', sql.NVarChar, `%${color.trim()}%`); }
        if (fuel) { conditions.push('K LIKE @fuel'); request.input('fuel', sql.NVarChar, `%${fuel.trim()}%`); }
        if (cylinders) { conditions.push('O = @cylinders'); request.input('cylinders', sql.NVarChar, cylinders.trim()); }
        if (year) { conditions.push('P = @year'); request.input('year', sql.NVarChar, year.trim()); }
        if (province) { conditions.push('B LIKE @province'); request.input('province', sql.NVarChar, `%${province.trim()}%`); }
        if (type) { conditions.push('C LIKE @type'); request.input('type', sql.NVarChar, `%${type.trim()}%`); }
        if (owner) { conditions.push('G LIKE @owner'); request.input('owner', sql.NVarChar, `%${owner.trim()}%`); }

        let query = `SELECT TOP 100 id, A as plateNo, B as province, C as type, D as office, E as barad, G as owner,
                            I as model, J as category, K as fuel, L as color, M as gear, N as doors, O as cylinders,
                            P as year, Q as seats, R as chassis, T as mobile, FF as enteredBy, GG as checker, DD as date
                     FROM T1 `;
        if (conditions.length > 0) {
            query += 'WHERE ' + conditions.join(' AND ') + ' ';
        }
        query += 'ORDER BY DD DESC';

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Advanced search error:', err);
        res.status(500).json({ error: err.message });
    }
});



// ─── START SERVER ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ TrafficCheck Server running on http://localhost:${PORT}`);
});
