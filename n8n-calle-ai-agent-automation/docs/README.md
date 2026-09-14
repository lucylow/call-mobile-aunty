# Call Aunty n8n AI Agent Automation

This package is a production-oriented starting point for an n8n Cloud workflow that turns a natural-language automation request into a guarded CALL-E phone action.

## Flow

Webhook / Trigger -> Normalize Request -> Policy Gate -> Dedup Check -> Human Approval Gate -> CALL-E HTTP Request (retry) -> Record Result -> Optional Survey/CRM/Slack follow-up

A live call is **not** placed until consent is granted, the contact is not on DNC, the request is not a duplicate, and an operator approves the Wait form (unless `context.autoApprove` is explicitly set).

## Required environment values

`CALLE_BASE_URL` — CALL-E API base URL
`CALLE_API_KEY` — server-side API key, stored in n8n credentials or an external secret manager

Do not put credentials into Code node source or input data.

## n8n setup

1. Import `workflow/call-aunty-ai-agent.json`.
2. Configure the CALL-E credential on the HTTP Request node, or keep the `$env.CALLE_*` expressions.
3. Connect your LLM credential to an AI Agent node if you choose to have the model produce the plan dynamically.
4. Keep the Code nodes in `n8n-code/` before any real call action.
5. Add a CALL-E callback/webhook path for asynchronous status updates.

If you edit the Code snippets, regenerate the importable workflow with `node scripts/generate-workflow.mjs`.

## Human approval gate

Every allowed request pauses on **Wait for Human Approval**, an n8n form that expires after 24 hours.

- The original webhook returns immediately with `{ status: "pending_approval", approvalUrl, requestId }`.
- Approving resumes the execution and places the CALL-E call.
- Rejecting or timing out releases the dedupe lock and does **not** place a call.
- Test/preview bypass only: send `"context": { "autoApprove": true }`. Do not enable this in production.

## Retry

The CALL-E HTTP Request node retries failed attempts (`retryOnFail`, 5 tries, 3s apart) and continues on the error output after those retries are exhausted.

The TypeScript client retries the same transient class of failures: `429`, `5xx`, timeouts, and network errors. `4xx` validation and auth errors fail immediately.

## Deduplication

Two keys are reserved before dispatch and stored in n8n workflow static data for 24 hours:

- `req:{requestId}` — same automation request is idempotent
- `contact:{digits}:{intent}:{utc-day}` — the same person is not called twice the same day for the same intent

A later duplicate returns the stored call record and skips approval and CALL-E. Pending reservations are released if approval is rejected or CALL-E retries are exhausted.

The HTTP `Idempotency-Key` header remains `call-aunty:{requestId}`.

## Safety

The workflow blocks calls when consent is not explicitly `granted`, when the contact is marked DNC, or when no phone number is available. Human approval is required for live dispatch. Credentials stay in n8n environment/credential storage.
