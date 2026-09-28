$ErrorActionPreference = 'Stop'
if ($env:KAMASI_QA_DATABASE -ne 'prisma/qa-test.db') {
  throw 'Refusing to create QA records: set KAMASI_QA_DATABASE=prisma/qa-test.db and start the server with the isolated QA Prisma schema.'
}
$base = 'http://127.0.0.1:3100'
$suffix = [guid]::NewGuid().ToString('N')
$password = 'Qa-' + [guid]::NewGuid().ToString('N') + '!'
$owner = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$viewer = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$results = [System.Collections.Generic.List[object]]::new()

function Assert-Check([string]$name, [bool]$condition, [string]$detail) {
  if (-not $condition) { throw "FAILED: $name — $detail" }
  $script:results.Add([pscustomobject]@{ scenario = $name; result = 'PASS'; detail = $detail })
}
function Get-Status($errorRecord) {
  try { return [int]$errorRecord.Exception.Response.StatusCode } catch { return 0 }
}
function Post-Json($path, $body, $session, $headers = @{}) {
  return Invoke-RestMethod -Uri ($script:base + $path) -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 8 -Compress) -WebSession $session -Headers $headers
}

$ownerReg = Post-Json '/api/auth/register' @{ email = "owner-$suffix@qa.local"; password = $password; name = 'QA Owner'; householdName = "QA Household $suffix" } $owner
$ownerId = $ownerReg.user.id
$ownerHousehold = $ownerReg.user.householdId
Assert-Check 'Disposable owner registration creates owner session' ($ownerReg.user.role -eq 'OWNER' -and $ownerId -and $ownerHousehold) 'Synthetic QA identity only'

$shared = Post-Json '/api/accounts' @{ name = 'QA Shared Bank'; type = 'BANK'; balance = 100; isShared = $true } $owner
$private = Post-Json '/api/accounts' @{ name = 'QA Private Cash'; type = 'CASH'; balance = 25; isShared = $false } $owner
$cats = Invoke-RestMethod -Uri "$base/api/categories" -WebSession $owner
$category = $cats | Where-Object { $_.type -eq 'EXPENSE' } | Select-Object -First 1
Assert-Check 'QA setup creates shared/private accounts and category' ($shared.id -and $private.id -and $category.id) 'Synthetic balances and category'

$txnBody = @{ accountId = $shared.id; categoryId = $category.id; amount = '12.50'; type = 'EXPENSE'; description = 'QA idempotent expense'; date = '2026-09-25T12:00:00.000Z' }
$expenseKey = "qa-$suffix-expense"
$posted = Post-Json '/api/transactions' $txnBody $owner @{ 'Idempotency-Key' = $expenseKey }
$repeat = Post-Json '/api/transactions' $txnBody $owner @{ 'Idempotency-Key' = $expenseKey }
$sharedAfterExpense = Invoke-RestMethod -Uri "$base/api/accounts/$($shared.id)" -WebSession $owner
Assert-Check 'Expense retry returns same transaction without double posting' ($posted.id -eq $repeat.id -and [decimal]$sharedAfterExpense.balance -eq 87.5) 'Balance is 87.50 after one 12.50 expense'

$conflictStatus = 0
try { $null = Post-Json '/api/transactions' (@{ accountId = $shared.id; categoryId = $category.id; amount = '13'; type = 'EXPENSE'; description = 'Changed payload'; date = '2026-09-25T12:00:00.000Z' }) $owner @{ 'Idempotency-Key' = $expenseKey } } catch { $conflictStatus = Get-Status $_ }
Assert-Check 'Reused idempotency key with changed payload is rejected' ($conflictStatus -eq 409) "HTTP $conflictStatus"

$badStatus = 0
try { $null = Post-Json '/api/transactions' (@{ accountId = $shared.id; categoryId = $category.id; amount = '-1'; type = 'EXPENSE'; description = 'Invalid negative'; date = '2026-09-25T12:00:00.000Z' }) $owner @{ 'Idempotency-Key' = "qa-$suffix-negative" } } catch { $badStatus = Get-Status $_ }
Assert-Check 'Negative transaction amount is rejected' ($badStatus -eq 400) "HTTP $badStatus"

$transfer = Post-Json '/api/transactions' @{ accountId = $shared.id; transferAccountId = $private.id; amount = '10'; type = 'TRANSFER'; description = 'QA transfer'; date = '2026-09-25T12:01:00.000Z' } $owner @{ 'Idempotency-Key' = "qa-$suffix-transfer" }
$sharedAfterTransfer = Invoke-RestMethod -Uri "$base/api/accounts/$($shared.id)" -WebSession $owner
$privateAfterTransfer = Invoke-RestMethod -Uri "$base/api/accounts/$($private.id)" -WebSession $owner
Assert-Check 'Transfer posts balanced source and destination effects' ($transfer.id -and [decimal]$sharedAfterTransfer.balance -eq 77.5 -and [decimal]$privateAfterTransfer.balance -eq 35) 'Source decreased and destination increased by 10.00'

$invite = Post-Json '/api/household/members' @{ email = "viewer-$suffix@qa.local"; role = 'VIEWER' } $owner
$viewerReg = Post-Json '/api/auth/register' @{ email = "viewer-$suffix@qa.local"; password = $password; name = 'QA Viewer'; householdName = "Viewer QA $suffix" } $viewer
$accepted = Post-Json '/api/household/invitations/accept' @{ code = $invite.code } $viewer
Assert-Check 'Invitation acceptance binds verified email to household as viewer' ($accepted.householdId -eq $ownerHousehold -and $accepted.role -eq 'VIEWER') 'Viewer accepted matching synthetic email invite'

$visibleAccounts = Invoke-RestMethod -Uri "$base/api/accounts" -WebSession $viewer
$privateStatus = 0
try { $null = Invoke-RestMethod -Uri "$base/api/accounts/$($private.id)" -WebSession $viewer } catch { $privateStatus = Get-Status $_ }
Assert-Check 'Viewer cannot list or read another member private account' ((@($visibleAccounts | Where-Object id -eq $private.id).Count -eq 0) -and $privateStatus -eq 404) "Private account absent from list; detail HTTP $privateStatus"

$viewerWriteStatus = 0
try { $null = Post-Json '/api/transactions' @{ accountId = $shared.id; categoryId = $category.id; amount = '1'; type = 'EXPENSE'; description = 'Viewer write denial'; date = '2026-09-25T12:02:00.000Z' } $viewer @{ 'Idempotency-Key' = "qa-$suffix-viewer-write" } } catch { $viewerWriteStatus = Get-Status $_ }
Assert-Check 'Viewer role is denied financial mutations' ($viewerWriteStatus -eq 403) "HTTP $viewerWriteStatus"

$unauthStatus = 0
try { $null = Invoke-RestMethod -Uri "$base/api/accounts" } catch { $unauthStatus = Get-Status $_ }
Assert-Check 'Unauthenticated account access is denied' ($unauthStatus -eq 401) "HTTP $unauthStatus"

$members = Invoke-RestMethod -Uri "$base/api/household/members" -WebSession $viewer
$viewerMember = $members.members | Where-Object { $_.user.id -eq $viewerReg.user.id } | Select-Object -First 1
Assert-Check 'Household API excludes password hashes' ($null -eq $viewerMember.user.passwordHash) 'Member response exposes only selected profile fields'

$results | ConvertTo-Json -Depth 5
