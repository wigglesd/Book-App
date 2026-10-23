# One-time setup for running Book App on this Windows PC.
# Run from an *administrator* PowerShell window, inside the Book-App folder:
#
#   powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
#
# Safe to run again later (for example after `git pull`) to update.

$ErrorActionPreference = 'Stop'
$TaskName = 'Book App'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Ask-YesNo($question) {
    $answer = Read-Host "$question [Y/n]"
    return ($answer -eq '' -or $answer -match '^[Yy]')
}
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host 'Please run this from an administrator PowerShell window (right-click PowerShell > Run as administrator).' -ForegroundColor Red
    exit 1
}

# ---- Node.js ----------------------------------------------------------------
Step 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    if (-not (Ask-YesNo 'Node.js is not installed. Install it now with winget?')) { exit 1 }
    winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
    Refresh-Path
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { Write-Host 'Node.js installed; close this window, open a new administrator PowerShell and run setup again.'; exit 1 }
}
$nodePath = $node.Source
$version = [version]((& $nodePath --version).TrimStart('v'))
if ($version -lt [version]'20.12.0') {
    Write-Host "Node.js $version is too old; version 20.12 or newer is needed. Run: winget upgrade OpenJS.NodeJS.LTS" -ForegroundColor Red
    exit 1
}
Write-Host "Using Node.js $version at $nodePath"

# ---- Stop a running copy before updating --------------------------------------
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Step 'Stopping the running Book App'
    Stop-ScheduledTask -TaskName $TaskName
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -like '*server.js*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

# ---- Dependencies -------------------------------------------------------------
Step 'Installing app dependencies'
$npm = Join-Path (Split-Path $nodePath) 'npm.cmd'
& $npm ci --omit=dev
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

# ---- Settings -------------------------------------------------------------------
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
    Step 'Keeping existing settings in .env'
} else {
    Step 'Settings'
    $name = Read-Host 'Your first name, shown on the public page (e.g. David)'
    while ($true) {
        $secure = Read-Host 'Choose an owner password (12+ characters; used to edit your lists)' -AsSecureString
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
        if ($password.Length -lt 12) { Write-Host 'Please use at least 12 characters.' -ForegroundColor Yellow; continue }
        if ($password.Contains("'") -or $name.Contains("'")) { Write-Host "Please avoid the ' character." -ForegroundColor Yellow; continue }
        $confirm = Read-Host 'Type it again' -AsSecureString
        $again = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirm))
        if ($password -ne $again) { Write-Host 'Passwords did not match.' -ForegroundColor Yellow; continue }
        break
    }
    $lines = @(
        "OWNER_PASSWORD='$password'",
        "OWNER_NAME='$name'",
        'PORT=3000'
    )
    # UTF-8 without a byte-order mark, which Node's .env reader expects.
    [IO.File]::WriteAllText($envFile, ($lines -join "`r`n") + "`r`n")
    # Only administrators and SYSTEM may read the password file.
    icacls $envFile /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null
    Write-Host 'Saved settings to .env'
}
$port = 3000
$portLine = Get-Content $envFile | Where-Object { $_ -match '^\s*PORT\s*=\s*(\d+)' } | Select-Object -First 1
if ($portLine -match '(\d+)') { $port = [int]$Matches[1] }

# ---- Scheduled task: start at boot, keep running -----------------------------------
Step 'Registering the "Book App" task to start with Windows'
$runScript = Join-Path $PSScriptRoot 'run.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $root `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runScript`" -NodePath `"$nodePath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Description 'Runs the Book App web server' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host 'Waiting for the app to start...'
$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
    Start-Sleep -Seconds 1
    try { Invoke-RestMethod "http://localhost:$port/api/session" | Out-Null; $ok = $true } catch { }
}
if (-not $ok) {
    Write-Host "The app did not start. Check the logs in $root\data (server.log and server-error.log)" -ForegroundColor Red
    exit 1
}
Write-Host "Book App is running at http://localhost:$port" -ForegroundColor Green

# ---- Stop the PC sleeping ------------------------------------------------------------
Step 'Power settings'
Write-Host 'Other people can only reach your lists while this PC is awake.'
if (Ask-YesNo 'Stop this PC going to sleep while plugged in?') {
    powercfg /change standby-timeout-ac 0
    powercfg /change hibernate-timeout-ac 0
    Write-Host 'Sleep disabled while on mains power (the screen can still turn off).'
}

# ---- Tailscale Funnel: public HTTPS address -------------------------------------------
Step 'Public HTTPS address (Tailscale Funnel)'
$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $tailscale -and (Test-Path 'C:\Program Files\Tailscale\tailscale.exe')) {
    $tailscale = Get-Command 'C:\Program Files\Tailscale\tailscale.exe'
}
if (-not $tailscale) {
    if (-not (Ask-YesNo 'Tailscale is not installed. Install it now with winget?')) {
        Write-Host 'Skipping. The app works on this PC only until Tailscale is set up; run setup again later.'
        exit 0
    }
    winget install --id Tailscale.Tailscale --exact --accept-source-agreements --accept-package-agreements
    Refresh-Path
    $tailscale = Get-Command 'C:\Program Files\Tailscale\tailscale.exe' -ErrorAction SilentlyContinue
    if (-not $tailscale) { Write-Host 'Tailscale installed; run setup again to finish.'; exit 0 }
}
$ts = $tailscale.Source

& $ts status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Sign in to Tailscale: a browser window will open. Create a free account if you do not have one.'
    & $ts up
    if ($LASTEXITCODE -ne 0) { Write-Host 'Tailscale sign-in did not finish; run setup again.' -ForegroundColor Red; exit 1 }
}

# Keep Tailscale connected even when nobody is logged in to Windows.
& $ts set --unattended=true *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Turn on "Run unattended" in the Tailscale tray menu (Preferences) so it stays on after you sign out.' -ForegroundColor Yellow
}

Write-Host 'Turning on Funnel. If Tailscale prints a link, open it, approve, and the command will continue.'
& $ts funnel --bg $port
if ($LASTEXITCODE -ne 0) { Write-Host 'Funnel was not enabled; run setup again after approving it.' -ForegroundColor Red; exit 1 }

$dns = $null
try { $dns = ((& $ts status --json | Out-String | ConvertFrom-Json).Self.DNSName).TrimEnd('.') } catch { }
Write-Host ''
if ($dns) {
    Write-Host "All done! Your Book App is at:" -ForegroundColor Green
    Write-Host "  Your page:    https://$dns/"
    Write-Host "  Share this:   https://$dns/share.html"
} else {
    & $ts funnel status
}
Write-Host 'The address can take a minute or two to start working the first time.'
