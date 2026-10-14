# A demo for friends from this machine: the built site, a database of its own (data\demo), payments
# off, the beta banner, sign-up by invite code, mail only in this window, and a Cloudflare Tunnel that
# gives it a public https address on your own domain. The machine must stay on while friends use it.
#
# Once (see deploy\DEMO.md): cloudflared tunnel login; cloudflared tunnel create d2m-demo;
# cloudflared tunnel route dns d2m-demo <host>. Then in .env:
#   DEMO_HOST=demo.example.fi        the address friends open
#   DEMO_INVITE_CODES=ystavat2026    what they type when they sign up (comma-separated; empty: open)
#   DEMO_MODERATORS=joose            your own username there, once you have signed up
# Run: scripts\demo.cmd   (Ctrl+C stops the site; close the tunnel's window to take it off the web)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

# the demo's settings from .env (the server reads the rest of .env itself)
$conf = @{}
if (Test-Path .env) {
  foreach ($line in Get-Content .env) {
    if ($line -match '^\s*(DEMO_[A-Z_]+)\s*=\s*(.*)$') { $conf[$Matches[1]] = $Matches[2].Trim() }
  }
}
$hostName = $conf['DEMO_HOST']
if (-not $hostName) { Write-Host 'Set DEMO_HOST in .env (e.g. DEMO_HOST=demo.example.fi), see deploy\DEMO.md.' -ForegroundColor Red; exit 1 }
$port = 5180

# the browser uploads videos straight to R2: let it from the demo's address (the same rules each time)
$env:D2M_ORIGINS = "https://$hostName"
npx tsx scripts/r2-cors.ts
Remove-Item Env:D2M_ORIGINS

Write-Host 'Building the site...'
npm run build --silent
if ($LASTEXITCODE -ne 0) { Write-Host 'The build failed.' -ForegroundColor Red; exit 1 }

# the tunnel in a window of its own (closing it takes the demo off the web)
$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) { $cloudflared = "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe" }
if (-not (Test-Path $cloudflared)) { Write-Host 'cloudflared is not installed (winget install Cloudflare.cloudflared).' -ForegroundColor Red; exit 1 }
Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', 'run', '--url', "http://localhost:$port", 'd2m-demo') -WindowStyle Normal

$env:NODE_ENV = 'production'
$env:PORT = "$port"
$env:D2M_DATA = Join-Path $root 'data\demo'
$env:D2M_PAY = 'off'
$env:D2M_BETA = '1'
$env:D2M_INVITE_CODES = $conf['DEMO_INVITE_CODES']
$env:D2M_MODERATORS = $conf['DEMO_MODERATORS']
$env:D2M_MAIL = 'console'
$env:D2M_ORIGIN = "https://$hostName"
$env:D2M_TRUST_PROXY = '1'
Remove-Item Env:D2M_DEMO -ErrorAction SilentlyContinue

Write-Host ''
Write-Host "Dear to Me demo: https://$hostName  (invite code: $($conf['DEMO_INVITE_CODES']))" -ForegroundColor Green
Write-Host 'Password reset links appear in this window. Ctrl+C stops the site.'
Write-Host ''
node --disable-warning=ExperimentalWarning --import tsx server/index.ts
