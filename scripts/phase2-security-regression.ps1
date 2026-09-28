$ErrorActionPreference = 'Stop'
if ($env:KAMASI_QA_DATABASE -ne 'prisma/phase2-fixed.db') {
  throw 'Refusing to run: start the app with the dedicated prisma/phase2-fixed.db database and set KAMASI_QA_DATABASE to that exact path.'
}
$base = if ($env:PHASE2_API_BASE_URL) { $env:PHASE2_API_BASE_URL } else { 'http://127.0.0.1:3102' }
$suffix = [guid]::NewGuid().ToString('N')
$password = 'Qa-' + [guid]::NewGuid().ToString('N') + '!'
$owner = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$other = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$viewer = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$results = [System.Collections.Generic.List[object]]::new()
function Assert-Check([string]$name, [bool]$condition, [string]$detail) {
  if (-not $condition) { throw "FAILED: $name — $detail" }
  $script:results.Add([pscustomobject]@{ scenario = $name; result = 'PASS'; detail = $detail })
}
function Post-Json([string]$path, $body, $session) {
  $response = Invoke-WebRequest -Uri ($script:base + $path) -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8 -Compress) -WebSession $session -SkipHttpErrorCheck
  $setCookie = $response.Headers['Set-Cookie']
  $cookieHeader = [string]$setCookie -split ';' | Select-Object -First 1
  if ($cookieHeader -like 'kamasi_session=*') {
    $token = $cookieHeader.Substring('kamasi_session='.Length)
    $cookie = [System.Net.Cookie]::new('kamasi_session', $token, '/', ([uri]$script:base).Host)
    $session.Cookies.Add($cookie)
  }
  $script:lastHttpStatus = [int]$response.StatusCode
  if ($script:lastHttpStatus -ge 400) { throw "HTTP $($response.StatusCode): $($response.Content)" }
  return $response.Content | ConvertFrom-Json
}

$a = Post-Json '/api/auth/register' @{ email = "phase2-owner-$suffix@qa.local"; password = $password; name = 'Phase 2 Owner'; householdName = "Phase 2 A $suffix" } $owner
$b = Post-Json '/api/auth/register' @{ email = "phase2-other-$suffix@qa.local"; password = $password; name = 'Phase 2 Other'; householdName = "Phase 2 B $suffix" } $other
$bScenario = Invoke-RestMethod -Uri "$base/api/forecasting" -WebSession $other
$crossStatus = 0
try { $null = Post-Json '/api/forecasting' @{ scenarioId = $bScenario.id; name = 'Unauthorized marker'; targetYear = 2030; estimatedCost = 1; type = 'EXPENSE' } $owner } catch { $crossStatus = $script:lastHttpStatus }
Assert-Check 'Cross-household forecast scenario write is rejected' ($crossStatus -eq 404) "Foreign scenario POST returned HTTP $crossStatus"
$bAfter = Invoke-RestMethod -Uri "$base/api/forecasting" -WebSession $other
Assert-Check 'Rejected scenario write leaves other household unchanged' (@($bAfter.milestones | Where-Object name -eq 'Unauthorized marker').Count -eq 0) 'No foreign milestone persisted'

$private = Post-Json '/api/accounts' @{ name = 'Synthetic Private Account'; type = 'BANK'; balance = 100; accountNumber = "SYNTHETIC-$suffix"; isShared = $false } $owner
$source = Post-Json '/api/income-sources' @{ name = 'Synthetic private income'; category = 'Other'; defaultAccountId = $private.id; expectedAmount = 20; currency = 'INR'; behavior = 'RECURRING'; frequency = 'MONTHLY'; expectedDay = 1 } $owner
$invite = Post-Json '/api/household/members' @{ email = "phase2-viewer-$suffix@qa.local"; role = 'VIEWER' } $owner
$null = Post-Json '/api/auth/register' @{ email = "phase2-viewer-$suffix@qa.local"; password = $password; name = 'Phase 2 Viewer'; householdName = "Viewer $suffix" } $viewer
$null = Post-Json '/api/household/invitations/accept' @{ code = $invite.code } $viewer
$sourceResponse = Invoke-RestMethod -Uri "$base/api/income-sources" -WebSession $viewer
$visibleSource = @($sourceResponse | Where-Object id -eq $source.id)[0]
Assert-Check 'Income source omits another member private account details' ($null -eq $visibleSource.defaultAccount -and $null -eq $visibleSource.defaultAccountId) 'Private account relation and identifier are hidden'
$serializedSources = $sourceResponse | ConvertTo-Json -Depth 10 -Compress
Assert-Check 'Income source response omits private account number and balance' (-not $serializedSources.Contains("SYNTHETIC-$suffix") -and -not $serializedSources.Contains('"balance"')) 'Sensitive account values absent from viewer response'
$occurrences = Invoke-RestMethod -Uri "$base/api/income-occurrences" -WebSession $owner
$occurrence = @($occurrences | Where-Object incomeSourceId -eq $source.id | Select-Object -First 1)[0]
if ($occurrence) {
  $txnBody = @{ accountId = $private.id; incomeSourceId = $source.id; occurrenceId = $occurrence.id; amount = '20'; type = 'INCOME'; description = 'Synthetic private receipt'; date = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json -Compress
  $txn = Invoke-WebRequest -Uri "$base/api/transactions" -Method Post -ContentType 'application/json' -Body $txnBody -WebSession $owner -Headers @{ 'Idempotency-Key' = "phase2-private-$suffix" } -SkipHttpErrorCheck
  Assert-Check 'Synthetic receipt posts successfully to private account' ([int]$txn.StatusCode -eq 201) "Receipt POST returned HTTP $($txn.StatusCode)"
  $viewerOccurrences = Invoke-RestMethod -Uri "$base/api/income-occurrences" -WebSession $viewer
  $viewerOccurrence = @($viewerOccurrences | Where-Object id -eq $occurrence.id)[0]
  Assert-Check 'Income occurrence response omits private linked transaction and account' (@($viewerOccurrence.transactions).Count -eq 0) 'Private account transaction is filtered from viewer response'
  $serializedOccurrences = $viewerOccurrences | ConvertTo-Json -Depth 10 -Compress
  Assert-Check 'Income occurrence response omits private account number and idempotency key' (-not $serializedOccurrences.Contains("SYNTHETIC-$suffix") -and -not $serializedOccurrences.Contains("phase2-private-$suffix")) 'Private account data and transaction idempotency key absent'
} else {
  Assert-Check 'Income occurrence response omits private linked transaction and account' $false 'No generated occurrence available for linked transaction scenario'
}

$results | ConvertTo-Json -Depth 5
