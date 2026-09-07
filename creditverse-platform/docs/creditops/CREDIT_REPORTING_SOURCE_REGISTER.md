# Credit Reporting Source Register

Every authority CreditOps relies on, with its level, its verification state and
its jurisdiction. Governed by `CREDIT_REPORTING_INTELLIGENCE_RULEBOOK.md` §2
and §23.

**The rule this register exists to enforce:** a citation becomes executable
legal logic only after the primary source has been read and recorded. Nothing
is coded from a secondary summary, this document's own prose included.

---

## 1. Authority levels

| Rank | Level | Weight |
|---|---|---|
| 1 | `STATUTE` | Highest |
| 2 | `REGULATION` | |
| 3 | `APPELLATE_CASE` | Jurisdiction-bound unless Supreme Court |
| 4 | `AGENCY_GUIDANCE` | Persuasive |
| 4b | `CONSENT_ORDER_OR_ENFORCEMENT` | **Risk context and test material only — never a holding** |
| 5 | `METRO2_CRRG` | Industry specification; licensed |
| 6 | `BES_OPERATIONAL` | Internal SOP; lowest |

Lower never overrides higher. A BES operational rule that conflicts with any
level above it is marked **LEGACY RULE REJECTED** in the crosswalk.

## 2. Verification states

| State | Meaning |
|---|---|
| `VERIFIED` | Primary text read, recorded, dated, reviewer named |
| `IN_USE_UNVERIFIED` | Cited in shipped code, primary text **not yet read against the current version** |
| `UNVERIFIED — PRIMARY SOURCE NOT READ` | Named in research; nothing in code depends on it |
| `LICENSE_REVIEW_REQUIRED` | CDIA/CRRG material; rights unconfirmed |
| `REJECTED` | Considered and not adopted, with a reason |

**Every row below is `IN_USE_UNVERIFIED` or weaker.** No primary-source
verification pass has been run against current text. That is the register's
most important disclosure, and it is why §23 of the Rulebook forbids treating
any of this as settled.

---

## 3. Statutes in use

Counts are occurrences in `src/` as of 2026-09-07.

| Citation | Proposition as used in BES | Level | Where | Uses | State |
|---|---|---|---|---|---|
| 15 U.S.C. § 1681e(b) | CRA duty of reasonable procedures to assure maximum possible accuracy | STATUTE | `legal-paths`, `decision-engine`, `escalation-ladder`, `rounds-and-layers` | 27 | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1681i | CRA reinvestigation duty on a consumer dispute | STATUTE | `legal-paths`, `decision-engine`, letters | 17 | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1681i(a)(5)(A) | Delete **or modify** on finding inaccurate, incomplete or unverifiable | STATUTE | `decision-engine` | 19 | `IN_USE_UNVERIFIED` — **the "or modify" half is the antidote to "error = delete"** |
| 15 U.S.C. § 1681i(a)(6) | Written notice of results | STATUTE | `escalation-ladder`, `legal-paths` | 3 | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1681i(a)(7) | **Description of the reinvestigation procedure**; furnisher business name, address, telephone where reasonably available | STATUTE | `escalation-ladder`, `legal-paths`, `decision-engine` | 4 | `IN_USE_UNVERIFIED` — **over-claimed in `rounds-and-layers`; see crosswalk L-04** |
| 15 U.S.C. § 1681s-2(a)(5) | Furnisher must report the month and year the delinquency commenced | STATUTE | `reporting-integrity-rules`, `metro2/section-g` | 5 | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1681s-2(a)(8) | Direct consumer dispute to a furnisher | STATUTE | *not currently cited* | 0 | **GAP — this is the correct citation for a direct dispute, and BES cites § 1681s-2(b) instead** |
| 15 U.S.C. § 1681s-2(b) | Furnisher duty **on a CRA-forwarded dispute** | STATUTE | `rounds-and-layers`, `legal-paths`, `decision-engine` | 18 | `IN_USE_UNVERIFIED` — **misapplied to direct disputes; see crosswalk L-03** |
| 15 U.S.C. § 1681c(a) | Reporting time limits | STATUTE | `metro2/section-g`, `section-k` (parked) | — | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1681c(c) | Running of the period from the delinquency | STATUTE | `reporting-integrity-rules` | 4 | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1681c-2 | Block of information resulting from identity theft | STATUTE | `legal-paths`, `metro2-guardrails` | 10 | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1681b | Permissible purposes | STATUTE | `metro2-guardrails` | 12 | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1681n | Willful noncompliance | STATUTE | `escalation-ladder` round 11 only | 5 | `IN_USE_UNVERIFIED` — gated behind `willfulness_record` + legal authorisation + human review |
| 15 U.S.C. § 1681o | Negligent noncompliance | STATUTE | `escalation-ladder` | 4 | `IN_USE_UNVERIFIED` |
| 15 U.S.C. § 1666 | FCBA billing error | STATUTE | `metro2-guardrails` | 5 | `IN_USE_UNVERIFIED` — behind an eligibility gate |
| 15 U.S.C. § 1692e(8) | Communicating disputed credit information without noting the dispute | STATUTE | `legal-paths`, `decision-engine` | 13 | `IN_USE_UNVERIFIED` — must be gated on FDCPA coverage |

## 4. Regulations in use

| Citation | Proposition | Where | State |
|---|---|---|---|
| 12 C.F.R. § 1022.42 (Reg V) | Furnisher accuracy and integrity policies | *not currently cited* | **GAP** |
| 12 C.F.R. § 1022.43 (Reg V) | Direct dispute eligibility, **including exclusions for disputes prepared by a credit repair organization** | `rounds-and-layers`, `letter-composer`, matrix phase 23 | `IN_USE_UNVERIFIED` — the CRO exception is enforced in the letter QA gate but contradicted by `rounds-and-layers` |
| 12 C.F.R. Part 1022, Appendix E | Furnisher accuracy guidelines | `reporting-integrity-rules` | `IN_USE_UNVERIFIED` |
| 12 C.F.R. § 1026.13 (Reg Z) | Billing error resolution | `metro2-guardrails` | `IN_USE_UNVERIFIED` |

## 5. Case law

**Nothing here may be encoded until the primary opinion is read.** Circuit
scope is recorded because one circuit's formulation is not nationwide law.

| Authority | Court / scope | Proposition as referenced | In code? | State |
|---|---|---|---|---|
| Safeco Ins. Co. of America v. Burr | U.S. Supreme Court | Willfulness includes reckless disregard; more than ordinary carelessness | Yes — `decision-engine`, `letter-voice` (as a *reason for human review*, not as a holding applied to a consumer) | `IN_USE_UNVERIFIED` |
| Bibbs v. Trans Union | 3d Cir. | Read the tradeline as a whole | Yes — `reporting-integrity-rules` authority on STATUS.CHARGEOFF_WITH_BALANCE | `IN_USE_UNVERIFIED` — **3d Circuit only; not recorded as jurisdiction-bound in the rule** |
| Saunders | — | — | No | `UNVERIFIED — PRIMARY SOURCE NOT READ` |
| Gorman | — | — | No | `UNVERIFIED — PRIMARY SOURCE NOT READ` |
| Hinkle | — | — | No | `UNVERIFIED — PRIMARY SOURCE NOT READ` |
| Sessa | — | — | No | `UNVERIFIED — PRIMARY SOURCE NOT READ` |
| Mader | — | — | No | `UNVERIFIED — PRIMARY SOURCE NOT READ` |
| Holden | — | — | No | `UNVERIFIED — PRIMARY SOURCE NOT READ` |
| 2026 Tenth Circuit authority (unnamed in the research) | 10th Cir. | Not stated | No | `UNVERIFIED — PRIMARY SOURCE NOT READ` |

**Required schema when any of these is adopted:** `authority` · `court` ·
`circuit` · `jurisdiction` · `decision_date` · `effective_or_relevant_period` ·
`rule_proposition` · `national_or_jurisdictional_scope` · `status` ·
`reviewed_at` · `reviewer`.

## 6. Agency guidance, consent orders and enforcement

**Level 4 and 4b. Neither is a judicial holding.**

| Item | Type | Used as | State |
|---|---|---|---|
| CFPB advisory opinion on facially false data | `AGENCY_GUIDANCE` | Supports DOFD-before-open-date and DOFD-on-current-zero-balance as anomalies | `IN_USE_UNVERIFIED` |
| CFPB consumer guidance on the three nationwide CRAs holding different information | `AGENCY_GUIDANCE` | Supports "a difference is a question, not proof" | `IN_USE_UNVERIFIED` |
| CFPB dispute guidance (identify the error, explain why, supply documents) | `AGENCY_GUIDANCE` | Maps to the finding/evidence model | `IN_USE_UNVERIFIED` |
| CFPB v. Santander consent order | `CONSENT_ORDER_OR_ENFORCEMENT` | Paid-in-full furnished with a contradictory current balance — **detection test case and risk context** | `IN_USE_UNVERIFIED` — correctly labelled `agency_guidance` in code, **not** as a holding |
| TD Bank enforcement | `CONSENT_ORDER_OR_ENFORCEMENT` | Risk context | Not in code |
| CFPB action against Credit Repair Cloud (stipulated judgment, 2024-08-12, $3m) | `CONSENT_ORDER_OR_ENFORCEMENT` | **Directly relevant to BES's own exposure as a software provider**; motivates the CROA billing gate | Not in code — see reconciliation delta R6 |
| FTC CROA overview | `AGENCY_GUIDANCE` | Advance payment, written contract, cancellation | `knowledge/violations.ts` | `IN_USE_UNVERIFIED` |
| FTC warning against false identity-theft reports as a credit-repair tactic | `AGENCY_GUIDANCE` | Motivates the identity-theft truth gate | `IN_USE_UNVERIFIED` |

## 7. Metro 2 / CRRG

| Item | State |
|---|---|
| CDIA Credit Reporting Resource Guide | `LICENSE_REVIEW_REQUIRED` — proprietary, redistribution rights unconfirmed |
| `knowledge/metro2-fields.ts` | Conceptual summaries only; already carries the licensing caveat in its header. **Keep as is.** |
| `metro2-status-rules.ts` — 21 Account Status codes | Derived from the uploaded BES defect catalogue's Appendix 1, itself **SOURCE NOT YET RECONCILED**. Marked `LICENSE_REVIEW_REQUIRED` **and** `SOURCE_UNVERIFIED` |
| `metro2-field-codes.ts` — 14 BS- display codes | Display/grid labels, not code-table semantics. Lower risk, but review with the CRRG question |
| BES Metro 2 defect catalogue (uploaded, uncommitted, lost) | `SOURCE NOT YET RECONCILED` — see `../../src/lib/dispute/ENGINE_INVENTORY.md` §3 |

## 8. BES operational material

| Item | State |
|---|---|
| `rounds-and-layers.ts` — 7-layer method, TRAP round 1 | **LEGACY RULE REJECTED in part** — see crosswalk L-01…L-06 |
| `escalation-ladder.ts` — 12 rounds earned by the record | Consistent with the Rulebook. Keep. |
| `letter-merge.ts` forbidden-phrase list | Consistent. Keep and extend. |
| `letter-voice.ts` tone axis | Consistent — explicitly refuses "you are willfully breaking the law". Keep. |

---

## 9. Verification backlog

In priority order. Each requires the primary text, its current version, the
jurisdiction where relevant, a named reviewer and a test before the citation
governs anything.

1. **§ 1681s-2(a)(8) and Reg V § 1022.43**, including the CRO exclusion — the
   single highest-impact correction, because BES currently cites
   § 1681s-2(b) for direct disputes.
2. **§ 1681i(a)(7)** — settles the MOV over-claim.
3. **§ 1681i(a)(5)(A)** — confirms "delete **or modify**".
4. **§ 1681c(a) and (c)** — obsolescence arithmetic, before any § 1681c rule
   ships.
5. **§ 1681b** — the permissible-purpose list the inquiry engine asks about.
6. **§ 1666 and Reg Z § 1026.13** — the FCBA eligibility gate's actual scope.
7. **§ 1692e(8)** — FDCPA coverage conditions.
8. **Bibbs** — record it as 3d Circuit, not as national law.
9. Everything in §5 marked `UNVERIFIED — PRIMARY SOURCE NOT READ`.

**Counsel review, not engineering, owns items 1–7's final wording.**
