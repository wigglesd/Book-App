# Stops Book App, removes its startup task and turns off the public address.
# Your book list (data\books.json) is left in place.
# Run from an administrator PowerShell window.

$TaskName = 'Book App'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -like '*server.js*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

$ts = 'C:\Program Files\Tailscale\tailscale.exe'
if (Test-Path $ts) { & $ts funnel reset }
Write-Host 'Book App stopped and removed. Your data folder was kept.'
