# Product Decision Required — Budget Rollover

**Status: UNAPPROVED — implementation blocked.** Current code treats each budget as a household/category/month/year target and does not carry a balance forward. This document surfaces choices; it does not select accounting behavior.

Before coding, product and finance owners must approve:

1. **Unused amount:** expire, carry forward the actual remainder, or carry a capped amount? If a budget is edited, does its remainder recalculate?
2. **Overspending:** carry negative remainder into next period, reset at period boundary, or track overspend separately? Can future budget be reduced automatically?
3. **Period boundaries:** calendar month only, fiscal year, or configurable annual periods? Define timezone and month-end behavior.
4. **Retroactive transactions:** should a backdated transaction recompute prior and subsequent rollover balances? How are closed periods handled?
5. **Category changes:** does a renamed/moved/deleted category preserve history and rollover chain? Are category merges allowed?
6. **Shared household budgets:** is the amount shared by all members, role-restricted, or allocated per member? How are simultaneous edits resolved?
7. **Refund/reversal interaction:** does a refund restore the original month’s budget, affect the current month, or both through a restatement?
8. **Precision and limits:** currency minor units, rounding, caps, and reporting behavior.

Required acceptance tests should cover unused funds, overspend, month/year boundary, leap year, retroactive transaction, category rename, concurrent shared edits, refunds, and reopening a closed period. No rollover feature or rule has been implemented.
