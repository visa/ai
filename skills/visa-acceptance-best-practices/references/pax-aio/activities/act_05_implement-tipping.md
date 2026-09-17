# Activity 6: Implement Tipping

Add tipping functionality to an existing PAX payment integration. The PAX SDK supports two tipping approaches: on-reader tipping (customer enters tip on terminal) and on-receipt tipping (customer writes tip on printed receipt).

**Reference:** [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) (On-Reader Tipping, On-Receipt Tipping, Tip Adjust sections)

## Critical Rules (NEVER violate these)

### On-Reader Tipping Rules

1. **NEVER pass tipping parameters to `.charge()` directly.** On-reader tipping uses `TippingProcessStepParameters` wrapped in `TransactionProcessParameters`, passed as the second argument to `createTransactionIntent()`.
2. **NEVER use the deprecated `.showConfirmationScreen()` method.** Use `.showAddTipConfirmationScreen()` instead.
3. **NEVER forget to pass BOTH parameters to `createTransactionIntent()`.** The signature is `createTransactionIntent(transactionParams, processParams)` — omitting `processParams` disables tipping.
4. **NEVER assume tip amount is always present.** `getDetails().getIncludedTipAmount()` returns `null` if the customer declined the tip. Always null-check before using.
5. **NEVER use `getAmount()` thinking it's the base amount.** It returns the total charged amount (base + tip). To get base amount, subtract tip from total.

### On-Receipt Tipping Rules

1. **NEVER use on-receipt tipping without implementing tip adjust.** A follow-on `.adjustTip()` call is required within 24 hours or the transaction remains uncaptured.
2. **NEVER set `.autoCapture(true)` for on-receipt tipping.** On-receipt tipping requires `.autoCapture(false)` for pre-authorization only.
3. **NEVER exceed 20% tip adjust limit.** Tip adjust amount is limited to 20% of the original transaction amount. Higher amounts will be rejected.
4. **NEVER use on-receipt tipping as the default.** CyberSource recommends on-reader tipping whenever possible to avoid chargeback risks.

## Prerequisites

Before starting this activity, the developer must have completed:

- **Activity 4** — Charge transaction implementation; a working payment flow must exist with `TransactionParameters` and `createTransactionIntent()`

## Workflow

Follow these steps in order.

### Step 1: Verify Existing Charge Transaction

**Do NOT assume a charge implementation exists.** Use `AskUserQuestion` to confirm:

```
Do you have a working charge transaction implementation in your project?

Options:
  - Yes, I can process payments successfully
  - No, I need to implement charge transactions first
  - Not sure, let me check
```

If "No" or "Not sure" → Direct to Activity 4 first. Do not proceed.

If "Yes" → Continue to Step 2.

### Step 2: Choose Tipping Type

Use `AskUserQuestion` to determine which tipping type to implement:

```
Which tipping approach do you want to implement?

Options:
  - On-reader tipping — Customer enters tip on terminal before payment
  - On-receipt tipping — Customer writes tip on receipt, requires follow-on tip adjust
```

Store the answer for subsequent steps.

### Step 3: Choose Tipping Strategy (On-Reader Only)

**Skip this step if on-receipt tipping was selected in Step 2.**

For on-reader tipping, use `AskUserQuestion` to choose the strategy:

```
Which on-reader tipping strategy do you want?

Options:
  - Percentage choice (display 10%, 15%, 20%)
  - Ask for tip amount (customer enters specific dollar amount)
  - Ask for total amount (customer enters total including tip)
```

Store the answer for Step 5.

### Step 4: Locate the Payment Code

Use `AskUserQuestion` to identify where payment logic exists:

```
Where is your payment transaction code located?

Options:
  - I know the file path (provide it below)
  - In an Activity class (e.g., CheckoutActivity)
  - In a Fragment or ViewModel
  - I need help finding it
```

If "I need help" → Use `Grep` to search for `createTransactionIntent` and show matching files.

Once identified, read the file to locate the `createTransactionIntent()` call:

```
Read(<payment_file_path>)
```

Determine if the project is **Java** or **Kotlin** from file extension or existing code.

### Step 5: Add Tipping Configuration

Based on the tipping type selected in Step 2, add the appropriate configuration.

---

## Path A: On-Reader Tipping Implementation

### Step 5A: Add Helper Method for Tipping Parameters

Add a helper method that returns `TransactionProcessParameters` based on the strategy from Step 3.

#### Strategy 1: Percentage Choice / Strategy 2: Tip Amount / Strategy 3: Total Amount

Fetch the tipping code examples from [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) → "Sale with On-Reader Tipping" section. The official docs show all three strategies.

**Integration pattern** — wrap the SDK code in a helper method that returns `TransactionProcessParameters`:

```kotlin
// Required imports (not shown in official docs):
import io.mpos.transactionprovider.processparameters.steps.tipping.TippingProcessStepParameters
import io.mpos.transactionprovider.processparameters.TransactionProcessParameters

private fun createTippingParams(): TransactionProcessParameters {
    val steps = TippingProcessStepParameters.Builder()
        // Use ONE of:
        //   .askForPercentageChoice()   ← Strategy 1
        //   .askForTipAmount()          ← Strategy 2
        //   .askForTotalAmount()        ← Strategy 3
        .showTotalAmountConfirmationScreen(true)
        .build()

    return TransactionProcessParameters.Builder()
        .addStep(steps)
        .build()
}
```

Map the selected `TIP_ENTRY_MODE` to the matching builder call:
- `percentage`   → `.askForPercentageChoice()` (optionally followed by `.percentages(BigDecimal("10"), BigDecimal("20"), BigDecimal("30"))`)
- `tip_amount`   → `.askForTipAmount()`
- `total_amount` → `.askForTotalAmount()`

### Step 6A: Update Payment Method to Use Tipping Parameters

Locate the existing payment method (e.g., `startCharge()`). It currently calls:

```java
Intent intent = MposUi.getInitializedInstance().createTransactionIntent(params);
```

**Update to pass the tipping process parameters:**

**Java:**
```java
Intent intent = MposUi.getInitializedInstance().createTransactionIntent(
        params,
        createPercentageTippingParams()  // or createTipAmountParams() or createTotalAmountTippingParams()
);
```

**Kotlin:**
```kotlin
val intent = MposUi.getInitializedInstance().createTransactionIntent(
    params,
    createPercentageTippingParams()  // or createTipAmountParams() or createTotalAmountTippingParams()
)
```

Use the `Edit` tool to update this line.

### Step 7A: Update Transaction Result Handler

Locate `onActivityResult` and the result handler method. Add tip amount retrieval:

**Java:**
```java
private void onChargeApproved(Transaction transaction) {
    BigDecimal totalAmount = transaction.getAmount();
    BigDecimal tipAmount = transaction.getDetails().getIncludedTipAmount();
    
    System.out.println("Total charged: " + totalAmount);
    System.out.println("Included Tip: " + tipAmount);
    
    // ... rest of existing code
}
```

**Kotlin:**
```kotlin
private fun onChargeApproved(transaction: Transaction?) {
    transaction ?: return
    
    val totalAmount = transaction.amount
    val tipAmount = transaction.details.includedTipAmount
    
    println("Total charged: $totalAmount")
    println("Included Tip: $tipAmount")
    
    // ... rest of existing code
}
```

### Step 8A: Build and Verify

```bash
./gradlew assembleDebug
```

If the build fails:

1. **`TippingProcessStepParameters` not found** — ensure imports are added
2. **`createTransactionIntent` signature error** — verify you're passing TWO parameters
3. **`getIncludedTipAmount` not found** — ensure calling `transaction.getDetails().getIncludedTipAmount()`

---

## Path B: On-Receipt Tipping Implementation

### Step 5B: Configure UiConfiguration with ADJUST_TIP

Enable tip adjust capability on the transaction summary screen. Find the `UiConfiguration` setup in the Application class (from Activity 1). Add `SummaryFeature.ADJUST_TIP` to the existing `summaryFeatures` set.

See [PAX AIO Get Started](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-get-started-intro.md) → "Create a UiConfiguration Instance" for the full `UiConfiguration` structure.

**CRITICAL:** The existing `UiConfiguration` MUST retain `.terminalParameters()`. Just add `SummaryFeature.ADJUST_TIP` to the `summaryFeatures` set alongside existing features.

Use the `Edit` tool to add `SummaryFeature.ADJUST_TIP` to your existing `UiConfiguration` where `MposUi` is initialized.

### Step 6B: Update Transaction Parameters

Locate the existing `TransactionParameters.Builder()` code. It currently looks like:

**Java:**
```java
TransactionParameters params = new TransactionParameters.Builder()
        .charge(amount, Currency.USD)
        .customIdentifier("...")
        .build();
```

**Kotlin:**
```kotlin
val params = TransactionParameters.Builder()
    .charge(amount, Currency.USD)
    .customIdentifier("...")
    .build()
```

**Add on-receipt tipping configuration:**

**Java:**
```java
TransactionParameters params = new TransactionParameters.Builder()
        .charge(amount, Currency.USD)
        .customIdentifier("yourReferenceForTheTransaction")
        .autoCapture(false)      // Pre-auth only
        .tipAdjustable(true)     // Enable on-receipt tipping
        .build();
```

**Kotlin:**
```kotlin
val params = TransactionParameters.Builder()
    .charge(amount, Currency.USD)
    .customIdentifier("yourReferenceForTheTransaction")
    .autoCapture(false)      // Pre-auth only
    .tipAdjustable(true)     // Enable on-receipt tipping
    .build()
```

Use the `Edit` tool to add these two lines before `.build()`.

### Step 7B: Store Transaction ID for Later Tip Adjust

In the result handler, store the transaction ID — you'll need it for the tip adjust call:

**Java:**
```java
private void onChargeApproved(Transaction transaction) {
    String transactionId = transaction.getIdentifier();
    BigDecimal preAuthAmount = transaction.getAmount();
    
    System.out.println("Transaction approved: " + transactionId);
    System.out.println("Pre-authorized amount: " + preAuthAmount);
    
    // TODO: Store transactionId - you'll need it for tip adjust within 24 hours
    // saveForTipAdjust(transactionId, preAuthAmount);
}
```

**Kotlin:**
```kotlin
private fun onChargeApproved(transaction: Transaction?) {
    transaction ?: return
    
    val transactionId = transaction.identifier
    val preAuthAmount = transaction.amount
    
    println("Transaction approved: $transactionId")
    println("Pre-authorized amount: $preAuthAmount")
    
    // TODO: Store transactionId - you'll need it for tip adjust within 24 hours
    // saveForTipAdjust(transactionId, preAuthAmount)
}
```

### Step 8B: Implement Tip Adjust Method

Add a method to process the tip adjust transaction. This must be called within 24 hours with the tip amount written on the receipt:

**Java:**
```java
private void adjustTip(String originalTransactionId, BigDecimal tipAmount) {
    if (!PaymentApplication.isMposUiReady()) {
        Toast.makeText(this, "Payment not available. Please try again.", Toast.LENGTH_SHORT).show();
        return;
    }

    TransactionParameters params = new TransactionParameters.Builder()
            .adjustTip(originalTransactionId, tipAmount, Currency.USD)
            .build();

    Intent intent = PaymentApplication.getMposUi().createTransactionIntent(params);
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT);
}
```

**Kotlin:**
```kotlin
private fun adjustTip(originalTransactionId: String, tipAmount: BigDecimal) {
    check(PaymentApplication.isMposUiReady()) {
        "MposUi not initialized."
    }

    val params = TransactionParameters.Builder()
        .adjustTip(originalTransactionId, tipAmount, Currency.USD)
        .build()

    val intent = PaymentApplication.mposUi.createTransactionIntent(params)
    startActivityForResult(intent, MposUi.REQUEST_CODE_PAYMENT)
}
```

**Important:** The tip adjust amount is limited to 20% of the original transaction amount.

### Step 9B: Build and Verify

```bash
./gradlew assembleDebug
```

If the build fails:

1. **`adjustTip` method not found** — ensure you're using the correct method signature with three parameters
2. **Transaction identifier not found** — verify you stored the original transaction ID in Step 6B

---

## Troubleshooting

See `references/pax-aio/troubleshooting.md#tipping` for on-reader and on-receipt tipping errors (missing imports, parameter mismatches, autoCapture, tip adjust limits).

---

## Acceptance Criteria

### On-Reader Tipping Acceptance Criteria

This activity is complete when all of the following are true:

1. Existing charge transaction implementation was confirmed with the user before proceeding
2. Tipping strategy was selected via `AskUserQuestion` (percentage choice / tip amount / total amount)
3. Helper method created that returns `TransactionProcessParameters` with `TippingProcessStepParameters`
4. Helper method uses `.askForPercentageChoice()`, `.askForTipAmount()`, or `.askForTotalAmount()`
5. `createTransactionIntent()` is called with BOTH parameters: `(params, processParams)`
6. Required imports for `TippingProcessStepParameters` and `TransactionProcessParameters` are present
7. `onChargeApproved` extracts tip amount via `transaction.getDetails().getIncludedTipAmount()`
8. Tip amount is null-checked before use
9. Project builds without compilation errors (`./gradlew assembleDebug`)
10. The tipping flow works on a PAX terminal (customer sees tip entry screen)

### On-Receipt Tipping Acceptance Criteria

This activity is complete when all of the following are true:

1. Existing charge transaction implementation was confirmed with the user before proceeding
2. `UiConfiguration` includes `SummaryFeature.ADJUST_TIP` in `summaryFeatures` set
3. `UiConfiguration` is set on `mposUi` instance (typically in `Application.onCreate()`)
4. Transaction parameters include `.autoCapture(false)` and `.tipAdjustable(true)`
5. `onChargeApproved` stores the transaction identifier for later tip adjust
6. `adjustTip()` method implemented with correct signature: `.adjustTip(transactionId, tipAmount, currency)`
7. Tip adjust method includes guard with `isMposUiReady()`
8. Code or documentation notes the 24-hour requirement for tip adjust
9. Code or documentation notes the 20% limit on tip adjust amount
10. Project builds without compilation errors (`./gradlew assembleDebug`)
11. The on-receipt tipping flow works (pre-auth succeeds, tip adjust can be called)

---

## Configuration Options

For the full list of `TippingProcessStepParameters.Builder()` methods and `TransactionParameters.Builder()` on-receipt tipping methods, see [PAX AIO Payment Services](https://developer.visaacceptance.com/docs/vas/en-us/pax-all-in-one/integration/all/na/pax-all-in-one/pax-aio-payment-txn-intro.md) → "Sale with On-Reader Tipping" and "Sale with On-Receipt Tipping" sections.

**Key integration notes NOT in the official docs:**
- When `maxTipAmount()` is set, the shopper is asked to enter a lesser amount (not just silently rejected)
- `.adjustTip()` limit is 20% of the original authorized amount — enforced server-side
- On-receipt tipping REQUIRES both `.autoCapture(false)` AND `.tipAdjustable(true)` — omitting either causes silent failure

---

---

## Agent Prompt Template

The workflow injects variables marked with `<VARIABLE>` before spawning the agent.

```
You are implementing Gate 5 of the PAX SDK integration: tipping functionality.

Working directory: <project root>

## Inputs

Read these files before writing any code:
1. `project-plan.md` (project root) — contains project context and GATE 5 implementation notes (tipping type, entry mode, config)
2. `references/pax-aio/activities/act_05_implement-tipping.md` — the activity definition (full implementation guidance)

Tipping type selected: <TIPPING_TYPE>

On-reader configuration (only set when Tipping type = on-reader; otherwise N/A):
- Tip entry mode (TIP_ENTRY_MODE): <TIP_ENTRY_MODE>
- Custom percentages (TIP_PERCENTAGES): <TIP_PERCENTAGES>
- Maximum tip amount (TIP_MAX_AMOUNT): <TIP_MAX_AMOUNT>

## Your task

Implement tipping using the activity file as your primary implementation guide.
Use `project-plan.md` for project-specific metadata (tipping type, entry mode, percentages, max amount).

For on-reader tipping:
- Add a helper method that returns `TransactionProcessParameters` with `TippingProcessStepParameters`
- Map the selected `TIP_ENTRY_MODE` to the matching builder call:
  - `percentage`   → `.askForPercentageChoice()`
  - `tip_amount`   → `.askForTipAmount()`
  - `total_amount` → `.askForTotalAmount()`
- If `TIP_ENTRY_MODE = percentage` AND `TIP_PERCENTAGES` is not null, add
  `.percentages(BigDecimal("<p1>"), BigDecimal("<p2>"), BigDecimal("<p3>"))` immediately
  after `.askForPercentageChoice()`. If `TIP_PERCENTAGES` is null, omit `.percentages(...)`
  so the SDK defaults (10/15/20) are used.
- If `TIP_ENTRY_MODE` ∈ {`tip_amount`, `total_amount`} AND `TIP_MAX_AMOUNT` is not null, add
  `.maxTipAmount(BigDecimal("<TIP_MAX_AMOUNT>"))`. If null, omit it (no maximum).
- Always add `.showTotalAmountConfirmationScreen(true)` before `.build()`.
- Update `createTransactionIntent()` to pass both parameters: `(params, processParams)`
- Add imports for `TippingProcessStepParameters` and `TransactionProcessParameters`

For on-receipt tipping:
- Add `.autoCapture(false)` and `.tipAdjustable(true)` to transaction parameters
- Add `SummaryFeature.ADJUST_TIP` to `UiConfiguration` in PaymentApplication
- Implement `adjustTip()` method with 20% limit validation

For both:
- Update result handler to retrieve `transaction.getDetails().getIncludedTipAmount()`

## Mandatory verification

Run `./gradlew assembleDebug`. Fix any errors. Do NOT report PASS until build succeeds.

## Required report

```
GATE 5 REPORT
Status: PASS | FAIL
Build: SUCCESS | FAILED
Build time: Xs
Tipping type: on-reader | on-receipt
Helper method created (on-reader): YES | NO | N/A
Tip entry mode used (on-reader): percentage | tip_amount | total_amount | N/A
Custom percentages applied (on-reader): YES (<p1>,<p2>,<p3>) | NO (defaults) | N/A
maxTipAmount applied (on-reader): YES (<value>) | NO | N/A
createTransactionIntent has 2 params (on-reader): YES | NO | N/A
ADJUST_TIP in UiConfiguration (on-receipt): YES | NO | N/A
adjustTip() method implemented (on-receipt): YES | NO | N/A
getIncludedTipAmount() in result handler: YES | NO
Files modified: <list>
Acceptance criteria met: <list>
```
```
