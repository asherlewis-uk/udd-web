---
name: security-truth-review
description: find security, secret, destructive action, and product truth risks with source evidence and smallest safe fixes
---

# Security Truth Review

Use this skill for security reviews that also need product-truth judgment.

## Required search areas

Search for:

```bash
rg -n "localStorage|sessionStorage" app components lib
rg -n "password|api key|apikey|secret|credential|token" app components lib
rg -n "auth\\.admin|service_role|service role|deleteUser" app lib scripts
rg -n "fake|mock|demo|stub|placeholder|coming soon|unavailable|href=\"#\"" app components lib docs
rg -n "disabled|aria-disabled|confirm|delete|remove|archive" app components
```

Use narrower paths when the user names a surface.

## Review rules

- Require source evidence for every finding.
- Do not make speculative claims without labeling uncertainty.
- Separate security findings from UX polish.
- Name the smallest safe fix for each finding.
- Do not treat a disabled control as safe unless the copy is truthful and the blocked action cannot run.
- Do not treat docs as proof of security behavior; verify server actions, SQL, and client boundaries.

## Risk categories

Classify findings as:

- `secret exposure`
- `client-side secret handling`
- `authorization/ownership`
- `destructive action safety`
- `fake or misleading capability`
- `unsafe fallback`
- `audit uncertainty`
- `ux polish`

## Evidence checklist

For each finding include:

- file path and symbol/component/action
- user impact
- whether data is persisted, exposed, deleted, or only displayed
- smallest safe fix
- verification needed after fix

## Output format

Use:

| Risk | Severity | Evidence | Smallest safe fix |
| --- | --- | --- | --- |

End with a short "Not security blockers" section for UX-only observations.
