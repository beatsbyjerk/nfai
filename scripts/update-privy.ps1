param(
  [string]$Cookie
)

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$envPath = Join-Path $root '.env'

if (-not (Test-Path $envPath)) {
  New-Item -ItemType File -Path $envPath | Out-Null
}

$cookieValue = $Cookie
if ([string]::IsNullOrWhiteSpace($cookieValue)) {
  $cookieValue = Read-Host 'Paste PRIVY_COOKIES value'
}

$cookieValue = $cookieValue.Trim()
if ($cookieValue.StartsWith('PRIVY_COOKIES=')) {
  $cookieValue = $cookieValue.Substring('PRIVY_COOKIES='.Length)
}
if (($cookieValue.StartsWith("'") -and $cookieValue.EndsWith("'")) -or ($cookieValue.StartsWith('"') -and $cookieValue.EndsWith('"'))) {
  $cookieValue = $cookieValue.Substring(1, $cookieValue.Length - 2).Trim()
}

$lines = Get-Content $envPath
$lines = $lines | Where-Object { $_ -notmatch '^\s*PRIVY_COOKIES\s*=' }
$lines += "PRIVY_COOKIES=$cookieValue"

Set-Content -Path $envPath -Value $lines -Encoding UTF8
Write-Host 'Updated PRIVY_COOKIES in .env.'
