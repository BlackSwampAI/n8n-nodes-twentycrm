# Release-candidate UI qualification

Automated package checks cannot prove n8n editor rendering. Run this bounded checklist in an owner-controlled disposable n8n instance after installing the locally packed package. Do not use production CRM data.

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
- Stop Twenty temporarily only under the environment owner's control: cached field-mapped execution should preserve the sanitized connectivity error, while editor field loading shows n8n's retry UI. Restore Twenty and confirm retry succeeds.

## Trigger

- Confirm active standard/custom objects and All Objects load, and Created/Updated/Deleted events are selectable.
- Confirm the manual-registration notice distinguishes test and production URLs and requires the same shared secret in Twenty and n8n.
- While listening for a test event, deliver one correctly signed disposable event and confirm filtering. Confirm an altered signature or stale timestamp produces no workflow item and exposes no payload or secret.

Record n8n, Node.js, and Twenty versions plus pass/fail only. Do not capture credentials, URLs containing webhook paths, object or record identifiers, or workspace data in screenshots or reports.
