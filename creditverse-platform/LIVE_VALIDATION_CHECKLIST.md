# Live Validation Checklist — Partner Portal

**Phase: live validation. Feature expansion on the Partner Portal is STOPPED.**
Frozen surfaces: Clients · Billing · Projects & Services · Messages · document
previews · the partner-safe whitelist · topic channels + DMs + threads.
No new portal modules until Dee reports an actual live-use defect.

**Authorize.Net production charging is OFF and stays off until Dee separately
approves it.** Nothing in this checklist charges a card.

**How to record a result:** mark each line PASS or FAIL. A FAIL goes into
`PILOT_ISSUES.md` with what you saw and what you expected. **LIVE VERIFIED is a
human gate** — only Dee or the operator who hit it can close one.

**Test in this order.** `visible_channels()` changed twice on 2026-09-13 and is
shared with the BES-side Communication screen, so Messages goes first.

---

## 0. First three, before anything else

| # | Check | Expected |
|---|---|---|
| 0.1 | Open **BES → Communication** as yourself | Your conversations list loads, unread counts look right, opening one shows its messages |
| 0.2 | Open **Partner Portal → Messages** as a partner contact | Channels and DMs both list; opening one shows its messages |
| 0.3 | Open one **Client detail** and one **Billing** account | Both load with real figures |

If 0.1 or 0.2 is wrong, stop and report it — that is the shared function.

---

## 1. Partner Portal

### Clients
| # | Check | Expected |
|---|---|---|
| 1.1 | Clients page loads | Summary counts across the top, client list below |
| 1.2 | Each filter bucket | Count matches the rows it shows |
| 1.3 | Search by name and by email | Finds the right client, no others |
| 1.4 | "Include closed files" off, then on | Closed files appear only when it is on |
| 1.5 | Counts vs. BES's own CreditOps list for that partner | Same clients, same number |

### Client detail
| # | Check | Expected |
|---|---|---|
| 1.6 | Open one client | Status, round, what BES is doing, last activity |
| 1.7 | Shared documents | **Previews, not filenames** — images as images, PDFs showing page one |
| 1.8 | Open a document | Downloads or opens; the link works |
| 1.9 | Anything marked "needs the partner" | Shows as an action, with what is being asked |

### Billing
| # | Check | Expected |
|---|---|---|
| 1.10 | Billing page | Five summary cards, four tabs |
| 1.11 | **Invoices** tab | Every invoice, correct number, date, amount, status |
| 1.12 | **Payments** tab | Every payment, method and reference |
| 1.13 | An invoice with a part payment | Balance = total − paid, and it says so |
| 1.14 | Payment instructions / methods | The ways to pay are listed and readable |
| 1.15 | No card fields anywhere | Nothing asks the partner for a card number or CVV |

### Account Credit — this is MONEY
| # | Check | Expected |
|---|---|---|
| 1.16 | Account Credit tab | A balance in dollars, with the entries that produced it |
| 1.17 | Each entry | Says where it came from (overpayment, refund, adjustment) |
| 1.18 | It is never added to Processing Credits | Two separate numbers, never one total |

### Processing Credits — these are UNITS
| # | Check | Expected |
|---|---|---|
| 1.19 | Processing Credits tab | Added / used / available as **counts**, not dollars |
| 1.20 | Used count vs. clients actually processed | They agree |

### Projects & Services
| # | Check | Expected |
|---|---|---|
| 1.21 | One card per live engagement | Every module the partner buys — CreditOps, FundingOps, BES CRM, TalentOps, Sales & Marketing |
| 1.22 | A partner with more than one service | All of them appear, none missing |
| 1.23 | An ended service | Not shown as live |
| 1.24 | Progress / milestone | Matches what BES sees internally |
| 1.25 | No internal detail | No BES assignee, no health reason, no rates, no internal notes |

### Messages — channels
| # | Check | Expected |
|---|---|---|
| 1.26 | Channel list | General and Support always; CreditOps only for a CreditOps partner; Marketing only for a marketing partner |
| 1.27 | Press a channel nobody has used | It opens and is ready to type in |
| 1.28 | Send a message | It appears, and BES sees it in Communication **in the same conversation** |
| 1.29 | BES replies | It arrives without reloading, labelled as BES |
| 1.30 | @-mention someone | The picker offers only people who will actually be notified |
| 1.31 | Attach a file and a screenshot | Both upload and open |
| 1.32 | Unread count | Appears on the menu, clears when read, does not come back |

### Messages — DMs
| # | Check | Expected |
|---|---|---|
| 1.33 | Direct messages list | The BES people assigned to this account, with what they do |
| 1.34 | Somebody NOT on the account | Not offered |
| 1.35 | Open a DM and send | BES receives it; the reply arrives |
| 1.36 | Open the same DM twice | One conversation, not two |

### Messages — threads
| # | Check | Expected |
|---|---|---|
| 1.37 | Reply in a thread | Opens in the **right-side drawer**, not inline |
| 1.38 | Reply count on the parent | Correct, and it updates |
| 1.39 | React to a message | The reaction sticks and both sides see it |

### Files and previews
| # | Check | Expected |
|---|---|---|
| 1.40 | Files page | **Previews**, not a list of filenames |
| 1.41 | Five screenshots with near-identical names | Tellable apart without opening any |
| 1.42 | A PDF | First page visible in the card |
| 1.43 | Download | Works from the card |
| 1.44 | Same on the CreditOps Documents tab (BES side) | Previews there too |

### Agreements
| # | Check | Expected |
|---|---|---|
| 1.45 | Agreements page | Every agreement, with its status |
| 1.46 | A signed one | Signer name and date shown |
| 1.47 | An unsigned one | Opens the signing page from its link |

### Actions Needed
| # | Check | Expected |
|---|---|---|
| 1.48 | With nothing outstanding | "You're all caught up" |
| 1.49 | With something outstanding | Count on the menu matches the list |
| 1.50 | **Approve** a marketing item | Approved — and **NOT** marked Completed. Approval is not publication |
| 1.51 | **Request changes** with a note | Goes back to the person who made it, with the note on the task |
| 1.52 | Request changes with no note | Refused, and says why |

### Suspended account
| # | Check | Expected |
|---|---|---|
| 1.53 | A suspended partner's menu | **Only** Overview, Actions Needed, Messages, Billing, Agreements, Updates, Account Settings |
| 1.54 | Clients / Services / Files | Gone from the menu — not greyed out |
| 1.55 | Type `/partner/clients` in the address bar | Refused, not shown |
| 1.56 | Overview | Says what is owed and how to fix it |
| 1.57 | Pay the balance, then reload | Access returns, work resumes |

---

## 2. Security — the checks that matter most

> These are proven against the live database (14/14 in the partner-messages
> probe, 85/85 in billing). What you are confirming is that the SCREENS agree
> with the database. A thing that is merely hidden is a FAIL.

| # | Check | Expected |
|---|---|---|
| 2.1 | **Second contact at the same partner** — sign in as a different contact | Sees the same clients, billing and topic channels |
| 2.2 | That second contact and a DM they are not in | **Does not see it at all** — not the conversation, not its unread count |
| 2.3 | Sign in as a contact of a **different** partner | Sees none of the first partner's anything |
| 2.4 | **Direct URL** — paste another partner's client URL | Refused. Not an empty page, not a flash of data first |
| 2.5 | **Direct URL** — `/app/...` (a BES page) as a partner | Refused |
| 2.6 | **Internal notes** — a client with BES notes on it | The partner sees none of them |
| 2.7 | **BES assignee** — a client with an agent assigned | The partner sees no agent name anywhere |
| 2.8 | **Internal files** — a document NOT marked shared | Does not appear in the portal at all |
| 2.9 | Mark it shared, reload | Now it appears. Unmark it, reload — gone again |
| 2.10 | Audit trail, SLA, internal comments | None of it reachable from any portal page |
| 2.11 | Finance | Reachable by BES only; a partner sees only their own billing |

---

## 3. Operational

| # | Check | Expected |
|---|---|---|
| 3.1 | **Partner starts the first conversation** — a partner with NO existing channel presses Support | It opens and they can write. They are not waiting to be called |
| 3.2 | BES opens "Conversation" on that same partner's profile | Lands in the **same** General conversation, not a second one |
| 3.3 | **Partner uploads / shares a file** where allowed | Uploads, and BES sees it |
| 3.4 | A place a partner may NOT upload | No upload control, and no upload succeeds if tried |
| 3.5 | **Partner approves** an item | Recorded, BES notified, status moves — but not to Completed |
| 3.6 | **Partner requests changes** | Back to the maker with the note |
| 3.7 | **Invoices agree with Finance** — pick one partner | Same invoices, same numbers, same statuses in Finance → Invoices and in their portal Billing |
| 3.8 | **Payments agree** | Same payments, same balances, both sides |
| 3.9 | A partner with an overdue invoice | Portal and Finance agree on days overdue and amount |
| 3.10 | Reminder emails | Arrive with the right sender name and the right amounts |
| 3.11 | Record a manual payment in Finance | Portal balance updates; a receipt goes out |

---

## 4. Must stay OFF

| # | Check | Expected |
|---|---|---|
| 4.1 | Authorize.Net | **Test mode only. No live charging.** |
| 4.2 | Any "charge card" control | Either absent or clearly disabled, and it does not charge |
| 4.3 | Card numbers and CVVs | Never asked for, never stored, never in a log |

---

## Automated gates behind this checklist

Re-run these before any fix is called done.

```bash
npm test && npm run build && npm run probe
```

| Gate | Command | Current |
|---|---|---|
| Unit tests | `npm test` | 1787 / 1787 |
| Build | `npm run build` | clean |
| PostgREST embeds | `npm run probe:shapes` | 53 parsed, 0 refused |
| SQL contracts | `npm run probe:sql` | 205 / 205 |
| Partner Messages (live) | `node supabase/scripts/partner-messages-probe.mjs` | 14 / 14 |
| Billing (live) | `node supabase/scripts/billing-probe.mjs` | 85 / 85 |
| Marketing (live) | `node supabase/scripts/marketing-module-probe.mjs` | 48 / 48 |

---

## Still Dee's to do

- Send the 15 pending invitations
- Staff the five CreditOps teams
- Add contact emails for partners missing one
- Decide whether K&A still buys BES CRM
- Complete the Authorize.Net **sandbox** checklist
- Approve production charging **separately**, in writing
