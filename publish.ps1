# Publish goldenstatesignal.com
#
#   .\publish.ps1                              review changes, then confirm
#   .\publish.ps1 -Message "new landing copy"  same, with your own commit message
#   .\publish.ps1 -SkipRefresh                 push what's here, don't re-copy
#   .\publish.ps1 -Yes                         no prompt: for the scheduled task
#
# Copies the site files out of the data project, checks nothing private is
# about to go public, shows you the diff, and pushes. Interactive runs ask
# first; the scheduled task ("Golden State Signal site publish") runs with -Yes
# and pushes only when something actually changed, so an unchanged site
# produces no commit and no noise.
#
# This site lives in its own repo deliberately. The data project next door
# holds 16,000+ real people's contact details and a 500MB database. Nothing in
# this folder does, so a mistake here cannot disclose any of that.
#
# The homepage and the demo were, for a while, uploaded through the GitHub web
# UI as well as pushed from here, which left this clone sixteen commits behind
# and the copy paths pointing at a folder the homepage had moved out of. So the
# script now pulls first (fast-forward only: if the web copy and the local copy
# have both changed the same file, it stops and says so rather than guess),
# and every source path is checked before anything is copied.
#
# NOTE: keep this file pure ASCII. Windows PowerShell 5.1 reads .ps1 as ANSI
# unless there is a BOM, and a stray em-dash makes it misparse the whole script.

param(
    [string]$Message = "",
    [switch]$SkipRefresh,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"
$Site = $PSScriptRoot
# Sibling folder - this repo and the data project both sit under "01 Work".
$Project = Join-Path (Split-Path $Site -Parent) "ca-procurement-intel"

Set-Location $Site

function Fail($text) {
    Write-Host $text -ForegroundColor Red
    exit 1
}

# --------------------------------------------------------------- pull first
if (-not (Test-Path (Join-Path $Site ".git"))) {
    Fail "No git repo here. This folder should be a clone of github.com/jayleone75/goldenstatesignal."
}
git fetch -q origin main
if ($LASTEXITCODE -ne 0) { Fail "Could not reach GitHub (git fetch failed). Nothing changed." }
git merge -q --ff-only origin/main
if ($LASTEXITCODE -ne 0) {
    Fail "This clone and GitHub have diverged (something was edited on the web and here). Resolve with git before publishing. Nothing changed."
}

# ------------------------------------------------------------------ refresh
# What the live site is made of, and where each piece is generated. The
# homepage is hand-edited in the project; everything under demo/ is written by
# pipeline scripts (make_demo_data.py, make_sample_runbook.py). demo/worker is
# the demo chat's Worker source and is maintained in this repo, not copied.
$homepage = Join-Path $Project "output\site-preview\index.html"
$demoItems = @("index.html", "sample-brief.html", "sample-runbook.html",
               "sample-runbook-oem.html", "assets", "data")

if (-not $SkipRefresh) {
    if (-not (Test-Path $Project)) {
        Fail "Can't find the data project at $Project. Re-run with -SkipRefresh to publish the files already here."
    }
    if (-not (Test-Path $homepage)) { Fail "Homepage source is missing: $homepage" }
    foreach ($item in $demoItems) {
        if (-not (Test-Path (Join-Path $Project "demo\$item"))) { Fail "Demo source is missing: demo\$item" }
    }
    Write-Host "Refreshing site files from the project..." -ForegroundColor Cyan
    Copy-Item $homepage (Join-Path $Site "index.html") -Force
    if (-not (Test-Path (Join-Path $Site "demo"))) { New-Item -ItemType Directory (Join-Path $Site "demo") | Out-Null }
    foreach ($item in $demoItems) {
        Copy-Item (Join-Path $Project "demo\$item") (Join-Path $Site "demo") -Recurse -Force
    }

    # Copy alone never REMOVES anything, so a data file the generator stopped
    # producing would sit on the live site forever - still fetchable by URL
    # even with nothing linking to it. Mirror the data directory so deletions
    # propagate.
    $srcData = Join-Path $Project "demo\data"
    $dstData = Join-Path $Site "demo\data"
    if (Test-Path $srcData) {
        $keep = Get-ChildItem $srcData -File | ForEach-Object { $_.Name }
        Get-ChildItem $dstData -File | Where-Object { $keep -notcontains $_.Name } |
          ForEach-Object {
              Write-Host "   removing superseded $($_.Name)" -ForegroundColor Yellow
              Remove-Item $_.FullName -Force
          }
    }
    # Editor lock files do not belong on the site.
    Get-ChildItem (Join-Path $Site "demo") -File -Force | Where-Object { $_.Name -like "~$*" } |
      ForEach-Object { Remove-Item $_.FullName -Force }
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
$staffMail      = '@(dmv|doj|cdt|dss|dot|cdcr|wildlife|water|arb|dsh|ftb|edd|cdph|dhcs|parks|fire|calfire|oes|caloes)\.ca\.gov'

$bad = @()
Get-ChildItem -Path $Site -Recurse -File |
  Where-Object {
      $_.FullName -notmatch '\\\.git\\' -and $_.Name -ne 'publish.ps1'
  } | ForEach-Object {
      $n = $_.Name
      if ($n -match '\.(db|sqlite|csv|xlsx|pst)$' -or $n -match '\.bak') {
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
    git checkout -q -- . 2>$null
    exit 1
}

# The site root holds a known, small set of files. Anything else that turns up
# there is almost certainly a stray, and `git add -A` will happily publish it.
# Interactive runs are warned; the unattended run refuses, because nobody is
# there to look.
$expectedRoot = @('index.html', 'CNAME', 'README.md', 'publish.ps1', '.gitignore',
                  'gss-og-card.png')
# Old homepage drafts (index_v1.html, indexv2.html, index_5.html...) were
# uploaded through the GitHub web UI and are already live; they are not
# strays, though each one is a public URL and worth pruning by hand.
$strays = Get-ChildItem -Path $Site -File |
    Where-Object { $expectedRoot -notcontains $_.Name -and $_.Name -notmatch '^index[_v0-9]*\.html$' } |
    ForEach-Object { $_.Name }
if ($strays.Count -gt 0) {
    Write-Host "   NOTE - unexpected files in the site root:" -ForegroundColor Yellow
    $strays | ForEach-Object { Write-Host "      $_" -ForegroundColor Yellow }
    if ($Yes) { Fail "Unattended run refuses to publish with stray files in the root. Delete or add them to the expected list." }
    Write-Host "   If any of those are scratch files, delete them before publishing." -ForegroundColor Yellow
}
Write-Host "   clean" -ForegroundColor Green

# ---------------------------------------------------------------------- git
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

if (-not $Yes) {
    $answer = Read-Host "Publish to goldenstatesignal.com? (y/N)"
    if ($answer -ne "y") {
        git reset | Out-Null
        Write-Host "Cancelled. Nothing pushed." -ForegroundColor Yellow
        exit 0
    }
}

if (-not $Message) {
    $changed = (git diff --cached --name-only) -join ", "
    if ($changed.Length -gt 70) { $changed = $changed.Substring(0, 67) + "..." }
    $Message = "Site update $(Get-Date -Format 'yyyy-MM-dd HH:mm'): $changed"
}

# PowerShell params take ONE dash. Typing --Message binds the literal string
# "--Message" as the commit message instead of erroring, so catch it here.
if ($Message -like "-*") {
    git reset | Out-Null
    Fail "That message looks like a mistyped switch: $Message  (PowerShell uses one dash: -Message ""your text"")"
}

# $ErrorActionPreference does NOT apply to native commands - git can fail and
# the script will happily continue. Every git call below is checked explicitly.
git commit -q -m $Message
if ($LASTEXITCODE -ne 0) {
    Fail "COMMIT FAILED - nothing was published. Your changes are still staged; fix the above and re-run."
}

git push -q origin main
if ($LASTEXITCODE -ne 0) {
    Fail "PUSH FAILED - the commit was made locally but is NOT live. Fix the above, then: git push origin main"
}

Write-Host ""
Write-Host "Published. GitHub Pages usually takes a minute to update." -ForegroundColor Green
Write-Host "   https://goldenstatesignal.com/"
Write-Host "   https://goldenstatesignal.com/demo/"
