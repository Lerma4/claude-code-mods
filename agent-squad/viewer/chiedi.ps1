# Handler of the squadra:// links in the flow pages, registered by `/squadra collega`.
#   squadra://chiedi?to=<session>&text=...    question for an open session
#   squadra://riprendi?to=<session>&text=...  same, after reopening that session in a new terminal
# The text goes to the session's inbox; agent-squad there puts it in the prompt box, never submits it.
# Any web page can open a squadra:// link: only a known session id is acted on, and nothing else
# from the link decides where or what runs.
param([string]$Url)

$root = Join-Path $env:USERPROFILE '.claude\agent-flow'
$verb = ($Url -replace '^squadra:/*', '') -replace '[/?].*$', ''
$q = @{}
foreach ($pair in (($Url -split '\?', 2)[1] -split '&')) {
  $k, $v = $pair -split '=', 2
  if ($k) { $q[$k] = [Uri]::UnescapeDataString("$v") }
}
$id = $q['to']
if ($verb -notin 'chiedi', 'riprendi' -or $id -notmatch '^[\w-]+$' -or -not $q['text']) { exit 1 }
$dir = Join-Path $root "sessioni\$id"

if ($verb -eq 'chiedi') {
  # An open session has its folder already.
  if (-not (Test-Path -LiteralPath $dir -PathType Container)) { exit 1 }
} else {
  # The folder to resume in is the project the local history records for that session.
  # ponytail: regex over storico.js, not ConvertFrom-Json, which caps input size on PowerShell 5.
  $history = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'storico.js')
  $m = [regex]::Match($history, '"id":"' + $id + '","project":"((?:[^"\\]|\\.)*)"')
  if (-not $m.Success) { exit 1 }
  $cwd = [regex]::Unescape($m.Groups[1].Value) -replace '/', '\'
  if ($cwd -notmatch '^[A-Za-z]:\\[^;"]*$' -or -not (Test-Path -LiteralPath $cwd -PathType Container)) { $cwd = $env:USERPROFILE }
}

$box = Join-Path $dir 'chiedi'
New-Item -ItemType Directory -Force $box | Out-Null
[IO.File]::WriteAllText((Join-Path $box "$([DateTime]::UtcNow.Ticks).txt"), $q['text'], (New-Object Text.UTF8Encoding $false))

if ($verb -eq 'riprendi') {
  if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
    Start-Process wt.exe -ArgumentList @('-d', "`"$cwd`"", 'claude', '--resume', $id)
  } else {
    Start-Process cmd.exe -ArgumentList @('/k', 'claude', '--resume', $id) -WorkingDirectory $cwd
  }
}
