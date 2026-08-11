# Publish goldenstatesignal.com
#
#   .\publish.ps1                              review changes, then confirm
#   .\publish.ps1 -Message "new landing copy"  same, with your own commit message
#   .\publish.ps1 -SkipRefresh                 push what's here, don't re-copy
#
# Copies the site files out of the data project, checks nothing private is
# about to go public, shows you the diff, and pushes only after you say yes.
#
# This site lives in its own repo deliberately. The data project next door
# holds 12,800+ real people's contact details and a 260MB database. Nothing in
# this folder does, so a mistake here cannot disclose any of that.
#
# NOTE: keep this file pure ASCII. Windows PowerShell 5.1 reads .ps1 as ANSI
# unless there is a BOM, and a stray em-dash makes it misparse the whole script.

param(
    [string]$Message = "",
    [switch]$SkipRefresh
)

$ErrorActionPreference = "Stop"
$Site = $PSScriptRoot
# Sibling folder - this repo and the data project both sit under "01 Work".
$Project = Join-Path (Split-Path $Site -Parent) "ca-procurement-intel"

Set-Location $Site

# ------------------------------------------------------------------ refresh
if (-not $SkipRefresh) {
    if (-not (Test-Path $Project)) {
        Write-Host "Can't find the data project at $Project" -ForegroundColor Red
        Write-Host "Re-run with -SkipRefresh to publish the files already here."
        exit 1
    }
    Write-Host "Refreshing site files from the project..." -ForegroundColor Cyan
    Copy-Item (Join-Path $Project "docs\business\index.html") `
              (Join-Path $Site "index.html") -Force
    foreach ($item in @("index.html", "sample-brief.html", "assets", "data")) {
        Copy-Item (Join-Path $Project "demo\$item") (Join-Path $Site "demo") `
                  -Recurse -Force
    }
}

# -------------------------------------------------------- safety tripwire
# The demo JSON is generated with staff names already redacted
# (pipeline/make_demo_data.py). This is a second, independent check: if
# anything that looks like a contact record reaches this folder, stop.
Write-Host "Checking for anything that shouldn't be published..." -ForegroundColor Cyan

# Built from parts so this script never matches its own detection strings.
$fieldBuyerName = '"buyer_' + 'name"'
$fieldBuyerMail = '"buyer_' + 'email"'
$fieldLinkedIn  = '"linked' + 'in_url"'
$staffMail      = '@(dmv|doj|cdt|dss|dot|cdcr|wildlife|water|arb|dsh)\.ca\.gov'

$bad = @()
Get-ChildItem -Path $Site -Recurse -File |
  Where-Object {
      $_.FullName -notmatch '\\\.git\\' -and $_.Name -ne 'publish.ps1'
  } | ForEach-Object {
      $n = $_.Name
      if ($n -match '\.(db|sqlite|csv|xlsx)$' -or $n -match '\.bak') {
          $bad += "$n  (data file - should never be here)"
      }
      $text = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
      if ($text) {
          if ($text -match [regex]::Escape($fieldBuyerName)) { $bad += "$n  (buyer name field)" }
          if ($text -match [regex]::Escape($fieldBuyerMail)) { $bad += "$n  (buyer email field)" }
          if ($text -match [regex]::Escape($fieldLinkedIn))  { $bad += "$n  (LinkedIn field)" }
          if ($text -match $staffMail)                       { $bad += "$n  (state staff email)" }
      }
  }

if ($bad.Count -gt 0) {
    Write-Host "STOPPING - these look like they contain private data:" -ForegroundColor Red
    $bad | Sort-Object -Unique | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    exit 1
}
Write-Host "   clean" -ForegroundColor Green

# ---------------------------------------------------------------------- git
if (-not (Test-Path (Join-Path $Site ".git"))) {
    Write-Host "No git repo here yet. Set one up first:" -ForegroundColor Yellow
    Write-Host "    git init; git branch -M main"
    Write-Host "    gh repo create goldenstatesignal-site --public --source=. --remote=origin"
    exit 1
}

git add -A | Out-Null
$staged = git diff --cached --stat
if (-not $staged) {
    Write-Host "Nothing changed - nothing to publish." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "About to publish these changes to the live site:" -ForegroundColor Cyan
git diff --cached --stat
Write-Host ""

$answer = Read-Host "Publish to goldenstatesignal.com? (y/N)"
if ($answer -ne "y") {
    git reset | Out-Null
    Write-Host "Cancelled. Nothing pushed." -ForegroundColor Yellow
    exit 0
}

if (-not $Message) { $Message = "Site update $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }

# PowerShell params take ONE dash. Typing --Message binds the literal string
# "--Message" as the commit message instead of erroring, so catch it here.
if ($Message -like "-*") {
    Write-Host "That message looks like a mistyped switch: $Message" -ForegroundColor Yellow
    Write-Host "PowerShell uses one dash:  .\publish.ps1 -Message ""your text"""
    git reset | Out-Null
    exit 1
}

# $ErrorActionPreference does NOT apply to native commands - git can fail and
# the script will happily continue. Every git call below is checked explicitly.
# This was found the hard way: a commit failed for a missing user.email and the
# script still printed "Published", which is worse than any real failure.
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "COMMIT FAILED - nothing was published." -ForegroundColor Red
    Write-Host "Your changes are still staged; fix the above and re-run."
    exit 1
}

git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "PUSH FAILED - the commit was made locally but is NOT live." -ForegroundColor Red
    Write-Host "Fix the above, then: git push origin main"
    exit 1
}

Write-Host ""
Write-Host "Published. GitHub Pages usually takes a minute to update." -ForegroundColor Green
Write-Host "   https://goldenstatesignal.com/"
Write-Host "   https://goldenstatesignal.com/demo/"
