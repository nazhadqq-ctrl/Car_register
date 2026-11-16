/* ═══════════════════════════════════════════════════════════════
   🚦 CENTRAL DATABASE & GITHUB AUTO-UPDATER FOR TRAFFICCHECK
   نوێکردنەوەی بنەڕەتی سیستەم لە ڕێگەی داتابەیسی ناوەندی (SQL Server) و گیت هاب
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

const REPO_OWNER = 'nazhadqq-ctrl';
const REPO_NAME = 'Car_register';
const BRANCH = 'main';
const BASE_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

// ئەگەر ڕیپۆسیتۆرییەکە تایبەت (Private) بێت لە گیت هاب، دەتوانرێت Token لێرە دابنرێت
// ئەگەر ڕیپۆسیتۆرییەکە Public بێت، بەبێ Token ڕاستەوخۆ کار دەکات
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const FILES_TO_UPDATE = [
  'version.json',
  'auto-updater.js',
  'server.js',
  'db.js',
  'package.json',
  'Update_TrafficCheck.bat',
  'Start_Silent_Print_Chrome.bat',
  'Start_Silent_Print_Edge.bat',
  'public/index.html',
  'public/login.html',
  'public/preview_gomrg.html',
  'public/profile-avatar.jpg',
  'public/traffic-it-logo.jpg',
  'public/app-icon.png'
];

function fetchUrl(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const headers = {
      'User-Agent': 'TrafficCheck-AutoUpdater-Desktop',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };
    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
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

  // ═══════════════════════════════════════════════════════════════
  // METHOD 1: DIRECT UPDATE FROM CENTRAL SQL DATABASE (PRIMARY)
  // ئەپدەیتی ڕاستەوخۆ لە تەیبڵی Tbl_System_Updates لە داتابەیسی ناوەندی
  // ئەم ڕێگەیە پێویستی بە گیت هاب یان ئینتەرنێتی دەرەکی نییە
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
          console.log(`🚀 [Auto-Updater] New database version available: v${remoteVersion} (Build ${remoteBuild}) [Local: Build ${localBuild}, force=${force}]`);

          const allFilesResult = await pool.request()
            .query('SELECT filename, content, version, build FROM Tbl_System_Updates');

          const updatedFiles = [];
          const errors = [];

          for (const fileRow of allFilesResult.recordset) {
            try {
              const relPath = fileRow.filename.trim().replace(/\\/g, '/');
              const targetPath = path.join(__dirname, relPath);
              const targetDir = path.dirname(targetPath);

              if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
              }

              if (fileRow.content && fileRow.content.startsWith('BASE64:')) {
                fs.writeFileSync(targetPath, Buffer.from(fileRow.content.slice(7), 'base64'));
              } else {
                fs.writeFileSync(targetPath, fileRow.content, 'utf8');
              }
              updatedFiles.push(relPath);
            } catch (fErr) {
              console.error(`❌ Error writing ${fileRow.filename}:`, fErr.message);
              errors.push(`${fileRow.filename}: ${fErr.message}`);
            }
          }

          // Ensure local version.json is updated
          try {
            fs.writeFileSync(path.join(__dirname, 'version.json'), JSON.stringify(remoteVerObj, null, 2), 'utf8');
          } catch (e) {}

          return {
            success: errors.length === 0,
            hasUpdate: true,
            source: 'database',
            previousVersion: localVer.version,
            newVersion: remoteVersion,
            newBuild: remoteBuild,
            updatedFiles,
            errors: errors.length > 0 ? errors : undefined,
            message: `سیستەمەکە بە سەرکەوتوویی لە ڕێگەی داتابەیسی ناوەندییەوە نوێکرایەوە بۆ وەشانی (${remoteVersion})!`
          };
        } else {
          console.log(`ℹ️ [Auto-Updater] Database version (Build ${remoteBuild}) is equal or older than local (Build ${localBuild}). Checking GitHub fallback...`);
        }
      }
    }
  } catch (dbErr) {
    console.warn('⚠️ [Auto-Updater] Database check skipped or failed:', dbErr.message);
  }

  // ═══════════════════════════════════════════════════════════════
  // METHOD 2: CHECK VIA LOCAL GIT (FALLBACK FOR DEVELOPER PC)
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
          message: `سیستەمەکە بە سەرکەوتوویی لە گیتەوە نوێکرایەوە بۆ وەشانی (${updatedVer.version || localVer.version})!`
        };
      }
    } catch (gitErr) {
      console.warn('⚠️ Git pull failed:', gitErr.error || gitErr);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // METHOD 3: DIRECT HTTP DOWNLOAD FROM GITHUB
  // ═══════════════════════════════════════════════════════════════
  let remoteVer = null;
  let hasUpdate = false;

  try {
    const verData = await fetchUrl(`${BASE_RAW_URL}/version.json?t=${Date.now()}`, 6000);
    remoteVer = JSON.parse(verData.toString('utf8'));
    if (remoteVer && remoteVer.build && remoteVer.build > localBuild) {
      hasUpdate = true;
    }
  } catch (err) {
    console.warn('⚠️ [Auto-Updater] GitHub check note:', err.message);
    if (force) {
      hasUpdate = true;
      remoteVer = { version: localVer.version, build: localBuild + 1 };
    }
  }

  if (force) {
    hasUpdate = true;
    if (!remoteVer) remoteVer = localVer;
  }

  if (!hasUpdate) {
    return {
      success: true,
      hasUpdate: false,
      source: 'none',
      currentVersion: localVer.version,
      latestVersion: remoteVer ? remoteVer.version : localVer.version,
      message: 'سیستەمەکەت نوێترین وەشانە و هیچ نوێکارییەکی نوێ بەردەست نییە.'
    };
  }

  const updatedFiles = [];
  const errors = [];

  for (const relPath of FILES_TO_UPDATE) {
    try {
      const fileUrl = `${BASE_RAW_URL}/${relPath}?t=${Date.now()}`;
      const content = await fetchUrl(fileUrl, 10000);

      const localPath = path.join(__dirname, relPath);
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(localPath, content);
      updatedFiles.push(relPath);
    } catch (err) {
      if (!err.message.includes('HTTP 404')) {
        errors.push(`${relPath}: ${err.message}`);
      }
    }
  }

  if (remoteVer) {
    try {
      fs.writeFileSync(path.join(__dirname, 'version.json'), JSON.stringify(remoteVer, null, 2), 'utf8');
    } catch (e) {}
  }

  return {
    success: errors.length === 0,
    hasUpdate: true,
    source: 'github',
    previousVersion: localVer.version,
    newVersion: remoteVer ? remoteVer.version : localVer.version,
    updatedFiles,
    errors: errors.length > 0 ? errors : undefined,
    message: `سیستەمەکە بە سەرکەوتوویی لە گیت هابەوە نوێکرایەوە بۆ وەشانی (${remoteVer ? remoteVer.version : localVer.version})!`
  };
}

if (require.main === module) {
  const isForce = process.argv.includes('--force') || process.argv.includes('-f');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   🚦 دەستەی هاتووچۆی سلێمانی - پشکنین و نوێکردنەوەی خۆکار');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`🔍 پشکنینی نوێکارییەکان... (force=${isForce})`);

  checkForUpdates(isForce)
    .then(res => {
      console.log('\n--------------------------------------------------');
      console.log(res.message);
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
