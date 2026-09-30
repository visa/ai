# Activity 0c: Connectivity Pre-Check

Verify that the developer's machine can reach every external resource that Gate 1 will
need during dependency resolution. Detecting proxy, SSL-interception, or firewall issues
**now** avoids slow, repeated build failures later.

**Reference:** `references/pax-aio/troubleshooting.md#network-access`

## Critical Rules (NEVER violate these)

1. **NEVER automatically remediate without developer consent** — always present the problem and let the developer choose.
2. **NEVER proceed to Step 2 until all checks pass** — connectivity failures cause repeated build failures.
3. **NEVER skip Check 3** — corporate proxy can intercept HTTPS silently.
4. **Assumption:** The skill assumes public internet access. Only prompt if the contrary is detected.

## Procedure

Run Checks 1-2 **in parallel** (they are independent) to minimise wall-clock time.
Wait for both to complete, then run Check 3 (which depends on Check 1's JVM path).

### Checks 1-2 (run in parallel)

Launch these two commands concurrently and collect their results:

#### Check 1 — Gradle wrapper (`services.gradle.org`)

```bash
./gradlew --version 2>&1 | head -20
```

- **Pass:** Output shows a Gradle version line (e.g., `Gradle 8.9`).
- **Fail (wrapper JAR missing):** Output contains `Could not find or load main class
  org.gradle.wrapper.GradleWrapperMain` or `gradlew: No such file or directory` or
  the wrapper JAR file (`gradle/wrapper/gradle-wrapper.jar`) does not exist. Tag as
  `WRAPPER_JAR_MISSING`.

  **Do NOT attempt to fix this automatically.** Instead, present the issue to the
  developer and ask:

  > The Gradle wrapper JAR is missing from this project
  > (`gradle/wrapper/gradle-wrapper.jar` not found).
  > This is needed to download Gradle and run builds.

  Use `AskUserQuestion` with options:
  - **I'll fix it myself** — the developer will regenerate or restore the wrapper.
    Pause and wait for the developer to tell you when ready, then re-run Check 1.
  - **Fix it for me** — the skill will attempt to regenerate the wrapper using system
    Gradle (see Remediation E below).
  - **Cancel integration** — stop here.

- **Fail (SSL):** Output contains `PKIX path building failed` or
  `unable to find valid certification path` → corporate SSL inspection is intercepting
  HTTPS. Tag as `SSL_ERROR`.
- **Fail (timeout / connection refused):** Output contains `Connection timed out`,
  `Connection refused`, or `Could not resolve host` → proxy or firewall blocking
  outbound HTTPS. Tag as `PROXY_OR_FIREWALL`.
- **Fail (other):** Capture the first 20 lines. Tag as `UNKNOWN`.

#### Check 2 — Visa SDK repository + SDK version discovery (`repo.visa.com`)

This check serves **two purposes**: verifying connectivity to `repo.visa.com` AND
(when `SDK_VERSION_PREFERENCE = latest`) discovering the latest SDK version.

```bash
SDK_VERSIONS=$(curl -sS --max-time 20 \
  https://repo.visa.com/mpos-releases/io/payworks/paybutton-android/ \
  | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -V | tail -6)
echo "$SDK_VERSIONS"
```

- **Pass:** Output contains one or more version numbers (e.g., `2.105.0`).
  Store all discovered versions as `AVAILABLE_SDK_VERSIONS`.

  **SDK version resolution** (based on `SDK_VERSION_PREFERENCE` from Q1):

  - If `SDK_VERSION_PREFERENCE = latest`: automatically select the **highest version**
    from `AVAILABLE_SDK_VERSIONS` and store as `SELECTED_SDK_VERSION`.

  - If `SDK_VERSION_PREFERENCE = choose`: `SELECTED_SDK_VERSION` was already collected
    and validated in Q1a. No further action needed — just confirm connectivity passed.
    If Q1a validation was tentative (due to network error at that time), re-validate now:
    ```bash
    HTTP_STATUS=$(curl -sS --max-time 15 -o /dev/null -w "%{http_code}" \
      "https://repo.visa.com/mpos-releases/io/payworks/paybutton-android/${SELECTED_SDK_VERSION}/paybutton-android-${SELECTED_SDK_VERSION}.pom")
    ```
    If HTTP 404, follow the same re-ask flow described in Q1a (present available versions,
    let user pick, repeat until valid).

  After this step, `SELECTED_SDK_VERSION` is final and is passed to the Gate 1
  implementation agent.

- **Fail (empty output / curl error):** The curl succeeded at the HTTP level but
  returned no parseable versions. Fall back to a simple connectivity check:
  ```bash
  curl -sSf --max-time 15 -o /dev/null -w "%{http_code}" https://repo.visa.com/mpos-releases/
  ```
  If this also fails, classify per Check 1 rules. Additionally, if Check 1 passes
  but Check 2 fails, the Visa repository may require a specific corporate mirror —
  tag as `VISA_REPO_BLOCKED`.
- **Fail (timeout / SSL / connection):** Same classification as Check 1. If Check 1
  passes but Check 2 fails, tag as `VISA_REPO_BLOCKED`.

### Check 3 — SSL certificate inspection

Run this regardless of whether Checks 1-2 passed — a corporate proxy can intercept HTTPS
successfully (no error) but still cause issues during Gradle dependency resolution.

```bash
# macOS / Linux
openssl s_client -connect repo.visa.com:443 -servername repo.visa.com </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer 2>/dev/null
```

- **Pass (public CA):** Issuer contains a well-known CA (e.g., `DigiCert`, `Entrust`,
  `Let's Encrypt`, `GlobalSign`). No action needed.
- **Warning (corporate MITM):** Issuer contains an internal or corporate CA name (not a well-known public CA).
  This means HTTPS traffic is being intercepted. Log the finding:

  > Corporate SSL inspection detected — certificate issuer: `<issuer>`.
  > This may cause SSL errors during Gradle builds.

  Check whether the corporate CA is already trusted by the project's JDK:

  ```bash
  JAVA_HOME_PATH=$(./gradlew --version 2>&1 | grep "JVM:" | sed 's/.*: //' | xargs -I{} dirname "$(dirname "{}")" 2>/dev/null) || JAVA_HOME_PATH=$JAVA_HOME
  keytool -list -keystore "$JAVA_HOME_PATH/lib/security/cacerts" -storepass changeit 2>/dev/null | grep -i "$(echo '<issuer_keyword>' | head -c 20)"
  ```

  - If found → the CA is already trusted, proceed.
  - If not found → tag as `SSL_ERROR`.

### Summary and Developer Decision

After all three checks, **always** present results to the developer:

> **Connectivity Pre-Check Results**
>
> | Check | Target | Result |
> |-------|--------|--------|
> | 1 | Gradle wrapper (`services.gradle.org`) | PASS / FAIL (`<tag>`) |
> | 2 | Visa SDK repo + version discovery (`repo.visa.com`) | PASS / FAIL (`<tag>`) — SDK version: `<SELECTED_SDK_VERSION>` or `N/A` |
> | 3 | SSL certificate inspection | Public CA / Corporate MITM (trusted) / Corporate MITM (untrusted) |

#### All checks pass

> _All connectivity checks passed — proceeding to Gate 1._
> _Selected SDK version: `<SELECTED_SDK_VERSION>` (will be forwarded to Gate 1)._

Store `SELECTED_SDK_VERSION` for injection into the Gate 1 agent prompt.
Proceed directly to Step 2. Do NOT ask for confirmation.

#### One or more checks fail

Do **NOT** automatically remediate. Instead, explain the problem clearly and let the
developer decide. Present a diagnosis for each failure:

> **Connectivity issues detected**
>
> The following resources could not be reached. Gate 1 (SDK Dependencies) will
> download the PAX SDK and Gradle dependencies from these hosts — without
> connectivity the build will fail repeatedly.
>
> | Issue | Diagnosis |
> |-------|-----------|
> | `SSL_ERROR` | Corporate SSL inspection is intercepting HTTPS certificates. The JDK does not trust the proxy's CA. |
> | `PROXY_OR_FIREWALL` | Outbound HTTPS is blocked — likely a corporate proxy or firewall. |
> | `VISA_REPO_BLOCKED` | `repo.visa.com` is unreachable but other hosts work — a corporate Artifactory/Nexus mirror may be required. |
> | `UNKNOWN` | Unexpected error (see output above). |

Then use `AskUserQuestion` with options:

- **Fix it for me** — the skill will attempt to diagnose and resolve the issues
  (see Remediations below).
- **I'll fix it myself** — the developer will resolve the network issues externally.
  The skill pauses and waits.
- **Cancel integration** — stop here. The developer is shown:
  > PAX SDK integration requires network access to download dependencies.
  > You can re-run the skill after resolving the connectivity issues.

**If "I'll fix it myself":** Ask the developer to tell you when they are ready, then
re-run all checks. Repeat until all pass or the developer cancels.

**If "Cancel integration":** End the session. Do NOT proceed to Step 2.

**If "Fix it for me":** Apply the matching remediation below, then re-run all checks.
If they still fail, present results again and ask the same question.

## Remediations (only when developer chooses "Fix it for me")

Refer to `references/pax-aio/troubleshooting.md#network-access` for the full escalation sequence.
The abbreviated decision tree is:

### Remediation A — SSL certificate error (corporate MITM / SSL inspection)

Corporate SSL inspection is replacing TLS certificates with its own CA.

1. Ask the developer for the corporate CA certificate file (`.crt` or `.pem`):

   > Your network uses SSL inspection (issuer: `<issuer>`).
   > Gradle needs to trust this certificate to download dependencies.
   >
   > Please provide the path to your corporate CA certificate file
   > (e.g., `~/certs/corporate-root-ca.pem`). Your IT team or network admin
   > can provide this.

2. Import into the JDK truststore:

   ```bash
   sudo keytool -importcert \
     -file "<cert_path>" \
     -keystore "$JAVA_HOME/lib/security/cacerts" \
     -alias "corp-proxy-ca" \
     -storepass changeit \
     -noprompt
   ```

3. Re-run the failing check. If it passes, continue.

### Remediation B — Proxy or firewall blocking outbound HTTPS

1. Check for existing proxy configuration:

   ```bash
   echo "HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY"
   echo "http_proxy=$http_proxy https_proxy=$https_proxy"
   grep -i proxy ~/.gradle/gradle.properties 2>/dev/null || true
   scutil --proxy 2>/dev/null || true
   ```

2. If a proxy is found but not configured for Gradle, add to `~/.gradle/gradle.properties`:

   ```properties
   systemProp.http.proxyHost=<proxy_host>
   systemProp.http.proxyPort=<proxy_port>
   systemProp.https.proxyHost=<proxy_host>
   systemProp.https.proxyPort=<proxy_port>
   systemProp.http.nonProxyHosts=localhost|127.0.0.1
   ```

3. If no proxy is found, ask the developer:

   > Outbound HTTPS connections are being blocked. This is usually caused by a
   > corporate firewall or proxy. How does your team normally access external
   > Maven repositories?
   >
   > Options:
   > 1. Provide your proxy host and port
   > 2. Connect to VPN first
   > 3. Ask IT to whitelist the required hosts

4. Re-run the failing check.

### Remediation C — `repo.visa.com` unreachable but other hosts work

The Visa repository may be behind a corporate mirror (Artifactory/Nexus).

1. Check for existing Artifactory/Nexus mirrors:

   ```bash
   cat ~/.gradle/init.gradle 2>/dev/null
   grep -ri "artifactory\|nexus" ~/.gradle/init.d/*.gradle 2>/dev/null || true
   grep -ri "artifactory\|nexus" settings.gradle* 2>/dev/null || true
   ```

2. If a mirror base URL is found, test it:

   ```bash
   curl -sSf --max-time 15 -o /dev/null -w "%{http_code}" https://<mirror_host>/mpos-releases/
   ```

3. If confirmed, update the project plan to use the mirror URL instead of
   `repo.visa.com` in the `settings.gradle` `exclusiveContent` block.

4. If no mirror exists, ask the developer per `references/pax-aio/troubleshooting.md#network-access` Approach D.

### Remediation D — Unknown failure

Capture the full error output and present it to the developer:

> The connectivity pre-check encountered an unexpected error:
>
> ```
> <error output>
> ```
>
> Please check your network configuration and try again.
> If you need help, consult your IT team or network administrator.

### Remediation E — Gradle wrapper JAR missing (only when developer chooses "Fix it for me")

The Gradle wrapper JAR (`gradle/wrapper/gradle-wrapper.jar`) is missing. The skill
will attempt to regenerate it using the system-installed Gradle.

1. Check if a system Gradle is available:

   ```bash
   which gradle && gradle --version 2>&1 | head -5
   ```

   If no system Gradle is found, inform the developer:
   > No system Gradle installation found. Please install Gradle (e.g., via
   > `brew install gradle` on macOS or `sdk install gradle` via SDKMAN) and
   > try again, or regenerate the wrapper manually.

   Pause and wait for the developer.

2. Determine the target Gradle version. Read `gradle/wrapper/gradle-wrapper.properties`
   to find the intended `distributionUrl`. If the properties file specifies a version,
   use that. Otherwise, use the version from `required_upgrades` in `project-plan.md`,
   or fall back to `MIN_GRADLE_VERSION` from `references/pax-aio/constants/pax-sdk-requirements.md`.

3. **Before regenerating, ask the developer for approval** of the distribution URL:

   > The wrapper will be regenerated pointing to:
   > `<distribution_url>`
   >
   > Is this correct?

   Use `AskUserQuestion` with options:
   - **Yes — proceed** — regenerate with the shown URL.
   - **Use a different URL** — the developer provides an alternative (e.g., corporate
     Artifactory mirror). Collect the URL and use it instead.

4. Regenerate the wrapper:

   ```bash
   gradle wrapper --gradle-distribution-url="<approved_distribution_url>" 2>&1
   ```

5. Verify the JAR was created:

   ```bash
   ls -la gradle/wrapper/gradle-wrapper.jar
   ./gradlew --version 2>&1 | head -10
   ```

   If the regeneration fails (e.g., the project's `build.gradle` has errors that
   prevent Gradle from configuring), inform the developer of the specific error and
   suggest they fix the build configuration first.

After any remediation attempt, re-run all checks. If failures remain, present
results again and repeat the developer decision question. Do NOT proceed to Step 2
until all checks pass.

## Acceptance Criteria

- [ ] All 3 connectivity checks pass
- [ ] `SELECTED_SDK_VERSION` is resolved and stored
- [ ] Results table is presented to the developer
- [ ] Any failures are diagnosed and remediated (or developer cancels)
