# Security Hardening Report for Claude

Date: 2026-06-14
Branch: `main`
Scope: Authentication, authorization, secret handling, token exposure, review abuse, dependency security

## Summary

The security findings from the repository audit were implemented and verified.
The highest-risk unauthenticated staff operations and token disclosure paths are now blocked.

## Implemented Changes

### 1. Staff table APIs require authentication and store ownership

- Added `require_staff_or_admin` to all `/staff/tables/*` mutations.
- Added store ownership checks for source and target tables.
- Protected staff QR PDF and register-table endpoints.
- File: `backend/routers/tables.py`

### 2. Public table responses no longer expose tokens

- Added `TablePublic`.
- Public `GET /api/stores/{store_id}/tables` now returns only:
  - `id`
  - `store_id`
  - `table_number`
  - `status`
- `qr_token`, `session_token`, join window, and internal state are excluded.
- File: `backend/routers/stores.py`

### 3. Legacy store and table creation are protected

- `POST /api/stores/` now requires super-admin authentication.
- `POST /api/stores/{store_id}/tables` requires store-admin authentication and matching ownership.
- File: `backend/routers/stores.py`

### 4. Store-admin privilege escalation is blocked

- Subscription extension verifies that the target store matches the authenticated admin store.
- Generic store update rejects protected fields including subscription state, credentials, owner identity, OAuth IDs, and master PIN.
- Files:
  - `backend/routers/billing.py`
  - `backend/routers/stores.py`

### 5. Public store response secret leakage is blocked

- Removed password hash, OAuth IDs, Stripe IDs, payment credentials, and master PIN from the public store response.
- File: `backend/routers/stores.py`

### 6. Customer checkout requires the current table session

- Legacy `/api/qr/checkout/{table_id}` now requires `session_token`.
- Checkout UI now calls `/api/customer/tables/{table_id}/checkout-request` with its stored session token.
- Files:
  - `backend/routers/qr.py`
  - `frontend-react/src/views/CheckoutView.jsx`

### 7. Review point farming is blocked

- Reviews require a paid order matching the requested store and customer.
- Order row is locked during validation.
- Duplicate reviews for the same order return HTTP 409.
- Ratings outside 1-5 are rejected.
- File: `backend/routers/reviews.py`

### 8. PINs are stored as bcrypt hashes

- Master and staff PIN creation/update/reset now stores bcrypt hashes.
- Existing plaintext PINs remain usable and are upgraded to bcrypt after successful login.
- Staff APIs no longer return PIN values.
- Expanded DB columns to `VARCHAR(255)`.
- Replaced broken Passlib/bcrypt integration with direct bcrypt calls while retaining existing bcrypt hash compatibility.
- Files:
  - `backend/utils/auth.py`
  - `backend/routers/admin.py`
  - `backend/routers/auth.py`
  - `backend/routers/staff_auth.py`
  - `backend/models.py`
  - `backend/database.py`

### 9. Secret encryption now fails closed

- Missing or invalid `ENCRYPTION_KEY` no longer causes payment secrets to be stored in plaintext.
- Secret writes fail with `RuntimeError`.
- File: `backend/utils/crypto.py`

### 10. Login brute-force protection

- Added Redis-backed failure counters.
- Limit: 10 failures per 15 minutes for account/IP or store/IP scope.
- Successful login clears the counter.
- Identifiers are SHA-256 hashed before being used as Redis keys.
- `X-Forwarded-For` is trusted only when `TRUST_PROXY_HEADERS=true`.
- Files:
  - `backend/utils/security.py`
  - `backend/routers/auth.py`
  - `backend/routers/super_admin.py`
  - `backend/routers/staff_auth.py`
  - `backend/.env.example`

### 11. SEO metadata XSS hardening

- Store-controlled title, description, and image URL are HTML-escaped before insertion.
- File: `backend/main.py`

### 12. Frontend dependency remediation

- Updated vulnerable packages, including:
  - `axios` 1.17.0
  - `react-router-dom` 7.17.0
  - `vite` 8.0.16
  - `postcss` 8.5.15
- Removed unused and incompatible `@vitejs/plugin-react-swc`.
- `npm audit`: 0 vulnerabilities.

## Verification

- Backend full test suite: `58 passed`
- Security regression tests: `12 passed`
- Python compile check: passed
- Frontend production build with Vite 8: passed
- `npm audit`: 0 vulnerabilities
- `git diff --check`: passed

Security regression tests are in:

- `backend/tests/test_security_hardening.py`

## Deployment Requirements

1. Set a valid Fernet `ENCRYPTION_KEY` before saving payment credentials.
2. Keep Redis available because authentication throttling depends on it.
3. Set `TRUST_PROXY_HEADERS=true` only behind a trusted proxy that rewrites `X-Forwarded-For`.
4. Run the normal application DB initialization so PIN columns are widened to `VARCHAR(255)`.
5. Existing plaintext PINs are migrated lazily on successful login; force PIN reset if immediate migration is required.
6. Run `npm install` during frontend deployment because the lock file and Vite major version changed.

## Remaining Notes

- Admin and staff JWTs are still stored in browser `localStorage`. Moving them to Secure, HttpOnly, SameSite cookies requires a broader authentication/API migration.
- The frontend bundle remains large and emits a chunk-size warning, but the production build succeeds.
- Pydantic emits two deprecation warnings for class-based model `Config`; this is not a current security failure.
