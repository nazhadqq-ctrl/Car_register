$enc = [System.Text.Encoding]::UTF8

# ─── index.html ───────────────────────────────────────────────────────────────
$p1 = 'C:\Users\Nazha\.gemini\antigravity-ide\scratch\TrafficCheck\public\index.html'
$c1 = [System.IO.File]::ReadAllText($p1, $enc)

# Remove the CSS variable definition line
$c1 = $c1 -replace "--ku-font:\s*[^;]+;", "--ku-font: 'Speda';"
# Replace all var(--ku-font) usages
$c1 = $c1.Replace("var(--ku-font) !important", "Speda !important")
$c1 = $c1.Replace("var(--ku-font)", "Speda")
# Remove leftover Cairo/Tahoma stacks
$c1 = $c1 -replace "'Cairo',\s*Tahoma,\s*'Arial Unicode MS',\s*Arial,\s*sans-serif\s*!important", "Speda !important"
$c1 = $c1 -replace "'Cairo',\s*Tahoma,\s*'Arial Unicode MS',\s*Arial,\s*sans-serif", "Speda"
$c1 = $c1 -replace "'Cairo',\s*Tahoma,\s*Arial,\s*sans-serif\s*!important", "Speda !important"
$c1 = $c1 -replace "'Cairo',\s*Tahoma,\s*Arial,\s*sans-serif", "Speda"
$c1 = $c1 -replace "Speda,Tahoma,Arial,sans-serif", "Speda"
# Remove Google Fonts import (no longer needed as fallback)
$c1 = $c1 -replace '<link[^>]*googleapis[^>]*>\s*', ''

[System.IO.File]::WriteAllText($p1, $c1, $enc)
Write-Host "index.html done"

# ─── login.html ───────────────────────────────────────────────────────────────
$p2 = 'C:\Users\Nazha\.gemini\antigravity-ide\scratch\TrafficCheck\public\login.html'
$c2 = [System.IO.File]::ReadAllText($p2, $enc)

# Remove CSS variable
$c2 = $c2 -replace "--ku-font:\s*[^;]+;", "--ku-font: 'Speda';"
$c2 = $c2.Replace("var(--ku-font) !important", "Speda !important")
$c2 = $c2.Replace("var(--ku-font)", "Speda")
# Remove all leftover font stacks
$c2 = $c2 -replace "'Cairo',\s*Tahoma,\s*'Arial Unicode MS',\s*Arial,\s*sans-serif\s*!important", "Speda !important"
$c2 = $c2 -replace "'Cairo',\s*Tahoma,\s*'Arial Unicode MS',\s*Arial,\s*sans-serif", "Speda"
$c2 = $c2 -replace "'Cairo',\s*Tahoma,\s*Arial,\s*sans-serif\s*!important", "Speda !important"
$c2 = $c2 -replace "'Cairo',\s*Tahoma,\s*Arial,\s*sans-serif", "Speda"
$c2 = $c2 -replace "Speda,Tahoma,Arial,sans-serif", "Speda"
# Remove Google Fonts import
$c2 = $c2 -replace "@import url\('[^']*googleapis[^']*'\);\s*", ''
$c2 = $c2 -replace '<link[^>]*googleapis[^>]*>\s*', ''

[System.IO.File]::WriteAllText($p2, $c2, $enc)
Write-Host "login.html done"
