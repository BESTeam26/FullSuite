# CREDITOPS QUEUE DOCTRINE

> Supplied by Dee, 2026-09-21, verbatim, in answer to P-027. This file is the
> source of record. She explicitly REJECTED the generic rule I proposed
> ("moving to another department makes the previous department
> non-actionable"). Do not reintroduce it.

Lock the queue behavior to explicit status semantics. Do NOT implement the generic rule "moving to another department makes the previous department non-actionable."

## QUEUE REMOVAL RULE

A client/work item leaves the active internal queue only when the selected status explicitly means there is no current BES action required.
Current locked cases:

### 1. Dispute Waiting for Results

Examples:

* Round 1 Sent
* Round 2 Sent
* Round 3 Sent
* ...through the supported rounds

Behavior:

```
Dispute status = Waiting for Results
Active Dispute Queue = NO
Assigned processor = cleared/unassigned where current logic requires
Client remains active in CreditOps
Results/reimport workflow resumes later
```

Do not mark the dispute as Completed.
It is waiting, not finished.

### 2. For Client Confirmation

Behavior:

```
Internal Action Queue = NO
Client Portal = YES
Client Action Required = YES
```

Show the required confirmation/action in the client portal.
The file should not stay in an internal agent queue while BES is waiting on the client.
Once the client confirms/responds, route it automatically to the correct next internal status/department.

## IMPORTANT DISTINCTION

These are three different concepts:

```
Actionable internally
Waiting externally
Completed
```

Do not collapse them into one status.
Example:
`Round 8 Sent`
= waiting externally for bureau results
not:
`Completed`
`For Client Confirmation`
= waiting externally for client
not:
`Completed`

## CROSS-DEPARTMENT WORK

Do not automatically close/suppress another department merely because a new department becomes involved.
A client may legitimately have simultaneous department states when both represent real outstanding work.
Example:

```
Dispute = Waiting for Results
Support = Monitoring Issue
```

This is valid.
Dispute should not appear in the active Processing queue because it is waiting for results.
Support should appear because Support has actionable work.

## ACTIVE QUEUE RULE

Queue membership should be determined from the department work record/status itself:

```
active_queue =
  department_status is actionable
  AND not waiting_for_external_party
  AND not completed/closed
```

Do not infer queue visibility only from the client's overall credit status.

## CLIENT PORTAL RULE

`For Client Confirmation` must create/maintain an explicit client-visible action state.
The client portal should clearly show:

*  what needs confirmation
*  what they need to provide/do
*  when it was requested
*  action button/input

Internal users should see:
`Waiting on Client`
but the file should not remain in the normal actionable queue.

## TEST THESE EXACT CASES

1.  Ready for Processing
 → Dispute queue visible
2.  Round 8 Sent
 → Dispute queue hidden
 → status Waiting for Results
 → not Completed
3.  CMS Issue 2 while Dispute is Waiting for Results
 → Support queue visible
 → Dispute queue still hidden
 → both department records remain truthful
4.  For Client Confirmation
 → internal actionable queue hidden
 → client portal action visible
5.  Client confirms
 → portal action closes
 → correct next internal department/status opens automatically
6.  Status changes to another department but previous department is still legitimately actionable
 → do NOT suppress it unless an explicit transition rule says so

Keep this status-driven and auditable. No generic cross-department auto-close rule.

That's the better model. It preserves real multi-department work while making sure the two true "waiting" states you called out don't clutter the team's active queues.
