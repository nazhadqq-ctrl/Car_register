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
            name: user.User_id, // User_id is the person's name in Tbl_User; User_Name is phone number
            phone: user.User_Name || '',
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

// ─── GET TABLO / PLATES LIST (parz) ──────────────────────────────────
app.get('/api/tablo', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT LTRIM(RTRIM(par)) as par 
            FROM parz 
            WHERE par IS NOT NULL AND LEN(LTRIM(RTRIM(par))) > 0 
            ORDER BY par
        `);
        res.json(result.recordset.map(r => r.par));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET PROVINCES LIST ──────────────────────────────────────────────
app.get('/api/provinces', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT LTRIM(RTRIM(par)) as par 
            FROM parz 
            WHERE par IS NOT NULL AND LEN(LTRIM(RTRIM(par))) > 0 
            ORDER BY par
        `);
        res.json(result.recordset.map(r => r.par));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET BASH / DEPARTMENTS LIST ─────────────────────────────────────
app.get('/api/bash', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT LTRIM(RTRIM(C)) as bash 
            FROM T1 
            WHERE C IS NOT NULL AND LEN(LTRIM(RTRIM(C))) > 0 
            ORDER BY bash
        `);
        const dbItems = result.recordset.map(r => r.bash);
        const defaults = ['تایبەت', 'بار', 'کرێ', 'بیناسازی', 'ماتۆڕ', 'میری', 'کشتوکاڵی', 'ناوخۆ', 'هاتووچۆ', 'جۆری تر', 'باص', 'پاص', 'انشائی', 'تراکتۆر'];
        const all = Array.from(new Set([...defaults, ...dbItems]));
        res.json(all);
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
        const currentUser = req.session.user || {};
        const isManager = Boolean(
            currentUser.permission === 'MANAGER' || 
            currentUser.place === '*' || 
            currentUser.username === '9' ||
            String(currentUser.permission || '').toUpperCase() === 'ADMIN'
        );

        // Optional query param: ?scope=all or ?scope=user (manager can switch views)
        const requestedScope = req.query.scope; // 'all' or 'user'
        const shouldFilterByUser = (!isManager) || (isManager && requestedScope === 'user');

        let totalQuery, todayQuery, byTypeQuery;
        const request = pool.request();

        if (shouldFilterByUser) {
            const userName = currentUser.name || currentUser.username || '';
            const userPlace = currentUser.place || '';
            request.input('userName', sql.NVarChar, userName);
            request.input('userPlace', sql.NVarChar, userPlace);

            // Filter in T1: GG is the employee/checker, FF is the station/user
            const userCondition = `(GG = @userName OR FF = @userName OR (FF = @userPlace AND @userPlace != '*' AND @userPlace != ''))`;

            totalQuery = `SELECT COUNT(*) as cnt FROM T1 WHERE ${userCondition}`;
            todayQuery = `SELECT COUNT(*) as cnt FROM T1 WHERE CAST(DD as date) = CAST(GETDATE() as date) AND ${userCondition}`;
            byTypeQuery = `SELECT C as type_, COUNT(*) as cnt FROM T1 WHERE C IS NOT NULL AND ${userCondition} GROUP BY C ORDER BY cnt DESC`;
        } else {
            // Full manager view (all cars across the whole system)
            totalQuery = `SELECT COUNT(*) as cnt FROM T1`;
            todayQuery = `SELECT COUNT(*) as cnt FROM T1 WHERE CAST(DD as date) = CAST(GETDATE() as date)`;
            byTypeQuery = `SELECT C as type_, COUNT(*) as cnt FROM T1 WHERE C IS NOT NULL GROUP BY C ORDER BY cnt DESC`;
        }

        const [total, today, byType] = await Promise.all([
            request.query(totalQuery),
            request.query(todayQuery),
            request.query(byTypeQuery)
        ]);

        res.json({
            total: total.recordset[0].cnt,
            today: today.recordset[0].cnt,
            byType: byType.recordset,
            isManager: Boolean(isManager),
            scope: shouldFilterByUser ? 'user' : 'all',
            scopedName: shouldFilterByUser ? (currentUser.name || currentUser.username) : 'سەرجەم بەشەکان (گشتی)',
            currentUser: {
                username: currentUser.username,
                name: currentUser.name,
                place: currentUser.place,
                permission: currentUser.permission
            }
        });
    } catch (err) {
        console.error('Stats error:', err);
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
app.get('/api/gomrg/next-id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`SELECT ISNULL(MAX(IDD), 530000) + 1 AS nextIDD FROM Gomrg`);
        const nextIDD = r.recordset[0]?.nextIDD || 531577;
        
        const placesResult = await pool.request().query(`
            SELECT DISTINCT place FROM Gomrg 
            WHERE place IS NOT NULL AND place != '' AND place != '*' 
            ORDER BY place
        `);
        const places = placesResult.recordset.map(x => x.place);

        res.json({ success: true, nextIDD, places });
    } catch (err) {
        console.error('Next IDD error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/gomrg/search-va', requireAuth, async (req, res) => {
    try {
        const { car_n, plet, bash } = req.query;
        if (!car_n || !car_n.trim()) {
            return res.status(400).json({ success: false, message: 'تکایە ژمارەی ئۆتۆمبێل بنووسە' });
        }
        if (!plet || !plet.trim()) {
            return res.status(400).json({ success: false, message: 'تکایە تابلۆ (پارێزگا) دیاری بکە' });
        }
        if (!bash || !bash.trim()) {
            return res.status(400).json({ success: false, message: 'تکایە بەشی ئۆتۆمبێل دیاری بکە' });
        }

        const pool = await getPool();
        const cleanCarN = car_n.trim();
        const cleanPlet = plet.trim();
        const cleanBash = bash.trim();

        // ONLY Search in Taqega.dbo.VA (Database Taqega) by car_n + plet + bash
        const vaQuery = `
            SELECT TOP 1 * FROM [Taqega].[dbo].[VA]
            WHERE (
                REPLACE(auto_no, ' ', '') = REPLACE(@car_n, ' ', '') 
                OR auto_no = @car_n
                OR shassy = @car_n
            )
            AND (
                plet = @plet
                OR REPLACE(REPLACE(plet, N'ى', N'ی'), N'ك', N'ک') = REPLACE(REPLACE(@plet, N'ى', N'ی'), N'ك', N'ک')
                OR plet LIKE @pletLike
                OR REPLACE(plet, N'ى', N'ی') LIKE @pletLikeClean
            )
            AND (
                bash = @bash
                OR REPLACE(REPLACE(bash, N'ى', N'ی'), N'ك', N'ک') = REPLACE(REPLACE(@bash, N'ى', N'ی'), N'ك', N'ک')
                OR bash LIKE @bashLike
            )
            ORDER BY id DESC
        `;

        const reqVA = pool.request()
            .input('car_n', sql.NVarChar, cleanCarN)
            .input('plet', sql.NVarChar, cleanPlet)
            .input('pletLike', sql.NVarChar, `%${cleanPlet}%`)
            .input('pletLikeClean', sql.NVarChar, `%${cleanPlet.replace(/ى/g, 'ی')}%`)
            .input('bash', sql.NVarChar, cleanBash)
            .input('bashLike', sql.NVarChar, `%${cleanBash}%`);

        const result = await reqVA.query(vaQuery);

        if (result.recordset && result.recordset.length > 0) {
            const row = result.recordset[0];
            return res.json({
                success: true,
                source: 'VA',
                data: {
                    car_n: row.auto_no || cleanCarN,
                    bash: row.bash || cleanBash,
                    parezga: row.plet || cleanPlet,
                    car_type: row.car_type || '',
                    model: row.Model || row.model || '',
                    color: row.color || '',
                    shassy: (row.shassy && row.shassy.trim() !== '') ? row.shassy.trim() : '*',
                    Full_name: row.Name_ || '',
                    place: (row.CC || '').replace(/^تاقیگەی\s*/, '').replace(/^تاقیگەى\s*/, '').trim() || ''
                }
            });
        }

        return res.json({ 
            success: false, 
            message: `هیچ داتایەک نەدۆزرایەوە بۆ ژمارەی (${cleanCarN}) - تابلۆی (${cleanPlet}) - بەشی (${cleanBash}) لە خشتەی تاقیگە (VA)` 
        });
    } catch (err) {
        console.error('Search VA error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/gomrg', requireAuth, async (req, res) => {
    try {
        const { q } = req.query;
        const pool = await getPool();
        let query = `SELECT TOP 100 id, IDD, car_n, shassy, Full_name, car_type, model, resoon, date_insert, user_, place, parezga, bash, qamara, AA, A_shassy, BB, CC, DD FROM Gomrg `;
        if (q && q.trim()) {
            query += `WHERE shassy LIKE @term OR car_n LIKE @term OR Full_name LIKE @term OR resoon LIKE @term OR CAST(IDD AS NVARCHAR) LIKE @term `;
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
        const {
            IDD,
            place,
            date_insert,
            car_n,
            parezga,
            bash,
            car_type,
            model,
            AA,
            shassy,
            qamara,
            Full_name,
            A_shassy,
            BB,
            CC,
            DD,
            resoon
        } = req.body;

        const pool = await getPool();
        let user = (req.session.user && (req.session.user.username || req.session.user.name)) || 'بەهرە قادر سعید';
        if (/^[0-9\+\-\s]{5,}$/.test(user) && req.session.user && req.session.user.username && !/^[0-9\+\-\s]{5,}$/.test(req.session.user.username)) {
            user = req.session.user.username;
        }

        let targetIDD = parseInt(IDD, 10);
        if (isNaN(targetIDD) || targetIDD <= 0) {
            const maxR = await pool.request().query(`SELECT ISNULL(MAX(IDD), 530000) + 1 AS nextIDD FROM Gomrg`);
            targetIDD = maxR.recordset[0]?.nextIDD || 531577;
        }

        const insertDate = date_insert ? new Date(date_insert) : new Date();

        await pool.request()
            .input('IDD', sql.Int, targetIDD)
            .input('place', sql.NVarChar, (place || '').trim())
            .input('car_n', sql.NVarChar, (car_n || '').trim())
            .input('bash', sql.NVarChar, (bash || '').trim())
            .input('parezga', sql.NVarChar, (parezga || '').trim())
            .input('car_type', sql.NVarChar, (car_type || '').trim())
            .input('model', sql.NVarChar, (model || '').trim())
            .input('shassy', sql.NVarChar, (shassy || '*').trim())
            .input('qamara', sql.NVarChar, (qamara || '*').trim())
            .input('A_shassy', sql.NVarChar, (A_shassy || '*').trim())
            .input('Full_name', sql.NVarChar, (Full_name || '').trim())
            .input('resoon', sql.NVarChar, (resoon || '').trim())
            .input('date_insert', sql.Date, insertDate)
            .input('user_', sql.NVarChar, user)
            .input('AA', sql.NVarChar, (AA || '').trim())
            .input('BB', sql.NVarChar, (BB || '').trim())
            .input('CC', sql.NVarChar, (CC || '*').trim())
            .input('DD', sql.NVarChar, (DD || '').trim())
            .query(`INSERT INTO Gomrg (IDD, place, car_n, bash, parezga, car_type, model, shassy, qamara, A_shassy, Full_name, resoon, date_insert, user_, AA, BB, CC, DD)
                    VALUES (@IDD, @place, @car_n, @bash, @parezga, @car_type, @model, @shassy, @qamara, @A_shassy, @Full_name, @resoon, @date_insert, @user_, @AA, @BB, @CC, @DD)`);

        res.json({
            success: true,
            message: 'زانیارییەکان بە سەرکەوتوویی لە خشتەی گومرگ (Gomrg) تۆمار کران',
            savedIDD: targetIDD,
            nextIDD: targetIDD + 1
        });
    } catch (err) {
        console.error('Add Gomrg error:', err);
        res.status(500).json({ success: false, error: err.message });
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

// ─── UNIQUE BARCODE GENERATOR (STRICT <= 10 CHARS & NO COLLISION) ─────
async function generateUniqueBarcode(pool) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let attempts = 0;
    while (attempts < 60) {
        attempts++;
        let randomStr = '';
        for (let i = 0; i < 8; i++) {
            randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const candidate = 'TC' + randomStr; // Exactly 10 characters!
        const check = await pool.request()
            .input('bc', sql.NVarChar, candidate)
            .query(`SELECT TOP 1 id FROM T1 WHERE KK = @bc`);
        if (check.recordset.length === 0) {
            return candidate;
        }
    }
    const digits = String(Date.now()).slice(-8);
    return 'TC' + digits;
}

// ─── GET FRESH UNIQUE BARCODE ENDPOINT ────────────────────────────────
app.get('/api/barcode/generate', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const barcode = await generateUniqueBarcode(pool);
        res.json({ barcode });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PRINT RECORD QUERY (STRICT: PLATE + BASH + TABLO + TODAY'S DATE) ─
app.get('/api/register/print-record', requireAuth, async (req, res) => {
    try {
        const { plate, tablo, bash } = req.query;
        if (!plate || !tablo || !bash) {
            return res.status(400).json({ error: 'ژمارەی ئۆتۆمبێل، تابلۆ و بەش داواکراوە' });
        }
        const pool = await getPool();
        const cleanPlate = plate.trim();
        const cleanTablo = tablo.trim();
        const cleanBash = bash.trim();
        const normTablo = cleanTablo.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
        const normBash = cleanBash.replace(/ى/g, 'ی').replace(/ك/g, 'ک');

        // STRICT TODAY'S DATE FILTER: ( ژمارەی ئوتومبێل + بەش + تابلۆ یان پارێزگا + بەرواری ئەمڕۆ )
        const query = `
            SELECT TOP 1 * FROM T1 
            WHERE (A = @plate OR REPLACE(A, ' ', '') = @plate)
              AND (B = @tablo OR REPLACE(B, N'ى', N'ی') = @normTablo)
              AND (C = @bash OR REPLACE(C, N'ى', N'ی') = @normBash)
              AND CAST(DD as date) = CAST(GETDATE() as date)
            ORDER BY id DESC
        `;
        const result = await pool.request()
            .input('plate', sql.NVarChar, cleanPlate)
            .input('tablo', sql.NVarChar, cleanTablo)
            .input('normTablo', sql.NVarChar, normTablo)
            .input('bash', sql.NVarChar, cleanBash)
            .input('normBash', sql.NVarChar, normBash)
            .query(query);

        if (result.recordset.length === 0) {
            return res.status(404).json({ 
                error: 'ئەم ئوتومبێلە بەرواری ئەمڕۆی خەزن نەکراوە لە سیستەمدا! ناتوانرێت فۆڕمی بەتاڵ، تۆمارنەکراو یاخود ڕۆژانی تر چاپ بکرێت.' 
            });
        }

        res.json(result.recordset[0]);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── ADMIN DELETE VEHICLE (T1) ───────────────────────────────────────
app.delete('/api/register/:id', requireAuth, async (req, res) => {
    try {
        const user = req.session.user;
        const perm = (user.permission || '').toUpperCase();
        if (perm !== 'ADMIN' && perm !== 'MANAGER' && user.username !== '9') {
            return res.status(403).json({ success: false, message: 'تەنها ئەدمین بۆی هەیە تۆمارەکان بسڕێتەوە!' });
        }

        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`DELETE FROM T1 WHERE id = @id`);

        res.json({ success: true, message: `تۆمارەکە لە لایەن ئەدمینەوە بە سەرکەوتوویی سڕایەوە (ID: ${req.params.id})` });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── FIND VEHICLE FOR REGISTRATION FORM (TAQEGA & T1) ────────────────
app.get('/api/register/find', requireAuth, async (req, res) => {
    try {
        const { plate, tablo, bash, chassis, barcode } = req.query;
        if (!plate && !chassis && !barcode) return res.json(null);

        const pool = await getPool();
        const cleanPlate = (plate || '').trim();
        const cleanTablo = (tablo || '').trim();
        const cleanBash = (bash || '').trim();
        const cleanChassis = (chassis || '').trim().toUpperCase();
        const cleanBarcode = (barcode || '').trim().toUpperCase();

        // ─── 0. MANDATORY EARLY HIJZ PRE-CHECK (CHECK BEFORE VA & T1 TO MINIMIZE SERVER LOAD) ───
        // Check Condition 1: By (Plate + Tablo/Province + Bash)
        // Check Condition 2: By Chassis (Reg_Name = chassis)
        if ((cleanPlate && cleanTablo && cleanBash) || cleanChassis) {
            let hijzQuery = `SELECT TOP 1 idd, Auto_No, Place_, Car_Plet, Date_Releasing, Reg_Name, car_Note, UUser, B FROM Hijz WHERE 1=0 `;
            const hijzReq = pool.request();

            if (cleanPlate && cleanTablo && cleanBash) {
                hijzReq.input('hPlate', sql.NVarChar, cleanPlate);
                hijzReq.input('hTablo', sql.NVarChar, cleanTablo);
                const normTablo = cleanTablo.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
                hijzReq.input('normTablo', sql.NVarChar, normTablo);

                hijzReq.input('hBash', sql.NVarChar, cleanBash);
                const normBash = cleanBash.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
                hijzReq.input('normBash', sql.NVarChar, normBash);

                hijzQuery += ` OR (
                    (Auto_No = @hPlate OR REPLACE(Auto_No, ' ', '') = @hPlate)
                    AND (Place_ = @hTablo OR REPLACE(Place_, N'ى', N'ی') = @normTablo)
                    AND (Car_Plet = @hBash OR REPLACE(Car_Plet, N'ى', N'ی') = @normBash)
                )`;
            }

            if (cleanChassis) {
                hijzReq.input('hChassis', sql.NVarChar, cleanChassis);
                hijzQuery += ` OR (Reg_Name = @hChassis OR REPLACE(Reg_Name, ' ', '') = @hChassis)`;
            }

            hijzQuery += ` ORDER BY idd DESC`;

            const hijzRes = await hijzReq.query(hijzQuery);
            if (hijzRes.recordset.length > 0) {
                const h = hijzRes.recordset[0];
                return res.json({
                    isHijz: true,
                    message: 'ئەم ئوتومبێلە کاری بۆ ناکرێت لەبەر ئەوەی نیشانەی گلدانەوەی لەسەرە و پەیوەندی بکەن بە سەرپەرشتیاری هۆبەی پشکنین',
                    hijz: {
                        idd: h.idd,
                        plate: h.Auto_No,
                        tablo: h.Place_,
                        bash: h.Car_Plet,
                        chassis: h.Reg_Name,
                        date: h.Date_Releasing,
                        note: h.car_Note,
                        officer: h.B,
                        user: h.UUser
                    }
                });
            }
        }

        // ─── 0.5 CHECK IF ALREADY REGISTERED IN T1 (FOR PLATE/CHASSIS SEARCH) ───
        if (!cleanBarcode && (cleanPlate || cleanChassis)) {
            const reqT1Check = pool.request();
            let t1CheckQuery = `SELECT TOP 1 id, A, B, C, R, DD, EE, FF, KK FROM T1 WHERE 1=0 `;
            
            if (cleanPlate && cleanTablo && cleanBash) {
                reqT1Check.input('cpPlate', sql.NVarChar, cleanPlate);
                reqT1Check.input('cpTablo', sql.NVarChar, cleanTablo);
                const normTablo = cleanTablo.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
                reqT1Check.input('normCpTablo', sql.NVarChar, normTablo);

                reqT1Check.input('cpBash', sql.NVarChar, cleanBash);
                const normBash = cleanBash.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
                reqT1Check.input('normCpBash', sql.NVarChar, normBash);

                t1CheckQuery += ` OR (
                    (A = @cpPlate OR REPLACE(A, ' ', '') = @cpPlate)
                    AND (B = @cpTablo OR REPLACE(B, N'ى', N'ی') = @normCpTablo)
                    AND (C = @cpBash OR REPLACE(C, N'ى', N'ی') = @normCpBash)
                )`;
            } else if (cleanPlate && !cleanTablo && !cleanBash) {
                reqT1Check.input('cpPlateOnly', sql.NVarChar, cleanPlate);
                t1CheckQuery += ` OR (A = @cpPlateOnly OR REPLACE(A, ' ', '') = @cpPlateOnly)`;
            }

            if (cleanChassis && cleanChassis !== '*') {
                reqT1Check.input('cpChassis', sql.NVarChar, cleanChassis);
                t1CheckQuery += ` OR (R = @cpChassis OR REPLACE(R, ' ', '') = @cpChassis)`;
            }

            t1CheckQuery += ` ORDER BY id DESC`;

            const t1CheckRes = await reqT1Check.query(t1CheckQuery);
            if (t1CheckRes.recordset.length > 0) {
                const existing = t1CheckRes.recordset[0];
                const regDate = existing.DD ? new Date(existing.DD).toISOString().slice(0, 10) : (existing.EE ? new Date(existing.EE).toISOString().slice(0, 10) : 'نەزانراو');
                return res.json({
                    alreadyRegistered: true,
                    date: regDate,
                    id: existing.id,
                    plate: existing.A,
                    tablo: existing.B,
                    bash: existing.C,
                    chassis: existing.R,
                    user: existing.FF
                });
            }
        }

        // 1. SEARCH BY BARCODE (FOR BARCODE READERS & SCANNERS)
        if (cleanBarcode) {
            const bRes = await pool.request()
                .input('bc', sql.NVarChar, cleanBarcode)
                .query(`SELECT TOP 1 * FROM T1 WHERE KK = @bc OR R = @bc ORDER BY id DESC`);
            if (bRes.recordset.length > 0) {
                const r = bRes.recordset[0];
                
                // Double check if this vehicle/chassis is in Hijz
                const ch = (r.R || '').trim().toUpperCase();
                if (ch) {
                    const hCheck = await pool.request().input('rch', sql.NVarChar, ch).query(`SELECT TOP 1 * FROM Hijz WHERE Reg_Name = @rch`);
                    if (hCheck.recordset.length > 0) {
                        const h = hCheck.recordset[0];
                        return res.json({
                            isHijz: true,
                            message: 'ئەم ئوتومبێلە کاری بۆ ناکرێت لەبەر ئەوەی نیشانەی گلدانەوەی لەسەرە و پەیوەندی بکەن بە سەرپەرشتیاری هۆبەی پشکنین',
                            hijz: {
                                idd: h.idd,
                                plate: h.Auto_No,
                                tablo: h.Place_,
                                bash: h.Car_Plet,
                                chassis: h.Reg_Name,
                                date: h.Date_Releasing,
                                note: h.car_Note,
                                officer: h.B,
                                user: h.UUser
                            }
                        });
                    }
                }

                return res.json({
                    source: 'T1',
                    id: r.id,
                    A: r.A || '',
                    B: r.B || 'سلێمانی',
                    C: r.C || 'تایبەت',
                    D: r.D || '',
                    E: r.E || '',
                    F: r.F || '*',
                    G: (r.G || '').trim(),
                    H: (r.H || '').trim() || 'تۆماری یەکەم جار',
                    I: (r.I || '').trim(),
                    J: (r.J || '').trim() || 'صالون',
                    K: (r.K || '').trim() || 'بەنزین',
                    L: (r.L || '').trim(),
                    M: (r.M || '').trim() || 'ئۆتۆماتیک',
                    N: r.N || 0,
                    O: r.O || 0,
                    P: r.P || 0,
                    Q: r.Q || 0,
                    R: (r.R || '').trim().toUpperCase(),
                    S: r.S || 0,
                    T: (r.T || '').trim() || 0,
                    U: (r.U || '').trim(),
                    V: (r.V || '').trim(),
                    W: r.W || '*',
                    X: r.X || '',
                    Y: r.Y || 0,
                    Z: r.Z || '',
                    AA: r.AA || '*',
                    BB: r.BB || '',
                    CC: r.CC || 0,
                    II: r.II || 0,
                    JJ: r.JJ || 0,
                    DD: r.DD ? new Date(r.DD).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                    KK: r.KK || cleanBarcode,
                    Barcod: r.KK || cleanBarcode,
                    resulat: ''
                });
            }
        }

        // 2. SEARCH BY VEHICLE (PLATE + PROVINCE + BASH) - 100% STRICT EXACT MATCH
        if (cleanPlate) {
            // A. Search in [Taqega].[dbo].[VA]
            const reqVa = pool.request().input('plate', sql.NVarChar, cleanPlate);
            let vaQuery = `
                SELECT TOP 1 * FROM [Taqega].[dbo].[VA]
                WHERE (auto_no = @plate OR REPLACE(auto_no, ' ', '') = @plate)
            `;

            if (cleanTablo) {
                reqVa.input('tablo', sql.NVarChar, cleanTablo);
                const normTablo = cleanTablo.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
                reqVa.input('normTablo', sql.NVarChar, normTablo);
                vaQuery += ` AND (plet = @tablo OR REPLACE(plet, N'ى', N'ی') = @normTablo) `;
            }

            if (cleanBash) {
                reqVa.input('bash', sql.NVarChar, cleanBash);
                const normBash = cleanBash.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
                reqVa.input('normBash', sql.NVarChar, normBash);
                vaQuery += ` AND (bash = @bash OR REPLACE(bash, N'ى', N'ی') = @normBash) `;
            }

            vaQuery += ` ORDER BY id DESC `;
            const vaResult = await reqVa.query(vaQuery);

            if (vaResult.recordset.length > 0) {
                const r = vaResult.recordset[0];
                const foundChassis = (r.shassy || '').trim().toUpperCase();

                // Check if found vehicle's chassis is in Hijz
                if (foundChassis) {
                    const hCheck = await pool.request().input('vch', sql.NVarChar, foundChassis).query(`SELECT TOP 1 * FROM Hijz WHERE Reg_Name = @vch`);
                    if (hCheck.recordset.length > 0) {
                        const h = hCheck.recordset[0];
                        return res.json({
                            isHijz: true,
                            message: 'ئەم ئوتومبێلە کاری بۆ ناکرێت لەبەر ئەوەی نیشانەی گلدانەوەی لەسەرە و پەیوەندی بکەن بە سەرپەرشتیاری هۆبەی پشکنین',
                            hijz: {
                                idd: h.idd,
                                plate: h.Auto_No,
                                tablo: h.Place_,
                                bash: h.Car_Plet,
                                chassis: h.Reg_Name,
                                date: h.Date_Releasing,
                                note: h.car_Note,
                                officer: h.B,
                                user: h.UUser
                            }
                        });
                    }
                }

                return res.json({
                    source: 'Taqega',
                    id: r.id,
                    A: r.auto_no || cleanPlate,
                    B: r.plet ? r.plet.replace(/ى/g, 'ی') : (cleanTablo || 'سلێمانی'),
                    C: r.bash || (cleanBash || 'تایبەت'),
                    D: r.CC || '',
                    E: '',
                    F: '*',
                    G: (r.Name_ || '').trim(),
                    H: 'تۆماری یەکەم جار',
                    I: (r.car_type || '').trim(),
                    J: (r.Car_group || '').trim() || 'صالون',
                    K: (r.Feull || '').trim() || 'بەنزین',
                    L: (r.color || '').trim(),
                    M: (r.Gear || '').trim() === 'عادی' ? 'عادی' : 'ئۆتۆماتیک',
                    N: 4,
                    O: r.celender || 0,
                    P: r.Model || 0,
                    Q: 5,
                    R: foundChassis,
                    S: 0,
                    T: (r.mobile || '').trim() || 0,
                    U: (r.NNote_ || '').trim(),
                    V: '',
                    W: '*',
                    X: '',
                    Y: 0,
                    Z: '',
                    AA: '*',
                    BB: '',
                    CC: 0,
                    II: r.EE || 0,
                    JJ: 0,
                    DD: r.Date_ ? new Date(r.Date_).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                    resulat: r.resulat || '',
                    Psulla: r.Psulla || ''
                });
            }

            // B. Search in [T1] with exact 100% match on (Plate + Province + Bash)
            const reqT1 = pool.request().input('plate', sql.NVarChar, cleanPlate);
            let t1Query = `SELECT TOP 1 * FROM T1 WHERE (A = @plate OR REPLACE(A, ' ', '') = @plate) `;
            if (cleanTablo) {
                reqT1.input('tablo', sql.NVarChar, cleanTablo);
                const normTablo = cleanTablo.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
                reqT1.input('normTablo', sql.NVarChar, normTablo);
                t1Query += ` AND (B = @tablo OR REPLACE(B, N'ى', N'ی') = @normTablo) `;
            }
            if (cleanBash) {
                reqT1.input('bash', sql.NVarChar, cleanBash);
                const normBash = cleanBash.replace(/ى/g, 'ی').replace(/ك/g, 'ک');
                reqT1.input('normBash', sql.NVarChar, normBash);
                t1Query += ` AND (C = @bash OR REPLACE(C, N'ى', N'ی') = @normBash) `;
            }
            t1Query += ` ORDER BY id DESC `;

            const t1Result = await reqT1.query(t1Query);
            if (t1Result.recordset.length > 0) {
                const row = t1Result.recordset[0];
                const foundChassis = (row.R || '').trim().toUpperCase();

                // Check if found vehicle's chassis is in Hijz
                if (foundChassis) {
                    const hCheck = await pool.request().input('t1ch', sql.NVarChar, foundChassis).query(`SELECT TOP 1 * FROM Hijz WHERE Reg_Name = @t1ch`);
                    if (hCheck.recordset.length > 0) {
                        const h = hCheck.recordset[0];
                        return res.json({
                            isHijz: true,
                            message: 'ئەم ئوتومبێلە کاری بۆ ناکرێت لەبەر ئەوەی نیشانەی گلدانەوەی لەسەرە و پەیوەندی بکەن بە سەرپەرشتیاری هۆبەی پشکنین',
                            hijz: {
                                idd: h.idd,
                                plate: h.Auto_No,
                                tablo: h.Place_,
                                bash: h.Car_Plet,
                                chassis: h.Reg_Name,
                                date: h.Date_Releasing,
                                note: h.car_Note,
                                officer: h.B,
                                user: h.UUser
                            }
                        });
                    }
                }

                row.source = 'T1';
                return res.json(row);
            }

            // If plate search does not find 100% exact match on plate+province+bash, return null!
            return res.json(null);
        }

        // 3. SEARCH BY CHASSIS (ONLY WHEN NO PLATE WAS ENTERED)
        if (cleanChassis) {
            const chRes = await pool.request()
                .input('chassis', sql.NVarChar, cleanChassis)
                .query(`SELECT TOP 1 * FROM [Taqega].[dbo].[VA] WHERE shassy = @chassis ORDER BY id DESC`);
            
            if (chRes.recordset.length > 0) {
                const r = chRes.recordset[0];
                return res.json({
                    source: 'Taqega',
                    id: r.id,
                    A: r.auto_no || '',
                    B: r.plet ? r.plet.replace(/ى/g, 'ی') : 'سلێمانی',
                    C: r.bash || 'تایبەت',
                    D: r.CC || '',
                    E: '',
                    F: '*',
                    G: (r.Name_ || '').trim(),
                    H: 'تۆماری یەکەم جار',
                    I: (r.car_type || '').trim(),
                    J: (r.Car_group || '').trim() || 'صالون',
                    K: (r.Feull || '').trim() || 'بەنزین',
                    L: (r.color || '').trim(),
                    M: (r.Gear || '').trim() === 'عادی' ? 'عادی' : 'ئۆتۆماتیک',
                    N: 4,
                    O: r.celender || 0,
                    P: r.Model || 0,
                    Q: 5,
                    R: (r.shassy || '').trim().toUpperCase(),
                    S: 0,
                    T: (r.mobile || '').trim() || 0,
                    U: (r.NNote_ || '').trim(),
                    V: '',
                    W: '*',
                    X: '',
                    Y: 0,
                    Z: '',
                    AA: '*',
                    BB: '',
                    CC: 0,
                    II: r.EE || 0,
                    JJ: 0,
                    DD: r.Date_ ? new Date(r.Date_).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
                    resulat: r.resulat || ''
                });
            }

            const t1Ch = await pool.request()
                .input('chassis', sql.NVarChar, cleanChassis)
                .query(`SELECT TOP 1 * FROM T1 WHERE R = @chassis ORDER BY id DESC`);
            if (t1Ch.recordset.length > 0) {
                const row = t1Ch.recordset[0];
                row.source = 'T1';
                return res.json(row);
            }
        }

        return res.json(null);
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
            V, W, X, Y, Z, AA, BB, CC, II, JJ, GG, DD, KK, Barcode
        } = req.body;

        if (!A && !R) {
            return res.status(400).json({ success: false, message: 'پێویستە لانی کەم ژمارەی تابلۆ یان شاسی دیاری بکرێت' });
        }

        const pool = await getPool();
        const user = req.session.user.name || req.session.user.username;

        // ─── STRICT HIJZ BLOCK ON REGISTRATION ───
        const cleanA = (A || '').trim();
        const cleanB = (B || '').trim();
        const cleanC = (C || '').trim();
        const cleanR = (R || '').trim().toUpperCase();

        if ((cleanA && cleanB && cleanC) || cleanR) {
            let hq = `SELECT TOP 1 idd, Auto_No, Place_, Car_Plet, Reg_Name, car_Note, B FROM Hijz WHERE 1=0 `;
            const hReq = pool.request();
            if (cleanA && cleanB && cleanC) {
                hReq.input('hA', sql.NVarChar, cleanA);
                hReq.input('hB', sql.NVarChar, cleanB);
                hReq.input('normB', sql.NVarChar, cleanB.replace(/ى/g, 'ی').replace(/ك/g, 'ک'));
                hReq.input('hC', sql.NVarChar, cleanC);
                hReq.input('normC', sql.NVarChar, cleanC.replace(/ى/g, 'ی').replace(/ك/g, 'ک'));
                hq += ` OR ((Auto_No = @hA OR REPLACE(Auto_No, ' ', '') = @hA) AND (Place_ = @hB OR REPLACE(Place_, N'ى', N'ی') = @normB) AND (Car_Plet = @hC OR REPLACE(Car_Plet, N'ى', N'ی') = @normC))`;
            }
            if (cleanR) {
                hReq.input('hR', sql.NVarChar, cleanR);
                hq += ` OR (Reg_Name = @hR OR REPLACE(Reg_Name, ' ', '') = @hR)`;
            }
            const hRes = await hReq.query(hq);
            if (hRes.recordset.length > 0) {
                return res.status(403).json({
                    success: false,
                    isHijz: true,
                    message: 'ئەم ئوتومبێلە کاری بۆ ناکرێت لەبەر ئەوەی نیشانەی گلدانەوەی لەسەرە و پەیوەندی بکەن بە سەرپەرشتیاری هۆبەی پشکنین'
                });
            }
        }

        // ─── STRICT DUPLICATE PREVENTION: (A + B + C) CAN ONLY BE ENTERED ONCE ───
        if (cleanA && cleanB && cleanC) {
            const dupCheck = await pool.request()
                .input('dA', sql.NVarChar, cleanA)
                .input('dB', sql.NVarChar, cleanB)
                .input('normB', sql.NVarChar, cleanB.replace(/ى/g, 'ی').replace(/ك/g, 'ک'))
                .input('dC', sql.NVarChar, cleanC)
                .input('normC', sql.NVarChar, cleanC.replace(/ى/g, 'ی').replace(/ك/g, 'ک'))
                .query(`
                    SELECT TOP 1 id, A, B, C, R, DD, FF FROM T1 
                    WHERE (A = @dA OR REPLACE(A, ' ', '') = @dA)
                      AND (B = @dB OR REPLACE(B, N'ى', N'ی') = @normB)
                      AND (C = @dC OR REPLACE(C, N'ى', N'ی') = @normC)
                    ORDER BY id DESC
                `);
            
            if (dupCheck.recordset.length > 0) {
                const existing = dupCheck.recordset[0];
                const dateStr = existing.DD ? new Date(existing.DD).toISOString().slice(0, 10) : '';
                return res.status(409).json({
                    success: false,
                    isDuplicate: true,
                    message: `⚠️ ئەم ئوتومبێلە پێشتر تۆمارکراوە بەم زانیارییانە (ژمارە: ${existing.A} - تابلۆ: ${existing.B} - بەش: ${existing.C}) لە بەرواری (${dateStr}) لە لایەن (${existing.FF || '-'}). هەموو ڕیکۆردێک تەنها یەکجار داخل دەکرێت و دووبارە قبوڵ ناکرێتەوە! لە کاتی پێویست دەبێت ئەدمین بیسڕێتەوە.`
                });
            }
        }

        // Validate that B belongs to parz table
        if (B && B.trim()) {
            const parzCheck = await pool.request()
                .input('pName', sql.NVarChar, B.trim())
                .query(`SELECT TOP 1 par FROM parz WHERE LTRIM(RTRIM(par)) = @pName`);
            if (parzCheck.recordset.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: `تابلۆی دیاریکراو (${B}) لە لیستی فەرمی (parz) نییە و ڕێگەپێدراو نییە.` 
                });
            }
        }

        // ─── UNIQUE BARCODE <= 10 CHARACTERS GUARANTEE ───
        let finalBarcode = (KK || Barcode || '').trim().toUpperCase();
        if (!finalBarcode || finalBarcode.length > 10 || finalBarcode === 'TC00000000') {
            finalBarcode = await generateUniqueBarcode(pool);
        } else {
            const bcCheck = await pool.request().input('bc', sql.NVarChar, finalBarcode).query(`SELECT TOP 1 id FROM T1 WHERE KK = @bc`);
            if (bcCheck.recordset.length > 0) {
                finalBarcode = await generateUniqueBarcode(pool);
            }
        }

        const insertRes = await pool.request()
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
            .input('R', sql.NVarChar, (R || '').trim().toUpperCase().slice(0, 17))
            .input('S', sql.NVarChar, (S || '*').trim().toUpperCase().slice(0, 17))
            .input('T', sql.NVarChar, (T || '0').trim().replace(/[^0-9]/g, '').slice(0, 11))
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
            .input('KK', sql.NVarChar, finalBarcode)
            .query(`INSERT INTO T1 (A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, BB, CC, II, JJ, FF, GG, DD, EE, KK)
                    VALUES (@A, @B, @C, @D, @E, @F, @G, @H, @I, @J, @K, @L, @M, @N, @O, @P, @Q, @R, @S, @T, @U, @V, @W, @X, @Y, @Z, @AA, @BB, @CC, @II, @JJ, @FF, @GG, @DD, GETDATE(), @KK);
                    SELECT SCOPE_IDENTITY() AS newId;

                    INSERT INTO T1_backup (A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, AA, BB, CC, II, JJ, FF, GG, DD, EE, KK)
                    VALUES (@A, @B, @C, @D, @E, @F, @G, @H, @I, @J, @K, @L, @M, @N, @O, @P, @Q, @R, @S, @T, @U, @V, @W, @X, @Y, @Z, @AA, @BB, @CC, @II, @JJ, @FF, @GG, @DD, GETDATE(), @KK);`);

        const newId = insertRes.recordset[0]?.newId;
        res.json({ success: true, message: 'ئوتومبێل بە سەرکەوتوویی تۆمارکرا', id: newId, barcode: finalBarcode });
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
            V, W, X, Y, Z, AA, BB, CC, II, JJ, GG, DD, KK, Barcode
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
            .input('R', sql.NVarChar, (R || '').trim().toUpperCase().slice(0, 17))
            .input('S', sql.NVarChar, (S || '*').trim().toUpperCase().slice(0, 17))
            .input('T', sql.NVarChar, (T || '0').trim().replace(/[^0-9]/g, '').slice(0, 11))
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
            .input('KK', sql.NVarChar, KK || Barcode || '')
            .query(`UPDATE T1 SET
                        A=@A, B=@B, C=@C, D=@D, E=@E, F=@F, G=@G, H=@H, I=@I, J=@J,
                        K=@K, L=@L, M=@M, N=@N, O=@O, P=@P, Q=@Q, R=@R, S=@S, T=@T,
                        U=@U, V=@V, W=@W, X=@X, Y=@Y, Z=@Z, AA=@AA, BB=@BB, CC=@CC,
                        II=@II, JJ=@JJ, GG=@GG, KK=@KK
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



// ─── SYSTEM AUTO-UPDATER & VERSION API ──────────────────────────────
app.get('/api/system/version', (req, res) => {
    try {
        const updater = require('./auto-updater');
        res.json(updater.getLocalVersion());
    } catch (e) {
        res.json({ version: '1.2.0', build: 120 });
    }
});

app.post('/api/system/check-update', async (req, res) => {
    try {
        const isForce = req.body && !!req.body.force;
        const updater = require('./auto-updater');
        const result = await updater.checkForUpdates(isForce);
        
        res.json(result);

        if (result.success && result.hasUpdate) {
            console.log('✅ Update applied successfully. Relaunching server process...');
            setTimeout(() => {
                try {
                    const { spawn } = require('child_process');
                    const child = spawn('cmd.exe', ['/c', 'start', '""', process.execPath, path.join(__dirname, 'server.js')], {
                        detached: true,
                        stdio: 'ignore',
                        cwd: __dirname
                    });
                    child.unref();
                } catch (spawnErr) {
                    console.error('Auto-restart spawn error:', spawnErr);
                }
                process.exit(0);
            }, 1800);
        }
    } catch (err) {
        console.error('Check update error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── START SERVER ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ TrafficCheck Server running on http://localhost:${PORT}`);
});

