# Next.js host boundaries

Keep a Causync contract's browser side declarative. The server remains responsible for authentication, authorization, atomic idempotency and evidence.

```ts
// app/api/tasks/title/route.ts
import 'server-only'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const command = await request.json()
  const actor = await requireActor()
  const receipt = await writeTaskTitleIdempotently({ actor, ...command })
  return NextResponse.json(receipt)
}
```

The idempotency transaction must bind `mutationId` to the authenticated scope and a hash of the canonical payload. A duplicate with the same hash returns the stored receipt; a duplicate with another hash is a conflict.

```ts
// app/tasks/actions.ts
'use server'
import 'server-only'

export async function setTaskTitle(command: SetTaskTitleCommand) {
  const actor = await requireActor()
  return writeTaskTitleIdempotently({ actor, ...command })
}
```

Both transports can back the same client contract. `accepted` validates the correlated receipt. `reconcile` queries an authoritative projection or mutation-status endpoint. A Server Action's return value is acceptance evidence only when the server adapter makes that guarantee; the client must not infer projection coverage from a resolved Promise.

For SWR or TanStack Query, fetch authoritative data through the matching Causync adapter and implement `covers(value, operation)` from versions, event IDs or explicit mutation coverage returned by the host. Timestamps alone are insufficient when clocks or projections are independent.
