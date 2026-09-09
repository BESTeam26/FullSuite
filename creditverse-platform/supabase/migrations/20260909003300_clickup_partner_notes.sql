-- =============================================================================
-- ClickUp partner card content → partner notes (Dee, 2026-09-09: "I want
-- everything from my ClickUp copied as note").
--
-- WITH ONE DELIBERATE EXCEPTION: password values. Notes are plain text,
-- readable by anyone with partner access, and never audited per read — the
-- Logins vault exists precisely because of that. Every password line below is
-- REDACTED to "[password — see Logins tab]"; platforms, usernames, emails,
-- links and instructions are all kept verbatim. Contact emails found on the
-- cards fill contact_email only where the card leaves no doubt.
--
-- Guarded: a note is written only where notes are still empty, so nothing
-- anyone typed by hand is overwritten. Covers the five cards read so far;
-- the remaining cards import the same way once fetched.
-- =============================================================================

update public.outsourcing_groups set notes =
'ClickUp card (imported 2026-09-09; passwords withheld — see Logins tab):

Applications & Software Access List
1. Management Email — Info@creditcure.io — [password — see Logins tab] — payments and document management.
2. Gmail — creditcure2021@gmail.com — [password — see Logins tab] — real estate agents send client documents here; upload to CRC and create the client.
3. GoHighLevel (GHL) — creditcure2021@gmail.com — [password — see Logins tab] — automation and workflows.
4. Quo (phone system) — creditcure2021@gmail.com — [password — see Logins tab] — client communication.
5. WhatsApp — team members'' own numbers — internal communication.
6. ClickUp — via creditcure2021@gmail.com — operations management.
7. CRC — creditcure2021@gmail.com — [password — see Logins tab] — client management and credit processing.
8. DF — creditcure2021@gmail.com — [password — see Logins tab] — operational workflow.
9. GHL Main (Zay) — creditcure2021@gmail.com — [password — see Logins tab].
10. GHL Admin (Kierra) — Info@creditcure.io — pending activation.
11. Zapier — Creditcure2021@gmail.com — [password — see Logins tab] — integrations.
12. BES Team LetterStream — creditcuredisputeteam_ — [password — see Logins tab] — mailing.'
 where name = 'CreditCure' and coalesce(trim(notes), '') = '';

update public.outsourcing_groups
   set contact_email = 'info@creditcure.io'
 where name = 'CreditCure' and coalesce(trim(contact_email::text), '') = '';

update public.outsourcing_groups set notes =
'ClickUp card (imported 2026-09-09): CLIENT INFORMATION — ACCESS THRU GHL BES SUB ACCOUNT.'
 where name = 'Bizhub' and coalesce(trim(notes), '') = '';

update public.outsourcing_groups set notes =
'ClickUp card (imported 2026-09-09; passwords withheld — see Logins tab):

Client spreadsheet: https://docs.google.com/spreadsheets/d/117ON9gqSNHAwJJgIwzgllZKTYNCsvsi3EJ8MfCs7klg/edit?gid=158934339

DISPUTEFOX login: Mj1909415@gmail.com — [password — see Logins tab]
LETTERSTREAM login: mikiadisputeteam_ — [password — see Logins tab] — verification code arrives at accounts@dispute-me.com.'
 where name = 'Mikia Edwards' and coalesce(trim(notes), '') = '';

update public.outsourcing_groups
   set contact_email = 'mj1909415@gmail.com'
 where name = 'Mikia Edwards' and coalesce(trim(contact_email::text), '') = '';

update public.outsourcing_groups set notes =
'ClickUp card (imported 2026-09-09; passwords withheld — see Logins tab):

CRC login: admin@creditreplenish.com — [password — see Logins tab]
DisputeFox login: werewinning@yahoo.com — [password — see Logins tab]
LetterStream (old): H8empty799@gmail.com — [password — see Logins tab]
LetterStream: accounts@dispute-me.com — [password — see Logins tab]
LetterStream (UPDATED): vanquishventures@dispute-me.com — [password — see Logins tab]

Client spreadsheet: https://docs.google.com/spreadsheets/d/1deXybTIPX-1Ao3N1fgLM5xb3SWNdEXUSHwV14Gb2wGM/edit?usp=sharing
UPDATED spreadsheet: https://docs.google.com/spreadsheets/d/1WcpuZU1SXmG11ecnKso4zGuUQbiUPx4oO-klp54eObY/edit?usp=sharing

ASK LLOYD for the current affiliate list so the DF assignees can be updated —
or ask them to update the affiliate assignees in DF.

Google Drive folders (every client is in these):
https://drive.google.com/drive/u/0/folders/1-qWvc3LI6aQC8SKJ2ut8ZkY_mGql-l_0
https://drive.google.com/drive/u/0/folders/1CA98uGcU0dUozHopPbQ7eYxHNkeIfxLV'
 where name = 'Vanquish Ventures' and coalesce(trim(notes), '') = '';
