const express = require('express');
const session = require('express-session');
const path = require('path');
const { getPool, sql } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

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

// ─── GET ALL PLACES (from Tbl_User, Gomrg, RAP, T1) ─────────────────
app.get('/api/places', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT LTRIM(RTRIM(Place_)) AS place FROM Tbl_User WHERE Place_ IS NOT NULL AND LEN(LTRIM(RTRIM(Place_))) > 0 AND Place_ != '*'
            UNION
            SELECT DISTINCT LTRIM(RTRIM(P)) AS place FROM RAP WHERE P IS NOT NULL AND LEN(LTRIM(RTRIM(P))) > 0 AND P != '*' AND P != '0'
            UNION
            SELECT DISTINCT LTRIM(RTRIM(Q)) AS place FROM RAP WHERE Q IS NOT NULL AND LEN(LTRIM(RTRIM(Q))) > 0 AND Q != '*' AND Q != '0'
            UNION
            SELECT DISTINCT LTRIM(RTRIM(p)) AS place FROM Hijz WHERE p IS NOT NULL AND LEN(LTRIM(RTRIM(p))) > 0 AND p != '*' AND p != '0'
            UNION
            SELECT DISTINCT LTRIM(RTRIM(place)) AS place FROM Gomrg WHERE place IS NOT NULL AND LEN(LTRIM(RTRIM(place))) > 0 AND place != '*'
            UNION
            SELECT DISTINCT LTRIM(RTRIM(D)) AS place FROM T1 WHERE D IS NOT NULL AND LEN(LTRIM(RTRIM(D))) > 0 AND D != '*'
            ORDER BY place
        `);
        const places = result.recordset.map(r => r.place).filter(Boolean);
        res.json(places);
    } catch (err) {
        console.error('Get places error:', err);
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

// ─── GET BARADS LIST (From Barad Table) ─────────────────────────────
app.get('/api/barads', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT LTRIM(RTRIM(Barad)) AS Barad 
            FROM Barad 
            WHERE Barad IS NOT NULL AND LTRIM(RTRIM(Barad)) != '*' AND LEN(LTRIM(RTRIM(Barad))) > 0 
            ORDER BY Barad
        `);
        let list = result.recordset.map(r => r.Barad.trim());
        if (!list || list.length === 0) {
            const rT1 = await pool.request().query(`
                SELECT DISTINCT TOP 50 E FROM T1 
                WHERE E IS NOT NULL AND LEN(E) > 3 AND E NOT IN ('-','.') 
                ORDER BY E
            `);
            list = rT1.recordset.map(r => r.E.trim());
        }
        res.json(list);
    } catch (err) {
        console.error('Barads error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── FULL STATS (Manager Only) ───────────────────────────────────────
app.get('/api/stats/full', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const cu = req.session.user || {};
        const isManager = Boolean(
            cu.permission === 'MANAGER' || cu.place === '*' || cu.username === '9' ||
            String(cu.permission || '').toUpperCase() === 'ADMIN'
        );
        if (!isManager) {
            return res.status(403).json({ error: 'دەسەڵات نیە' });
        }

        const [total, today, week, month, byType, byProvince, byUser, byMonth] = await Promise.all([
            pool.request().query(`SELECT COUNT(*) as cnt FROM T1`),
            pool.request().query(`SELECT COUNT(*) as cnt FROM T1 WHERE CAST(DD as date)=CAST(GETDATE() as date)`),
            pool.request().query(`SELECT COUNT(*) as cnt FROM T1 WHERE DD >= DATEADD(day,-7,GETDATE())`),
            pool.request().query(`SELECT COUNT(*) as cnt FROM T1 WHERE DD >= DATEADD(day,-30,GETDATE())`),
            pool.request().query(`SELECT C as type_, COUNT(*) as cnt FROM T1 WHERE C IS NOT NULL GROUP BY C ORDER BY cnt DESC`),
            pool.request().query(`SELECT B as province, COUNT(*) as cnt FROM T1 WHERE B IS NOT NULL AND B!='' GROUP BY B ORDER BY cnt DESC`),
            pool.request().query(`SELECT TOP 15 FF as username, COUNT(*) as cnt FROM T1 WHERE FF IS NOT NULL AND FF!='' GROUP BY FF ORDER BY cnt DESC`),
            pool.request().query(`SELECT TOP 12 FORMAT(DD,'yyyy-MM') as month, COUNT(*) as cnt FROM T1 WHERE DD IS NOT NULL GROUP BY FORMAT(DD,'yyyy-MM') ORDER BY month DESC`)
        ]);

        res.json({
            total: total.recordset[0].cnt,
            today: today.recordset[0].cnt,
            week: week.recordset[0].cnt,
            month: month.recordset[0].cnt,
            byType: byType.recordset,
            byProvince: byProvince.recordset,
            byUser: byUser.recordset,
            byMonth: byMonth.recordset.reverse()
        });
    } catch (err) {
        console.error('Full stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── DETAILED STATS: T1 by Writer/Barad/Place + Date Range ───────────
app.get('/api/stats/detailed', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const cu = req.session.user || {};
        const isManager = Boolean(
            cu.permission === 'MANAGER' || cu.place === '*' || cu.username === '9' ||
            String(cu.permission || '').toUpperCase() === 'ADMIN'
        );
        if (!isManager) return res.status(403).json({ error: 'دەسەڵات نیە' });

        const { from, to } = req.query;
        const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10);
        const dateTo   = to   || new Date().toISOString().slice(0,10);

        const req1 = pool.request()
            .input('df', sql.Date, dateFrom)
            .input('dt', sql.Date, dateTo);

        const [byWriter, byBarad, byPlace, byDate] = await Promise.all([
            // By Writer (GG = checker/writer)
            req1.query(`
                SELECT GG as writer, COUNT(*) as cnt,
                    MIN(CAST(DD as date)) as first_date, MAX(CAST(DD as date)) as last_date,
                    CAST(CAST(DD as date) as nvarchar(20)) as date_
                FROM T1
                WHERE GG IS NOT NULL AND GG != '' AND GG != '*'
                  AND CAST(DD as date) BETWEEN @df AND @dt
                GROUP BY GG, CAST(DD as date)
                ORDER BY CAST(DD as date) DESC, cnt DESC
            `),
            // By Barad (E column)
            pool.request()
            .input('df2', sql.Date, dateFrom).input('dt2', sql.Date, dateTo)
            .query(`
                SELECT E as barad, COUNT(*) as cnt,
                    CAST(CAST(DD as date) as nvarchar(20)) as date_
                FROM T1
                WHERE E IS NOT NULL AND LEN(LTRIM(RTRIM(E))) > 2 AND E NOT IN ('-','.')
                  AND CAST(DD as date) BETWEEN @df2 AND @dt2
                GROUP BY E, CAST(DD as date)
                ORDER BY CAST(DD as date) DESC, cnt DESC
            `),
            // By Place/FF (FF = place column)
            pool.request()
            .input('df3', sql.Date, dateFrom).input('dt3', sql.Date, dateTo)
            .query(`
                SELECT FF as place_, COUNT(*) as cnt,
                    CAST(CAST(DD as date) as nvarchar(20)) as date_
                FROM T1
                WHERE FF IS NOT NULL AND FF != '' AND FF != '*'
                  AND CAST(DD as date) BETWEEN @df3 AND @dt3
                GROUP BY FF, CAST(DD as date)
                ORDER BY CAST(DD as date) DESC, cnt DESC
            `),
            // Daily summary for the range
            pool.request()
            .input('df4', sql.Date, dateFrom).input('dt4', sql.Date, dateTo)
            .query(`
                SELECT CAST(DD as date) as date_, COUNT(*) as cnt
                FROM T1
                WHERE CAST(DD as date) BETWEEN @df4 AND @dt4
                GROUP BY CAST(DD as date)
                ORDER BY CAST(DD as date) DESC
            `)
        ]);

        res.json({
            dateFrom, dateTo,
            byWriter: byWriter.recordset,
            byBarad:  byBarad.recordset,
            byPlace:  byPlace.recordset,
            byDate:   byDate.recordset
        });
    } catch (err) {
        console.error('Detailed stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GOMRG STATS: By Place & User + Date Range ───────────────────────
app.get('/api/stats/gomrg', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const cu = req.session.user || {};
        const isManager = Boolean(
            cu.permission === 'MANAGER' || cu.place === '*' || cu.username === '9' ||
            String(cu.permission || '').toUpperCase() === 'ADMIN'
        );
        if (!isManager) return res.status(403).json({ error: 'دەسەڵات نیە' });

        const { from, to } = req.query;
        const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10);
        const dateTo   = to   || new Date().toISOString().slice(0,10);

        const [byPlace, byUser, byDate] = await Promise.all([
            // By Place + date
            pool.request()
            .input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo)
            .query(`
                SELECT place, COUNT(*) as cnt,
                    CAST(CAST(date_insert as date) as nvarchar(20)) as date_
                FROM Gomrg
                WHERE place IS NOT NULL AND place != ''
                  AND CAST(date_insert as date) BETWEEN @df AND @dt
                GROUP BY place, CAST(date_insert as date)
                ORDER BY CAST(date_insert as date) DESC, cnt DESC
            `),
            // By User + date
            pool.request()
            .input('df2', sql.Date, dateFrom).input('dt2', sql.Date, dateTo)
            .query(`
                SELECT user_ as username, COUNT(*) as cnt,
                    CAST(CAST(date_insert as date) as nvarchar(20)) as date_
                FROM Gomrg
                WHERE user_ IS NOT NULL AND user_ != ''
                  AND CAST(date_insert as date) BETWEEN @df2 AND @dt2
                GROUP BY user_, CAST(date_insert as date)
                ORDER BY CAST(date_insert as date) DESC, cnt DESC
            `),
            // Daily summary
            pool.request()
            .input('df3', sql.Date, dateFrom).input('dt3', sql.Date, dateTo)
            .query(`
                SELECT CAST(date_insert as date) as date_, COUNT(*) as cnt
                FROM Gomrg
                WHERE CAST(date_insert as date) BETWEEN @df3 AND @dt3
                GROUP BY CAST(date_insert as date)
                ORDER BY CAST(date_insert as date) DESC
            `)
        ]);

        res.json({
            dateFrom, dateTo,
            byPlace:  byPlace.recordset,
            byUser:   byUser.recordset,
            byDate:   byDate.recordset
        });
    } catch (err) {
        console.error('Gomrg stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── STATS (TODAY'S OPERATIONS: REGISTRATION + GOMRG + RAPORT + HIJZ) ──────
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

        // Optional query param: ?scope=all or ?scope=user (defaults to user)
        const requestedScope = req.query.scope; // 'all' or 'user'
        const shouldFilterByUser = (!requestedScope) || requestedScope === 'user' || (!isManager);

        const userName = (currentUser.name || currentUser.username || '').trim();
        const userPlace = (currentUser.place || '').trim();

        const request = pool.request();
        request.input('userName', sql.NVarChar, userName);
        request.input('userPlace', sql.NVarChar, userPlace);

        let t1Query, gomrgQuery, rapQuery, hijzQuery, totalQuery;

        if (shouldFilterByUser) {
            // Filter by the logged-in employee's operations today
            t1Query = `SELECT COUNT(*) as cnt FROM T1 WHERE CAST(DD as date) = CAST(GETDATE() as date) AND (GG = @userName OR FF = @userName)`;
            gomrgQuery = `SELECT COUNT(*) as cnt FROM Gomrg WHERE CAST(date_insert as date) = CAST(GETDATE() as date) AND (user_ = @userName)`;
            rapQuery = `SELECT COUNT(*) as cnt FROM RAP WHERE CAST(O as date) = CAST(GETDATE() as date) AND (R = @userName)`;
            hijzQuery = `SELECT COUNT(*) as cnt FROM Hijz WHERE CAST(Date_Releasing as date) = CAST(GETDATE() as date) AND (UUser = @userName)`;
            totalQuery = `SELECT COUNT(*) as cnt FROM T1 WHERE (GG = @userName OR FF = @userName)`;
        } else {
            // Full manager view (all employees' operations today)
            t1Query = `SELECT COUNT(*) as cnt FROM T1 WHERE CAST(DD as date) = CAST(GETDATE() as date)`;
            gomrgQuery = `SELECT COUNT(*) as cnt FROM Gomrg WHERE CAST(date_insert as date) = CAST(GETDATE() as date)`;
            rapQuery = `SELECT COUNT(*) as cnt FROM RAP WHERE CAST(O as date) = CAST(GETDATE() as date)`;
            hijzQuery = `SELECT COUNT(*) as cnt FROM Hijz WHERE CAST(Date_Releasing as date) = CAST(GETDATE() as date)`;
            totalQuery = `SELECT COUNT(*) as cnt FROM T1`;
        }

        const [t1Res, gomrgRes, rapRes, hijzRes, totalRes] = await Promise.all([
            request.query(t1Query),
            request.query(gomrgQuery),
            request.query(rapQuery),
            request.query(hijzQuery),
            request.query(totalQuery)
        ]);

        const t1Today = t1Res.recordset[0]?.cnt || 0;
        const gomrgToday = gomrgRes.recordset[0]?.cnt || 0;
        const raportToday = rapRes.recordset[0]?.cnt || 0;
        const hijzToday = hijzRes.recordset[0]?.cnt || 0;
        const todayTotal = t1Today + gomrgToday + raportToday + hijzToday;

        res.json({
            success: true,
            t1Today,
            gomrgToday,
            raportToday,
            hijzToday,
            todayTotal,
            total: totalRes.recordset[0]?.cnt || 0,
            today: t1Today,
            isManager: Boolean(isManager),
            scope: shouldFilterByUser ? 'user' : 'all',
            scopedName: shouldFilterByUser ? userName : 'سەرجەم بەشەکان (گشتی)',
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

// ─── RAPORT (RAP TABLE) ─────────────────────────────────────────────
app.get('/api/raport/init', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const cu = req.session.user || {};

        const [rSeq, rPlaces, rTablos, rBashes, rBarads, rReasons] = await Promise.all([
            pool.request().query(`SELECT ISNULL(MAX(S), 0) + 1 AS nextS FROM RAP`),
            pool.request().query(`
                SELECT DISTINCT P AS place FROM RAP 
                WHERE P IS NOT NULL AND LEN(TRIM(P)) > 0 AND P != '*' AND P != '0'
                UNION
                SELECT DISTINCT Place_ AS place FROM Tbl_User 
                WHERE Place_ IS NOT NULL AND LEN(TRIM(Place_)) > 0 AND Place_ != '*'
                ORDER BY place
            `),
            pool.request().query(`SELECT DISTINCT Tablo_Name FROM Tbl_Tablo ORDER BY Tablo_Name`),
            pool.request().query(`
                SELECT DISTINCT C AS bash FROM RAP 
                WHERE C IS NOT NULL AND LEN(TRIM(C)) > 0 AND C != '0'
                ORDER BY bash
            `),
            pool.request().query(`
                SELECT DISTINCT Barad FROM Barad 
                WHERE Barad IS NOT NULL AND Barad != '*' AND LEN(TRIM(Barad)) > 0
                ORDER BY Barad
            `),
            pool.request().query(`
                SELECT TOP 20 N as reason, COUNT(*) as cnt FROM RAP 
                WHERE N IS NOT NULL AND LEN(TRIM(N)) > 3 
                GROUP BY N ORDER BY cnt DESC
            `)
        ]);

        const nextS = rSeq.recordset[0]?.nextS || 3407;
        const places = rPlaces.recordset.map(x => x.place).filter(Boolean);
        const tablos = rTablos.recordset.map(x => x.Tablo_Name).filter(Boolean);
        const bashes = rBashes.recordset.map(x => x.bash).filter(Boolean);
        const barads = rBarads.recordset.map(x => x.Barad).filter(Boolean);
        const reasons = rReasons.recordset.map(x => x.reason.trim()).filter(Boolean);

        res.json({
            success: true,
            nextS,
            places,
            tablos,
            bashes,
            barads,
            reasons,
            currentUser: {
                username: cu.username || '',
                name: cu.name || cu.username || '',
                place: cu.place || '*'
            }
        });
    } catch (err) {
        console.error('Raport init error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/raport/search-car', requireAuth, async (req, res) => {
    try {
        const rawPlate = (req.query.plate || req.query.car_n || req.query.carNo || req.query.auto_no || '').trim();
        if (!rawPlate) {
            return res.status(400).json({ success: false, message: 'تکایە ژمارەی ئۆتۆمبێل بنووسە' });
        }

        const pool = await getPool();
        const cleanPlate = rawPlate
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        const cleanPlateNoSpace = cleanPlate.replace(/\s+/g, '');
        const cleanTablo = (req.query.tablo || req.query.plet || req.query.parezga || '').trim();
        const cleanBash  = (req.query.bash  || '').trim();

        // 1. Search in [Taqega].[dbo].[VA] FIRST (as requested by user)
        try {
            let reqVA = pool.request()
                .input('plate', sql.NVarChar, cleanPlate)
                .input('plateNoSpace', sql.NVarChar, cleanPlateNoSpace)
                .input('tablo', sql.NVarChar, cleanTablo)
                .input('tabloLike', sql.NVarChar, `%${cleanTablo}%`)
                .input('tabloLikeClean', sql.NVarChar, `%${cleanTablo.replace(/ى/g, 'ی')}%`)
                .input('bash', sql.NVarChar, cleanBash)
                .input('bashLike', sql.NVarChar, `%${cleanBash}%`);

            let qVA = `
                SELECT TOP 1 * FROM [Taqega].[dbo].[VA]
                WHERE (
                    REPLACE(auto_no, ' ', '') = @plateNoSpace
                    OR auto_no = @plate
                    OR REPLACE(auto_no, ' ', '') = @plate
                    OR shassy = @plate
                    OR REPLACE(shassy, ' ', '') = @plateNoSpace
                )
            `;
            if (cleanTablo && cleanTablo !== '*' && cleanTablo !== 'هەموو') {
                qVA += ` AND (
                    plet = @tablo
                    OR REPLACE(REPLACE(plet, N'ى', N'ی'), N'ك', N'ک') = REPLACE(REPLACE(@tablo, N'ى', N'ی'), N'ك', N'ک')
                    OR plet LIKE @tabloLike
                    OR REPLACE(plet, N'ى', N'ی') LIKE @tabloLikeClean
                ) `;
            }
            if (cleanBash && cleanBash !== '*' && cleanBash !== 'هەموو') {
                qVA += ` AND (
                    bash = @bash
                    OR REPLACE(REPLACE(bash, N'ى', N'ی'), N'ك', N'ک') = REPLACE(REPLACE(@bash, N'ى', N'ی'), N'ك', N'ک')
                    OR bash LIKE @bashLike
                ) `;
            }
            qVA += ` ORDER BY id DESC `;

            let rVA = await reqVA.query(qVA);
            if (rVA.recordset && rVA.recordset.length > 0) {
                const row = rVA.recordset[0];
                return res.json({
                    success: true,
                    source: 'VA',
                    data: {
                        car_no: row.auto_no || cleanPlate,
                        tablo: (row.plet || cleanTablo || '').replace(/ى/g, 'ی'),
                        bash: row.bash || cleanBash,
                        model: row.car_type || '',
                        year: row.Model || row.model || '0',
                        color: row.color || '',
                        chassis: (row.shassy && row.shassy.trim() !== '') ? row.shassy.trim() : '*',
                        qamara: '*',
                        owner: row.Name_ || '',
                        arabana1_chassis: '*',
                        arabana1_color: '',
                        arabana2_chassis: '*',
                        arabana2_color: '',
                        barad1: row.AA || '',
                        place: (row.CC || '').replace(/^تاقیگەی\s*/, '').replace(/^تاقیگەى\s*/, '').trim() || ''
                    }
                });
            }
        } catch (e) {
            console.warn('VA lookup warning:', e.message);
        }

        // 2. Fallback to T1
        let reqT1 = pool.request()
            .input('plate', sql.NVarChar, cleanPlate)
            .input('tablo', sql.NVarChar, cleanTablo)
            .input('tabloLike', sql.NVarChar, `%${cleanTablo}%`)
            .input('bash', sql.NVarChar, cleanBash)
            .input('bashLike', sql.NVarChar, `%${cleanBash}%`);

        let qT1 = `
            SELECT TOP 1 * FROM T1
            WHERE (
                REPLACE(A, ' ', '') = REPLACE(@plate, ' ', '')
                OR A = @plate
                OR R = @plate
            )
        `;
        if (cleanTablo && cleanTablo !== '*') {
            qT1 += ` AND (B = @tablo OR B LIKE @tabloLike) `;
        }
        if (cleanBash && cleanBash !== '*') {
            qT1 += ` AND (C = @bash OR C LIKE @bashLike) `;
        }
        qT1 += ` ORDER BY DD DESC, id DESC `;

        let rT1 = await reqT1.query(qT1);

        if (rT1.recordset && rT1.recordset.length > 0) {
            const row = rT1.recordset[0];
            return res.json({
                success: true,
                source: 'T1',
                data: {
                    car_no: row.A || cleanPlate,
                    tablo: row.B || cleanTablo,
                    bash: row.C || cleanBash,
                    model: row.I || '',
                    year: row.P || '0',
                    color: row.L || '',
                    chassis: row.R || '',
                    qamara: row.S || '*',
                    owner: row.E || '',
                    arabana1_chassis: row.W || '',
                    arabana1_color: row.X || '',
                    arabana2_chassis: row.AA || '',
                    arabana2_color: row.BB || '',
                    barad1: row.GG || '',
                    place: row.FF || ''
                }
            });
        }

        // 2. Fallback to TBL_B
        try {
            let rB = await pool.request()
                .input('plate', sql.NVarChar, cleanPlate)
                .query(`SELECT TOP 1 * FROM TBL_B WHERE Auto_No = @plate OR Shassy = @plate ORDER BY idd DESC`);
            if (rB.recordset && rB.recordset.length > 0) {
                const row = rB.recordset[0];
                return res.json({
                    success: true,
                    source: 'TBL_B',
                    data: {
                        car_no: row.Auto_No || cleanPlate,
                        tablo: row.Car_Plet || cleanTablo,
                        bash: row.Car_Bash || cleanBash,
                        model: row.Auto_Type || '',
                        year: row.Model || '0',
                        color: row.Color || '',
                        chassis: row.Shassy || '',
                        qamara: row.qamara || '*',
                        owner: row.Reg_Name || '',
                        arabana1_chassis: row.A_Shassy || '',
                        arabana1_color: row.A_color || '',
                        arabana2_chassis: row.B_Shassy || '',
                        arabana2_color: row.B_color || '',
                        barad1: row.Barad || '',
                        place: row.Place_ || row.Place || ''
                    }
                });
            }
        } catch (e) {
            console.warn('TBL_B lookup skipped:', e.message);
        }

        return res.json({
            success: false,
            message: 'هیچ ئۆتۆمبێلێک بەم زانیارییانەوە نەدۆزرایەوە، دەتوانیت زانیارییەکان بە دەست بنووسیت.'
        });
    } catch (err) {
        console.error('Raport search error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/raport', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const b = req.body || {};

        if (!b.A || !String(b.A).trim()) {
            return res.status(400).json({ success: false, message: 'تکایە ژمارەی ئۆتۆمبێل پڕبکەرەوە' });
        }

        // Auto-generate S if not passed or <= 0
        let sVal = parseInt(b.S, 10);
        if (isNaN(sVal) || sVal <= 0) {
            const rSeq = await pool.request().query(`SELECT ISNULL(MAX(S), 0) + 1 AS nextS FROM RAP`);
            sVal = rSeq.recordset[0]?.nextS || 3407;
        }

        const dateVal = b.O ? new Date(b.O) : new Date();
        const dateStr = b.O ? String(b.O).slice(0, 10) : new Date().toISOString().slice(0, 10);
        const userName = (req.session?.user?.name || req.session?.user?.username || b.UUser || 'سیستەم').trim();

        const placeVal = String(b.place || b.P || req.session?.user?.place || 'بێستون').trim();
        const tabloVal = String(b.B || '').trim();
        const bashVal  = String(b.C || '').trim();
        const barad1   = String(b.Q || '').trim();
        const barad2   = String(b.R || '').trim();

        // 1. INSERT INTO RAP table
        const insertRapReq = pool.request()
            .input('A', sql.NVarChar, String(b.A || '').trim())
            .input('B', sql.NVarChar, tabloVal)
            .input('C', sql.NVarChar, bashVal)
            .input('D', sql.NVarChar, String(b.D || '').trim())
            .input('E', sql.NVarChar, String(b.E || '0').trim())
            .input('F', sql.NVarChar, String(b.F || '').trim())
            .input('G', sql.NVarChar, String(b.G || '').trim())
            .input('H', sql.NVarChar, String(b.H || '').trim())
            .input('I', sql.NVarChar, String(b.I || '').trim())
            .input('J', sql.NVarChar, String(b.J || '').trim())
            .input('K', sql.NVarChar, String(b.K || '').trim())
            .input('L', sql.NVarChar, String(b.L || '').trim())
            .input('M', sql.NVarChar, String(b.M || '').trim())
            .input('N', sql.NVarChar, String(b.N || '').trim())
            .input('O', sql.Date, dateVal)
            .input('P', sql.NVarChar, tabloVal || 'سلێمانی')
            .input('Q', sql.NVarChar, placeVal || 'بێستون')
            .input('R', sql.NVarChar, userName)
            .input('S', sql.Int, sVal);

        const qRap = `
            INSERT INTO RAP (A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S)
            VALUES (@A, @B, @C, @D, @E, @F, @G, @H, @I, @J, @K, @L, @M, @N, @O, @P, @Q, @R, @S);
            SELECT SCOPE_IDENTITY() AS insertedId;
        `;
        const result = await insertRapReq.query(qRap);
        const newId = result.recordset[0]?.insertedId;

        // 2. INSERT INTO Hijz (حیجز) table
        try {
            await pool.request()
                .input('hAutoNo', sql.NVarChar, String(b.A || '').trim().slice(0, 7))
                .input('hPlace', sql.NVarChar, tabloVal.slice(0, 20))
                .input('hCarPlet', sql.NVarChar, bashVal.slice(0, 20))
                .input('hDate', sql.NVarChar, dateStr.slice(0, 10))
                .input('hRegName', sql.NVarChar, String(b.G || '').trim().slice(0, 50))
                .input('hCarNote', sql.NVarChar, String(b.N || '').trim().slice(0, 200))
                .input('hUser', sql.NVarChar, userName.slice(0, 75))
                .input('hP', sql.NVarChar, placeVal.slice(0, 50))
                .input('hB', sql.NVarChar, barad1.slice(0, 50))
                .input('hC', sql.NVarChar, barad2.slice(0, 40))
                .query(`
                    INSERT INTO Hijz (Auto_No, Place_, Car_Plet, Date_Releasing, Reg_Name, car_Note, UUser, p, B, C)
                    VALUES (@hAutoNo, @hPlace, @hCarPlet, @hDate, @hRegName, @hCarNote, @hUser, @hP, @hB, @hC)
                `);
            console.log(`[RAPORT + HIJZ] Successfully recorded car ${b.A} in both RAP and Hijz tables.`);
        } catch (hijzErr) {
            console.error('[HIJZ INSERT ERROR]', hijzErr);
        }

        // Query the next available sequence for frontend
        const rNext = await pool.request().query(`SELECT ISNULL(MAX(S), 0) + 1 AS nextS FROM RAP`);
        const nextS = rNext.recordset[0]?.nextS || (sVal + 1);

        res.json({
            success: true,
            id: newId,
            S: sVal,
            nextS,
            message: `ڕاپۆرت بە سەرکەوتوویی لە هەردوو تەیبڵی (RAP) و (حیجز - Hijz) تۆمارکرا بە ژمارەی ڕۆشتوو (${sVal})`
        });
    } catch (err) {
        console.error('Save Raport error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/raport/update-t1', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const b = req.body || {};

        if (!b.A || !String(b.A).trim()) {
            return res.status(400).json({ success: false, message: 'ژمارەی ئۆتۆمبێل دیاری نەکراوە' });
        }

        const updReq = pool.request()
            .input('A', sql.NVarChar, String(b.A || '').trim())
            .input('B', sql.NVarChar, String(b.B || '').trim())
            .input('C', sql.NVarChar, String(b.C || '').trim())
            .input('D', sql.NVarChar, String(b.D || '').trim())
            .input('E', sql.NVarChar, String(b.E || '0').trim())
            .input('F', sql.NVarChar, String(b.F || '').trim())
            .input('G', sql.NVarChar, String(b.G || '').trim())
            .input('H', sql.NVarChar, String(b.H || '').trim())
            .input('I', sql.NVarChar, String(b.I || '').trim())
            .input('J', sql.NVarChar, String(b.J || '').trim())
            .input('K', sql.NVarChar, String(b.K || '').trim())
            .input('L', sql.NVarChar, String(b.L || '').trim())
            .input('M', sql.NVarChar, String(b.M || '').trim());

        const q = `
            UPDATE TOP (1) T1 SET
                I  = @D,
                P  = @E,
                L  = @F,
                R  = @G,
                S  = @H,
                W  = @I,
                X  = @J,
                AA = @K,
                BB = @L,
                E  = @M
            WHERE REPLACE(A, ' ', '') = REPLACE(@A, ' ', '')
              AND (@B = '' OR B = @B)
              AND (@C = '' OR C = @C);
        `;

        await updReq.query(q);
        res.json({ success: true, message: 'زانیارییەکان لە تەیبڵی T1 نوێکرانەوە' });
    } catch (err) {
        console.error('Update T1 from Raport error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/raport/:id', requireAuth, async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id, 10))
            .query(`SELECT TOP 1 * FROM RAP WHERE id = @id`);
        if (!r.recordset || r.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'ڕاپۆرت نەدۆزرایەوە' });
        }
        res.json({ success: true, data: r.recordset[0] });
    } catch (err) {
        console.error('Get Raport by ID error:', err);
        res.status(500).json({ success: false, error: err.message });
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

// ─── SEARCH IN VA FOR HIJZ FORM ──────────────────────────────────────
app.get('/api/hijz/search-va', requireAuth, async (req, res) => {
    try {
        const { car_n, plet, bash } = req.query;
        if (!car_n || !car_n.trim()) {
            return res.status(400).json({ success: false, message: 'تکایە ژمارەی ئوتومبێل بنووسە' });
        }

        const pool = await getPool();
        const cleanCarN = car_n.trim()
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
        const cleanCarNNoSpace = cleanCarN.replace(/\s+/g, '');
        const cleanPlet = (plet || '').trim();
        const cleanBash = (bash || '').trim();

        const request = pool.request()
            .input('car_n', sql.NVarChar, cleanCarN)
            .input('car_n_ns', sql.NVarChar, cleanCarNNoSpace);

        let q = `
            SELECT TOP 1 * FROM [Taqega].[dbo].[VA]
            WHERE (
                REPLACE(auto_no, ' ', '') = @car_n_ns
                OR auto_no = @car_n
                OR REPLACE(shassy, ' ', '') = @car_n_ns
                OR shassy = @car_n
            )
        `;

        if (cleanPlet && cleanPlet !== '*' && cleanPlet !== 'هەموو') {
            request.input('plet', sql.NVarChar, cleanPlet);
            request.input('pletLike', sql.NVarChar, `%${cleanPlet}%`);
            request.input('pletClean', sql.NVarChar, `%${cleanPlet.replace(/ى/g, 'ی')}%`);
            q += ` AND (
                plet = @plet
                OR REPLACE(REPLACE(plet, N'ى', N'ی'), N'ك', N'ک') = REPLACE(REPLACE(@plet, N'ى', N'ی'), N'ك', N'ک')
                OR plet LIKE @pletLike
                OR REPLACE(plet, N'ى', N'ی') LIKE @pletClean
            ) `;
        }

        if (cleanBash && cleanBash !== '*' && cleanBash !== 'هەموو') {
            request.input('bash', sql.NVarChar, cleanBash);
            request.input('bashLike', sql.NVarChar, `%${cleanBash}%`);
            q += ` AND (
                bash = @bash
                OR REPLACE(REPLACE(bash, N'ى', N'ی'), N'ك', N'ک') = REPLACE(REPLACE(@bash, N'ى', N'ی'), N'ك', N'ک')
                OR bash LIKE @bashLike
            ) `;
        }

        q += ` ORDER BY id DESC `;

        const result = await request.query(q);
        if (result.recordset && result.recordset.length > 0) {
            const row = result.recordset[0];
            return res.json({
                success: true,
                found: true,
                source: 'VA',
                data: {
                    auto_no: row.auto_no || cleanCarN,
                    plet: (row.plet || cleanPlet).replace(/ى/g, 'ی'),
                    bash: row.bash || cleanBash,
                    shassy: (row.shassy || '').trim().toUpperCase(),
                    owner: (row.Name_ || '').trim(),
                    barad: (row.AA || '').trim(),
                    car_type: (row.car_type || '').trim(),
                    model: (row.Model || '').trim(),
                    color: (row.color || '').trim(),
                    resulat: (row.resulat || '').trim()
                }
            });
        }

        // Fallback search in T1
        let rT1 = await pool.request()
            .input('plate', sql.NVarChar, cleanCarN)
            .query(`SELECT TOP 1 * FROM T1 WHERE A = @plate OR R = @plate ORDER BY id DESC`);
        if (rT1.recordset && rT1.recordset.length > 0) {
            const row = rT1.recordset[0];
            return res.json({
                success: true,
                found: true,
                source: 'T1',
                data: {
                    auto_no: row.A || cleanCarN,
                    plet: (row.B || cleanPlet).replace(/ى/g, 'ی'),
                    bash: row.C || cleanBash,
                    shassy: (row.R || '').trim().toUpperCase(),
                    owner: (row.E || '').trim(),
                    barad: (row.GG || '').trim()
                }
            });
        }

        return res.json({
            success: true,
            found: false,
            message: 'ئەم ئۆتۆمبێلە لە خشتەی تاقیگە (VA) نەدۆزرایەوە، تکایە خۆت بە دەستی پڕی بکەرەوە.'
        });
    } catch (err) {
        console.error('Hijz search VA error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/hijz', requireAuth, async (req, res) => {
    try {
        const { Auto_No, Place_, Car_Plet, Date_Releasing, Reg_Name, car_Note, owner_name, Barad1, Barad2 } = req.body;
        if (!Auto_No || !String(Auto_No).trim()) {
            return res.status(400).json({ success: false, message: 'تکایە ژمارەی ئۆتۆمبێل بنووسە' });
        }
        if (!Reg_Name || !String(Reg_Name).trim()) {
            return res.status(400).json({ success: false, message: 'تکایە ژمارەی شاسی بنووسە' });
        }
        if (!car_Note || !String(car_Note).trim()) {
            return res.status(400).json({ success: false, message: 'تکایە ووردەکاری ڕاگرتنی کار بنووسە' });
        }

        const pool = await getPool();
        const user = req.session.user.name || req.session.user.username || 'سیستەم';
        const userPlace = req.session.user.place || 'بێستون';

        // Format car_Note with owner name if provided, truncated to max 200 chars
        let finalNote = String(car_Note || '').trim();
        if (owner_name && String(owner_name).trim()) {
            const cleanOwner = String(owner_name).trim();
            if (!finalNote.includes(cleanOwner)) {
                finalNote = `خاوەن: ${cleanOwner} - ${finalNote}`;
            }
        }
        if (finalNote.length > 200) {
            finalNote = finalNote.substring(0, 197) + '...';
        }

        const cleanChassis = String(Reg_Name).trim().toUpperCase();

        await pool.request()
            .input('Auto_No', sql.NVarChar, String(Auto_No).trim().slice(0, 7))
            .input('Place_', sql.NVarChar, String(Place_ || 'سلێمانی').trim().slice(0, 20))
            .input('Car_Plet', sql.NVarChar, String(Car_Plet || 'تایبەت').trim().slice(0, 20))
            .input('Date_Releasing', sql.NVarChar, String(Date_Releasing || new Date().toISOString().slice(0, 10)).trim().slice(0, 10))
            .input('Reg_Name', sql.NVarChar, cleanChassis.slice(0, 50))
            .input('car_Note', sql.NVarChar, finalNote)
            .input('UUser', sql.NVarChar, String(user).slice(0, 75))
            .input('p', sql.NVarChar, String(userPlace).slice(0, 50))
            .input('B', sql.NVarChar, String(Barad1 || '').trim().slice(0, 50))
            .input('C', sql.NVarChar, String(Barad2 || '').trim().slice(0, 40))
            .query(`
                INSERT INTO Hijz (Auto_No, Place_, Car_Plet, Date_Releasing, Reg_Name, car_Note, UUser, p, B, C)
                VALUES (@Auto_No, @Place_, @Car_Plet, @Date_Releasing, @Reg_Name, @car_Note, @UUser, @p, @B, @C)
            `);

        res.json({ success: true, message: 'نیشانەی حجز بە سەرکەوتوویی لە سەر سوارڕەو تۆمار کرا' });
    } catch (err) {
        console.error('Add Hijz error:', err);
        res.status(500).json({ success: false, error: err.message });
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
        let updater;
        try { updater = require('./auto-updater'); } catch(e){}
        if (updater && typeof updater.getLocalVersion === 'function') {
            return res.json(updater.getLocalVersion());
        }
        const vPath = path.join(__dirname, 'version.json');
        if (fs.existsSync(vPath)) {
            return res.json(JSON.parse(fs.readFileSync(vPath, 'utf8')));
        }
        res.json({ version: '1.3.0', build: 130 });
    } catch (e) {
        res.json({ version: '1.3.0', build: 130 });
    }
});

function restartServerProcess() {
    try {
        const { spawn } = require('child_process');
        console.log('🔄 Relaunching server process cleanly in background...');
        const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
            detached: true,
            stdio: 'ignore',
            cwd: __dirname,
            windowsHide: true
        });
        child.unref();
        setTimeout(() => {
            process.exit(0);
        }, 800);
    } catch (spawnErr) {
        console.error('Auto-restart spawn error:', spawnErr);
        process.exit(0);
    }
}

app.post('/api/system/check-update', async (req, res) => {
    try {
        const isForce = req.body && !!req.body.force;
        let updater;
        try {
            delete require.cache[require.resolve('./auto-updater')];
            updater = require('./auto-updater');
        } catch (e) {
            console.error('Require auto-updater error:', e);
            return res.status(500).json({ success: false, error: 'فایلی auto-updater بەردەست نییە: ' + e.message });
        }

        const result = await updater.checkForUpdates(isForce);
        res.json(result);

        if (result.success && result.hasUpdate) {
            console.log('✅ Update applied successfully. Relaunching server process...');
            setTimeout(() => {
                restartServerProcess();
            }, 2000);
        }
    } catch (err) {
        console.error('Check update error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── START SERVER & AUTO-CHECK FOR UPDATES ─────────────────────────
app.listen(PORT, () => {
    console.log(`✅ TrafficCheck Server running on http://localhost:${PORT}`);
    
    // Silent check for updates 7 seconds after startup
    setTimeout(async () => {
        try {
            const updater = require('./auto-updater');
            const chk = await updater.checkForUpdates(false);
            if (chk && chk.success && chk.hasUpdate) {
                console.log('🌟 [Auto-Update] New update detected on startup. Restarting server...');
                restartServerProcess();
            }
        } catch(e) {
            // Silently ignore startup network issues
        }
    }, 7000);

    // Periodic check every 30 minutes
    setInterval(async () => {
        try {
            const updater = require('./auto-updater');
            const chk = await updater.checkForUpdates(false);
            if (chk && chk.success && chk.hasUpdate) {
                console.log('🌟 [Auto-Update] Periodic update applied. Restarting server...');
                restartServerProcess();
            }
        } catch(e) {}
    }, 30 * 60 * 1000);
});


