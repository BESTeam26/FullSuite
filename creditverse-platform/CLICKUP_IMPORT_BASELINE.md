# ClickUp import — completed baseline (2026-09-30)

**Status: COMPLETE / RECONCILED.** Confirmed by a final inventory of every
crosswalk task against ClickUp (ids and counts only; no card text leaves the
Edge Function). Dee, 2026-09-30: "preserve this migration as the completed
baseline… Do not change the importer again unless the final confirming
inventory finds a real discrepancy."

## Final inventory (2,161 tasks)

| | ClickUp | FullSuite |
|---|---|---|
| Cards on the 20 linked lists | 2,158 | 2,161 crosswalk tasks (3 deleted in ClickUp after import, kept) |
| Work files / canonical clients | — | 2,144 / 2,144 (676 archived, 0 without a partner) |
| Comments (importable: not empty, not automation, not an upload receipt) | 11,531 | 13,651 linked, each a distinct ClickUp comment id |
| Attachments | 29,552 | 29,610 linked, each a distinct ClickUp attachment id |
| Preserved descriptions (protected `source_note`) | 2,041 | 117 cards had none; 3 deleted |

Inventory result: **2,140 clients complete, 1 explained, 3 unanswered.**
- Explained: Marcos Torres (Credit by Nainoa, `86eyyhxj4`) — ClickUp merged its
  sibling card into it; the content is linked on the sibling record, which is
  flagged `[possible duplicate]` for a person to resolve.
- Unanswered: `86eyx28qm`, `86ey21rfq`, `86eyyhxkf` — deleted in ClickUp after
  import (404). FullSuite keeps them; deleted source records never delete
  history here.

The FullSuite excess over ClickUp is legitimate: receipt-type comments
imported under the earlier looser rule, and content since deleted in ClickUp.

## No duplication
0 duplicate task links · 0 duplicate comment links · 0 duplicate comment
events · 0 duplicate attachment links · 0 duplicate source notes.
154 groups (314 files) share name+size on one client — every one a distinct
ClickUp attachment id, i.e. ClickUp holds the file twice.

## Rerun proof
16 cards across 4 partners re-imported after the fixes: created 0, comments 0,
attachments 0; row counts in clients, events, files, secrets, secret events,
links and vault identical before and after.

## Protections that are now permanent
- An existing file's status (and department row) changes only when ClickUp's
  own raw status changed (`source_status`) — an unchanged coarse status never
  overwrites a refined FullSuite status (20260930015000).
- `client_secret_write` leaves no trace when handed an unchanged value: no
  vault rotation, no `updated` event (20260930014000).
- Comments and attachments are idempotent by ClickUp id (`import_links`).
- A shared email never merges two people; the crosswalk (task → file) is the
  identity of a card (20260930016000 moved Jenny Guzman's content home).
- Partner boundaries: D-023 unchanged; a person under two partners is two
  files.
- Deleted ClickUp source records never delete FullSuite history.
- A fixture account or fixture team is never given a production file
  (20260930011000; `creditops-routing-probe.mjs` checks 52–53).
- Comment text is built from ClickUp's structured parts; the strings
  `undefined` / `null` / `[object Object]` never render (0 remaining).

## Human review (Client Directory → Needs review, by reason)
| Reason | Clients |
|---|---|
| Round unknown | 179 |
| Round conflict | 3 |
| Credential conflict | 2 (Fernando Serrato — detected; Kendra Smith — flagged by hand with provenance) |
| Possible duplicate | 73 (37 same-name pairs on one partner, 35 Vanquish; no SSN to compare) |
| Workload review | Vanquish Ventures Dispute files held by Daniel via the same-partner-batch rule; nothing redistributed |

Nothing is guessed or merged automatically.

## Audit tooling (Edge Function `clickup-import`, service role, ids/counts only)
`taskIdsOnly` · `inventoryOnly` (comment ids + dates, attachment ids) ·
`repairComments` · `preserveDescription`. Edge limit 150 s: 12 cards per
call can time out on heavy cards — 3, then 1.
