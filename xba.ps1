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
$PlaywrightCli = Join-Path $PSScriptRoot "node_modules\playwright\cli.js"
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PSScriptRoot ".playwright-browsers"

if ($Command -in @("setup", "run")) {
    if (-not (Test-Path -LiteralPath $PlaywrightCli -PathType Leaf)) {
        throw "Dependencies are missing. Run 'pnpm install' after installing Node.js 20 or newer."
    }
    $InstalledChromium = Get-ChildItem -LiteralPath $env:PLAYWRIGHT_BROWSERS_PATH -Directory -Filter "chromium-*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $InstalledChromium) {
        Write-Host "Installing Chromium into $env:PLAYWRIGHT_BROWSERS_PATH ..."
        & $NodePath $PlaywrightCli install chromium
        if ($LASTEXITCODE -ne 0) {
            throw "Chromium installation failed with exit code $LASTEXITCODE."
        }
    }
}

& $NodePath $CliPath $Command
exit $LASTEXITCODE
