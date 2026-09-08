# Velocity Cookie Policy (template — real legal review required before use)

## Cookies we actually use

| Cookie | Purpose | Real mechanism |
|---|---|---|
| Session cookie | Keeps you signed in | JWT access token (15 min) — STEP 3's real session model |
| Refresh token cookie | Silently renews your session without re-entering your password | JWT refresh token (30 days), rotated on use |
| Workspace selector | Remembers which workspace you last worked in | A lightweight client-side preference, not sent to any third party |

## What we do NOT use

No third-party advertising or cross-site tracking cookies. No analytics cookies beyond first-party product-usage tracking needed to operate the dashboard you're using (aggregate campaign performance, not individual browsing behavior across other sites).

## Managing cookies

Session and refresh cookies are required for the product to function — disabling them will sign you out. You can revoke any active session directly from your account settings (a real, working feature — `sessions.list`/`sessions.revoke`, STEP 3), which is the equivalent of clearing that session's cookie server-side.
