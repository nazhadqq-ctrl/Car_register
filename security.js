/**
 * ════════════════════════════════════════════════════════════════════════
 * 🛡️ TRAFFIC CHECK - CYBERSECURITY & HARDENING MODULE
 * پارێزگاری ئەمنی سێرڤەر، بەرگری لە هێرشی نێت، CSRF، DNS Rebinding،
 * Brute-Force، کۆنترۆڵی دەسەڵات (RBAC)، و تۆماری ئۆدیتی ئەمنی
 * ════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── 1. LIGHTWEIGHT ZERO-DEPENDENCY .ENV LOADER ──────────────────────────
function loadDotEnv(envFilePath = path.join(__dirname, '.env')) {
    try {
        if (!fs.existsSync(envFilePath)) return;
        const lines = fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/);
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const eqIdx = line.indexOf('=');
            if (eqIdx <= 0) continue;
            const key = line.slice(0, eqIdx).trim();
            let val = line.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            if (!(key in process.env)) {
                process.env[key] = val;
            }
        }
    } catch (e) {
        // Ignore unreadable .env
    }
}

// ─── 2. SECURITY DATA DIRECTORY (%LocalAppData%\TrafficCheck) ────────────
function getSecurityDataDir(subDir = '') {
    const base = process.env.TRAFFICCHECK_DATA_DIR
        || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'TrafficCheck') : path.join(__dirname, '.tc_data'));
    const full = subDir ? path.join(base, subDir) : base;
    try {
        if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    } catch (e) {
        const fallback = subDir ? path.join(__dirname, '.tc_data', subDir) : path.join(__dirname, '.tc_data');
        if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
        return fallback;
    }
    return full;
}

// ─── 3. SECURITY AUDIT LOGGER (JSONL) ────────────────────────────────────
function auditLog(event, details = {}) {
    try {
        const logDir = getSecurityDataDir('logs');
        const logPath = path.join(logDir, 'security-audit.jsonl');
        const entry = {
            ts: new Date().toISOString(),
            event,
            ...details
        };
        fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (e) {
        // Never crash app due to audit log write failure
    }
}

// ─── 4. CENTRALIZED RBAC (MANAGER / ADMIN CHECK) ─────────────────────────
function isManagerUser(user) {
    if (!user || typeof user !== 'object') return false;
    const perm = String(user.permission || '').trim().toUpperCase();
    const place = String(user.place || '').trim();
    const uname = String(user.username || '').trim();
    return Boolean(
        perm === 'MANAGER' ||
        perm === 'ADMIN' ||
        place === '*' ||
        uname === '9'
    );
}

function requireManager(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: 'تکایە سەرەتا بچۆ ژوورەوە' });
    }
    if (!isManagerUser(req.session.user)) {
        auditLog('RBAC_DENIED', {
            user: req.session.user.username,
            method: req.method,
            path: req.originalUrl,
            ip: req.ip
        });
        return res.status(403).json({ success: false, message: 'دەسەڵاتی بەڕێوەبەر پێویستە بۆ ئەم کردارە' });
    }
    return next();
}

// ─── 5. HTTP SECURITY HEADERS & CSP MIDDLEWARE ───────────────────────────
function securityHeadersMiddleware(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    // CSP tuned to protect against external script injection while preserving local inline handlers,
    // Kurdish fonts, Code128 SVG barcodes, and hidden-iframe silent printing (--kiosk-printing).
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: blob:",
            "connect-src 'self'",
            "frame-src 'self' about: blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'"
        ].join('; ')
    );

    if (req.path.startsWith('/api/') || req.path === '/index.html' || req.path === '/') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    next();
}

// ─── 6. DNS REBINDING & HOST HEADER GUARD ────────────────────────────────
function createHostGuard(port) {
    const allowedHosts = new Set([
        `localhost:${port}`,
        `127.0.0.1:${port}`,
        `[::1]:${port}`,
        'localhost',
        '127.0.0.1',
        '[::1]'
    ]);

    if (process.env.ALLOWED_HOSTS) {
        process.env.ALLOWED_HOSTS.split(',').map(h => h.trim().toLowerCase()).filter(Boolean).forEach(h => {
            allowedHosts.add(h);
        });
    }

    return function hostGuardMiddleware(req, res, next) {
        const host = String(req.headers.host || '').trim().toLowerCase();
        if (!host || !allowedHosts.has(host)) {
            auditLog('BLOCKED_HOST_HEADER', { host, ip: req.ip, path: req.originalUrl });
            return res.status(403).json({ success: false, message: 'داواکاری ڕێگەپێنەدراو (Host)' });
        }
        return next();
    };
}

// ─── 7. CSRF / ORIGIN & SEC-FETCH-SITE GUARD ─────────────────────────────
function createCsrfGuard(port) {
    const allowedOrigins = new Set([
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
        `http://[::1]:${port}`
    ]);

    if (process.env.ALLOWED_ORIGINS) {
        process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim().toLowerCase()).filter(Boolean).forEach(o => {
            allowedOrigins.add(o);
        });
    }

    const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

    return function csrfGuardMiddleware(req, res, next) {
        if (SAFE_METHODS.has(req.method.toUpperCase())) return next();

        const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
        if (fetchSite === 'cross-site') {
            auditLog('BLOCKED_CSRF_FETCH_SITE', { fetchSite, ip: req.ip, path: req.originalUrl });
            return res.status(403).json({ success: false, message: 'هەوڵی داواکاری دەرەکی بلۆک کرا (CSRF)' });
        }

        const origin = String(req.headers.origin || '').trim().toLowerCase();
        if (origin) {
            if (!allowedOrigins.has(origin)) {
                auditLog('BLOCKED_CSRF_ORIGIN', { origin, ip: req.ip, path: req.originalUrl });
                return res.status(403).json({ success: false, message: 'سەرچاوەی داواکاری ڕێگەپێنەدراوە (Origin)' });
            }
            return next();
        }

        const referer = String(req.headers.referer || '').trim().toLowerCase();
        if (referer) {
            try {
                const refOrigin = new URL(referer).origin.toLowerCase();
                if (!allowedOrigins.has(refOrigin)) {
                    auditLog('BLOCKED_CSRF_REFERER', { referer, ip: req.ip, path: req.originalUrl });
                    return res.status(403).json({ success: false, message: 'سەرچاوەی داواکاری ڕێگەپێنەدراوە (Referer)' });
                }
            } catch (e) {
                return res.status(403).json({ success: false, message: 'داواکاری نادروستە' });
            }
        }

        return next();
    };
}

// ─── 8. IN-MEMORY RATE LIMITERS (LOGIN BRUTE-FORCE & API FLOOD) ──────────
function createRateLimiter({ windowMs, maxRequests, keyFn, message, eventName }) {
    const store = new Map();

    // Periodic cleanup every 5 minutes to prevent memory growth
    const timer = setInterval(() => {
        const now = Date.now();
        for (const [k, v] of store.entries()) {
            if (now > v.resetAt) store.delete(k);
        }
    }, 5 * 60 * 1000);
    if (timer.unref) timer.unref();

    return {
        middleware(req, res, next) {
            const now = Date.now();
            const key = keyFn(req);
            let record = store.get(key);
            if (!record || now > record.resetAt) {
                record = { count: 0, resetAt: now + windowMs };
                store.set(key, record);
            }
            record.count += 1;
            if (record.count > maxRequests) {
                const retrySec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
                res.setHeader('Retry-After', String(retrySec));
                auditLog(eventName || 'RATE_LIMIT_EXCEEDED', { key, ip: req.ip, path: req.originalUrl });
                return res.status(429).json({
                    success: false,
                    message: message || `داواکاری زۆر کراوە، تکایە پاش ${retrySec} چرکە هەوڵبدەرەوە`
                });
            }
            next();
        },
        recordFailure(key) {
            const now = Date.now();
            let record = store.get(key);
            if (!record || now > record.resetAt) {
                record = { count: 0, resetAt: now + windowMs };
                store.set(key, record);
            }
            record.count += 1;
            return record;
        },
        isBlocked(key) {
            const now = Date.now();
            const record = store.get(key);
            if (!record) return { blocked: false, retrySec: 0 };
            if (now > record.resetAt) {
                store.delete(key);
                return { blocked: false, retrySec: 0 };
            }
            if (record.count >= maxRequests) {
                return { blocked: true, retrySec: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) };
            }
            return { blocked: false, retrySec: 0 };
        },
        reset(key) {
            store.delete(key);
        }
    };
}

// ─── 9. INPUT & SQL HELPERS ──────────────────────────────────────────────
function escapeLike(val) {
    return String(val || '').replace(/[\[%_]/g, '[$&]');
}

function generateSessionSecret() {
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 24) {
        return process.env.SESSION_SECRET;
    }
    return crypto.randomBytes(32).toString('hex');
}

function sendSafeError(res, err, publicMessage = 'هەڵەیەکی ناوخۆیی سێرڤەر ڕوویدا', status = 500) {
    if (err) {
        console.error(`[SAFE ERROR ${status}]`, err.message || err);
    }
    return res.status(status).json({
        success: false,
        message: publicMessage,
        error: publicMessage
    });
}

// ─── 10. ATOMIC FILE WRITE HELPER ────────────────────────────────────────
function atomicWriteFileSync(targetPath, data, encoding = 'utf8') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, data, encoding);
    fs.renameSync(tmpPath, targetPath);
}

// ─── 11. SHA-256 INTEGRITY HELPER ────────────────────────────────────────
function sha256Buffer(bufOrStr) {
    const buf = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr || ''), 'utf8');
    return crypto.createHash('sha256').update(buf).digest('hex');
}

module.exports = {
    loadDotEnv,
    getSecurityDataDir,
    auditLog,
    isManagerUser,
    requireManager,
    securityHeadersMiddleware,
    createHostGuard,
    createCsrfGuard,
    createRateLimiter,
    escapeLike,
    generateSessionSecret,
    sendSafeError,
    atomicWriteFileSync,
    sha256Buffer
};
