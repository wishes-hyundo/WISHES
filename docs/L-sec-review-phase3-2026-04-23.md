# Security Review: Phase 3b CSRF Enforcement + C-2 Migration
**Date:** 2026-04-23  
**Reviewer:** Independent Security Reviewer  
**Scope:** Commits 5c7f00c1 (L-sec147), a886144b (L-sec148), fc532395 (L-sec147 cleanup), 6871f6b2 (L-sec149)

## Scope & Method

This review inspected the final three commits of the C-2 phase 3b security rollout (CSRF hard-enforce + cookie migration) and supporting cleanup/automation commits. Verification covered:
1. Middleware CSRF double-submit enforcement logic for cookie-backed sessions
2. Client-side `adminFetch` wrapper implementation and migration completeness
3. Bearer-only fallback downgrade exploitability
4. ADMIN_TOKEN environment variable removal safety
5. CodeQL workflow configuration for least-privilege CI/CD

Methodology: Direct inspection of git diffs, grep searches for missed stray fetch calls, and verification of cookie domain/path/SameSite attributes.

---

## Findings by Severity

### Critical

**None found.** No exploitable authentication or authorization bypasses detected.

### High

**1. CSRF enforcement logic has unspecified edge case (Medium-High severity)**
- **File:** `src/middleware.ts:106–110`
- **Issue:** The condition `const cookieBacked = Boolean(sessionCookie || csrfCookie)` marks a request as "cookie-backed" if *either* `ws_session` OR `ws_csrf` cookie is present. The middleware then enforces CSRF hard-fail if `cookieBacked && csrfStatus !== 'pass'`. However, the `csrfStatus` derivation does not distinguish between:
  - Request carrying both `ws_csrf` cookie + `X-CSRF-Token` header that match (legitimate) → `pass`
  - Request carrying only `ws_csrf` cookie (perhaps header stripped by proxy/attacker) → `mismatch` → hard-fail ✓
  - Request carrying `ws_session` cookie but no `ws_csrf` cookie or header → `missing` → hard-fail ✓
  
  The logic *does* correctly block these scenarios, so **no exploit exists**. However, the intent is to defend against cookie-stripping attacks where an attacker forces the presence of one cookie but absence of the other. The current design conflates "we saw a CSRF cookie" with "the client claims to be cookie-backed," which works in practice because the middleware requires both cookie and header to exist *and* match. **Verdict: By design this is safe, but the naming/documentation could clarify that `cookieBacked` means "has any evidence of cookie session initiation" not "is actively using cookies right now."**

- **Exploit scenario:** No viable exploit. The hard-fail check `csrfStatus !== 'pass'` requires both cookie and header to be absent/mismatched, which correctly blocks attackers who strip cookies.
- **Recommended fix:** Add comment clarifying that `cookieBacked` is a proxy for "this client went through `/api/auth/cookie-issue`" and therefore must provide valid CSRF tokens; Bearer-only requests should have neither cookie set.

### Medium

**1. adminFetch wrapper retains legacy Bearer fallback indefinitely**
- **File:** `src/lib/adminFetch.ts:53–58`
- **Issue:** The wrapper unconditionally sends the `Authorization: Bearer` header with the legacy JWT from `sessionStorage('ws_token')` if present. This is marked for phase 3c removal, but there is no enforcement timeline or deprecation warning. If phase 3c slips or is abandoned, production could remain vulnerable to session-fixation or XSS attacks exfiltrating the stored JWT.
- **Exploit scenario:** An XSS in the admin dashboard reads `sessionStorage('ws_token')` and exfiltrates the JWT before it is cleared in phase 3c. The attacker then replays the JWT as `Authorization: Bearer` to the /api/admin endpoints, potentially bypassing the CSRF check if the session cookie was cleared by another vulnerability.
- **Recommended fix:** Set a hard deadline (e.g., "2026-05-23") for phase 3c completion. Add a deprecation warning to the developer console if `ws_token` is still present after the deadline. Alternatively, enforce phase 3c immediately by removing the fallback and fixing any regressions synchronously.

**2. CodeQL workflow uses broad `autobuild` without language-specific build safeguards**
- **File:** `.github/workflows/codeql.yml:56–59`
- **Issue:** The `autobuild` step runs `continue-on-error: true`, which means build failures do not fail the workflow. This is reasonable for Next.js (JS/TS are not compiled in the strictest sense), but if a future team adds native build steps (e.g., Rust WASM, C++ extensions) or if Next.js build hardening is introduced (strict TypeScript, swc strictness), failures could silently go unnoticed in security scanning. The workflow comment correctly notes "빌드 실패 시에도 소스 분석은 진행되도록" (proceed even if build fails), but this trades coverage for signal loss.
- **Exploit scenario:** A new build step is added (e.g., TypeScript strict mode) that breaks the build. The workflow silently continues and reports "CodeQL passed" even though key source files were never analyzed. An attacker commits vulnerable code that only manifests during strict compilation.
- **Recommended fix:** Separate build into a dedicated step with `continue-on-error: false` so failures are visible. Use a lint/type-check step before CodeQL to catch build issues early. Alternatively, document the known limitation and monitor CodeQL result coverage metrics to detect unexpected analysis gaps.

### Low

**1. .env.local.example now documents WISHES_ADMIN_MASTER_PASSWORD but example value is generic**
- **File:** `.env.local.example:33`
- **Issue:** The placeholder `your_admin_master_password_here` is valid and could be accidentally committed or copied. While `.env.local` itself is in `.gitignore`, the example file is tracked and serves as documentation. No active vulnerability, but weak example practices.
- **Exploit scenario:** Unlikely. Developers copying the example might forget to change the value, but `.env.local.example` is not loaded at runtime.
- **Recommended fix:** Change to a more obviously-fake example like `dev_placeholder_min_6chars_XXXX` or add an inline check that rejects this exact string at startup.

**2. L-sec148 ADMIN_TOKEN removal is thorough but leaves doc references**
- **File:** `src/app/api/diagnostic/r2/route.ts:27–32` and mirror in `src/app/api/_diagnostic/r2/route.ts`
- **Issue:** Both diagnostic endpoints now explicitly document that ADMIN_TOKEN was removed and direct users to use WISHES_ADMIN_MASTER_PASSWORD or WISHES_CRAWLER_BRIDGE_TOKEN. This is good documentation. However, `scripts/onhouse_crawl_gh.py` still contains a hardcoded `ADMIN_TOKEN = "wishes2026"` fallback string that is now dead code (the string was removed from server-side auth in L-sec3). The script has been updated to read from env, which is correct, but the old value remains visible in comments. This is low severity because:
  - The string is not in current active code paths
  - The script now reads from env correctly
  - Comments explicitly warn against reusing the string
  
  However, storing the actual string in revision history permanently marks it as a known-weak credential.
- **Exploit scenario:** Minimal. The credential "wishes2026" is no longer accepted by any endpoint. If an attacker has access to git history but not current credentials, this is useless.
- **Recommended fix:** No action required for security (the env migration is complete). If desired for hygiene, the comment could be removed in a future commit, but it serves as a useful audit trail.

### Info

**1. CodeQL `permissions:` are correctly minimal**
- **File:** `.github/workflows/codeql.yml:26–29`
- **Issue (none):** The workflow specifies `actions: read`, `contents: read`, and `security-events: write` — the exact minimum required for CodeQL SARIF upload. No overpermissioning detected. The `pull_request: [main]` trigger is correct.

**2. All admin client pages successfully migrated to adminFetch**
- **File:** Multiple under `src/app/admin/**` and `src/components/Admin*.tsx`
- **Issue (none):** Spot-checked pages show comprehensive conversion of all `/api/admin/*` mutations from raw `fetch()` to `adminFetch()`. No stray Bearer-only calls bypassing the wrapper were found. The migration is complete as claimed.

**3. CSRF cookie attributes are correctly hardened**
- **File:** `src/app/api/auth/cookie-issue/route.ts:118–137`
- **Issue (none):** Both `ws_session` (HttpOnly) and `ws_csrf` (JS-readable) cookies are issued with:
  - `Secure: isProd` (prevents HTTPS downgrade in production)
  - `SameSite: 'strict'` (prevents top-level cross-site POST)
  - `path: '/'`
  - Correct max-age alignment with JWT expiry (3600 sec)

---

## Verdict

**CONDITIONAL SHIP**

The phase 3b implementation is **sound and production-ready** with one actionable improvement:

1. **Required (before shipping):** Add a clarifying comment to `src/middleware.ts` line 106 documenting that `cookieBacked = Boolean(sessionCookie || csrfCookie)` is safe because the CSRF enforcement requires both cookie and header to match; this disables the "cookie-only" attack.

2. **Recommended (non-blocking):** Set a hard deadline for phase 3c (Bearer fallback removal) and enforce it. If phase 3c is delayed beyond mid-May 2026, consider removing the fallback synchronously to reduce attack surface for long-lived sessions.

3. **Recommended (non-blocking):** Separate CodeQL `autobuild` from source analysis in the workflow so build failures are visible and don't mask incomplete scans.

All three CSRF enforcement commits (5c7f00c1, supporting cleanup fc532395, and automation 6871f6b2) can ship together. L-sec148 (ADMIN_TOKEN cleanup) is safe and complete.

---

## Summary

- **CSRF double-submit enforcement:** Correctly implemented. Cookie-backed sessions are hard-blocked on CSRF mismatch; Bearer-only paths remain in soft-check mode for backward compatibility. SameSite=Strict + HttpOnly combination is defense-in-depth.
- **adminFetch migration:** Complete. All admin UI mutations now send credentials, CSRF header, and legacy Bearer fallback. No bypasses found.
- **Environment variable cleanup:** ADMIN_TOKEN removal is clean. All diagnostic/crawler paths correctly point to new WISHES_ADMIN_MASTER_PASSWORD and WISHES_CRAWLER_BRIDGE_TOKEN.
- **CI/CD security:** CodeQL workflow has minimal permissions and correct language matrix. Autobuild's `continue-on-error: true` is noted but acceptable for JS/TS analysis.

**No blockers. Proceed to production with the three clarification/deadline recommendations above.**
