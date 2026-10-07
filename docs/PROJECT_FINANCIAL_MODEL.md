# Kamasi Finance — Universal Project & Financial Planning Engine v2
## Financial Modeling & Mathematical Invariants

---

### 1. Invariant Formulations

For any project $P$, with active versioned financial plan $F_P$, cost items $C_P$, payment requirements $R_P$, and funding channels $S_P$:

#### 1.1 Total Approved Budget
$$\text{Budget}(P) = \sum_{c \in C_P} c.\text{approvedAmount} + F_P.\text{contingencyAmount}$$

#### 1.2 Total Scheduled Commitments
$$\text{Committed}(P) = \sum_{r \in R_P} r.\text{amount}$$

#### 1.3 Total Actual Spend (Authoritative Ledger Linkage)
$$\text{Actual}(P) = \sum_{r \in R_P} \sum_{a \in r.\text{allocations}} a.\text{amount}$$
where each allocation $a$ must reference a valid, posted transaction $T$:
$$T.\text{status} = \text{'POSTED'} \land T.\text{householdId} = P.\text{householdId}$$

#### 1.4 Pending Commitment Obligation
$$\text{PendingCommitments}(P) = \sum_{r \in R_P, r.\text{status} \in \{\text{'PENDING'}, \text{'DUE'}, \text{'OVERDUE'}\}} (r.\text{amount} - r.\text{paidAmount})$$

---

### 2. Funding Claim Over-Allocation Detection

When multiple active projects claim funding from the same liquid bank account or asset:

For a given ledger account $A$:
$$\text{TotalCommittedClaims}(A) = \sum_{P} \sum_{s \in S_P, s.\text{accountId} = A.\text{id}} s.\text{committedAmount}$$

The system triggers an invariant conflict if:
$$\text{TotalCommittedClaims}(A) > A.\text{balance}$$

This prevents household members from double-counting savings across concurrent projects.

---

### 3. Deterministic Health Calculation Algorithm

Project health is evaluated deterministically in the following priority order:

1. **COMPLETED**: If $P.\text{status} = \text{'COMPLETED'}$.
2. **PAYMENT_OVERDUE**: If any $r \in R_P$ has $r.\text{status} = \text{'OVERDUE'}$.
3. **PAYMENT_DUE**: If any $r \in R_P$ is due within 7 days and unpaid.
4. **BUDGET_RISK**: If $\text{Actual}(P) > \text{Budget}(P)$.
5. **FUNDING_GAP**: If $\sum s.\text{committedAmount} < \text{Budget}(P)$ and project is ACTIVE.
6. **ON_TRACK**: If all milestones and obligations are met within expected thresholds.

