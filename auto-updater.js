/* ═══════════════════════════════════════════════════════════════
   🚦 AUTOMATIC GITHUB UPDATER FOR TRAFFICCHECK DESKTOP CLIENTS
   Fetches and applies the latest updates directly from GitHub
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

const REPO_OWNER = 'nazhadqq-ctrl';
const REPO_NAME = 'Car_register';
const BRANCH = 'main';
const BASE_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;

const FILES_TO_UPDATE = [
  'version.json',
  'auto-updater.js',
  'server.js',
  'db.js',
  'public/index.html',
  'public/login.html',
  'public/preview_gomrg.html'
];

function fetchUrl(url, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'TrafficCheck-AutoUpdater',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
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
      reject(new Error(`Request timed out`));
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
  let remoteVer = null;
  let hasUpdate = false;

  // ─── METHOD 1: CHECK VIA GIT IF GIT REPOSITORY IS AVAILABLE ─────
  const isGitRepo = fs.existsSync(path.join(__dirname, '.git'));
  if (isGitRepo) {
    try {
      await runCommandAsync('git fetch origin main --quiet');
      const localCommit = await runCommandAsync('git rev-parse HEAD');
      const remoteCommit = await runCommandAsync('git rev-parse origin/main');

      if (localCommit !== remoteCommit || force) {
        hasUpdate = true;
        // Perform git pull to update all tracked files
        await runCommandAsync('git pull origin main');
        const updatedVer = getLocalVersion();
        return {
          success: true,
          hasUpdate: true,
          previousVersion: localVer.version,
          newVersion: updatedVer.version || localVer.version,
          updatedFiles: ['Git pull (سەرجەم فایلە نوێکراوەکان)'],
          message: `سیستەمەکە بە سەرکەوتوویی لە گیت هابەوە نوێکرایەوە بۆ وەشانی (${updatedVer.version || localVer.version})!`
        };
      } else {
        return {
          success: true,
          hasUpdate: false,
          currentVersion: localVer.version,
          latestVersion: localVer.version,
          message: 'سیستەمەکەت نوێترین وەشانە.'
        };
      }
    } catch (gitErr) {
      console.warn('Git update attempt failed, falling back to direct raw HTTP download:', gitErr.error || gitErr);
      // Fall through to Method 2 (HTTP download)
    }
  }

  // ─── METHOD 2: DIRECT HTTP DOWNLOAD FROM GITHUB RAW ───────────────
  try {
    const verData = await fetchUrl(`${BASE_RAW_URL}/version.json?t=${Date.now()}`, 6000);
    remoteVer = JSON.parse(verData.toString('utf8'));
    if (remoteVer.build && remoteVer.build > (localVer.build || 0)) {
      hasUpdate = true;
    }
  } catch (err) {
    if (force) {
      hasUpdate = true;
      remoteVer = { version: localVer.version, build: (localVer.build || 120) + 1 };
    } else {
      return {
        success: true,
        hasUpdate: false,
        currentVersion: localVer.version,
        latestVersion: localVer.version,
        message: 'سیستەمەکەت نوێترین وەشانە.'
      };
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
      currentVersion: localVer.version,
      latestVersion: remoteVer ? remoteVer.version : localVer.version,
      message: 'سیستەمەکەت نوێترین وەشانە.'
    };
  }

  // Perform HTTP download for each file
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
    previousVersion: localVer.version,
    newVersion: remoteVer ? remoteVer.version : localVer.version,
    updatedFiles,
    errors: errors.length > 0 ? errors : undefined,
    message: `سیستەمەکە بە سەرکەوتوویی نوێکرایەوە بۆ وەشانی (${remoteVer ? remoteVer.version : localVer.version})!`
  };
}

module.exports = { checkForUpdates, getLocalVersion };
