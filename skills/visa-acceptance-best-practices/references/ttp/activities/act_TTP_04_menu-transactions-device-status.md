# Activity TTP-4: Top Menu — Transactions and Device Status

Establish the app's collapsible top menu and put the two Tap to Pay operator surfaces under it:
**Transactions** (a real transaction history, backed by `transactionModule`) and **Device Status**
(enrollment state and the enroll / re-enroll action).

This gate runs **after** setup, credentials and enrollment, and **before** any money-moving gate. That
position is deliberate: it creates the navigation surface and the enrollment entry point that every
later gate attaches to, so the later gates never have to invent a place to put a control.

**Reference:** `references/ttp/constants/ttp-sdk-requirements.md` § *Finding a past transaction —
`transactionModule`*, § *`Transaction` — nullability and status values*, `act_TTP_03` (enrollment
mechanism), `references/ttp/troubleshooting.md#tap-to-pay`

## Critical Rules (NEVER violate these)

1. **The menu is the ONLY place enrollment is reachable from.** After this gate there must be no
   `Enroll Device` button, tile, or menu item anywhere else in the app — including one an earlier gate or
   an earlier run may have added. Enrollment is a one-time setup step; a permanent control for it on a
   merchant-facing payment screen is clutter that invites a re-tap which tears down a working enrollment.
2. **Menu order is fixed: `Transactions` first, `Device Status` second.** Do not reorder, and do not
   interleave the app's own entries between them.
3. **Reconcile with what already exists BEFORE writing anything.** If the project already has a menu, a
   transaction-history surface, or an enrollment control, *ask the developer* how to proceed (Step 0). Do
   not silently add a second menu, and do not silently rewrite a screen they built.
4. **This gate's Transactions screen is READ-ONLY.** It lists and shows detail. It does **not** wire
   refund or capture — those are added by `act_TTP_06` (refund) and `act_TTP_08` (capture), which own the
   money-moving code and its guards. Leave the extension point described in Step 3 and stop there.
5. **Never render a query error as an empty list.** `onCompleted` delivers the list and the `MposError`
   in the same callback and the list is nullable. An empty history that actually means "the query failed"
   is indistinguishable, to a merchant, from "you have taken no payments".
6. **Always paginate.** Use the 5-argument `queryTransactions` overload with an explicit `offset` and
   `limit`. There is no total count and no `hasMore`, so derive the end from a short page.
7. **`queryTransactions` and `lookupTransaction` are asynchronous and return nothing.** Read results only
   inside the callback.
8. **Never treat a cached identifier as the history.** A persisted identifier (such as the active pre-auth
   in `act_TTP_08`) is a convenience for one workflow, not a substitute for querying.
9. **Both menu entries always ship. There is no Device-Status-only variant.** `act_TTP_06` attaches refund
   and `act_TTP_08` attaches capture to the transaction detail page this gate creates; without it those
   gates have nowhere to put a control that acts on a *chosen* transaction, and the only thing left is a
   cached "latest", which both of them forbid. If the app already has a history surface, Step 0 decides
   whether to extend it or rebuild it — never whether to have one.
10. **`MposUi` comes from `MPOS_ACCESSOR`; this gate never constructs it.** `act_TTP_03` owns the holder.
    An empty `mpos_accessor` is a stop-and-report, not a cue to call `MposUi.create()` here — a second
    instance builds cleanly and fails on hardware.
11. **NEVER put a `Transaction` — or any `io.mpos.*` object — in `rememberSaveable`. Hold the identifier `String` instead.** This gate creates the navigation state that carries the selected transaction into the detail screen, so this gate is where the mistake gets made. `rememberSaveable { mutableStateOf<Transaction?>(null) }` compiles, and then throws `IllegalStateException: MutableState(value=io.mpos.transactions.Transaction@…) cannot be saved using the current SaveableStateRegistry` the moment the host Activity is stopped — which is exactly what happens when the SDK's payment Activity launches on top of it. **The crash therefore lands on Gate 6's or Gate 8's first tap, not here**, and it looks like their bug.

    Hold `selectedTransactionId: String?` in `rememberSaveable` (or as a navigation route argument, which is a `String` anyway) and resolve the record from the list this gate already loaded. Full rule, the exception text and the resolve pattern: constants file § *CRITICAL — `rememberSaveable` holds Bundle-safe values ONLY*.

    **This does not change the `TransactionDetailActions(transaction: Transaction)` signature** — see Rule 12.
12. **`TransactionDetailActions` takes the whole `Transaction`, and that is not in tension with Rule 11.** A composable *parameter* is not saved state. Gates 6 and 8 read `status`, `isRefunded` and `isCaptured` off the object to decide what to offer, so a slot typed `(String) -> Unit` forces them into a lookup or a cached flag. Keep the parameter typed `Transaction`; keep the *state* holding the identifier. Narrowing the signature to satisfy Rule 11 is the wrong correction.

## Prerequisites

- `act_TTP_01` — SDK dependencies configured, project builds
- `act_TTP_02` — real TEST MID + secret key wired through `BuildConfig`
- `act_TTP_03` — enrollment implemented, the `EnrollDeviceActivity` theme override in place, and the
  **durable `MposUi` holder created with `mpos_accessor` recorded in `project-plan.md`**. This gate
  **presents** enrollment; it does not reimplement it, and it does not construct `MposUi`.

> **`mpos_accessor` is a hard prerequisite, not a convenience.** Every query in this gate goes through
> `<MPOS_ACCESSOR>.transactionModule`. If the field is empty in `project-plan.md`, stop and report:
> either Gate 3 was skipped on a project that has no durable holder, or it passed without recording the
> value (its Critical Rule 9 forbids that). Guessing `PaymentApplication.mposUi` breaks the build on
> every project that took the extend-existing or DI branch.

## Workflow

### Step 0: Reconcile with the app's existing UI — before writing anything

An app that already has a navigation menu, a history screen, or an enrollment control is the normal case,
not the exception. Adding a second menu, or rewriting a screen the developer built, are both worse
outcomes than asking.

```bash
cd "$GRADLE_ROOT" || exit 1
[ -n "$SOURCE_ROOT" ] && [ -d "$SOURCE_ROOT" ] \
  || { echo "FAIL: SOURCE_ROOT unset or missing — re-read project-plan.md"; exit 1; }

# 1. An existing menu / navigation surface.
grep -rniE 'NavigationDrawer|ModalNavigationDrawer|DrawerLayout|BottomNavigation|NavigationBar|TopAppBar|Toolbar|BottomSheetScaffold|onCreateOptionsMenu|NavigationRail' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rniE '<menu|NavigationView|BottomNavigationView|MaterialToolbar' \
  "$ANDROID_MODULE_DIR/src/main/res" 2>/dev/null

# 2. An existing transaction-history surface.
grep -rniE 'transactionHistory|TransactionList|history|receipts?Screen|pastTransactions|OrderHistory' \
  "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null

# 3. An existing enrollment control — including one an earlier run of THIS skill added.
grep -rniE 'enroll' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rniE 'enroll' "$ANDROID_MODULE_DIR/src/main/res" 2>/dev/null
```

Record what each probe found, then ask — **one question per artefact that exists**, and only for those
that exist. Do not ask about an artefact the probes did not find.

```
<ScreenName / file> already contains <a navigation menu | a transaction history surface |
an enrollment control>.

How should Tap to Pay's <Transactions | Device Status> entry be integrated?
Options:
  - Add to the existing <menu/screen> (recommended) — keep what you have, add the Tap to Pay
    entries to it in the required order
  - Rebuild it as the Tap to Pay menu — replace the existing surface with the one this gate
    describes (say which existing entries must be preserved)
  - Leave the existing surface alone and add a separate Tap to Pay entry point (say where)
```

> **"Recommended" is *add to existing*, and that is not a default to skip past.** The developer's menu
> carries their own product's entries. Replacing it is a change to their app's navigation, so it needs an
> explicit choice — and if they choose it, they must tell you which existing entries to preserve, because
> you cannot infer which of their entries still matter.

Store the answers as `menu_integration` (`add-to-existing` | `rebuild` | `separate`) and
`existing_enroll_controls` (the list of files to clean up in Step 5).

> **If the probes find nothing**, proceed to Step 1 and record `menu_integration: new`. Say so in the
> report — "no existing menu found" is a finding the developer can correct.

### Step 1: The collapsible top menu

A single collapsible menu anchored at the top of the app. The mechanism is the project's choice; what is
fixed is that it collapses, sits at the top, and lists `Transactions` before `Device Status`.

`UI_TOOLKIT = compose` — `ModalNavigationDrawer` behind the top app bar's navigation icon:

```kotlin
@Composable
fun TtpAppScaffold(
    isEnrolled: Boolean,
    onOpenTransactions: () -> Unit,
    onOpenDeviceStatus: () -> Unit,
    content: @Composable () -> Unit,
) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                // Order is fixed: Transactions first, Device Status second.
                NavigationDrawerItem(
                    label = { Text("Transactions") },
                    selected = false,
                    onClick = { scope.launch { drawerState.close() }; onOpenTransactions() },
                )
                NavigationDrawerItem(
                    label = { Text("Device Status") },
                    // The enrollment state is surfaced on the item itself, so a merchant can see it
                    // without opening the screen.
                    badge = { Text(if (isEnrolled) "Enrolled" else "Not enrolled") },
                    selected = false,
                    onClick = { scope.launch { drawerState.close() }; onOpenDeviceStatus() },
                )
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Point of Sale") },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(Icons.Default.Menu, contentDescription = "Open menu")
                        }
                    },
                    // Enrollment status stays visible WITHOUT opening the menu — it blocks the pay
                    // control, so it must not be hidden behind a tap.
                    actions = { Text(if (isEnrolled) "Tap to Pay: enrolled" else "Tap to Pay: not enrolled") },
                )
            },
        ) { padding -> Box(Modifier.padding(padding)) { content() } }
    }
}
```

`UI_TOOLKIT = views` — a `DrawerLayout` + `NavigationView` with a fixed-order menu resource:

```xml
<!-- res/menu/ttp_menu.xml — order here IS the displayed order -->
<menu xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:id="@+id/ttp_transactions"  android:title="Transactions" />
    <item android:id="@+id/ttp_device_status" android:title="Device Status" />
</menu>
```

```kotlin
navigationView.setNavigationItemSelectedListener { item ->
    when (item.itemId) {
        R.id.ttp_transactions  -> { openTransactions();  true }
        R.id.ttp_device_status -> { openDeviceStatus();  true }
        else -> false
    }
}
```

> **The status indicator in the top bar is not optional, and it is not the same thing as the menu entry.**
> A merchant who has not enrolled meets a disabled pay button. If the only explanation lives inside a
> collapsed menu, the app reads as broken. Keep the short status string in the bar itself and the *action*
> behind the menu.

On `menu_integration = add-to-existing`, add these two entries to the project's existing menu in the
required order and leave every existing entry untouched. Do not restyle their menu.

### Step 2: The Transactions screen — query a page at a time

```kotlin
import io.mpos.transactionprovider.FilterParameters
import io.mpos.transactions.Transaction
import java.math.RoundingMode

private const val PAGE_SIZE = 20

class TransactionsViewModel(private val mposUi: MposUi) : ViewModel() {

    private val _items = MutableStateFlow<List<Transaction>>(emptyList())
    val items: StateFlow<List<Transaction>> = _items.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private var nextOffset = 0
    private var endReached = false

    fun loadNextPage(reset: Boolean = false) {
        if (_isLoading.value) return
        if (reset) { nextOffset = 0; endReached = false; _items.value = emptyList() }
        if (endReached) return

        _isLoading.value = true
        // An empty builder is a legal "everything" filter. Narrow it with setStartDateMillis /
        // setEndDateMillis / customIdentifier when the screen offers a filter.
        val filter = FilterParameters.Builder().build()

        mposUi.transactionModule.queryTransactions(
            filter,
            /* includeReceipts = */ false,
            nextOffset,
            PAGE_SIZE,
        ) { _, _, _, _, transactions, error ->
            _isLoading.value = false

            // CHECK THE ERROR FIRST. The list and the error arrive in the SAME callback, and the list
            // is nullable — `transactions ?: emptyList()` on a failed query renders an empty history
            // that a merchant reads as "no payments taken".
            if (error != null) {
                _error.value = error.info ?: error.type?.name ?: "Could not load transactions"
                return@queryTransactions
            }

            val received = transactions.orEmpty()
            _error.value = null
            _items.value = _items.value + received

            // No total count and no hasMore flag: both derive from the page you actually got.
            nextOffset += received.size
            if (received.size < PAGE_SIZE) endReached = true
        }
    }
}
```

Rendering a row — every displayed field is nullable on a *queried* transaction:

```kotlin
@Composable
private fun TransactionRow(tx: Transaction) {
    // amount and currency are nullable here even though they are populated on an approved
    // transaction. Do not force-unwrap either.
    val amount = tx.amount?.setScale(2, RoundingMode.HALF_UP)?.toString() ?: "—"
    val currency = tx.currency?.name.orEmpty()
    Column {
        Text("$amount $currency")
        Text("${tx.status.name} · ${tx.identifier}")
    }
}
```

> **`Transaction.status` carries the outcome the merchant is looking for.** `TransactionStatus` includes
> `APPROVED`, `ACCEPTED`, `DECLINED`, `ERROR`, `ABORTED`, `PENDING` and exposes `isFinal()` — see
> § *`Transaction` — nullability and status values*. Show the status; a list of amounts with no outcome
> cannot answer "did that one go through?", which is the whole reason a merchant opens this screen.

Empty vs failed must be visually distinct:

| State | Show |
|-------|------|
| query succeeded, zero rows | "No transactions yet" |
| query failed | the error, **and** a retry affordance — never an empty list |
| loading the first page | a loading indicator, not an empty state |

### Step 3: Transaction detail, and the extension point for later gates

Tapping a row opens a read-only detail view. Build it from the `Transaction` already in the list; use
`lookupTransaction(identifier)` only to refresh a single transaction:

```kotlin
mposUi.transactionModule.lookupTransaction(identifier) { _, transaction, error ->
    if (error != null) { showError(error); return@lookupTransaction }
    transaction?.let { render(it) }
}
```

**Leave the actions to the gates that own them.** Provide the slot and stop:

```kotlin
// Filled in by act_TTP_06 (refund) and act_TTP_08 (capture). Empty in this gate BY DESIGN:
// those gates own the money-moving builder chains, their guards, and their acceptance criteria.
@Composable
fun TransactionDetailActions(transaction: Transaction) { /* intentionally empty in TTP-4 */ }
```

> **Do not anticipate the later gates by wiring a refund button here.** Refund has approach and type
> decisions (referenced full / referenced partial / stand-alone credit) that `act_TTP_06` collects and
> validates, and capture has a single-active-hold rule that `act_TTP_08` enforces. A button added here
> bypasses both, and it will still be there if the developer declines those gates.

**What will fill this slot, so you can size the detail page for it:**

| Action | Added by | Enabled when |
|--------|----------|--------------|
| Refund | `act_TTP_06` Step 7 | `status == APPROVED && !isRefunded` |
| Capture | `act_TTP_08` Step 8 | `status == APPROVED && !isCaptured` |
| Increase hold | `act_TTP_08` Step 8, only if `INCREMENTAL_AUTH_REQUESTED = yes` | `status == APPROVED && !isCaptured` |

Every one of those reads its enabled state from **the transaction this page is displaying** — which is
the whole reason they belong here rather than on the payment screen. A control on the POS screen has no
target transaction, so it can only act on a cached "latest" or "stored hold" identifier: wrong as soon as
a second sale or a second hold happens, and stale after the first is settled.

> **This is also why the detail page must pass the whole `Transaction`, not just its identifier.** The
> later gates need `status`, `isRefunded` and `isCaptured` to decide what is offered. A slot typed
> `(String) -> Unit` forces them back to a lookup or a cached flag.
>
> **That is a statement about the composable's parameter, and NOT about how the selection is stored.**
> Passing a `Transaction` down is correct. **Putting one in `rememberSaveable` is a crash** — Critical
> Rules 11 and 12. Keep the two apart:

```kotlin
// Navigation state: the KEY is saveable, so it survives Activity recreation.
var selectedTransactionId by rememberSaveable { mutableStateOf<String?>(null) }

// The RECORD is derived, never saved. items is this gate's StateFlow<List<Transaction>>.
val selected: Transaction? = remember(selectedTransactionId, items) {
    items.firstOrNull { it.identifier == selectedTransactionId }
}

// After process death `items` is empty too, so re-resolve a non-null id from the platform:
//   mposUi.transactionModule.lookupTransaction(id) { _, tx, error -> ... }

// The parameter stays typed Transaction — Critical Rule 12.
selected?.let { TransactionDetailActions(transaction = it) }
```

> **Never `rememberSaveable { mutableStateOf<Transaction?>(null) }`.** It compiles, and it throws
> `IllegalStateException: … cannot be saved using the current SaveableStateRegistry` at
> `onSaveInstanceState` — which fires when the SDK's payment Activity comes to the front, so the crash
> surfaces on Gate 6's or Gate 8's first tap and reads as their defect. The full rule, the verbatim
> exception and the reasoning are in the constants file § *CRITICAL — `rememberSaveable` holds Bundle-safe
> values ONLY*.

### Step 4: The Device Status screen

This screen is now the **only** enrollment surface. It shows state and hosts the action; the enrollment
mechanism itself is `act_TTP_03`'s and is not reimplemented here.

```kotlin
@Composable
fun DeviceStatusScreen(
    mposUi: MposUi,
    onEnroll: () -> Unit,          // launches act_TTP_03's getEnrollDeviceIntent flow
    onReEnroll: () -> Unit,        // act_TTP_03's re-enrollment path, using the stored serial number
) {
    // deviceEnrolledFlow() rather than polling isDeviceEnrolled(): the state changes while this
    // screen is composed, which is exactly when a merchant is looking at it.
    val isEnrolled by mposUi.tapToPhone.deviceEnrolledFlow()
        .collectAsStateWithLifecycle(initialValue = false)

    Column {
        Text(if (isEnrolled) "This device is enrolled for Tap to Pay" else "This device is not enrolled")

        // The action's LABEL is bound to state; the control is never composed unconditionally as a
        // live "Enroll Device" button.
        if (isEnrolled) {
            Button(onClick = onReEnroll) { Text("Re-enroll this device") }
        } else {
            Button(onClick = onEnroll) { Text("Enroll this device") }
        }

        // Credentials that load but produce no currencies mean the MID/secret are wrong — enrollment
        // succeeding does not prove they are good. See act_TTP_03 Step 7.
        val currencies = mposUi.tapToPhone.getMerchantInformation()?.supportedCurrencies.orEmpty()
        if (isEnrolled && currencies.isEmpty()) {
            Text("Enrolled, but no supported currencies were returned — check the merchant credentials.")
        }
    }
}
```

Include on this screen, because this is where an operator will look for them:

- enrollment state, and the stored serial number when enrolled
- the Tap to Pay Ready app's presence/version if the app already reads it
- `supportedCurrencies`, or the "credentials look wrong" message when empty

### Step 5: Remove every other enrollment affordance

Critical Rule 1 is only satisfied once the old controls are gone. Work from
`existing_enroll_controls` recorded in Step 0:

```bash
# After the menu exists, no enrollment control may remain outside the Device Status screen.
grep -rniE 'enroll' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null \
  | grep -viE 'DeviceStatus|EnrollResultIntent|getEnrollDeviceIntent|isDeviceEnrolled|deviceEnrolledFlow|enrollDevice\(|//|/\*'
# Anything still listed is a stray affordance or a stale string — remove it or explain it in the report.
```

Removing a control the developer added themselves is a change to their app. On
`menu_integration = add-to-existing`, confirm each removal with them rather than deleting on sight; on
`new`, remove anything this skill's own earlier gates created without asking.

### Step 6: Offline transactions (only if the project uses them)

`MposUi.offlineModule` exposes the same `lookupTransaction` / `queryTransactions` shape for offline
records. If the project has no offline feature, skip this entirely — do not introduce one.

---

## Acceptance Criteria

This activity is complete when all of the following are true:

1. Step 0's three probes were run, their findings recorded, and **one question asked per artefact that
   actually exists** — with `menu_integration` stored as `add-to-existing` | `rebuild` | `separate` | `new`
2. A collapsible menu is anchored at the top of the app and opens from a top-bar navigation control
3. The menu lists **`Transactions` first, then `Device Status`** — that order, and no Tap to Pay entry
   anywhere else
4. On `menu_integration = add-to-existing`, every pre-existing menu entry is still present and unrestyled
5. Enrollment status is visible in the top bar **without opening the menu**, sourced from
   `deviceEnrolledFlow()`
5a. **`MPOS_ACCESSOR` was read from `project-plan.md` and used everywhere**, and this gate added no
    `MposUi.create()` call — Critical Rule 10. `grep -rc 'MposUi\.create(' "$SOURCE_ROOT"` still returns 1
6. The Transactions screen queries via `<MPOS_ACCESSOR>.transactionModule.queryTransactions(...)` using
   the **5-argument** overload with an explicit `offset` and `limit`, and it is present unconditionally —
   Critical Rule 9
7. Pagination advances by `received.size` and treats a short page as the end — no total-count assumption
8. **The `MposError` is checked before the list is used**, and a failed query renders an error with a
   retry affordance, never an empty list. "No transactions yet", "failed", and "loading" are three
   visually distinct states
9. `Transaction.amount` and `Transaction.currency` are read null-safely, and `Transaction.status` is
   displayed on every row
10. Transaction detail is read-only, and `TransactionDetailActions` (or the project's equivalent slot) is
    **empty** — no refund or capture control is wired in this gate
11. The Device Status screen shows enrollment state and hosts the enroll/re-enroll action, with the action's
    label bound to enrollment state and never composed unconditionally
12. **No enrollment affordance exists anywhere outside the Device Status screen** — the Step 5 grep is
    clean, or every remaining hit is explained in the report
13. `isDeviceEnrolled()` still gates transaction entry points (from `act_TTP_03`) — this gate changes where
    enrollment is *presented*, never whether it is *enforced*
14. The project builds successfully (`$GRADLE_MODULE_PATH:assembleDebug`)
15. On a device with at least one prior transaction, the Transactions screen lists it with the correct
    amount and status

> **Device-dependent criteria:** AC 15 needs a real device that has taken at least one transaction, so it
> normally cannot pass before Gate 5 has run on hardware. Implement AC 1–14 and hand AC 15 to
> **TTP Gate 10 (manual device validation)**. An empty list on a merchant who has never transacted is a
> pass, not a failure — but say which of the two you observed.

---

## Agent Prompt Template

```
You are implementing the Tap to Pay operator menu in an existing Android app: a collapsible top menu
with a Transactions history screen and a Device Status screen. Read the activity file in full before
writing code.

Activity file: "$SKILL_DIR/references/ttp/activities/act_TTP_04_menu-transactions-device-status.md"

## Inputs injected by the workflow

SKILL_DIR=<SKILL_DIR>                      (ABSOLUTE path to the skill)
GRADLE_ROOT=<gradle_root>                  (ABSOLUTE)
ANDROID_MODULE_DIR=<android_module_dir>    (relative to GRADLE_ROOT)
GRADLE_MODULE_PATH=<gradle_module_path>    (e.g. :app — may be empty)
SOURCE_ROOT=<source_root>                  (relative to GRADLE_ROOT)
UI_TOOLKIT=<ui_toolkit>                    (views | compose | mixed)
DEVICE_AVAILABLE=<DEVICE_AVAILABLE>        (yes | no — decides whether AC 15 is met or DEFERRED)
MPOS_ACCESSOR=<mpos_accessor>              (from project-plan.md, WRITTEN BY TTP GATE 3. Substitute it
                                           for every literal `mposUi` / `PaymentApplication.mposUi` in
                                           this file's samples. If it is EMPTY, STOP and report — Gate 3
                                           either was skipped or failed to record it, and this gate
                                           cannot query transactionModule without it.)
GRADLE_ARGS=<gradle_args>                  (extra args EVERY build command must carry, or "")
BASELINE_QUALITY_TASK=<BASELINE_QUALITY_TASK>      (the KOTLIN tool: detekt | ktlintCheck | spotlessCheck | none)
BASELINE_QUALITY_FINDINGS=<BASELINE_QUALITY_FINDINGS>    (count + rule types at HEAD)
BASELINE_QUALITY_TASK_2=<BASELINE_QUALITY_TASK_2>  (the ANDROID tool: lintDebug | lint | none)
BASELINE_QUALITY_FINDINGS_2=<BASELINE_QUALITY_FINDINGS_2>  (count + rule types at HEAD)

## Your task

1. **Run Step 0 first.** Probe for an existing menu, history surface, and enrollment control. Ask one
   question per artefact that EXISTS. Never assume add-vs-replace, and never ask about an artefact the
   probes did not find.
2. Build the collapsible top menu with `Transactions` first and `Device Status` second. On
   `add-to-existing`, extend their menu and preserve every existing entry.
3. Put the enrollment STATUS in the top bar, visible without opening the menu, from `deviceEnrolledFlow()`.
4. Implement the Transactions screen with the 5-argument `queryTransactions` overload, explicit
   pagination, and THREE distinct states: loading, empty, failed. Check the `MposError` before the list.
5. Implement Device Status: state + enroll/re-enroll, label bound to enrollment state. Do NOT
   reimplement enrollment — call act_TTP_03's existing flow.
6. Leave `TransactionDetailActions` EMPTY. Refund is act_TTP_06's and capture is act_TTP_08's.
7. Remove every enrollment affordance outside Device Status. On `add-to-existing`, confirm removals of
   the developer's own controls before deleting.
8. **Both entries always ship.** There is no "Device Status only" variant: `act_TTP_06` and `act_TTP_08`
   attach refund and capture to the transaction detail page this gate creates, so an app without the
   Transactions screen has nowhere to put them. If Step 0 finds an existing history surface, integrate
   with it — but do not omit the capability.
9. All paths come from ANDROID_MODULE_DIR / SOURCE_ROOT. Never hardcode `app/`.
10. Resolve every API name from
    "$SKILL_DIR/references/ttp/constants/ttp-sdk-requirements.md" § *Finding a past transaction*.
    Do not invent members — `javap` the artifact if a name is not in that file.
```

---

## Mandatory verification

Run every check. Report each result verbatim; a check you did not run is a FAIL.

```bash
cd "$GRADLE_ROOT" || exit 1
[ -n "$SOURCE_ROOT" ] && [ -d "$SOURCE_ROOT" ] \
  || { echo "FAIL: SOURCE_ROOT unset or missing"; exit 1; }

# The query API is actually used — not latestTransaction standing in for a history.
grep -rq 'transactionModule' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK: transactionModule is used" \
  || echo "FAIL: no transactionModule — a history cannot be built from latestTransaction"

# Critical Rule 11 — no io.mpos.* object in rememberSaveable. This one is GREEN at build time and
# crashes on Gate 6's or Gate 8's first tap, where it reads as THEIR bug. Grep is the only
# pre-device detection. TransactionStatus is an enum and IS saveable, so it must not match.
if [ "$UI_TOOLKIT" != "views" ]; then
  grep -rn -A2 'rememberSaveable' "$SOURCE_ROOT" --include="*.kt" --exclude-dir=build \
    | grep -E 'mutableStateOf<[^{}]*\bTransaction\??>|mutableStateOf<[^{}]*io\.mpos' \
    && echo "FAIL: an SDK object is held in rememberSaveable — IllegalStateException at onSaveInstanceState. Hold the identifier String and resolve the record (Critical Rule 11)" \
    || echo "OK: no SDK object in saveable state"
else
  echo "SDK-object-in-rememberSaveable check: N/A (views project)"
fi

# The PAGINATED overload. The 2-arg form silently caps the history at 20 rows forever.
grep -rnE 'queryTransactions\(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null
grep -rq 'PAGE_SIZE\|pageSize\|limit' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK: an explicit page size is present" \
  || echo "FAIL: no explicit limit — the 2-arg overload caps the list at 20 with no way forward"

# The error must be handled in the SAME callback as the list. A file that queries but never mentions
# the error parameter is the silent-empty-history defect.
for f in $(grep -rlE 'queryTransactions\(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null); do
  grep -qE 'error *!= *null|error\?\.|if *\(error' "$f" \
    && echo "OK: $f checks the query error" \
    || echo "FAIL: $f calls queryTransactions but never tests the error — a failed query will render as an empty history"
done

# Menu order: Transactions must appear before Device Status.
for f in $(grep -rlE 'Transactions' "$SOURCE_ROOT" "$ANDROID_MODULE_DIR/src/main/res" 2>/dev/null); do
  T=$(grep -n 'Transactions'  "$f" | head -1 | cut -d: -f1)
  D=$(grep -n 'Device Status' "$f" | head -1 | cut -d: -f1)
  if [ -n "$T" ] && [ -n "$D" ]; then
    [ "$T" -lt "$D" ] && echo "OK: $f lists Transactions before Device Status" \
                      || echo "FAIL: $f lists Device Status before Transactions"
  fi
done

# Critical Rule 1 — no enrollment affordance outside Device Status.
STRAY=$(grep -rniE 'enroll' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null \
  | grep -viE 'DeviceStatus|EnrollResultIntent|getEnrollDeviceIntent|isDeviceEnrolled|deviceEnrolledFlow|enrollDevice\(|^[^:]*:[0-9]*: *(//|\*|/\*)')
if [ -n "$STRAY" ]; then
  echo "REVIEW: enrollment references outside Device Status — each must be removed or explained:"
  echo "$STRAY"
else
  echo "OK: no stray enrollment affordance"
fi

# Rule 4 — no money-moving control wired in this gate.
grep -rnE '\.refund\(|\.capture\(' "$SOURCE_ROOT" --include="*.kt" --include="*.java" 2>/dev/null \
  && echo "REVIEW: refund/capture appears in the tree — it must come from act_TTP_06 / act_TTP_08, NOT from this gate" \
  || echo "OK: no refund/capture wired here"

# Status is displayed, not just the amount.
grep -rq 'status' "$SOURCE_ROOT" --include="*.kt" --include="*.java" \
  && echo "OK: transaction status is referenced" \
  || echo "FAIL: no status displayed — the list cannot answer 'did it go through?'"

# Build. Never pipe the build command; the exit code must be the build's own.
"$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:assembleDebug" > /tmp/ttp-g4-build.log 2>&1
BUILD_EXIT=$?
[ "$BUILD_EXIT" -eq 0 ] && echo "OK: build succeeded" \
  || { echo "FAIL: build exit $BUILD_EXIT"; tail -30 /tmp/ttp-g4-build.log; }
```

### Quality-gate diff (mandatory when the project has one)

This gate edits Kotlin/Java **and** resource files, so **both** baselines apply — the Kotlin tool does
not read `res/menu/*.xml` and Android `lint` does not read Kotlin style.

```bash
QUALITY_EXIT=0
for TASK in "$BASELINE_QUALITY_TASK" "$BASELINE_QUALITY_TASK_2"; do
  [ -z "$TASK" ] && continue
  [ "$TASK" = "none" ] && continue
  "$GRADLE_ROOT/gradlew" $GRADLE_ARGS "$GRADLE_MODULE_PATH:$TASK" > "/tmp/ttp-g4-$TASK.log" 2>&1
  EXIT=$?
  echo "$TASK exit $EXIT — compare the finding count against the Gate 0 baseline for the SAME task"
  [ "$EXIT" -ne 0 ] && QUALITY_EXIT=$EXIT
done
[ "$QUALITY_EXIT" -eq 0 ] && echo "OK: no quality regression" \
  || echo "REVIEW: compare against baseline — an absolute zero is not the bar"
```

Compare **against the Gate 0 baseline**, not against zero. Do not "fix" pre-existing findings, do not
edit the project's lint/detekt configuration, and do not add a blanket suppression.

---

## Required report

```
TTP GATE 4 REPORT
Status: PASS | FAIL | PASS (history listing DEFERRED to TTP Gate 10)
Existing UI found: menu: YES (<file>) | NO | history: YES (<file>) | NO | enroll control: YES (<files>) | NO
menu_integration: add-to-existing | rebuild | separate | new
  Questions asked: <one per artefact that existed, or "none — no existing artefacts found">
  Pre-existing menu entries preserved: YES | N/A | NO (<why>)
Menu mechanism: <ModalNavigationDrawer | DrawerLayout+NavigationView | other>
Menu order verified (Transactions before Device Status): YES | NO
Enrollment status in top bar, visible without opening the menu: YES | NO
Transactions screen: IMPLEMENTED   (there is no skip variant — Gates 6 and 8 depend on its detail page)
  queryTransactions overload: 5-arg (paginated) | 2-arg (<why — this caps at 20>)
  Page size: <n>
  Pagination end condition: short page | other (<what>)
  MposError checked before the list: YES | NO
  Distinct loading / empty / failed states: YES | NO
  Fields displayed: amount (null-safe: YES|NO), currency (null-safe: YES|NO), status, identifier
Transaction detail: read-only YES | NO
  TransactionDetailActions left empty for act_TTP_06 / act_TTP_08: YES | NO (<what was wired>)
  Selection held as: identifier String in rememberSaveable / nav argument | plain remember | Transaction in rememberSaveable (FAIL — crashes Gates 6 and 8)
  TransactionDetailActions parameter type: Transaction (any other type is a FAIL — Critical Rule 12)
Device Status screen: <file>
  Enroll/re-enroll label bound to deviceEnrolledFlow(): YES | NO
  supportedCurrencies check present: YES | NO
Stray enrollment affordances removed: <list removed> | none found
  Removals confirmed with the developer: YES | N/A (skill-created only)
isDeviceEnrolled() still gates transaction entry points: YES | NO
Build: SUCCESS | FAILED
Quality diff vs Gate 0 baseline: <kotlin task>: <n> vs <baseline n> | <lint task>: <n> vs <baseline n>
On-device listing: LISTED <n> transactions | EMPTY (merchant has none) | DEFERRED (no device)
Files created/modified: <list>
Acceptance criteria met: <list>
```
