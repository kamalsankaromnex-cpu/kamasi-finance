$ErrorActionPreference = 'Stop'
if ($env:KAMASI_QA_DATABASE -ne 'prisma/phase3-qa.db') {
  throw 'Refusing to write QA data: set KAMASI_QA_DATABASE=prisma/phase3-qa.db and run the app against that dedicated disposable database.'
}
$base = if ($env:PHASE3_API_BASE_URL) { $env:PHASE3_API_BASE_URL } else { 'http://127.0.0.1:3104' }
$suffix = [guid]::NewGuid().ToString('N')
$password = 'Qa-' + [guid]::NewGuid().ToString('N') + '!'
$owner = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$other = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$results = [System.Collections.Generic.List[object]]::new()

function Post([string]$path, $body, $session, $headers = @{}) {
  $response = Invoke-WebRequest -Uri ($script:base + $path) -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 10 -Compress) -WebSession $session -Headers $headers -SkipHttpErrorCheck
  return [pscustomobject]@{ status = [int]$response.StatusCode; body = $(if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }) }
}
function Get([string]$path, $session) {
  $response = Invoke-WebRequest -Uri ($script:base + $path) -Method Get -WebSession $session -SkipHttpErrorCheck
  return [pscustomobject]@{ status = [int]$response.StatusCode; body = $(if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null }) }
}
function Check([string]$id, [string]$scenario, [bool]$condition, [string]$actual, [string]$severity = 'P1') {
  $result = if ($condition) { 'PASS' } else { 'FAIL' }
  $script:results.Add([pscustomobject]@{ id = $id; scenario = $scenario; actual = $actual; status = $result; severity = $severity })
  if (-not $condition) { throw "FAILED $id — $actual" }
}

$registered = Post '/api/auth/register' @{ email = "phase3-owner-$suffix@qa.local"; password = $password; name = 'Phase 3 Owner'; householdName = "Phase 3 QA $suffix" } $owner
Check 'P3-AUTH-001' 'Register synthetic owner household' ($registered.status -eq 201 -and $registered.body.user.role -eq 'OWNER') "HTTP $($registered.status); role $($registered.body.user.role)" 'P0'
$otherRegistered = Post '/api/auth/register' @{ email = "phase3-other-$suffix@qa.local"; password = $password; name = 'Other Owner'; householdName = "Other $suffix" } $other
Check 'P3-SEC-001' 'Register second isolated household' ($otherRegistered.status -eq 201) "HTTP $($otherRegistered.status)" 'P0'

$accountResponse = Post '/api/accounts' @{ name = 'Phase 3 Main Account'; type = 'BANK'; balance = '1000'; accountNumber = "SYNTHETIC-$suffix"; isShared = $true } $owner
$account = $accountResponse.body
$destinationResponse = Post '/api/accounts' @{ name = 'Phase 3 Transfer Account'; type = 'CASH'; balance = '200'; isShared = $true } $owner
$destination = $destinationResponse.body
Check 'P3-ACCT-001' 'Create two synthetic accounts' ($accountResponse.status -eq 201 -and $destinationResponse.status -eq 201) "HTTP $($accountResponse.status)/$($destinationResponse.status)" 'P0'
Check 'P3-ACCT-002' 'Account responses mask full account numbers and reject invalid financial metadata' (($account.accountNumber -match '\*{4}\s\d{4}$') -and (Post '/api/accounts' @{ name = 'Invalid synthetic account'; type = 'BANK'; balance = 'NaN' } $owner).status -eq 400) "masked account $($account.accountNumber); invalid opening balance rejected" 'P0'
$creditAccount = Post '/api/accounts' @{ name = 'Phase 3 Limited Credit'; type = 'CREDIT'; balance = '0'; creditLimit = '100'; isShared = $true } $owner
$creditOver = Post '/api/transactions' @{ accountId = $creditAccount.body.id; amount = '101'; type = 'EXPENSE'; description = 'Over credit limit' } $owner @{ 'Idempotency-Key' = "phase3-credit-over-$suffix" }
$creditWithin = Post '/api/transactions' @{ accountId = $creditAccount.body.id; amount = '90'; type = 'EXPENSE'; description = 'Within credit limit' } $owner @{ 'Idempotency-Key' = "phase3-credit-within-$suffix" }
Check 'P3-ACCT-003' 'Credit spending is bounded by the configured credit limit' ($creditAccount.status -eq 201 -and $creditOver.status -eq 409 -and $creditWithin.status -eq 201 -and [decimal]$creditWithin.body.amount -eq 90) "account/over-limit/within-limit HTTP $($creditAccount.status)/$($creditOver.status)/$($creditWithin.status)" 'P0'
$foreignRead = Get "/api/accounts/$($account.id)" $other
Check 'P3-SEC-002' 'Second household cannot read first household account' ($foreignRead.status -eq 404) "HTTP $($foreignRead.status)" 'P0'
$foreignAccountForIncome = Post '/api/accounts' @{ name = 'Other Household Account'; type = 'BANK'; balance = '50'; isShared = $true } $other
$foreignCategory = Post '/api/categories' @{ name = 'Foreign Income Category'; type = 'INCOME' } $other
$categories = Get '/api/categories' $owner
$expenseCategory = @($categories.body | Where-Object type -eq 'EXPENSE' | Select-Object -First 1)[0]
$budget = Post '/api/budgets' @{ categoryId = $expenseCategory.id; amount = '8000'; month = 9; year = 2026 } $owner
$asset = Post '/api/assets' @{ name = 'Synthetic asset'; type = 'OTHER'; value = '10000' } $owner
$liability = Post '/api/liabilities' @{ name = 'Synthetic liability'; type = 'OTHER'; amount = '2000' } $owner
$investment = Post '/api/investments' @{ name = 'Synthetic holding'; symbol = 'P3'; type = 'OTHER'; quantity = '2'; purchasePrice = '50'; currentPrice = '75' } $owner
Check 'P3-MOD-001' 'Create synthetic budget, asset, liability, and investment fixtures' ($budget.status -eq 201 -and $asset.status -eq 201 -and $liability.status -eq 201 -and $investment.status -eq 201) "budget/asset/liability/investment HTTP $($budget.status)/$($asset.status)/$($liability.status)/$($investment.status)" 'P1'
Check 'P3-MOD-002' 'Reject malformed goal, investment, asset and liability money/date inputs' (((Post '/api/goals' @{ name = 'Invalid goal'; targetAmount = '-1'; targetDate = '2026-09-01' } $owner).status -eq 400) -and ((Post '/api/investments' @{ name = 'Invalid holding'; purchasePrice = '-1' } $owner).status -eq 400) -and ((Post '/api/assets' @{ name = 'Invalid asset'; value = 'NaN' } $owner).status -eq 400) -and ((Post '/api/liabilities' @{ name = 'Invalid debt'; amount = '-2' } $owner).status -eq 400)) 'invalid route payloads all rejected with HTTP 400' 'P1'

$invalidEmploymentSalary = Post '/api/employments' @{ employerName = 'Invalid salary employer'; expectedMonthlySalary = '-5' } $owner
$invalidEmploymentDay = Post '/api/employments' @{ employerName = 'Invalid day employer'; salaryCreditDate = 32 } $owner
$foreignEmployment = Post '/api/employments' @{ employerName = 'Foreign profile'; userId = $otherRegistered.body.user.id } $owner
Check 'P3-EMP-001' 'Reject negative salary, invalid credit day, and nonmember employment owner' ($invalidEmploymentSalary.status -eq 400 -and $invalidEmploymentDay.status -eq 400 -and $foreignEmployment.status -eq 404) "salary/day/foreign-member HTTP $($invalidEmploymentSalary.status)/$($invalidEmploymentDay.status)/$($foreignEmployment.status)" 'P1'
$employmentResponse = Post '/api/employments' @{ employerName = 'Phase 3 Synthetic Employer'; expectedMonthlySalary = '1000' } $owner
$employment = $employmentResponse.body
$invalidMonth = Post '/api/payslips' @{ employmentId = $employment.id; month = 13; year = 2026; basicSalary = '1000' } $owner
$negativeEarning = Post '/api/payslips' @{ employmentId = $employment.id; month = 9; year = 2026; basicSalary = '-1' } $owner
$validSlipResponse = Post '/api/payslips' @{ employmentId = $employment.id; month = 9; year = 2026; basicSalary = '1000'; pfDeduction = '100' } $owner
$payslip = $validSlipResponse.body
Check 'P3-SAL-001' 'Reject invalid accounting month and negative salary components' ($invalidMonth.status -eq 400 -and $negativeEarning.status -eq 400) "month HTTP $($invalidMonth.status); negative earning HTTP $($negativeEarning.status)" 'P1'
Check 'P3-SAL-002' 'Calculate a valid payslip using exact decimal components' ($validSlipResponse.status -eq 201 -and [decimal]$payslip.grossSalary -eq 1000 -and [decimal]$payslip.netSalary -eq 900) "HTTP $($validSlipResponse.status); gross $($payslip.grossSalary), net $($payslip.netSalary)" 'P0'
$invalidCredit = Post '/api/payslips/confirm' @{ payslipId = $payslip.id; accountId = $account.id; actualAmountCredited = '-25' } $owner
$overCredit = Post '/api/payslips/confirm' @{ payslipId = $payslip.id; accountId = $account.id; actualAmountCredited = '901' } $owner
$badCreditDate = Post '/api/payslips/confirm' @{ payslipId = $payslip.id; accountId = $account.id; actualCreditDate = 'not-a-date' } $owner
Check 'P3-SAL-003' 'Reject negative, excessive, and malformed-date salary confirmation' ($invalidCredit.status -eq 400 -and $overCredit.status -eq 400 -and $badCreditDate.status -eq 400) "negative/over/date HTTP $($invalidCredit.status)/$($overCredit.status)/$($badCreditDate.status)" 'P0'
$confirmed = Post '/api/payslips/confirm' @{ payslipId = $payslip.id; accountId = $account.id; actualCreditDate = '2026-09-28'; actualAmountCredited = '500' } $owner
$accountAfterCredit = Get "/api/accounts/$($account.id)" $owner
$repeatConfirm = Post '/api/payslips/confirm' @{ payslipId = $payslip.id; accountId = $account.id; actualCreditDate = '2026-09-28'; actualAmountCredited = '500' } $owner
$regenerateConfirmed = Post '/api/payslips' @{ employmentId = $employment.id; month = 9; year = 2026; basicSalary = '1200' } $owner
Check 'P3-SAL-004' 'Partial salary credit posts once and response minimizes account fields' ($confirmed.status -eq 200 -and [decimal]$confirmed.body.accountBalance -eq 1500 -and $null -eq $confirmed.body.payslip.account.accountNumber) "HTTP $($confirmed.status); balance $($confirmed.body.accountBalance); account number returned $($null -ne $confirmed.body.payslip.account.accountNumber)" 'P0'
Check 'P3-SAL-005' 'Repeated confirmation does not double-credit or regenerate history' ($repeatConfirm.status -eq 409 -and [decimal]$accountAfterCredit.body.balance -eq 1500 -and $regenerateConfirmed.status -eq 409) "repeat HTTP $($repeatConfirm.status); balance $($accountAfterCredit.body.balance); regeneration HTTP $($regenerateConfirmed.status)" 'P0'

$sourceResponse = Post '/api/income-sources' @{ name = 'Phase 3 One-time Income'; category = 'Other'; behavior = 'ONE_TIME'; frequency = 'MONTHLY' } $owner
$source = $sourceResponse.body
$invalidSourceAmount = Invoke-WebRequest -Uri "$base/api/income-sources/$($source.id)" -Method Put -ContentType 'application/json' -Body (@{ expectedAmount = '-10' } | ConvertTo-Json -Compress) -WebSession $owner -SkipHttpErrorCheck
$foreignSourceAccount = Invoke-WebRequest -Uri "$base/api/income-sources/$($source.id)" -Method Put -ContentType 'application/json' -Body (@{ defaultAccountId = $foreignAccountForIncome.body.id } | ConvertTo-Json -Compress) -WebSession $owner -SkipHttpErrorCheck
$foreignSourceCategory = Invoke-WebRequest -Uri "$base/api/income-sources/$($source.id)" -Method Put -ContentType 'application/json' -Body (@{ categoryId = $foreignCategory.body.id } | ConvertTo-Json -Compress) -WebSession $owner -SkipHttpErrorCheck
Check 'P3-INC-003' 'Income source update rejects negative amounts and foreign account/category IDs' ([int]$invalidSourceAmount.StatusCode -eq 400 -and [int]$foreignSourceAccount.StatusCode -eq 400 -and [int]$foreignSourceCategory.StatusCode -eq 400) "amount/account/category HTTP $($invalidSourceAmount.StatusCode)/$($foreignSourceAccount.StatusCode)/$($foreignSourceCategory.StatusCode)" 'P0'
$negativeOccurrence = Post '/api/income-occurrences' @{ incomeSourceId = $source.id; name = 'Negative'; expectedAmount = '-50'; dueDate = '2026-09-10' } $owner
$zeroOccurrence = Post '/api/income-occurrences' @{ incomeSourceId = $source.id; name = 'Zero'; expectedAmount = '0'; dueDate = '2026-09-10' } $owner
$badOccurrenceDate = Post '/api/income-occurrences' @{ incomeSourceId = $source.id; name = 'Bad date'; expectedAmount = '50'; dueDate = '2026-02-30' } $owner
$badOccurrencePeriod = Post '/api/income-occurrences' @{ incomeSourceId = $source.id; name = 'Reversed period'; expectedAmount = '50'; periodStart = '2026-09-20'; periodEnd = '2026-09-01'; dueDate = '2026-09-10' } $owner
$validOccurrenceResponse = Post '/api/income-occurrences' @{ incomeSourceId = $source.id; name = 'Phase 3 occurrence'; expectedAmount = '50'; periodStart = '2026-09-01'; periodEnd = '2026-09-30'; dueDate = '2026-09-10' } $owner
$occurrence = $validOccurrenceResponse.body
Check 'P3-INC-001' 'Reject invalid occurrence amount and accounting dates' ($negativeOccurrence.status -eq 400 -and $zeroOccurrence.status -eq 400 -and $badOccurrenceDate.status -eq 400 -and $badOccurrencePeriod.status -eq 400) "negative/zero/bad-date/period HTTP $($negativeOccurrence.status)/$($zeroOccurrence.status)/$($badOccurrenceDate.status)/$($badOccurrencePeriod.status)" 'P0'
Check 'P3-INC-002' 'Create valid income occurrence with validated period' ($validOccurrenceResponse.status -eq 201 -and [decimal]$occurrence.expectedAmount -eq 50) "HTTP $($validOccurrenceResponse.status); expected $($occurrence.expectedAmount)" 'P1'
$incomeKey = "phase3-income-$suffix"
$receiptPayload = @{ incomeSourceId = $source.id; occurrenceId = $occurrence.id; accountId = $account.id; amount = '20'; date = '2026-09-10'; description = 'Phase 3 synthetic receipt' }
$receipt = Post '/api/income-sources/receipts' $receiptPayload $owner @{ 'Idempotency-Key' = $incomeKey }
$receiptReplay = Post '/api/income-sources/receipts' $receiptPayload $owner @{ 'Idempotency-Key' = $incomeKey }
$balanceBeforeRejectedReceipt = Get "/api/accounts/$($account.id)" $owner
$excessReceipt = Post '/api/income-sources/receipts' @{ incomeSourceId = $source.id; occurrenceId = $occurrence.id; accountId = $account.id; amount = '40'; date = '2026-09-10' } $owner @{ 'Idempotency-Key' = "phase3-excess-$suffix" }
$balanceAfterRejectedReceipt = Get "/api/accounts/$($account.id)" $owner
$afterReceipt = Get '/api/income-occurrences' $owner
$postedOccurrence = @($afterReceipt.body | Where-Object id -eq $occurrence.id)[0]
Check 'P3-LED-001' 'Receipt updates income occurrence and account; retry does not duplicate' ($receipt.status -eq 201 -and $receiptReplay.status -eq 200 -and [decimal]$postedOccurrence.receivedAmount -eq 20 -and [decimal]$postedOccurrence.outstandingAmount -eq 30) "receipt/replay HTTP $($receipt.status)/$($receiptReplay.status); received $($postedOccurrence.receivedAmount); outstanding $($postedOccurrence.outstandingAmount)" 'P0'
Check 'P3-LED-005' 'Over-receipt rollback leaves account and occurrence untouched' ($excessReceipt.status -eq 400 -and [decimal]$balanceBeforeRejectedReceipt.body.balance -eq [decimal]$balanceAfterRejectedReceipt.body.balance -and [decimal]$postedOccurrence.receivedAmount -eq 20 -and [decimal]$postedOccurrence.outstandingAmount -eq 30) "over-receipt HTTP $($excessReceipt.status); account $($balanceBeforeRejectedReceipt.body.balance)/$($balanceAfterRejectedReceipt.body.balance); occurrence received/outstanding $($postedOccurrence.receivedAmount)/$($postedOccurrence.outstandingAmount)" 'P0'

$transferKey = "phase3-transfer-$suffix"
$transfer = Post '/api/transactions' @{ accountId = $account.id; transferAccountId = $destination.id; amount = '120'; type = 'TRANSFER'; description = 'Phase 3 transfer'; date = '2026-09-12' } $owner @{ 'Idempotency-Key' = $transferKey }
$expenseKey = "phase3-expense-$suffix"
$expense = Post '/api/transactions' @{ accountId = $account.id; amount = '100'; type = 'EXPENSE'; description = 'Phase 3 reversible expense'; date = '2026-09-13' } $owner @{ 'Idempotency-Key' = $expenseKey }
$expenseReplay = Post '/api/transactions' @{ accountId = $account.id; amount = '100'; type = 'EXPENSE'; description = 'Phase 3 reversible expense'; date = '2026-09-13' } $owner @{ 'Idempotency-Key' = $expenseKey }
$void = Invoke-WebRequest -Uri "$base/api/transactions/$($expense.body.id)" -Method Delete -WebSession $owner -SkipHttpErrorCheck
$voidReplay = Invoke-WebRequest -Uri "$base/api/transactions/$($expense.body.id)" -Method Delete -WebSession $owner -SkipHttpErrorCheck
$voidedLedgerRow = @((Get '/api/transactions' $owner).body | Where-Object id -eq $expense.body.id)[0]
Check 'P3-LED-002' 'Transfer conserves cash and void preserves original transaction facts' ($transfer.status -eq 201 -and $expense.status -eq 201 -and $expenseReplay.status -eq 200 -and [int]$void.StatusCode -eq 200 -and [int]$voidReplay.StatusCode -eq 200 -and $voidedLedgerRow.type -eq 'EXPENSE' -and $voidedLedgerRow.description -eq 'Phase 3 reversible expense' -and $voidedLedgerRow.isVoided -and $null -ne $voidedLedgerRow.voidedAt) "transfer/expense/replay/void/revoid HTTP $($transfer.status)/$($expense.status)/$($expenseReplay.status)/$($void.StatusCode)/$($voidReplay.StatusCode); original type $($voidedLedgerRow.type), isVoided $($voidedLedgerRow.isVoided)" 'P0'

$refundExpense = Post '/api/transactions' @{ accountId = $account.id; amount = '50'; type = 'EXPENSE'; description = 'Phase 3 refundable expense'; date = '2026-09-14' } $owner @{ 'Idempotency-Key' = "phase3-refund-exp-$suffix" }
$refundKey = "phase3-refund-$suffix"
$refundPayload = @{ amount = '30'; date = '2026-09-16'; notes = 'Synthetic partial refund' }
$refund = Post "/api/transactions/$($refundExpense.body.id)/refund" $refundPayload $owner @{ 'Idempotency-Key' = $refundKey }
$refundReplay = Post "/api/transactions/$($refundExpense.body.id)/refund" $refundPayload $owner @{ 'Idempotency-Key' = $refundKey }
$refundRemainder = Post "/api/transactions/$($refundExpense.body.id)/refund" @{ amount = '20'; date = '2026-09-17' } $owner @{ 'Idempotency-Key' = "phase3-refund-rem-$suffix" }
$refundExcess = Post "/api/transactions/$($refundExpense.body.id)/refund" @{ amount = '1'; date = '2026-09-18' } $owner @{ 'Idempotency-Key' = "phase3-refund-over-$suffix" }
$foreignRefund = Post "/api/transactions/$($refundExpense.body.id)/refund" @{ amount = '1'; date = '2026-09-18' } $other @{ 'Idempotency-Key' = "phase3-foreign-refund-$suffix" }
Check 'P3-REF-001' 'Partial refunds link as income, replay once, cap at original expense, and isolate household' ($refundExpense.status -eq 201 -and $refund.status -eq 201 -and $refundReplay.status -eq 200 -and $refundRemainder.status -eq 201 -and $refundExcess.status -eq 409 -and $foreignRefund.status -eq 404 -and $refundRemainder.body.transaction.refundOfId -eq $refundExpense.body.id) "expense/refund/replay/remainder/excess/foreign HTTP $($refundExpense.status)/$($refund.status)/$($refundReplay.status)/$($refundRemainder.status)/$($refundExcess.status)/$($foreignRefund.status)" 'P0'

$bill = Post '/api/recurring-bills' @{ name = 'Phase 3 Synthetic Bill'; accountId = $account.id; amount = '100'; type = 'EXPENSE'; frequency = 'MONTHLY'; startDate = '2026-09-01'; nextDueDate = '2026-09-15' } $owner
$billOccurrenceId = $bill.body.occurrence.id
$billKey = "phase3-billpay-$suffix"
$billPayPayload = @{ occurrenceId = $billOccurrenceId; accountId = $account.id; amount = '25'; date = '2026-09-15' }
$billPay = Post '/api/recurring-bills/payments' $billPayPayload $owner @{ 'Idempotency-Key' = $billKey }
$billReplay = Post '/api/recurring-bills/payments' $billPayPayload $owner @{ 'Idempotency-Key' = $billKey }
Check 'P3-LED-003' 'Bill payment and retry update outstanding and balance once' ($bill.status -eq 201 -and $billPay.status -eq 201 -and $billReplay.status -eq 200 -and [decimal]$billPay.body.occurrence.paidAmount -eq 25 -and [decimal]$billPay.body.occurrence.outstandingAmount -eq 75) "rule/payment/replay HTTP $($bill.status)/$($billPay.status)/$($billReplay.status); paid $($billPay.body.occurrence.paidAmount), outstanding $($billPay.body.occurrence.outstandingAmount)" 'P0'
$largeBill = Post '/api/recurring-bills' @{ name = 'Phase 3 Insufficient Funds Bill'; accountId = $account.id; amount = '2000'; type = 'EXPENSE'; frequency = 'MONTHLY'; startDate = '2026-09-01'; nextDueDate = '2026-09-20' } $owner
$balanceBeforeBillFailure = Get "/api/accounts/$($account.id)" $owner
$billOverdraft = Post '/api/recurring-bills/payments' @{ occurrenceId = $largeBill.body.occurrence.id; accountId = $account.id; amount = '2000'; date = '2026-09-20' } $owner @{ 'Idempotency-Key' = "phase3-bill-overdraft-$suffix" }
$billAfterFailure = Get "/api/recurring-bills" $owner
$largeBillAfterFailure = @($billAfterFailure.body.occurrences | Where-Object id -eq $largeBill.body.occurrence.id)[0]
$balanceAfterBillFailure = Get "/api/accounts/$($account.id)" $owner
Check 'P3-LED-007' 'Insufficient bill payment rolls back occurrence, transaction and account updates' ($billOverdraft.status -eq 409 -and [decimal]$largeBillAfterFailure.paidAmount -eq 0 -and [decimal]$largeBillAfterFailure.outstandingAmount -eq 2000 -and [decimal]$balanceBeforeBillFailure.body.balance -eq [decimal]$balanceAfterBillFailure.body.balance) "payment HTTP $($billOverdraft.status); paid/outstanding $($largeBillAfterFailure.paidAmount)/$($largeBillAfterFailure.outstandingAmount); balance $($balanceBeforeBillFailure.body.balance)/$($balanceAfterBillFailure.body.balance)" 'P0'

$preOverdraft = Get "/api/accounts/$($account.id)" $owner
$overdraft = Post '/api/transactions' @{ accountId = $account.id; amount = ([decimal]$preOverdraft.body.balance + 1).ToString('0.00'); type = 'EXPENSE'; description = 'Must not overdraw synthetic account'; date = '2026-09-19' } $owner @{ 'Idempotency-Key' = "phase3-overdraft-$suffix" }
$postOverdraft = Get "/api/accounts/$($account.id)" $owner
$overdraftTransfer = Post '/api/transactions' @{ accountId = $account.id; transferAccountId = $destination.id; amount = ([decimal]$preOverdraft.body.balance + 1).ToString('0.00'); type = 'TRANSFER'; description = 'Must not overdraw synthetic transfer'; date = '2026-09-19' } $owner @{ 'Idempotency-Key' = "phase3-transfer-overdraft-$suffix" }
$overdraftLedgerCheck = Get '/api/transactions' $owner
$overdraftRows = @($overdraftLedgerCheck.body | Where-Object { $_.description -in @('Must not overdraw synthetic account', 'Must not overdraw synthetic transfer') }).Count
Check 'P3-LED-006' 'Reject expense and transfer beyond available balance without writing ledger rows' ($overdraft.status -eq 409 -and $overdraftTransfer.status -eq 409 -and [decimal]$preOverdraft.body.balance -eq [decimal]$postOverdraft.body.balance -and $overdraftRows -eq 0) "expense/transfer HTTP $($overdraft.status)/$($overdraftTransfer.status); balance before/after $($preOverdraft.body.balance)/$($postOverdraft.body.balance); failed postings $overdraftRows" 'P0'

$goal = Post '/api/goals' @{ name = 'Phase 3 Savings Goal'; targetAmount = '1000'; currentAmount = '0'; targetDate = '2027-12-31' } $owner
$goalKey = "phase3-goal-$suffix"
$goalContribution = Post "/api/goals/$($goal.body.id)/contribute" @{ accountId = $account.id; amount = '40' } $owner @{ 'Idempotency-Key' = $goalKey }
$goalReplay = Post "/api/goals/$($goal.body.id)/contribute" @{ accountId = $account.id; amount = '40' } $owner @{ 'Idempotency-Key' = $goalKey }
Check 'P3-LED-004' 'Goal contribution updates goal and ledger once on retry' ($goal.status -eq 201 -and $goalContribution.status -eq 200 -and $goalReplay.status -eq 200 -and [decimal]$goalContribution.body.currentAmount -eq 40) "goal/contribution/replay HTTP $($goal.status)/$($goalContribution.status)/$($goalReplay.status); current amount $($goalContribution.body.currentAmount)" 'P0'

$concurrentKey = "phase3-concurrent-$suffix"
$concurrentPayload = @{ accountId = $account.id; amount = '30'; type = 'EXPENSE'; description = 'Phase 3 concurrent expense'; date = '2026-09-18' } | ConvertTo-Json -Compress
$cookie = ($owner.Cookies.GetCookies([uri]$base) | Where-Object Name -eq 'kamasi_session' | Select-Object -First 1).Value
$jobs = 1..2 | ForEach-Object {
  Start-ThreadJob -ArgumentList $base, $cookie, $concurrentKey, $concurrentPayload -ScriptBlock {
    param($apiBase, $jwt, $key, $json)
    try {
      $response = Invoke-WebRequest -Uri "$apiBase/api/transactions" -Method Post -ContentType 'application/json' -Body $json -Headers @{ Cookie = "kamasi_session=$jwt"; 'Idempotency-Key' = $key } -SkipHttpErrorCheck
      [int]$response.StatusCode
    } catch { 0 }
  }
}
$concurrentStatuses = @(Receive-Job -Job $jobs -Wait -AutoRemoveJob)
$concurrentRetry = Post '/api/transactions' ($concurrentPayload | ConvertFrom-Json) $owner @{ 'Idempotency-Key' = $concurrentKey }
$ledgerRows = Get '/api/transactions' $owner
$sameConcurrentPosting = @($ledgerRows.body | Where-Object description -eq 'Phase 3 concurrent expense').Count
Check 'P3-CON-001' 'Concurrent identical transaction requests produce at most one ledger posting' (($concurrentStatuses | Where-Object { $_ -eq 201 -or $_ -eq 200 }).Count -ge 1 -and $concurrentRetry.status -eq 200 -and $sameConcurrentPosting -eq 1) "parallel HTTP $($concurrentStatuses -join '/'); retry HTTP $($concurrentRetry.status); matching ledger rows $sameConcurrentPosting" 'P0'

$finalMain = Get "/api/accounts/$($account.id)" $owner
$finalDestination = Get "/api/accounts/$($destination.id)" $owner
$mainLedger = @($ledgerRows.body | Where-Object { $_.accountId -eq $account.id -and -not $_.isVoided -and $_.type -ne 'VOIDED' })
$mainIncome = ($mainLedger | Where-Object type -eq 'INCOME' | Measure-Object -Property amount -Sum).Sum
$mainExpenses = ($mainLedger | Where-Object type -eq 'EXPENSE' | Measure-Object -Property amount -Sum).Sum
$mainTransfersOut = ($mainLedger | Where-Object type -eq 'TRANSFER' | Measure-Object -Property amount -Sum).Sum
$destinationTransfersIn = ($ledgerRows.body | Where-Object { $_.transferAccountId -eq $destination.id -and $_.type -eq 'TRANSFER' } | Measure-Object -Property amount -Sum).Sum
$mainIncome = if ($null -eq $mainIncome) { [decimal]0 } else { [decimal]$mainIncome }
$mainExpenses = if ($null -eq $mainExpenses) { [decimal]0 } else { [decimal]$mainExpenses }
$mainTransfersOut = if ($null -eq $mainTransfersOut) { [decimal]0 } else { [decimal]$mainTransfersOut }
$destinationTransfersIn = if ($null -eq $destinationTransfersIn) { [decimal]0 } else { [decimal]$destinationTransfersIn }
$expectedMain = [decimal]1000 + $mainIncome - $mainExpenses - $mainTransfersOut
$expectedDestination = [decimal]200 + $destinationTransfersIn
Check 'P3-REC-001' 'Independent balance oracle reconciles persisted active ledger effects' ([decimal]$finalMain.body.balance -eq $expectedMain -and [decimal]$finalDestination.body.balance -eq $expectedDestination) "main opening+income-expense-transfer=$expectedMain/$($finalMain.body.balance); destination opening+transfer=$expectedDestination/$($finalDestination.body.balance)" 'P0'

$results | ConvertTo-Json -Depth 6
