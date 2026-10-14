# Asks for the Cloudflare R2 API token's two keys (hidden as you paste them) and writes them into .env, nowhere else.
$envFile = Join-Path $PSScriptRoot '..\.env'
function Ask($prompt) {
  $secure = Read-Host $prompt -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
}
Write-Host 'Cloudflare: R2 > Manage API tokens > Create API token (Object Read & Write, bucket deartome).'
Write-Host 'Luomisen jälkeen sivulla näkyvät Access Key ID ja Secret Access Key.'
$id = Ask 'Liitä Access Key ID ja paina Enter'
$secret = Ask 'Liitä Secret Access Key ja paina Enter'
if ($id.Length -ne 32 -or $secret.Length -ne 64) {
  Write-Host "Avaimet eivät näytä R2-avaimilta (Access Key ID on 32 merkkiä, nyt $($id.Length); Secret 64 merkkiä, nyt $($secret.Length)). Mitään ei tallennettu." -ForegroundColor Red
} else {
  $lines = @(Get-Content $envFile | Where-Object { $_ -notmatch '^R2_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=' })
  $lines += "R2_ACCESS_KEY_ID=$id"
  $lines += "R2_SECRET_ACCESS_KEY=$secret"
  Set-Content -Path $envFile -Value $lines -Encoding ascii
  Write-Host 'Tallennettu D2M\.env -tiedostoon.' -ForegroundColor Green
}
Read-Host 'Paina Enter sulkeaksesi'
