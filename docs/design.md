# Inwards Tool — approved receiving workflow

Build locally in this project directory. Deploy one Next.js application and one dedicated PostgreSQL database on Coolify after Git and hosting details are available.

## Receiving
- Staff sign in and create a receipt with a delivery reference and optional supplier/notes.
- Scan SKU codes directly. No product master, purchase order matching, stock ledger, or integration is needed.
- SKU codes are shared between pieces: five scans of `4MST2268-03-L` mean five units.
- Handheld/USB keyboard scanners are primary. Enter or Tab terminates a scan; no per-scan confirmation. The input stays ready while requests save.
- Phone scanning is a secondary, explicitly opened camera. It counts automatically and rearms after the code leaves view; no confirmation dialogs.
- Persist a pending scan locally before sending it. Retry with the same request ID, so a response lost after a successful save cannot double-count. Display pending/error state; never claim unsaved scans are saved.
- Save progress in PostgreSQL. Multiple operators can contribute; serialize mutations per receipt to protect counts and finalization.
- Select a destination shelf, then scan continuously into it. Different shelves are allowed within one receipt; counts are keyed by SKU + shelf. Every queued scan keeps the shelf selected at capture time, even if the operator switches before it saves.
- Corrections set a quantity for a SKU on one shelf with a reason and reject stale quantities. Preserve the audit history.
- Finalization locks a nonempty receipt. Download a repeatable CSV; do not infer that downloading means the other system imported it.
- The approved CSV contract from `Inventory Adjustment 11.csv` is exactly `Adjustment Type,Product Code,Shelf Code,Quantity`. Export `ADD`, scanned SKU, destination shelf code, and positive integer quantity; one row per SKU + shelf. No receipt metadata, extra columns, or total rows. Use CRLF line endings and UTF-8 without a BOM.

## Implementation decisions
Next.js App Router, TypeScript, plain CSS, and the `pg` driver already used by neighboring projects. SQL constraints and transactions handle the small data model directly. Native Node crypto provides password hashing and opaque, database-backed sessions. ZXing is loaded only for the secondary camera feature because camera barcode decoding is not available consistently through browser-native APIs.

Tables: users, sessions, login attempts, receipts, receipt lines, receipt events. Each change records the user, time, source, quantity delta, and reason. All data routes require authentication; writes require same-origin JSON requests. Local development uses its own PostgreSQL cluster and database, separate from adjacent applications.

## Verification
Run a real database integration check for repeated SKU scans, retried requests, concurrent scans, stale corrections, finalization, CSV, and authentication. Run TypeScript and production build checks. Use a browser to exercise login, creation, continuous scanning, corrections, history, and export. Real scanner hardware and phone camera acceptance require the user's devices.
