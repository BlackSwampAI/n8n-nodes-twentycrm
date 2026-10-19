# UI qualification checklist

Automated package checks cannot prove n8n editor rendering. Run this bounded checklist in an owner-controlled disposable n8n instance after installing the locally packed package. Do not use production CRM data.

## PR20 owner report

The owner reported the requested eight-step PR20 n8n/CRM smoke checklist passed on 2026-10-19 at runtime commit `5189fb8`, then confirmed the compatibility work was verified. The tested installation was reported as `latest` pulled approximately two hours before that confirmation; exact n8n and Twenty versions remain unconfirmed, so no specific release or broad version matrix is inferred. This records hands-on smoke evidence for PR20; it does not assert that every item below was exercised, including the service-interruption step, conditional wide-object/cross-page cases, or high-volume webhook throttling and recovery.

## Package identity and credentials

- Confirm **Twenty CRM** and **Twenty CRM Trigger** appear with the official Twenty icon in light and dark themes.
- Confirm `Twenty API` masks the API key, defaults the Base URL to `https://api.twenty.com`, accepts a self-hosted root, and performs its read-only credential test.
- Confirm `Twenty Webhook API` masks the shared secret and has no connectivity test.

## Action node

- Confirm Company, Note, Opportunity, Person, Record, Schema Object, and Task appear as resources.
- Confirm fixed resources expose Create/Get/Get Many/Update/Delete; Schema Object exposes only Get/Get Many.
- Confirm active standard and custom objects load dynamically for Record and Schema Object.
- Confirm Create/Update default to Field Mapping, common fields render immediately for fixed resources, and Additional Fields starts opt-in without duplicates.
- Confirm generic Record retains its dynamic mapper, JSON fallback works, and Update uses Record ID rather than mapper matching.
- Confirm Get Many shows Return All/Limit and keeps Filter/Order By under Options.
- On Get and Get Many for both Record and a fixed resource, confirm Read Options/Options exposes Fields and Depth. Confirm an empty selection preserves normal output, an explicit root-field list narrows output while retaining `id`, Depth 1 expands an eligible relation, and invalid dotted/wildcard syntax fails locally.
- Against disposable Twenty 2.46 and 2.47 instances, confirm field selection persists across Return All pages. Confirm workflow reads remain available and generic workflow writes are allowed only where the server version supports them; do not mutate a production workspace.
- Stop Twenty temporarily only under the environment owner's control: cached field-mapped execution should preserve the sanitized connectivity error, while editor field loading shows n8n's retry UI. Restore Twenty and confirm retry succeeds.

## Trigger

- Confirm active standard/custom objects and All Objects load, and Created/Updated/Deleted events are selectable.
- Confirm the manual-registration notice distinguishes test and production URLs and requires the same shared secret in Twenty and n8n.
- Review the workspace-wide webhook allowance and reconciliation guidance before relying on high-volume trigger delivery. Confirm any reconciliation workflow owns a persistent watermark and idempotent downstream writes.
- While listening for a test event, deliver one correctly signed disposable event and confirm filtering. Confirm an altered signature or stale timestamp produces no workflow item and exposes no payload or secret.

Record n8n, Node.js, and Twenty versions plus pass/fail only. Do not capture credentials, URLs containing webhook paths, object or record identifiers, or workspace data in screenshots or reports.
