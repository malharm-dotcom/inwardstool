# Inwards Tool

Next.js + PostgreSQL receiving workspace for direct SKU scanning. Handheld and USB keyboard scanners are the primary input. Each completed scan adds one piece; repeated SKU codes accumulate on the same SKU + shelf line. No product master or expected purchase order is needed.

## Local preview on this computer

Open **http://localhost:3100**. The generated development login is in `.local/access.md` (ignored by Git).

The local database runs on `127.0.0.1:55432`. `inwards` stores preview data; `inwards_test` is isolated for automated checks. The project-local PostgreSQL runtime and data are under `.local/`; do not commit that directory. This runtime uses a compatible Microsoft C++ runtime copied locally because the installed system runtime crashes PostgreSQL 18.4. System files and neighboring projects were not changed. Coolify internal database hostnames resolve only inside its network; local preview commands need the loopback database URL instead.

To restart the local database and development application in PowerShell:

```powershell
cd 'C:\Malhar\Inwards Tool'
.\scripts\start-local.ps1
```

Use `localhost:3100`, not `127.0.0.1:3100`: `APP_URL` is checked on writes. The development server listens only on loopback. The local database uses trust authentication on loopback only; this is a local development setup, not a production configuration.

## Setup on another machine

Use Node.js 24 and a dedicated PostgreSQL 16+ database.

```sh
npm ci
# Copy .env.example to .env.local and set DATABASE_URL and APP_URL.
npm run db:migrate
npm run user:create
npm run dev
```

Before creating a user, set `CREATE_USERNAME`, `CREATE_DISPLAY_NAME`, and `CREATE_PASSWORD` in the environment or `.env.local`. Passwords must contain at least 12 characters. No default production password is shipped. `user:bootstrap` creates the first account only when no users exist; it never overwrites existing credentials. `user:create` adds subsequent staff accounts. Each staff member should have an individual account for the audit history. All staff currently have access to all receipts.

## Coolify application and database

1. Create a **PostgreSQL** resource dedicated to this application. Use a strong database password, keep its persistent volume, and leave public exposure disabled. Copy its **internal connection URL**.
2. Create an application from the private Git repository. Use **Nixpacks**, repository root `/`, application port **3000**, and a production branch of your choice. The checked-in `nixpacks.toml` selects Node 24, installs dependencies, builds Next.js, and applies migrations before starting.
3. Place the application and database on the same Coolify destination network. Configure:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Database resource's internal PostgreSQL URL |
   | `APP_URL` | Exact public HTTPS origin, for example `https://inwards.example.com` |
   | `TZ` | `Asia/Kolkata` |
   | `CREATE_USERNAME` | Initial login, e.g. `admin` |
   | `CREATE_DISPLAY_NAME` | Initial staff name, e.g. `Warehouse Admin` |
   | `CREATE_PASSWORD` | Your own strong password, at least 12 characters |

4. Set the application's domain and enable HTTPS. Secure cookies and camera access depend on HTTPS. The app needs its own database, not the PostgreSQL database used internally by Coolify.
5. Configure the health check as **GET `/api/health` on port 3000**. Use a start period of about 30 seconds. Build does not require a reachable database; runtime and migrations do.
6. Deploy. Startup applies migrations and creates the initial staff account if the users table is empty. Later deployments leave accounts and passwords untouched. You can remove the `CREATE_*` values after the first successful deployment. Add later accounts with `npm run user:create` in the app terminal using temporary `CREATE_*` values. Do not copy `.env.local` or the local preview account to production.
7. Enable scheduled database backups in Coolify and verify a restore to a separate database before using real receiving data.

If entering commands manually instead of using `nixpacks.toml`:

```text
Install: npm ci --include=dev
Build:   npm run build
Start:   npm run db:migrate && npm run user:bootstrap && npm run start
Port:    3000
```

The application requires no upload volume. Receipt data, hashed sessions, and audit events live in PostgreSQL. SQL migrations are versioned and applied transactionally under an advisory lock. Never run development migration resets against production.

## Scanner setup

- USB/Bluetooth: keyboard/HID mode; suffix **Enter** or **Tab**.
- Android handhelds: enable keyboard output in the scanner profile, targeting the browser.
- Select a destination shelf with **Use shelf**, then select the scan field. Each scan counts immediately, with no confirmation.
- Use **Change shelf** when moving to another destination. Each queued scan retains its original shelf even if you switch before it saves. The same SKU can have independent quantities on multiple shelves within one receipt.
- Unsent scans are persisted in browser storage before transmission. Keep the tab open until **All scans saved** appears. If interrupted, return to the same receipt in the same browser and user account, then retry. Request IDs make retries safe.
- Do not clear browser storage while work is pending. The queue supports up to 10,000 unsent scans. A full or unavailable store rejects new captures visibly.
- One scanning tab per receipt per browser prevents competing tabs from overwriting the local queue. Different devices can scan the same receipt; database transactions serialize updates.
- Camera is secondary. Open **Use camera**, show one barcode, then move it out of view for at least one second before the next tag. This is a heuristic, so verify totals on real devices. Hardware scanners are preferred for sustained receiving.
- Quantity corrections apply to one SKU on one shelf, require a reason, and preserve history. A stale correction is rejected when another operator changes that quantity.
- Finalize only when all operators have finished and saved their pending work. Finalization locks quantities. The server cannot know about another device's offline scans; late scans are rejected and retained locally for reconciliation.
- CSV downloads can be repeated, and downloading does not mark stock as imported into the other system.

## Required CSV output

The export matches the supplied `Inventory Adjustment 11.csv` column names and order:

```csv
Adjustment Type,Product Code,Shelf Code,Quantity
ADD,4MST2268-03-L,FRONT_OFFICE,3
ADD,4MST2268-03-L,RACK_A01,1
```

`Product Code` is the scanned SKU. `Shelf Code` is the destination selected before scanning. Rows group by SKU + shelf; only positive quantities export. Files use UTF-8 without a BOM, comma separators, and CRLF line endings. There are no extra receipt metadata columns or totals. The receipt reference is used in the filename. Codes preserve case and leading zeros; supported characters are letters, digits, dots, hyphens, slashes, and underscores, starting with a letter or digit. Verify the actual shelf codes in the destination system; the app has no connection to its shelf master.

The export is an **ADD** inventory adjustment. Uploading the same file twice may add stock twice in the destination system. Downloading again does not change this tool’s counts or prove an external upload succeeded.

## Checks

```sh
npm run typecheck
npm test
npm run build
# With the local development server running:
npm run test:http
```

`TEST_DATABASE_URL` must point to a dedicated database ending in `_test`. Apply migrations to that database before running tests. The tests create uniquely named test receipts/accounts; they never truncate tables. The normal database must not be used for testing.

Real device acceptance should verify the handheld's keyboard suffix, five tags with the same SKU yielding five units, correction, lost-connection retry, finalization, and upload of an exported CSV into the destination system.
