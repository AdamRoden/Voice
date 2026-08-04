# Build data/word-class-10k.json(.gz) from Google 10k frequency list + Moby POS.
# Usage: powershell -File tools/build-word-class-10k.ps1
param(
  [string]$GoogleUrl = "https://cdn.jsdelivr.net/gh/first20hours/google-10000-english@master/google-10000-english-usa-no-swears.txt",
  [string]$MobyUrl = "https://raw.githubusercontent.com/elitejake/Moby-Project/main/Moby%20Part-of-Speech%20II/mobypos.txt",
  [string]$OutJson = (Join-Path $PSScriptRoot "..\data\word-class-10k.json"),
  [string]$OutGz = (Join-Path $PSScriptRoot "..\data\word-class-10k.json.gz")
)

$ErrorActionPreference = "Stop"
$OutJson = [IO.Path]::GetFullPath($OutJson)
$OutGz = [IO.Path]::GetFullPath($OutGz)
$tmp = Join-Path $env:TEMP ("voice-wc-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $tmp | Out-Null
$googlePath = Join-Path $tmp "google10k.txt"
$mobyPath = Join-Path $tmp "mobypos.txt"

try {
  Write-Host "Downloading Google 10k..."
  Invoke-WebRequest -Uri $GoogleUrl -OutFile $googlePath -UseBasicParsing
  Write-Host "Downloading Moby POS..."
  Invoke-WebRequest -Uri $MobyUrl -OutFile $mobyPath -UseBasicParsing

  function Map-Tags([string]$tags) {
    $set = New-Object "System.Collections.Generic.HashSet[string]"
    foreach ($ch in $tags.ToCharArray()) {
      switch -CaseSensitive ($ch) {
        "D" { [void]$set.Add("det") }
        "I" { [void]$set.Add("det") }
        "r" { [void]$set.Add("pron") }
        "o" { [void]$set.Add("pron") }
        "C" { [void]$set.Add("conj") }
        "P" { [void]$set.Add("prep") }
        "V" { [void]$set.Add("verb") }
        "t" { [void]$set.Add("verb") }
        "i" { [void]$set.Add("verb") }
        "A" { [void]$set.Add("adj") }
        "v" { [void]$set.Add("adv") }
        "N" { [void]$set.Add("noun") }
        "p" { [void]$set.Add("noun") }
        "h" { [void]$set.Add("noun") }
      }
    }
    return , $set
  }

  Write-Host "Parsing Moby..."
  $moby = @{}
  $reader = [IO.StreamReader]::new($mobyPath)
  while ($null -ne ($line = $reader.ReadLine())) {
    $line = $line.Trim()
    if (-not $line) { continue }
    $bs = $line.LastIndexOf([char]"\")
    if ($bs -lt 1) { continue }
    $w = $line.Substring(0, $bs).Trim().ToLowerInvariant()
    $tags = $line.Substring($bs + 1)
    if ($w -notmatch "^[a-z']+$") { continue }
    $classes = Map-Tags $tags
    if ($classes.Count -eq 0) { continue }
    if (-not $moby.ContainsKey($w)) {
      $moby[$w] = New-Object "System.Collections.Generic.HashSet[string]"
    }
    foreach ($c in $classes) { [void]$moby[$w].Add($c) }
  }
  $reader.Close()

  $closed = @{
    det   = @("the", "a", "an", "this", "that", "these", "those", "my", "your", "his", "her", "our", "their", "some", "any", "no", "every", "each", "more", "less", "much", "many", "few", "all", "both", "another", "other", "such", "enough", "several", "most", "own", "same", "half", "whole")
    pron  = @("i", "you", "he", "she", "we", "they", "it", "me", "him", "her", "us", "them", "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves", "someone", "somebody", "something", "anyone", "anybody", "anything", "everyone", "everybody", "everything", "nothing", "nobody", "none", "one", "ones", "who", "whom", "whose", "which", "what")
    modal = @("can", "could", "will", "would", "should", "may", "might", "must", "shall", "ought", "need")
    aux   = @("is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "have", "has", "had", "having")
    prep  = @("to", "of", "in", "on", "at", "for", "with", "from", "about", "into", "over", "under", "after", "before", "by", "as", "like", "than", "without", "within", "through", "across", "between", "among", "against", "during", "until", "since", "toward", "towards", "onto", "upon", "near", "off", "out", "up", "down", "around", "behind", "beside", "beyond", "along", "above", "below", "inside", "outside", "except", "plus", "via", "per")
    conj  = @("and", "or", "but", "so", "if", "because", "when", "while", "although", "though", "unless", "until", "since", "whether", "nor", "yet", "once", "whereas")
    wh    = @("what", "where", "when", "why", "who", "whom", "whose", "which", "how", "whatever", "wherever", "whenever", "whoever", "whichever")
    neg   = @("not", "no", "never", "none", "neither", "nor", "nobody", "nothing", "nowhere")
  }
  $closedMap = @{}
  foreach ($kv in $closed.GetEnumerator()) {
    foreach ($w in $kv.Value) {
      if (-not $closedMap.ContainsKey($w)) {
        $closedMap[$w] = New-Object "System.Collections.Generic.HashSet[string]"
      }
      [void]$closedMap[$w].Add($kv.Key)
    }
  }

  function Heuristic-Class([string]$w) {
    if ($w.Length -gt 4 -and $w.EndsWith("ly")) { return , @("adv") }
    if ($w.Length -gt 5 -and $w.EndsWith("ing")) { return , @("verb", "noun") }
    if ($w.Length -gt 4 -and $w.EndsWith("ed")) { return , @("verb", "adj") }
    if ($w -match "(ness|tion|sion|ment|ity|ism|hood|ship)$") { return , @("noun") }
    if ($w.Length -gt 4 -and $w -match "(ous|ful|less|ive|able|ible|ical|ish)$") { return , @("adj") }
    if ($w.Length -gt 5 -and $w -match "(ize|ise|ate)$") { return , @("verb") }
    return , @("noun")
  }

  $primaryOrder = @("det", "modal", "aux", "wh", "neg", "pron", "prep", "conj", "adv", "verb", "adj", "noun")
  $classLists = [ordered]@{}
  $seenInClass = @{}
  foreach ($c in $primaryOrder) {
    $classLists[$c] = New-Object System.Collections.Generic.List[string]
    $seenInClass[$c] = New-Object "System.Collections.Generic.HashSet[string]"
  }

  $google = @(
    Get-Content $googlePath |
      ForEach-Object { $_.Trim().ToLowerInvariant() } |
      Where-Object { $_ -match "^[a-z']+$" }
  )
  $stats = @{ closed = 0; moby = 0; heur = 0 }

  foreach ($w in $google) {
    $classes = New-Object "System.Collections.Generic.HashSet[string]"
    if ($closedMap.ContainsKey($w)) {
      foreach ($c in $closedMap[$w]) { [void]$classes.Add($c) }
      $stats.closed++
    } elseif ($moby.ContainsKey($w)) {
      foreach ($c in $moby[$w]) { [void]$classes.Add($c) }
      $stats.moby++
    } else {
      foreach ($c in (Heuristic-Class $w)) { [void]$classes.Add($c) }
      $stats.heur++
    }
    if ($closed["modal"] -contains $w) { [void]$classes.Add("modal") }
    if ($closed["aux"] -contains $w) { [void]$classes.Add("aux") }
    foreach ($c in $classes) {
      if (-not $classLists.Contains($c)) { continue }
      if ($seenInClass[$c].Add($w)) { $classLists[$c].Add($w) }
    }
  }

  $inAny = New-Object "System.Collections.Generic.HashSet[string]"
  foreach ($c in $classLists.Keys) {
    foreach ($w in $classLists[$c]) { [void]$inAny.Add($w) }
  }
  foreach ($w in $google) {
    if (-not $inAny.Contains($w)) {
      $classLists["noun"].Add($w)
      [void]$inAny.Add($w)
    }
  }

  Write-Host ("Coverage {0}/{1} closed={2} moby={3} heur={4}" -f $inAny.Count, $google.Count, $stats.closed, $stats.moby, $stats.heur)
  foreach ($c in $classLists.Keys) { Write-Host ("  {0}: {1}" -f $c, $classLists[$c].Count) }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('{"meta":{')
  [void]$sb.Append('"name":"word-class-10k",')
  [void]$sb.Append('"source":"Google 10k USA no-swears + Moby Part-of-Speech II (public domain) + curated closed classes",')
  [void]$sb.Append('"freqList":"google-10000-english-usa-no-swears",')
  [void]$sb.Append('"wordCount":').Append($google.Count).Append(",")
  [void]$sb.Append('"classified":').Append($inAny.Count).Append(",")
  [void]$sb.Append('"mobyHits":').Append($stats.moby).Append(",")
  [void]$sb.Append('"heuristicOnly":').Append($stats.heur)
  [void]$sb.Append('},')
  # Flat frequency-ordered vocab (same order as Google list) for mid-word prefix scan.
  [void]$sb.Append('"words":[')
  $firstW = $true
  foreach ($w in $google) {
    if (-not $firstW) { [void]$sb.Append(",") }
    $firstW = $false
    [void]$sb.Append('"').Append($w).Append('"')
  }
  [void]$sb.Append('],"classes":{')
  $firstC = $true
  foreach ($c in $classLists.Keys) {
    if (-not $firstC) { [void]$sb.Append(",") }
    $firstC = $false
    [void]$sb.Append('"').Append($c).Append('":[')
    $firstW = $true
    foreach ($w in $classLists[$c]) {
      if (-not $firstW) { [void]$sb.Append(",") }
      $firstW = $false
      [void]$sb.Append('"').Append($w).Append('"')
    }
    [void]$sb.Append("]")
  }
  [void]$sb.Append("}}")

  $dir = Split-Path $OutJson -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  [IO.File]::WriteAllText($OutJson, $sb.ToString(), [Text.UTF8Encoding]::new($false))
  $bytes = [IO.File]::ReadAllBytes($OutJson)
  $fs = [IO.File]::Create($OutGz)
  $gz = New-Object IO.Compression.GZipStream($fs, [IO.Compression.CompressionLevel]::Optimal)
  $gz.Write($bytes, 0, $bytes.Length)
  $gz.Dispose(); $fs.Dispose()
  # Runtime ships gz only
  Remove-Item -Force $OutJson -ErrorAction SilentlyContinue
  Write-Host "Wrote $OutGz ($((Get-Item $OutGz).Length) bytes)"
  Write-Host "Attribution: data/NOTICE-word-class-10k.txt"
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
