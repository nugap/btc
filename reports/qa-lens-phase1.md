# 🔬 Lens — Functional Logic Audit Report (Phase 1: yolo.html)

**Date:** 2026-04-14
**Auditor:** Lens (Functional logic perspective)
**Scope:** All features in template.html vs Phase 1 spec (specs/phase1-yolo-btc.md) and MILESTONES.md acceptance criteria
**Verdict:** ⚠️ CONDITIONAL PASS — 1 CRITICAL logic bug, 4 functional gaps

---

## Acceptance Criteria Checklist

| # | Criteria | Status | Notes |
|---|---------|--------|-------|
| 1.1 | Single file, no ext deps | ✅ PASS | yolo.html is 2MB, all inlined |
| 1.2 | Import xpub/zpub | ✅ PASS | zpub→xpub conversion works, BIP-84 derivation verified |
| 1.3 | Import single address | ✅ PASS | bc1q and bc1p accepted, validated |
| 1.4 | Balance display | ✅ PASS | Total balance in BTC (8 decimals) |
| 1.5 | UTXO list | ✅ PASS | Expandable per address, txid/vout/value/confirmed shown |
| 1.6 | Construct transaction | ⚠️ PARTIAL | PSBT construction works but see F-1 |
| 1.7 | Fee rate estimation | ✅ PASS | Pulls from mempool.space, real-time slider |
| 1.8 | QR display | ✅ PASS | BC-UR crypto-psbt, animated for large PSBTs |
| 1.9 | QR scanning | ✅ PASS | html5-qrcode + URDecoder, progress bar |
| 1.10 | Broadcast | ✅ PASS | POST /api/tx with raw hex |
| 1.11 | Input validation | ⚠️ PARTIAL | See F-2 |
| 1.12 | Responsive | ✅ PASS | Mobile-first, 640px breakpoint |
| 1.13 | Dark theme | ✅ PASS | Colors match spec exactly |

---

## Critical Findings

### F-1: Gap limit logic not properly implemented
**Severity:** CRITICAL
**Location:** `fetchAllBalances()` — gap counter logic
**Spec says:** "If addresses 0-19 all empty, don't derive more. If some have activity, extend to gap limit of 20 consecutive empty addresses."
**Actual behavior:** The code derives exactly 20 receive + 20 change addresses upfront (`deriveAddresses` always generates 20+20). The `gapCount` variable in `fetchAllBalances()` is incremented but **never used** — it doesn't trigger additional address derivation when activity is found beyond index 19.
**Impact:** If a wallet has activity on addresses beyond index 19 (common for active wallets), those funds will be invisible. User sees incorrect (lower) balance.
**Recommendation:** Implement dynamic address derivation: start with 20, if activity found near the end, derive more until 20 consecutive empty addresses are found.

---

## Functional Gaps

### F-2: Missing fee rate pre-population from mempool.space labels
**Severity:** MEDIUM
**Spec says:** Section 4.3 — "Pre-populated from mempool.space recommended fees with labels: Economy / Normal / Priority"
**Actual:** The slider labels show static "Economy" and "Priority" text. The slider value is set from `halfHourFee`, but there's no indication which fee level (economy/normal/priority) the current position corresponds to.
**Recommendation:** Show actual values: "Economy (1 sat/vB) | Normal (4 sat/vB) | Priority (10 sat/vB)" dynamically from API response.

### F-3: No "last updated: X min ago" display
**Severity:** LOW
**Spec says:** Section 4.2 — "Show 'last updated: X min ago' timestamp"
**Actual:** Shows "Updated: HH:MM:SS" (absolute time, not relative). This is a minor cosmetic gap.

### F-4: processSignedPsbt doesn't show full transaction details
**Severity:** MEDIUM
**Spec says:** Section 4.6 — Final preview should show "All inputs with addresses and amounts, All outputs with addresses and amounts, Total fee, Fee rate, Transaction size"
**Actual:** The broadcast preview only shows truncated TX hex and byte count. It doesn't decode and display inputs/outputs/fee breakdown.
**Recommendation:** After `tx.finalize()`, iterate through inputs/outputs and display human-readable details before broadcast confirmation.

### F-5: No file upload fallback for QR scanning
**Severity:** LOW
**Spec says:** Section 4.5 — "No camera found: show error with suggestion to use file upload"
**Actual:** Shows error "No camera found" but no file upload option is provided.
**Recommendation:** Add file input as fallback for desktop/no-camera scenarios.

---

## Positive Findings ✅

1. **UTXO selection algorithm** — Correctly sorts descending, handles dust absorption (< 546 sats → absorbed into fee)
2. **Change address derivation** — Correctly uses first unused change address for xpub, same address for single-address mode
3. **Amount conversion** — Integer arithmetic throughout, no floating point for financial math
4. **BC-UR encoding** — Proper CBOR wrapping, correct `crypto-psbt` type
5. **API error handling** — Retry on 429, clear error messages, network error detection
6. **Navigation flow** — Clean section-based SPA, back buttons work correctly
7. **Max amount calculation** — Correctly accounts for sweep (1 output, no change)

---

## Test Results

13/13 e2e tests passing:
- Address validation (5/5)
- HD key derivation (3/3)
- PSBT construction (1/1)
- BC-UR round trip (1/1)
- UTXO selection (1/1)
- Amount conversion (2/2)

---

## Recommendation

**F-1 (gap limit) is the only blocking issue.** A wallet with >20 active addresses will show wrong balance — this is a data correctness problem that affects financial safety. Fix before Phase 1 sign-off.

F-4 (broadcast preview) is strongly recommended for user safety — users should see exactly what they're broadcasting.

Other issues are quality-of-life improvements, not blockers.
