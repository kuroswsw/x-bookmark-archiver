param(
    [ValidateSet("setup", "run", "doctor")]
    [string]$Command = "run"
)

$ErrorActionPreference = "Stop"
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($NodeCommand) {
    $NodePath = $NodeCommand.Source
} else {
    $BundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    if (-not (Test-Path -LiteralPath $BundledNode -PathType Leaf)) {
        throw "Node.js was not found. Install Node.js 20 or newer from https://nodejs.org/ and reopen PowerShell."
    }
    $NodePath = $BundledNode
}

$CliPath = Join-Path $PSScriptRoot "src\cli.js"
& $NodePath $CliPath $Command
exit $LASTEXITCODE

