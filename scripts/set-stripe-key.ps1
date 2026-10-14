# Asks for the Stripe secret key (hidden as you paste it) and writes it into .env, nowhere else.
$envFile = Join-Path $PSScriptRoot '..\.env'
$secure = Read-Host 'Liitä Stripen salainen avain (sk_live_... tai sk_test_...) ja paina Enter' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($key -notmatch '^(sk|rk)_(live|test)_') {
  Write-Host 'Tämä ei näytä Stripen salaiselta avaimelta. Mitään ei tallennettu.' -ForegroundColor Red
} else {
  if ($key -match '_live_') { Write-Host 'Live-avain: maksut ovat oikeita.' -ForegroundColor Yellow }
  $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^STRIPE_SECRET_KEY=' })
  $lines += "STRIPE_SECRET_KEY=$key"
  Set-Content -Path $envFile -Value $lines -Encoding ascii
  Write-Host 'Tallennettu D2M\.env -tiedostoon.' -ForegroundColor Green
}
Read-Host 'Paina Enter sulkeaksesi'
