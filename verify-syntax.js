/* ═══════════════════════════════════════════════════════════════
   🛡️ TRAFFICCHECK AUTOMATED SYNTAX & UI INTEGRITY VALIDATOR
   پشکنەری خۆکاری کۆد و فۆرمەکان بۆ بنەبڕکردنی کێشەی ئیش نەکردنی دوگمەکان
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_FILES = [
    'security.js',
    'server.js',
    'db.js',
    'auto-updater.js',
    'publish-update.js'
];

const HTML_FILES = [
    'public/index.html',
    'public/login.html',
    'public/preview_gomrg.html'
];

const REQUIRED_INDEX_FUNCTIONS = [
    'openRegisterModal',
    'openGomrgModal',
    'openRaportPage',
    'openHijzAddModal',
    'openAdvSearchModal',
    'openSystemUpdateModal',
    'openOverlay',
    'closeOverlay',
    'switchTab',
    'dfSearchCar',
    'onBarcodeVAChange',
    'onBarcodeVAInput',
    'populateRegistrationFields',
    'dfResetNew',
    'init'
];

function verifyJsFile(relPath) {
    const fullPath = path.join(__dirname, relPath);
    if (!fs.existsSync(fullPath)) return { ok: true, skipped: true };

    const code = fs.readFileSync(fullPath, 'utf8');
    try {
        new vm.Script(code, { filename: relPath });
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            file: relPath,
            error: err.message,
            stack: err.stack
        };
    }
}

function verifyHtmlFile(relPath) {
    const fullPath = path.join(__dirname, relPath);
    if (!fs.existsSync(fullPath)) return { ok: true, skipped: true };

    const html = fs.readFileSync(fullPath, 'utf8');
    const errors = [];

    // 1. Validate all inline <script> blocks (checking ONLY opening tag attributes for src=)
    const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptCount = 0;
    let combinedIndexScript = '';

    while ((match = scriptRegex.exec(html)) !== null) {
        const attrs = match[1] || '';
        const code = match[2] || '';
        if (/\bsrc\s*=/i.test(attrs)) continue;

        scriptCount++;
        const prefix = html.slice(0, match.index);
        const startLine = prefix.split('\n').length;
        // Pad newlines so vm.Script reports the exact line number in the HTML file!
        const paddedCode = '\n'.repeat(startLine - 1) + code;

        try {
            new vm.Script(paddedCode, { filename: `${relPath} (script #${scriptCount})` });
            combinedIndexScript += '\n' + code;
        } catch (err) {
            errors.push({
                file: relPath,
                type: `Inline <script> #${scriptCount} SyntaxError`,
                error: err.message,
                stack: (err.stack || '').split('\n').slice(0, 6).join('\n')
            });
        }
    }

    // 2. Validate inline event handlers (onclick, onchange, oninput, onkeydown, onpaste, onsubmit)
    // Only scan outside <script>...</script> blocks
    const htmlWithoutScripts = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, m => '\n'.repeat(m.split('\n').length - 1));
    const eventAttrRegex = /\b(onclick|onchange|oninput|onkeydown|onkeyup|onpaste|onsubmit)\s*=\s*"([^"]*)"/gi;
    let evMatch;
    while ((evMatch = eventAttrRegex.exec(htmlWithoutScripts)) !== null) {
        const attrName = evMatch[1];
        const handlerCode = evMatch[2]
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
        const lineNum = htmlWithoutScripts.slice(0, evMatch.index).split('\n').length;
        try {
            // Wrap inside function body so 'return' and 'event' are valid
            new vm.Script(`(function(event){ ${handlerCode} })`, { filename: `${relPath}:${lineNum} (${attrName})` });
        } catch (err) {
            errors.push({
                file: `${relPath}:${lineNum}`,
                type: `HTML attribute ${attrName} SyntaxError`,
                error: err.message,
                code: handlerCode
            });
        }
    }

    // 3. For public/index.html, verify all required UI functions exist and no missing DOM IDs are accessed directly
    if (relPath === 'public/index.html') {
        if (scriptCount === 0) {
            errors.push({
                file: relPath,
                type: 'Missing <script>',
                error: 'No inline <script> block found in public/index.html!'
            });
        }

        for (const fnName of REQUIRED_INDEX_FUNCTIONS) {
            const fnRegex = new RegExp(`(?:async\\s+)?function\\s+${fnName}\\s*\\(`);
            if (!fnRegex.test(combinedIndexScript)) {
                errors.push({
                    file: relPath,
                    type: 'Missing Required Function',
                    error: `Function "${fnName}" is missing from public/index.html!`
                });
            }
        }

        // Check direct document.getElementById('...').addEventListener / property accesses
        const directAccessRegex = /document\.getElementById\(['"]([^'"]+)['"]\)\.(addEventListener|style|value|textContent|innerHTML|classList)/g;
        let domMatch;
        while ((domMatch = directAccessRegex.exec(combinedIndexScript)) !== null) {
            const id = domMatch[1];
            if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
                errors.push({
                    file: relPath,
                    type: 'Null DOM Access Risk',
                    error: `Direct access to document.getElementById('${id}').${domMatch[2]} — element id="${id}" does not exist in HTML!`
                });
            }
        }
    }

    return {
        ok: errors.length === 0,
        scriptCount,
        errors
    };
}

function verifyAll(silent = false) {
    const allErrors = [];

    if (!silent) {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('   🛡️ پشکنینی خۆکاری کۆد و فۆرمەکانی سیستەم (Syntax Validator)');
        console.log('═══════════════════════════════════════════════════════════════');
    }

    for (const jsFile of JS_FILES) {
        const res = verifyJsFile(jsFile);
        if (res.skipped) continue;
        if (res.ok) {
            if (!silent) console.log(`  ✅ [JS OK]   ${jsFile}`);
        } else {
            allErrors.push(res);
            console.error(`  ❌ [JS FAIL] ${jsFile}: ${res.error}`);
            if (res.stack) console.error(res.stack);
        }
    }

    for (const htmlFile of HTML_FILES) {
        const res = verifyHtmlFile(htmlFile);
        if (res.skipped) continue;
        if (res.ok) {
            if (!silent) console.log(`  ✅ [HTML OK] ${htmlFile} (${res.scriptCount} script block(s) + all event handlers verified)`);
        } else {
            for (const err of res.errors) {
                allErrors.push(err);
                console.error(`  ❌ [HTML FAIL] ${err.file} [${err.type}]: ${err.error}`);
                if (err.stack) console.error(err.stack);
                if (err.code) console.error(`     Code: ${err.code}`);
            }
        }
    }

    if (allErrors.length > 0) {
        console.error('\n⛔ پشکنین شکستی هێنا! تکایە هەڵەکان چاک بکە پێش بڵاوکردنەوە.');
        return { ok: false, errors: allErrors };
    }

    if (!silent) {
        console.log('\n🎉 هەموو فایلەکان 100% دروستن و هیچ هەڵەیەکی سینتاکس نییە!\n');
    }
    return { ok: true, errors: [] };
}

if (require.main === module) {
    const result = verifyAll(false);
    process.exit(result.ok ? 0 : 1);
}

module.exports = { verifyAll, verifyJsFile, verifyHtmlFile };
