# Keeps the Book App server running. Started at boot by the "Book App"
# scheduled task that setup.ps1 creates; you don't need to run it yourself.
param(
    [Parameter(Mandatory = $true)][string]$NodePath
)

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root

$dataDir = Join-Path $root 'data'
$backupDir = Join-Path $dataDir 'backups'
$log = Join-Path $dataDir 'server.log'
$errorLog = Join-Path $dataDir 'server-error.log'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

# Keep a dated copy of the book list each time the server starts (last 30).
$books = Join-Path $dataDir 'books.json'
if (Test-Path $books) {
    Copy-Item $books (Join-Path $backupDir ("books-{0:yyyy-MM-dd}.json" -f (Get-Date))) -Force
    Get-ChildItem $backupDir -Filter 'books-*.json' | Sort-Object Name -Descending |
        Select-Object -Skip 30 | Remove-Item -Force
}

while ($true) {
    # Keep the previous run's logs as *.old.
    foreach ($file in @($log, $errorLog)) {
        if (Test-Path $file) { Move-Item $file "$file.old" -Force }
    }
    $process = Start-Process -FilePath $NodePath -ArgumentList 'server.js' -WorkingDirectory $root `
        -RedirectStandardOutput $log -RedirectStandardError $errorLog -NoNewWindow -PassThru -Wait
    Add-Content $errorLog ("[{0:u}] Book App exited with code {1}; restarting in 10 seconds" -f (Get-Date), $process.ExitCode)
    Start-Sleep -Seconds 10
}
