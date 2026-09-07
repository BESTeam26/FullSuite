# Current-engine gap map

What the Rulebook requires, against what the engine does today. Read with
`CREDIT_REPORTING_LEGACY_CROSSWALK.md`, which covers rules that are *wrong*;
this covers capabilities that are *absent*.

Legend: **✅** in place · **◐** partial · **✕** absent

---

## 1. The canonical sequence, stage by stage

| Stage | State | Where / what is missing |
|---|---|---|
| REPORTED DATA | ◐ | `credit_reports` + `report_items` are immutable and append-only. **One value per field** — no per-bureau values (G-01) |
| METRO 2 CONTEXT | ◐ | `metro2-taxonomy` field context; `metro2-status-rules` is `SOURCE_UNVERIFIED` (L-22) |
| POTENTIAL ANOMALY | ✅ | `condition-detector` (31 conditions), `reporting-integrity-engine` (8 evaluated), `metro2/` Section A |
| CONSUMER FACT | ◐ | `ConsumerAttestations` in the detector, `dispute_attestations` at the QA gate. No per-finding `consumer_answers` record (G-05) |
| DOCUMENTARY EVIDENCE | ◐ | `files` + `document_instances`. **No link from a finding to the document that supports it**, and no evidence-strength field (G-04) |
| APPLICABLE LEGAL DUTY | ◐ | `INTEGRITY_RULES.authorities`, `legal-paths`. § 1681s-2(a)(8) absent entirely (L-03) |
| RESPONSIBLE PARTY | ◐ | `IntegrityRule.route` + `ROUTE_GUIDANCE`. No `DISPUTE_ORIGIN` field (G-06) |
| PROPER DISPUTE CHANNEL | ◐ | `dispute_letters.recipient_kind`; TRAP channels contradict it (L-02) |
| APPROPRIATE REMEDY | ◐ | `Remedy` type has 7 of the Rulebook's 13 values (G-07) |
| HUMAN REVIEW | ✅ | `report_findings.human_disposition`; `approve_dispute_letter()` QA gate |
| LETTER / ACTION | ✅ | `letter-composer`, `letter-merge` forbidden phrases, `letter_mailings` reserve-then-reconcile |
| RESULT / REIMPORT | ◐ | `client_round_outcomes`, chronology in the integrity engine. Outcome vocabulary too coarse (G-08); no forensic review model (G-09) |

## 2. Gaps

### G-01 Per-bureau observations — **blocks the most**
The Rulebook's cross-bureau model (§9) cannot be built. `report_items` holds one
value per field plus `bureaus text[]`; the parser reads tri-merge columns and
discards all but the first. Costs: `BUREAU.VALUE_DIFFERS` unreachable, six
detector cross-bureau conditions unreachable, and **`detectConditions` has no
product caller at all**.
→ `ARCHITECTURE_PROPOSAL_PER_BUREAU_OBSERVATIONS.md`

### G-02 Chronology
No reporting period, no account information date, no dispute/forwarding/result
event timeline. DOFD re-aging cannot reconstruct cure (L-17); reinsertion
cannot distinguish a deletion from an incomplete import (L-18).
→ `ARCHITECTURE_PROPOSAL_CHRONOLOGY.md`

### G-03 Source type and `raw_metro2_verified` per fact
`IntegrityFinding.rawMetro2Verified` is a hardcoded `false` on the **finding**.
The Rulebook (§6) needs it on the **fact**, with a `source_type` from the
eight-value list, so a consumer-display value and an authorized structured
value are never rendered alike.
*Fixable without schema for findings; needs schema for stored observations.*

### G-04 Evidence strength and multi-dimensional confidence
One `Confidence` (`confirmed`/`apparent`/`not_an_error`) mixes anomaly
certainty with evidentiary support. The Rulebook needs six separate axes (§5)
and a six-level evidence scale, plus a link from a finding to the documents
supporting it.
*Domain types first (no schema); persistence later.*

### G-05 Consumer answers per finding
`ConsumerAttestations` is seven booleans on the whole detection input.
The Rulebook needs an answer bound to a specific finding, with who said it and
when.

### G-06 `DISPUTE_ORIGIN`
Absent. `dispute_letters.dispute_origin` exists with `cro_prepared` as a value
— but the *analysis* layer never sees it, so routing cannot branch on it. This
is what makes L-03 possible.
*Partly fixable without schema: thread the existing column into the domain.*

### G-07 Remedy vocabulary
`Remedy` has `correct`, `modify`, `delete`, `block`, `dispute_notation`,
`no_action`, `investigate_first`. Missing the field-specific remedies the
Rulebook names: `CORRECT_DOFD`, `CORRECT_BALANCE`, `CORRECT_PAYMENT_HISTORY`,
`CORRECT_RESPONSIBILITY`, `REQUEST_INFORMATION`, `REINVESTIGATE`.
*Type-only change; no schema (`report_findings.remedy` is text).*

### G-08 Outcome vocabulary
`client_round_outcomes` counts deleted/updated/verified. Cannot express
"bureau-confirmed deletion" versus "no longer observed" — the false-deletion
risk, and it feeds what a client is told.
*Same as reconciliation delta R5.*

### G-09 Post-result forensic review
A VERIFIED result has no analysis model. The Rulebook's eight outcomes (§18)
do not exist; `escalation-ladder` gates the next round but does not classify
the last one.

### G-10 Objective-verifiability class
No rule declares whether its issue is an objectively verifiable fact or a
complex legal interpretation. Nothing stops a rule reaching for a bankruptcy
or settlement characterization.
*Type-only addition to `Metro2Rule` and `IntegrityRule`.*

### G-11 Investigation timeline events
`dispute_timers` starts four timers at `mark_letter_mailed()` — correct, and
already better than most. Missing: `cra_furnisher_notice_at`,
`procedure_request_at`, `reinsertion_detected_at`, `extension_basis`, and a
recorded triggering *evidence* reference per timer.

### G-12 Evidence manifest
A dispute package cannot say which document supported which assertion. Needs
document hashes and revisions — which is also reconciliation delta R3.

---

## 3. What can be corrected with **no schema change**

Ordered by value.

1. **L-01 · L-02 · L-05 — delete the false FTC/CFPB/production claims.** Text
   and TypeScript only.
2. **L-03 — stop citing § 1681s-2(b) for direct disputes.** Route on the
   `dispute_origin` column that already exists.
3. **L-06 · L-07 — retire `rounds-and-layers.ts`**, moving its three consumers
   to `escalation-ladder.ts`.
4. **L-04 · L-23 — rename** "Method of Verification" → "Reinvestigation
   Procedure Request"; "Metro 2 Intelligence" → "Credit Report Accuracy & Data
   Integrity Analysis" in customer-facing labels.
5. **L-08 — "delete or modify"** wherever "delete if unverifiable" appears.
6. **L-12 — extend the forbidden-phrase list** with the Rulebook §22 wording.
7. **G-07 · G-10 — widen the remedy union; add the verifiability class.**
   Type-only; `report_findings.remedy` and `verdict` are text columns.
8. **G-06 — thread `dispute_origin` into the domain layer.**
9. **G-03 (findings half) — carry `source_type` on a finding**; `evidence` is
   already `jsonb`.
10. **Testing doctrine (§21)** — the eleven permanent invariant tests. Four
    exist; seven can be written today against current behaviour.

## 4. What requires schema

| # | Change | Blocks |
|---|---|---|
| S-1 | `report_item_bureau_values` child table | G-01, the whole cross-bureau model |
| S-2 | Reporting period + account information date on observations | G-02 |
| S-3 | `import_jobs` / `parser_runs` with source type and parser version | G-03 |
| S-4 | `finding_evidence` join, evidence strength, six confidence axes | G-04, G-12 |
| S-5 | `consumer_answers` bound to a finding | G-05 |
| S-6 | Timeline events beyond `dispute_timers` | G-11 |
| S-7 | Outcome source + `not_observed` on `client_round_outcomes` | G-08 |
| S-8 | Document checksum / revision (reconciliation R3) | G-12 |

**Sequence:** S-1 → S-2 → S-4 → S-3 → S-5/S-6/S-7/S-8. S-1 first because every
later one is more useful once a fact has a bureau attached to it.

## 5. What requires CDIA licensing or access

- Extending `metro2-status-rules.ts` beyond its current 21 codes (L-22)
- Any customer-facing reproduction of code tables
- The V2 Metro 2 Validation Layer in its entirety
- Re-deriving `knowledge/metro2-fields.ts` beyond conceptual summaries

## 6. What requires counsel

- § 1681s-2(a)(8) / Reg V § 1022.43 and the CRO exclusion — **highest value**
- § 1681i(a)(7)'s exact scope, for the letter wording
- § 1681c(a)/(c) obsolescence arithmetic before any such rule ships
- FDCPA coverage conditions gating § 1692e(8)
- CROA service-start, cancellation and billing eligibility (reconciliation R6)
- Every case in the Source Register §5
