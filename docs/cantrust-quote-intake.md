# CanTrust form to quote tasks

Source inspected: https://github.com/Zackfeng02/cantrust-quote-form (master, 2026-09-28). The upstream form posts structured auto/home/both fields to its Cloudflare relay and also delivers email via Web3Forms. This change does not modify or deploy either external service.

## Local/staff flow

Open **填写报价表单** from the board while signed in. The hosted form preserves upstream fields and bilingual steps, posts only to the same-origin `/api/quote-form`, and creates one unassigned `lead` (新报价) task. No email, WeCom, Turnstile or remote relay request is made by this hosted copy. It is a staff-assisted intake form, not a public customer endpoint. The customer-facing GitHub form is unchanged.

Original customer claims are stored in the source with the task, including unknown fields, both effective dates, receipt time and submission ID. Quote nodes begin pending; submission is not evidence of verified completeness, consent, coverage or premium. Identity is unlinked until a staff member explicitly selects the ClientCore customer. Auto/home combination is one task; earliest valid requested effective date is the editable initial due date. Other dates remain in the original data. Priority is normal by default.

## Relay integration contract (prepared, not enabled online)

POST `/api/integrations/cantrust` with the existing relay record shape `{id, receivedAt, payload:{quoteType, locale, submittedAt, fields}}`. Configure `CANTRUST_INTAKE_TEAM_ID`, `CANTRUST_INTAKE_MEMBER_ID` (active receiving member) and a separate 32+ character `CANTRUST_INTAKE_SECRET` server-side. Public keys embedded in the HTML are not authentication for this route.

Serialize with `JSON.stringify(record)`. Sign `timestamp + "\nPOST\n/api/integrations/cantrust\n" + serializedBody` using HMAC-SHA256 and the server secret. Headers: `x-cantrust-timestamp` (epoch milliseconds), `x-cantrust-signature` (lowercase hex). Requests expire after five minutes. `scripts/deliver-cantrust-submission.mjs record.json` provides the server-side adapter. Configure `CANTRUST_KANBAN_URL` only for the intended destination. Do not put any server secret in the public form.

A successful response returns `{ok:true,taskId,duplicate}` only after the team transaction commits. Retry the same record ID and payload after failures. A replay returns the original task; changed content with the same ID returns 409. Archived tasks also remain deduplicated. Do not deduplicate separate submissions by name or shared contact details.

Before future online cutover, the relay needs a durable delivery queue/outbox and retries with stable IDs. Its current seven-day KV and destructive `/ack` are a single-consumer mechanism: do not add a second competing poller or acknowledge/delete a record until every required destination has durably received it. This implementation does not consume or acknowledge that live queue. Email success alone must not be reported as Kanban delivery. Public-form retry IDs must also survive retries. Cutover and historical import remain separate from this local delivery.

## Verification

Run `npm test`, `npm run typecheck`, `npm run build`. Local HTTP acceptance should prove authenticated form submission, signed relay delivery, deduplicated retries, tampered-signature rejection and persistence across app restart. Use fictional contacts only. The upstream online form is not submitted during testing.
