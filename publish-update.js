/**
 * ════════════════════════════════════════════════════════════════════════
 * 🚀 TRAFFIC CHECK - DIRECT DATABASE UPDATE PUBLISHER
 * بڵاوکردنەوەی نوێکارییەکان ڕاستەوخۆ بۆ ناو داتابەیس (Tbl_System_Updates)
 * ════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sql, config190 } = require('./db');
const { verifyAll } = require('./verify-syntax');
const sha256Buffer = (bufOrStr) => crypto.createHash('sha256').update(Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr || ''), 'utf8')).digest('hex');

const config = {
    ...config190,
    options: {
        ...config190.options,
        connectTimeout: 20000,
        requestTimeout: 60000
    }
};

// Security: db.js and public/preview_gomrg.html are NEVER distributed via auto-update!
const FILES_TO_PUBLISH = [
    'version.json',
    'security.js',
    'server.js',
    'auto-updater.js',
    'package.json',
    'public/index.html',
    'public/login.html',
    'public/profile-avatar.jpg',
    'public/traffic-it-logo.jpg',
    'public/app-icon.png',
    'Update_TrafficCheck.bat',
    'Start_Silent_Print_Chrome.bat',
    'Start_Silent_Print_Edge.bat',
    'verify-syntax.js'
];

async function publish() {
    const syntaxCheck = verifyAll(false);
    if (!syntaxCheck.ok) {
        console.error('❌ بڵاوکردنەوە ڕاگیرا! تکایە هەڵەی سینتاکس لە فایلەکاندا چاک بکە پێش بڵاوکردنەوە.');
        process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   بڵاوکردنەوەی وەشانی نوێی سیستەم بۆ ناو داتابەیس (SQL Server)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const vPath = path.join(__dirname, 'version.json');
    if (!fs.existsSync(vPath)) {
        console.error('❌ فایلی version.json نەدۆزرایەوە!');
        process.exit(1);
    }

    const versionData = JSON.parse(fs.readFileSync(vPath, 'utf8'));
    const version = versionData.version || '1.0.0';
    const build = parseInt(versionData.build || 100, 10);

    console.log(`📦 وەشان: v${version} (Build: ${build})`);
    console.log(`👤 گەشەپێدەر: ${versionData.developer || 'نەژاد قادر'}`);
    console.log(`📝 تێبینی: ${versionData.description || '-'}\n`);

    console.log('⏳ پەیوەندیکردن بە داتابەیسی ناوەندی...');
    let pool;
    try {
        pool = await sql.connect(config);
        console.log('✅ بە سەرکەوتوویی پەیوەندی بە داتابەیسەوە بەسترا.\n');
    } catch (err) {
        console.error('❌ کێشەی پەیوەستبوون بە داتابەیس:', err.message);
        process.exit(1);
    }

    // Build SHA-256 integrity manifest for all published files
    const manifest = {
        version,
        build,
        generatedAt: new Date().toISOString(),
        files: {}
    };

    const prepared = [];
    for (const relFile of FILES_TO_PUBLISH) {
        const fullPath = path.join(__dirname, relFile);
        if (!fs.existsSync(fullPath)) {
            console.warn(`⚠️ فایلی ${relFile} نەدۆزرایەوە، پەڕینەوە...`);
            continue;
        }

        const isBinary = /\.(jpg|jpeg|png|gif|ico|ttf|woff|woff2|eot|pdf)$/i.test(relFile);
        let content;
        let sizeKb;
        let hash;
        if (isBinary) {
            const buf = fs.readFileSync(fullPath);
            hash = sha256Buffer(buf);
            content = 'BASE64:' + buf.toString('base64');
            sizeKb = (buf.length / 1024).toFixed(1);
        } else {
            const buf = fs.readFileSync(fullPath);
            hash = sha256Buffer(buf);
            content = buf.toString('utf8');
            sizeKb = (buf.length / 1024).toFixed(1);
        }
        manifest.files[relFile] = hash;
        prepared.push({ relFile, content, sizeKb });
    }

    // Save local update-manifest.json and also publish it to SQL Server
    const manifestJson = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(path.join(__dirname, 'update-manifest.json'), manifestJson, 'utf8');
    prepared.push({
        relFile: 'update-manifest.json',
        content: manifestJson,
        sizeKb: (Buffer.byteLength(manifestJson, 'utf8') / 1024).toFixed(1)
    });

    let successCount = 0;
    for (const item of prepared) {
        try {
            await pool.request()
                .input('filename', sql.NVarChar, item.relFile)
                .input('content', sql.NVarChar, item.content)
                .input('version', sql.NVarChar, version)
                .input('build', sql.Int, build)
                .query(`
                    MERGE Tbl_System_Updates AS target
                    USING (SELECT @filename AS filename) AS source
                    ON (target.filename = source.filename)
                    WHEN MATCHED THEN
                        UPDATE SET content = @content, version = @version, build = @build, updated_at = GETDATE()
                    WHEN NOT MATCHED THEN
                        INSERT (filename, content, version, build, updated_at)
                        VALUES (@filename, @content, @version, @build, GETDATE());
                `);

            console.log(`  [OK] ${item.relFile.padEnd(30)} (${item.sizeKb} KB) -> بڵاوکرایەوە`);
            successCount++;
        } catch (err) {
            console.error(`  [!] هەڵە لە بڵاوکردنەوەی ${item.relFile}:`, err.message);
        }
    }

    console.log(`\n🎉 سەرکەوتوو بوو: (${successCount} لە کۆی ${prepared.length}) فایل (لەگەڵ SHA-256 manifest) لە داتابەیس پاشەکەوت کران.`);
    console.log(`✨ ئێستا هەموو کۆمپیوتەرەکانی یوزەرەکان دەتوانن ڕاستەوخۆ بەبێ پێویستی بە گیت هاب و سێتەپ ئەم نوێکارییە وەربگرن.`);
    process.exit(0);
}

if (require.main === module) {
    publish().catch(err => {
        console.error('Unhandled error:', err);
        process.exit(1);
    });
}

module.exports = { publish };
