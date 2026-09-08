# Archive

Files here compiled in the GHL AI Studio export but were **never routed or imported**.
They are earlier-generation CreditOps screens (QA checklist, results/outcomes, evidence
vault, strategy engine, Metro 2 inspector, digital twin, progress report, cases, disputes,
issues) kept for reference while the production rebuild decides what to fold into the
client workspace.

Nothing under `src/_archive/` is part of the app bundle. Do not import from here.

**Added 2026-09-08 — `FulfillmentWorkspace` and `FulfillmentLiveChatModal`.**
Routed at `/app/fulfillment` until today, linked from nowhere, and rendering
an empty board: its `workOrders` come from `agency-context`'s `workItems`,
which has been `useState<WorkItem[]>([])` since the seed data was removed.
Nothing populates it, so the screen could only ever show nothing.

It was also the one `/app` route with no guard of any kind, and its mapping
attributed every work order to `organizations[0]` — the first organization in
the list, whichever that happened to be, rather than the one the work belongs
to (rule 4). The screen that replaced it is `/app/creditops`.
