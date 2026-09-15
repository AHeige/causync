# Security and privacy contract

Causync does not grant authority. Every write, retry, status lookup and authoritative read must authenticate the current actor and enforce tenant scope, RBAC, domain invariants and expected version on the server.

Bind a mutation ID to authenticated actor scope, contract ID and a server-computed canonical payload hash in the same transaction as the domain write. Reusing an ID with a different binding is a conflict. Keep idempotency records longer than the maximum recovery window. External effects require provider idempotency or a transactional outbox.

Recovery input may contain user data. Persist only fields required to recover the intent, select storage appropriate to their sensitivity, isolate it by tenant and user, expire it, and clear it at sign-out. Web Storage is readable by script in the same origin and is unsuitable for unprotected secrets. Multi-tab broadcasts contain mutation IDs only.

Treat `unknown` and `not-found` as uncertainty until authoritative review. Never convert a timeout into rejection, silently replay an unsafe command, or accept client-supplied actor scope. Receipts and coverage predicates are security-sensitive evidence adapters and require hostile-input tests.

## Supported versions

Until Causync reaches a stable release, security fixes target the latest `0.x` prerelease published under the npm `next` tag. Older prereleases may be unsupported.

## Reporting a vulnerability

Report suspected vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/AHeige/causync/security/advisories/new). Do not include credentials, tenant data or exploitable production details in a public issue.
