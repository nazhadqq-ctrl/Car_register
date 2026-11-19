/* ═══════════════════════════════════════════════════════════════
   🚦 GITHUB & CENTRAL DATABASE AUTO-UPDATER FOR TRAFFICCHECK
   نوێکردنەوەی خۆکاری سیستەم لە ڕێگەی گیت هاب (سەرەکی) و داتابەیسی ناوەندی
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');
const crypto = require('crypto');
const { exec } = require('child_process');

const ALLOWED_GITHUB_HOSTS = new Set([
  'raw.githubusercontent.com',
  'objects.githubusercontent.com'
]);

const ALLOWED_BINARY_EXT = /\.(jpg|jpeg|png|gif|ico)$/i;

function sha256(bufOrStr) {
  const buf = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr || ''), 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hashMatches(relPath, buf, expectedHash) {
  if (!expectedHash) return true;
  if (sha256(buf) === expectedHash) return true;
  if (!ALLOWED_BINARY_EXT.test(relPath)) {
    const lfNormalized = buf.toString('utf8').replace(/\r\n/g, '\n');
    if (sha256(lfNormalized) === expectedHash) return true;
  }
  return false;
}

function validateDownloadedContent(relPath, rawBufOrStr) {
  const isTextCode = /\.(js|html|json)$/i.test(relPath);
  if (!isTextCode) return;
  const text = Buffer.isBuffer(rawBufOrStr) ? rawBufOrStr.toString('utf8') : String(rawBufOrStr || '');
  if (relPath.endsWith('.json')) {
    JSON.parse(text);
  } else if (relPath.endsWith('.js')) {
    new vm.Script(text, { filename: relPath });
  } else if (relPath.endsWith('.html')) {
    const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(text)) !== null) {
      if (/\bsrc\s*=/i.test(match[1] || '')) continue;
      new vm.Script(match[2] || '', { filename: relPath });
    }
  }
}

const REPO_OWNER = 'nazhadqq-ctrl';
const REPO_NAME = 'Car_register';
const BRANCH = 'main';
const BASE_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

// Security: strictly allowlisted files only (db.js and preview_gomrg.html are NEVER overwritten by auto-updater)
const FILES_TO_UPDATE = [
  'version.json',
  'security.js',
  'auto-updater.js',
  'server.js',
  'package.json',
  'Update_TrafficCheck.bat',
  'Start_Silent_Print_Chrome.bat',
  'Start_Silent_Print_Edge.bat',
  'public/index.html',
  'public/login.html',
  'public/profile-avatar.jpg',
  'public/traffic-it-logo.jpg',
  'public/app-icon.png',
  'public/img/w_nawxo2.jpg',
  'verify-syntax.js'
];

const ALLOWED_UPDATE_FILES = new Set(FILES_TO_UPDATE);

function safeResolveAppPath(rawRelPath) {
  const relPath = String(rawRelPath || '').trim().replace(/\\/g, '/');
  if (!ALLOWED_UPDATE_FILES.has(relPath)) {
    throw new Error(`Blocked unauthorized update path: ${relPath}`);
  }
  const rootDir = path.resolve(__dirname);
  const targetPath = path.resolve(rootDir, relPath);
  if (targetPath !== rootDir && !targetPath.startsWith(rootDir + path.sep)) {
    throw new Error(`Blocked path traversal attempt: ${relPath}`);
  }
  return { relPath, targetPath };
}

function atomicWrite(targetPath, data) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.upd.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, targetPath);
}

function fetchUrl(url, timeoutMs = 12000, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 3) {
      return reject(new Error('Too many HTTP redirects (blocked)'));
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error('Invalid update URL'));
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_GITHUB_HOSTS.has(parsed.hostname.toLowerCase())) {
      return reject(new Error(`Blocked untrusted update host: ${parsed.hostname}`));
    }

    const headers = {
      'User-Agent': 'TrafficCheck-AutoUpdater-Desktop',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };

    const req = https.get(parsed.toString(), { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        if (!res.headers.location) return reject(new Error('Redirect without Location header'));
        const nextUrl = new URL(res.headers.location, parsed).toString();
        return fetchUrl(nextUrl, timeoutMs, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${parsed.hostname}`));
      }
      const chunks = [];
      let totalBytes = 0;
      const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB safety ceiling
      res.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_FILE_BYTES) {
          req.destroy();
          return reject(new Error('Update file exceeded maximum allowed size'));
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

function getLocalVersion() {
  try {
    const p = path.join(__dirname, 'version.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {}
  return { version: '1.2.0', build: 120, developer: 'نەژاد قادر محمد' };
}

function runCommandAsync(cmd, cwd = __dirname) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) {
        return reject({ error, stderr, stdout });
      }
      resolve(stdout.trim());
    });
  });
}

async function checkForUpdates(force = false) {
  const localVer = getLocalVersion();
  const localBuild = parseInt(localVer.build, 10) || 0;

  console.log(`🔍 وەشانی ناوخۆیی ئێستا: v${localVer.version} (Build: ${localBuild})`);

  // ═══════════════════════════════════════════════════════════════
  // METHOD 1: GITHUB RAW DOWNLOAD (PRIMARY)
  // ئەپدەیتی ڕاستەوخۆ لە ڕێپۆسیتۆری فەرمی GitHub (سەرەکی)
  // ═══════════════════════════════════════════════════════════════
  let gitHubHasUpdate = false;
  let remoteGitHubVer = null;

  try {
    const verUrl = `${BASE_RAW_URL}/version.json?t=${Date.now()}`;
    const verData = await fetchUrl(verUrl, 7000);
    remoteGitHubVer = JSON.parse(verData.toString('utf8'));
    const gitHubBuild = parseInt(remoteGitHubVer.build, 10) || 0;

    console.log(`🌐 وەشانی بەردەست لە GitHub: v${remoteGitHubVer.version} (Build: ${gitHubBuild})`);

    if (gitHubBuild > localBuild || force) {
      gitHubHasUpdate = true;
    }
  } catch (ghErr) {
    console.warn('⚠️ ناتوانرێت پەیوەندی بە GitHub بکرێت یان ئینتەرنێت نەبەستراوە:', ghErr.message);
  }

  if (gitHubHasUpdate && remoteGitHubVer) {
    console.log(`🚀 [GitHub] نوێکاری بەردەستە: v${remoteGitHubVer.version} (Build: ${remoteGitHubVer.build}) -> داگرتن و پشکنینی ئەمنی فایلەکان...`);

    // Try loading SHA-256 manifest if published for this build
    let manifestHashes = null;
    try {
      const mBuf = await fetchUrl(`${BASE_RAW_URL}/update-manifest.json?t=${Date.now()}`, 7000);
      const mObj = JSON.parse(mBuf.toString('utf8'));
      if (mObj && mObj.files && parseInt(mObj.build, 10) === parseInt(remoteGitHubVer.build, 10)) {
        manifestHashes = mObj.files;
      }
    } catch (e) {}

    const staged = [];
    const errors = [];

    for (const rawRel of FILES_TO_UPDATE) {
      try {
        const { relPath, targetPath } = safeResolveAppPath(rawRel);
        const fileUrl = `${BASE_RAW_URL}/${relPath}?t=${Date.now()}`;
        const content = await fetchUrl(fileUrl, 12000);

        if (manifestHashes && manifestHashes[relPath]) {
          if (!hashMatches(relPath, content, manifestHashes[relPath])) {
            throw new Error(`SHA-256 mismatch for ${relPath}`);
          }
        }

        // پشکنینی سینتاکسی فایل پێش نووسینەوەی بۆ ئەوەی فایلی تێکچوو بەرنامەکە نەوەستێنێت
        validateDownloadedContent(relPath, content);
        staged.push({ relPath, targetPath, content });
      } catch (err) {
        if (!String(err.message || '').includes('HTTP 404')) {
          errors.push(`${rawRel}: ${err.message}`);
        }
      }
    }

    // If GitHub failed integrity/network checks, fall through to Central Database fallback before aborting
    if (errors.length === 0) {
      const updatedFiles = [];
      for (const item of staged) {
        atomicWrite(item.targetPath, item.content);
        updatedFiles.push(item.relPath);
      }

      try {
        atomicWrite(path.join(__dirname, 'version.json'), Buffer.from(JSON.stringify(remoteGitHubVer, null, 2), 'utf8'));
      } catch (e) {}

      return {
        success: true,
        hasUpdate: true,
        source: 'github',
        previousVersion: localVer.version,
        newVersion: remoteGitHubVer.version,
        newBuild: remoteGitHubVer.build,
        updatedFiles,
        message: `سیستەمەکە بە سەرکەوتوویی و پارێزراوی لە GitHub نوێکرایەوە بۆ وەشانی (${remoteGitHubVer.version})!`
      };
    } else {
      console.warn('⚠️ [GitHub] پشکنینی ئەمنی یان داگرتن سەرکەوتوو نەبوو، هەوڵدان لە ڕێگەی داتابەیسی ناوەندی:', errors.join(' | '));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // METHOD 2: CENTRAL SQL DATABASE (FALLBACK)
  // ئەگەر ئینتەرنێت نەبوو، لە داتابەیسی ناوەندی (SQL Server) تاقی دەکاتەوە
  // ═══════════════════════════════════════════════════════════════
  try {
    let db;
    try {
      db = require('./db');
    } catch (e) {
      db = require(path.join(__dirname, 'db'));
    }

    if (db && typeof db.getPool === 'function') {
      const pool = await db.getPool();
      const vResult = await pool.request()
        .input('fn', 'version.json')
        .query('SELECT filename, content, version, build FROM Tbl_System_Updates WHERE filename = @fn');

      if (vResult.recordset && vResult.recordset.length > 0) {
        const row = vResult.recordset[0];
        const remoteBuild = parseInt(row.build, 10) || 0;
        const remoteVersion = row.version || '1.0.0';

        let remoteVerObj = null;
        try {
          remoteVerObj = JSON.parse(row.content);
        } catch (e) {
          remoteVerObj = { version: remoteVersion, build: remoteBuild, developer: 'نەژاد قادر محەمەد' };
        }

        if (remoteBuild > localBuild || force) {
          console.log(`🚀 [Database] وەشانی نوێ لە داتابەیس بەردەستە: v${remoteVersion} (Build ${remoteBuild})`);

          const allFilesResult = await pool.request()
            .query('SELECT filename, content, version, build FROM Tbl_System_Updates');

          // Extract SHA-256 manifest from DB if present for this build
          let dbManifestHashes = null;
          const manifestRow = allFilesResult.recordset.find(r => String(r.filename || '').trim() === 'update-manifest.json');
          if (manifestRow && manifestRow.content) {
            try {
              const mObj = JSON.parse(manifestRow.content);
              if (mObj && mObj.files && parseInt(mObj.build, 10) === remoteBuild) {
                dbManifestHashes = mObj.files;
              }
            } catch (e) {}
          }

          const stagedDb = [];
          const errors = [];

          for (const fileRow of allFilesResult.recordset) {
            const rawName = String(fileRow.filename || '').trim().replace(/\\/g, '/');
            if (rawName === 'update-manifest.json') continue;
            // Security: strictly skip unauthorized files (e.g. db.js, preview_gomrg.html, or any traversal path)
            if (!ALLOWED_UPDATE_FILES.has(rawName)) {
              continue;
            }
            try {
              const { relPath, targetPath } = safeResolveAppPath(rawName);
              let buf;

              if (fileRow.content && fileRow.content.startsWith('BASE64:')) {
                if (!ALLOWED_BINARY_EXT.test(relPath)) {
                  throw new Error(`Blocked BASE64 payload for non-binary file: ${relPath}`);
                }
                buf = Buffer.from(fileRow.content.slice(7), 'base64');
              } else {
                const textContent = String(fileRow.content || '');
                validateDownloadedContent(relPath, textContent);
                buf = Buffer.from(textContent, 'utf8');
              }

              if (dbManifestHashes && dbManifestHashes[relPath]) {
                if (!hashMatches(relPath, buf, dbManifestHashes[relPath])) {
                  throw new Error(`SHA-256 mismatch for ${relPath}`);
                }
              }

              stagedDb.push({ relPath, targetPath, buf });
            } catch (fErr) {
              console.error(`❌ Error verifying ${fileRow.filename}:`, fErr.message);
              errors.push(`${fileRow.filename}: ${fErr.message}`);
            }
          }

          if (errors.length > 0) {
            return {
              success: false,
              hasUpdate: false,
              source: 'database',
              errors,
              message: 'نوێکردنەوە لە داتابەیس ڕاگیرا بەهۆی هەڵەی پشکنینی ئەمنی!'
            };
          }

          const updatedFiles = [];
          for (const item of stagedDb) {
            atomicWrite(item.targetPath, item.buf);
            updatedFiles.push(item.relPath);
          }

          try {
            atomicWrite(path.join(__dirname, 'version.json'), Buffer.from(JSON.stringify(remoteVerObj, null, 2), 'utf8'));
          } catch (e) {}

          return {
            success: true,
            hasUpdate: true,
            source: 'database',
            previousVersion: localVer.version,
            newVersion: remoteVersion,
            newBuild: remoteBuild,
            updatedFiles,
            message: `سیستەمەکە بە پارێزراوی لە ڕێگەی داتابەیسی ناوەندییەوە نوێکرایەوە بۆ وەشانی (${remoteVersion})!`
          };
        }
      }
    }
  } catch (dbErr) {
    console.warn('⚠️ [Auto-Updater] Database fallback check failed:', dbErr.message);
  }

  // ═══════════════════════════════════════════════════════════════
  // METHOD 3: LOCAL GIT (FALLBACK FOR DEVELOPER PC)
  // ═══════════════════════════════════════════════════════════════
  const isGitRepo = fs.existsSync(path.join(__dirname, '.git'));
  if (isGitRepo) {
    try {
      await runCommandAsync('git fetch origin main --quiet');
      const localCommit = await runCommandAsync('git rev-parse HEAD');
      const remoteCommit = await runCommandAsync('git rev-parse origin/main');

      if (localCommit !== remoteCommit || force) {
        await runCommandAsync('git pull origin main');
        const updatedVer = getLocalVersion();
        return {
          success: true,
          hasUpdate: true,
          source: 'git',
          previousVersion: localVer.version,
          newVersion: updatedVer.version || localVer.version,
          updatedFiles: ['Git pull (سەرجەم فایلە نوێکراوەکان)'],
          message: `سیستەمەکە لە گیتەوە نوێکرایەوە بۆ وەشانی (${updatedVer.version || localVer.version})!`
        };
      }
    } catch (gitErr) {}
  }

  return {
    success: true,
    hasUpdate: false,
    source: 'none',
    currentVersion: localVer.version,
    latestVersion: remoteGitHubVer ? remoteGitHubVer.version : localVer.version,
    message: 'سیستەمەکەت نوێترین وەشانە و هیچ نوێکارییەکی نوێ بەردەست نییە.'
  };
}

if (require.main === module) {
  const isForce = process.argv.includes('--force') || process.argv.includes('-f');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   🚦 دەستەی هاتووچۆی سلێمانی - پشکنین و نوێکردنەوە لە GitHub');
  console.log('═══════════════════════════════════════════════════════════════\n');

  checkForUpdates(isForce)
    .then(res => {
      console.log('\n--------------------------------------------------');
      console.log(res.message);
      if (res.source) {
        console.log(`🌐 سەرچاوەی ئەپدەیت: [${res.source.toUpperCase()}]`);
      }
      if (res.updatedFiles && res.updatedFiles.length > 0) {
        console.log('📁 فایلە نوێکراوەکان:');
        res.updatedFiles.forEach(f => console.log('  [+] ' + f));
      }
      if (res.errors && res.errors.length > 0) {
        console.log('⚠️ هەڵەکان:');
        res.errors.forEach(e => console.log('  [!] ' + e));
      }
      console.log('--------------------------------------------------');
      process.exit(res.success ? 0 : 1);
    })
    .catch(err => {
      console.error('\n❌ کێشە لە نوێکردنەوە:', err.message || err);
      process.exit(1);
    });
}

module.exports = { checkForUpdates, getLocalVersion, FILES_TO_UPDATE };
