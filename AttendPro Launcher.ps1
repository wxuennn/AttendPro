$ErrorActionPreference = "SilentlyContinue"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

$port = 4173
$localUrl = "http://127.0.0.1:$port"
$cloudflared = Join-Path $projectDir "cloudflared.exe"
$serverLog = Join-Path $projectDir "attendpro-server.log"
$serverErr = Join-Path $projectDir "attendpro-server-error.log"
$tunnelLog = Join-Path $projectDir "attendpro-public-link.log"
$tunnelErr = Join-Path $projectDir "attendpro-public-link-error.log"
$linkFile = Join-Path $projectDir "AttendPro Public Website.url"
$htmlFile = Join-Path $projectDir "AttendPro Public Website.html"

function Show-Message($message, $title = "AttendPro") {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($message, $title, "OK", "Information") | Out-Null
}

function Test-ServerReady {
  try {
    $response = Invoke-WebRequest -Uri "$localUrl/" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

$nodeCandidates = @(
  "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  "C:\Users\User\AppData\Local\OpenAI\Codex\bin\node.exe",
  "node"
)
$node = $nodeCandidates | Where-Object {
  if ($_ -eq "node") { return [bool](Get-Command node -ErrorAction SilentlyContinue) }
  Test-Path -LiteralPath $_
} | Select-Object -First 1

if (-not $node) {
  Show-Message "Node.js was not found. AttendPro cannot start on this computer."
  exit 1
}

if (-not (Test-Path -LiteralPath $cloudflared)) {
  Show-Message "cloudflared.exe was not found in the AttendPro folder. The public phone link cannot be created."
  exit 1
}

if (-not (Test-ServerReady)) {
  Remove-Item -LiteralPath $serverLog, $serverErr -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $serverLog -RedirectStandardError $serverErr | Out-Null
  $ready = $false
  for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ServerReady) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    Show-Message "AttendPro server could not start. Check attendpro-server-error.log in the project folder."
    exit 1
  }
}

Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -and ($_.Path -ieq $cloudflared)
} | Stop-Process -Force -ErrorAction SilentlyContinue

Remove-Item -LiteralPath $tunnelLog, $tunnelErr, $linkFile, $htmlFile -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $cloudflared -ArgumentList "tunnel --url $localUrl --loglevel info" -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput $tunnelLog -RedirectStandardError $tunnelErr | Out-Null

$publicUrl = ""
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  $text = ""
  if (Test-Path -LiteralPath $tunnelLog) { $text += Get-Content -Raw -LiteralPath $tunnelLog }
  if (Test-Path -LiteralPath $tunnelErr) { $text += Get-Content -Raw -LiteralPath $tunnelErr }
  $match = [regex]::Match($text, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
  if ($match.Success) {
    $publicUrl = $match.Value
    break
  }
}

if (-not $publicUrl) {
  Show-Message "Public link could not be created. Check attendpro-public-link-error.log in the project folder."
  exit 1
}

$freshUrl = "$publicUrl/?fresh=1"
@"
[InternetShortcut]
URL=$freshUrl
"@ | Set-Content -LiteralPath $linkFile -Encoding ASCII

@"
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AttendPro Public Website</title>
  <style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f8fa;color:#172026}
    main{width:min(620px,calc(100% - 32px));background:white;border:1px solid #d9e4e8;border-radius:8px;padding:24px;box-shadow:0 18px 44px rgba(20,35,42,.12)}
    h1{margin:0 0 10px;font-size:24px}.link{display:block;margin:16px 0;padding:14px;border-radius:8px;background:#0f766e;color:white;text-decoration:none;font-weight:800;text-align:center;overflow-wrap:anywhere}
    p{color:#65747c;line-height:1.6}code{display:block;padding:12px;background:#eef7f6;border-radius:8px;overflow-wrap:anywhere}
  </style>
</head>
<body>
  <main>
    <h1>AttendPro Public Website</h1>
    <p>Use this same HTTPS link on computer, phone, employee QR scan, and QR display.</p>
    <a class="link" href="$freshUrl">Open AttendPro</a>
    <code>$freshUrl</code>
    <p>Keep this computer running. To close the website, open <strong>Stop AttendPro Server.vbs</strong>.</p>
  </main>
</body>
</html>
"@ | Set-Content -LiteralPath $htmlFile -Encoding UTF8

Start-Process $freshUrl
