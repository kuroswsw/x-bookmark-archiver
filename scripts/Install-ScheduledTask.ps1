param(
    [int]$Minutes = 15,
    [string]$TaskName = "X Bookmark Archiver"
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$NodePath = (Get-Command node -ErrorAction Stop).Source
$CliPath = Join-Path $ProjectDir "src\cli.js"

$Action = New-ScheduledTaskAction `
    -Execute $NodePath `
    -Argument ('"{0}" run' -f $CliPath) `
    -WorkingDirectory $ProjectDir

$Trigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes $Minutes) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$Settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes ([Math]::Max(10, $Minutes)))

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Archive X bookmarks from the authenticated browser UI." `
    -Force

Write-Host "Scheduled task '$TaskName' was registered to run every $Minutes minutes."

