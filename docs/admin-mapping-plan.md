# Admin users and EAN mapping

User-requested extension to receiving: admin creates warehouse users and imports SKU/EAN mappings; scans resolve to SKU before counting and exporting.

- Add roles with staff as default, promote the existing first account only on migration; fresh bootstrap creates admin.
- Admin-only user listing/creation and activation, with server authorization and password hashing. Never deactivate the current administrator.
- Admin mapping import with a downloadable CSV template, strict validation and atomic upsert. One EAN maps to one SKU, several EANs may share a SKU; conflicting assignments are rejected. Preserve leading zeros.
- Resolve numeric scans from the mapping. Reject unknown numeric barcodes without losing queued scans. Alphanumeric direct SKUs continue to work. Save original barcode in the audit; deduplicate using original input before resolution so mapping changes cannot affect retries.
- Test permissions, import validation/atomicity, leading zeros, EAN/direct SKU aggregation, retries and final export. Build, browser-check, commit and push for deployment.
