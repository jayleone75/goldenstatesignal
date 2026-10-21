<#
    Installs (or re-installs) the Windows scheduled task that publishes this
    site every morning: "Golden State Signal site publish".

    The task existed before this script and was built by hand, with no log
    and a 15-minute limit. On Oct 20, 2026 its 07:30 run was killed at that
    limit (the laptop was in Modern Standby), and the Oct 19 run left no
    trace at all: nothing fetched, nothing pushed, Monday's rebuilt
    department pages sat unpublished until a hand run. So the task now:
      - writes everything publish.ps1 prints to logs\site-publish.log in
        the data project, with a timestamp per run;
      - gets 45 minutes, not 15, and retries three times, 15 minutes apart;
      - waits for a network connection before starting.

    Usage:
      .\install-publish-task.ps1              daily at 07:30
      .\install-publish-task.ps1 -At 08:00
      .\install-publish-task.ps1 -Remove
#>
[CmdletBinding()]
param(
    [switch]$Remove,
    [string]$At = '07:30'
)

$ErrorActionPreference = 'Stop'
$taskName = 'Golden State Signal site publish'
$script   = Join-Path $PSScriptRoot 'publish.ps1'
$log      = Join-Path (Split-Path $PSScriptRoot -Parent) 'ca-procurement-intel\logs\site-publish.log'

if ($Remove) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host "Removed scheduled task '$taskName'."
    } else {
        Write-Host "No scheduled task named '$taskName' to remove."
    }
    return
}

if (-not (Test-Path $script)) { throw "Cannot find $script" }

# -Command rather than -File so the output can be appended to the log; the
# first line stamps the run so a silent failure still leaves a trace.
# Out-File with utf8 rather than *>> (which writes UTF-16 in Windows
# PowerShell), and the script's exit code is passed back out so Task
# Scheduler records a refused or failed publish as a failure and retries.
$command = "`$ErrorActionPreference='Continue'; " +
           "Add-Content -Path '$log' -Encoding utf8 -Value ('--- site publish started ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ---'); " +
           "& '$script' -Yes *>&1 | Out-File -FilePath '$log' -Append -Encoding utf8; " +
           "`$code = `$LASTEXITCODE; " +
           "Add-Content -Path '$log' -Encoding utf8 -Value ('--- exit ' + `$code + ' ' + (Get-Date -Format 'HH:mm:ss') + ' ---'); " +
           "exit `$code"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "' + $command + '"') `
    -WorkingDirectory $PSScriptRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 45) `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description "Daily publish of goldenstatesignal.com from the data project's generated pages (publish.ps1 -Yes)." `
    -Force | Out-Null

Write-Host "Installed '$taskName'."
Write-Host "  Runs daily at $At  |  Log: $log"
Write-Host ""
Write-Host "Run it now without waiting:"
Write-Host "  Start-ScheduledTask -TaskName '$taskName'"
