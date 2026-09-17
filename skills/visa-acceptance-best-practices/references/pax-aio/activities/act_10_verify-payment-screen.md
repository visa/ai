# Activity 9: Interactive Transaction Verification

After all implementation gates are complete and the APK is installed on the PAX terminal,
verify that each implemented transaction type completes successfully by having the user
run transactions on the physical device while the agent analyses logcat output.

**Skip if:** no PAX terminal is connected (`TERMINAL_AVAILABLE=no`).

---

## Why this matters

A successful build does not guarantee transactions work at runtime. Each transaction type
has its own category of runtime-only failures:

| Transaction Type | Runtime failure that builds can't catch |
|------------------|----------------------------------------|
| Charge / Sale | Merchant credentials rejected by gateway; `ProviderMode` mismatch |
| Refund | Missing or invalid original transaction ID; refund-not-allowed config |
| Charge with Tip | Tipping parameters not passed; tip amount overflows field |
| Pre-Authorization | Credentials lack pre-auth permission; wrong `TransactionType` enum |
| Capture | No prior pre-auth to capture; capture amount exceeds auth amount |

Automated UI testing (uiautomator, input tap, screen scraping) is unreliable on PAX
terminals — the PAX Android fork has inconsistent `uiautomator` support and screen
coordinates vary by device model. Instead, this activity uses a **user-driven flow**:
the user manually runs each transaction on the physical device, and the agent analyses
logcat output to determine success or failure.

---

## Inputs (from workflow context)

| Variable | Source |
|----------|--------|
| `<device_serial>` | ADB device serial from Gate 8 |
| `<package>` | `package` field from `project-plan.md` |
| `gate_skip_decisions` | From `project-plan.md` — determines which transaction types to test |

---

## Step 1 — Determine Testable Transaction Types

Read `gate_skip_decisions` from `project-plan.md` and build an ordered list of transaction
types to test. The mapping is:

| Gate decision | Transaction type | Include? |
|---------------|-----------------|----------|
| `gate_3_charge` = `run` or `skip` | **Charge / Sale** | YES (always included — charge is the base transaction) |
| `gate_4_refund` = `run` or `skip` | **Refund** | YES |
| `gate_4_refund` = `declined` | Refund | NO — user declined this feature |
| `gate_5_tipping` = `run` or `skip` | **Charge with Tip** | YES |
| `gate_5_tipping` = `declined` | Charge with Tip | NO — user declined this feature |
| `gate_6_pre_auth` = `run` or `skip` | **Pre-Authorization** | YES |
| `gate_6_pre_auth` = `declined` | Pre-Authorization | NO — user declined this feature |
| `gate_7_capture` = `run` or `skip` | **Capture** | YES |
| `gate_7_capture` = `declined` | Capture | NO — user declined this feature |

Both `run` and `skip` mean code exists in the project and should be tested. Only `declined`
means the feature was not requested and should be excluded.

**Order enforced:** Charge → Refund → Charge with Tip → Pre-Authorization → Capture.
This order ensures dependencies flow correctly (refund needs a prior charge, capture needs
a prior pre-auth).

---

## Step 2 — Ask User: Begin Testing or Test Later

Use `AskUserQuestion` to present two options:

> **Ready to test transactions on your PAX terminal?**
>
> I'll walk you through each transaction type one at a time. You'll run the transaction
> on the device and I'll check the logs to verify it worked.
>
> Transaction types to test: [list from Step 1]
>
> - **Begin testing now**
> - **Test later** (you can re-run this gate when a terminal is available)

If the user chooses **Test later** → jump to Step 6 (DEFERRED report).

---

## Step 3 — Test Each Transaction Type (loop)

For each transaction type in the ordered list from Step 1:

### 3a. Clear logcat

```bash
DEVICE="<device_serial>"
adb -s "$DEVICE" logcat -c
```

### 3b. Instruct user via AskUserQuestion

Present transaction-specific instructions. Use `AskUserQuestion` with two options:
**Transaction completed** / **Skip this test**.

#### Charge / Sale instructions:
> 1. Open your app on the PAX terminal
> 2. Navigate to a payment screen
> 3. Tap the Pay / Charge button
> 4. When the card-waiting screen appears, tap or insert a test card
> 5. Wait for the transaction to complete (approved or declined)
>
> - **Transaction completed** — I ran the charge
> - **Skip this test**

#### Refund instructions:
> 1. Open your app on the PAX terminal
> 2. Navigate to the refund flow (or trigger a refund from the charge you just completed)
> 3. Complete the refund process
>
> **Note:** Refund requires a prior successful charge. If the charge above failed, you may want to skip this.
>
> - **Transaction completed** — I ran the refund
> - **Skip this test**

#### Charge with Tip instructions:
> 1. Open your app on the PAX terminal
> 2. Navigate to a payment screen that includes tipping
> 3. Tap the Pay / Charge button
> 4. When prompted, enter a tip amount on the terminal
> 5. Tap or insert a test card and wait for the transaction to complete
>
> - **Transaction completed** — I ran the charge with tip
> - **Skip this test**

#### Pre-Authorization instructions:
> 1. Open your app on the PAX terminal
> 2. Navigate to the pre-authorization flow
> 3. Initiate a pre-auth transaction
> 4. Tap or insert a test card and wait for the authorization to complete
>
> - **Transaction completed** — I ran the pre-auth
> - **Skip this test**

#### Capture instructions:
> 1. Open your app on the PAX terminal
> 2. Navigate to the capture flow (this captures the pre-auth you just completed)
> 3. Complete the capture process
>
> **Note:** Capture requires a prior successful pre-authorization. If the pre-auth above
> failed, you may want to skip this.
>
> - **Transaction completed** — I ran the capture
> - **Skip this test**

If the user chooses **Skip this test** → mark this type as `SKIPPED`, proceed to the next type.

### 3c. Capture logcat (after user confirms)

Wait 3 seconds for log buffer to flush, then capture:

```bash
sleep 3

echo "=== SDK transaction logs ==="
adb -s "$DEVICE" logcat -d \
  -s "MposUi" -s "MposUiImpl" -s "PaymentApplication" \
  -s "ConnectToAccessoryProcess" -s "AndroidRuntime" | tail -50

echo "=== Success indicators ==="
adb -s "$DEVICE" logcat -d 2>/dev/null \
  | grep -iE "RESULT_CODE_APPROVED|2001|approved|transaction.completed|RESULT_CODE_SUCCESS" | tail -10

echo "=== Failure indicators ==="
adb -s "$DEVICE" logcat -d 2>/dev/null \
  | grep -iE "RESULT_CODE_FAILED|2004|declined|FATAL|AndroidRuntime|unauthorized|401|403|ACCESSORY_NOT_WHITELISTED|exception|error" | tail -10
```

### 3d. Determine result

Analyse the captured logcat output using this priority:

**PASS** if:
- A success indicator is found (`RESULT_CODE_APPROVED`, `2001`, `approved`, `transaction.completed`)
- AND no FATAL/crash/auth errors present

**FAIL** if any of these (checked in priority order):
1. **Accessory error**: `ACCESSORY_NOT_WHITELISTED`, `ConnectToAccessoryProcess` errors → "Accessory not connected or not whitelisted"
2. **Auth error**: `unauthorized`, `401`, `403` → "Merchant credentials rejected by gateway"
3. **Crash**: `FATAL`, `AndroidRuntime` exception → "Application crashed — see logcat"
4. **Declined**: `RESULT_CODE_FAILED`, `2004`, `declined` → "Transaction declined by gateway"
5. **Silent failure**: No success or failure indicators at all → "No transaction result in logs — verify the transaction was triggered"

Extract the specific failure reason from the highest-priority match.

### 3e. Report single result inline

Tell the user the result for this transaction type before proceeding:

> **Charge / Sale: PASS** — Transaction approved (RESULT_CODE_APPROVED found in logs)

or:

> **Refund: FAIL** — Merchant credentials rejected by gateway (401 Unauthorized in logs)

Then proceed to the next transaction type in the list.

---

## Step 4 — Summary Table

After all transaction types have been tested (or skipped), present the results:

```
Transaction Verification Results
=================================

| #  | Transaction Type   | Status  | Failure Reason                              |
|----|--------------------|---------|---------------------------------------------|
| 1  | Charge / Sale      | PASS    |                                             |
| 2  | Refund             | FAIL    | Transaction declined by gateway             |
| 3  | Charge with Tip    | PASS    |                                             |
| 4  | Pre-Authorization  | SKIPPED |                                             |

Passed: 2 / 4   Failed: 1 / 4   Skipped: 1 / 4
```

---

## Step 5 — Post-Summary Options

Use `AskUserQuestion` to present options based on results:

**If any transactions FAILED:**

> Some transactions failed. What would you like to do?
>
> - **Re-run failed tests** — I'll walk you through the failed transactions again
> - **Test later** — defer remaining verification to a future run
> - **Accept results** — proceed with the current results as-is

**If all transactions PASSED (or passed + skipped):**

> All tested transactions passed!
>
> - **Accept results**

### Re-run behaviour

If the user chooses **Re-run failed tests**:
1. Loop back to Step 3 for only the FAILED transaction types
2. Clear logcat fresh before each re-run
3. Replace the previous FAIL result with the new result
4. Return to Step 4 with updated results
5. Multiple re-run cycles are allowed

If the user chooses **Test later**:
- Jump to Step 6 (DEFERRED report) with partial results noted

---

## Step 6 — Deferred Report

If the user chose "Test later" at Step 2 or Step 5:

Report `DEFERRED` status. Include any partial results if some tests were already run.

---

## Acceptance criteria

| Outcome | Condition |
|---------|-----------|
| **PASS** | All tested transaction types pass |
| **PARTIAL** | Mix of pass and fail — user chose "Accept results" |
| **FAIL** | All tested transaction types fail |
| **DEFERRED** | User chose "Test later" (no tests run, or partial run deferred) |
| **SKIPPED** | No terminal connected (`TERMINAL_AVAILABLE=no`) |

---

## Edge cases

- **Only Charge implemented**: single-item list, single-row summary — flow works identically
- **User picks "Test Later" immediately**: DEFERRED status, no tests run
- **Capture without Pre-Auth success**: warn user that pre-auth is a prerequisite, offer to skip Capture
- **Refund without prior Charge**: instructions note the prerequisite, user can attempt with an older transaction ID or skip
- **Re-run loop**: clears logcat fresh, replaces previous FAIL result, multiple re-run cycles allowed

---

## Required report

```
GATE 9 REPORT
Status: PASS | PARTIAL | FAIL | DEFERRED | SKIPPED (no terminal)
Transaction types tested: <N>
Passed: <N>  Failed: <N>  Skipped: <N>

Results:
| Transaction Type   | Status  | Failure Reason |
|--------------------|---------|----------------|
| ...                | ...     | ...            |

Device serial: <serial>
Notes: <observations>
```

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 10 of the PAX SDK integration: interactive transaction verification.

Working directory: <project root>
Device serial: <DEVICE_SERIAL>

## Inputs

Read: `references/pax-aio/activities/act_10_verify-payment-screen.md`
Read: `project-plan.md` — for `package` and `gate_skip_decisions`

## Your task

Follow every step in the activity file. This is a USER-DRIVEN interactive flow:

1. Read `gate_skip_decisions` to determine which transaction types to test.
   Both `run` and `skip` mean code exists — test it. Only `declined` = exclude.
   Order: Charge → Refund → Tipping → Pre-Auth → Capture → Offline.

2. Use `AskUserQuestion` to ask the user whether to begin testing now or test later.
   If "test later" → report DEFERRED and stop.

3. For each testable transaction type:
   a. Clear logcat: `adb -s "$DEVICE" logcat -c`
   b. Use `AskUserQuestion` to instruct the user (transaction-specific steps)
      with options: "Transaction completed" / "Skip this test"
   c. After user confirms, capture logcat (tail -50 from MposUi/MposUiImpl/
      PaymentApplication/ConnectToAccessoryProcess/AndroidRuntime tags)
   d. Grep for success indicators: RESULT_CODE_APPROVED, 2001, approved
   e. Grep for failure indicators: RESULT_CODE_FAILED, 2004, declined, FATAL,
      AndroidRuntime, unauthorized, 401, 403, ACCESSORY_NOT_WHITELISTED
   f. Determine PASS or FAIL with specific failure reason
   g. Report result to user inline, then next type

4. Present summary table with per-transaction results.

5. If any FAILED: offer re-run / test later / accept results.
   If all PASS: accept results.

## PROHIBITED — do NOT use any of these:
- `uiautomator dump` — unreliable on PAX Android fork
- `input tap` — coordinates vary by device model
- Screen scraping or automated UI interaction of any kind

All interaction with the device is done by the USER on the physical terminal.
The agent only reads logcat output.

## Required report

```
GATE 10 REPORT
Status: PASS | PARTIAL | FAIL | DEFERRED | SKIPPED (no terminal)
Transaction types tested: <N>
Passed: <N>  Failed: <N>  Skipped: <N>

Results:
| Transaction Type   | Status  | Failure Reason |
|--------------------|---------|----------------|
| ...                | ...     | ...            |

Device serial: <serial>
Notes: <observations>
```
```
