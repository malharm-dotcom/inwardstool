# Inwards Tool implementation plan

**Goal:** Deliver the approved receiving workflow locally with a deployment-ready Next.js application and PostgreSQL schema.
**Spec:** `docs/design.md` records the user's approved workflow and exact inventory-adjustment CSV contract.
**Execution:** Implement inline in the empty project directory. Git remote and live deployment are separate from the local build.

## 1. Receiving persistence and access
- [x] Create package/config files, versioned SQL migration, and local setup scripts.
- [x] Write and run `tests/receiving.test.ts` against a dedicated test database.
- [x] Implement `src/lib/db.ts`, `auth.ts`, `validation.ts`, `receipts.ts`, and `csv.ts`.
- [x] Verify five identical SKU scans produce five units, replaying a request adds nothing, concurrent scans are retained, stale corrections fail, and finalized receipts reject changes.

## 2. Application
- [x] Build login, receipt list, new receipt, receiving workspace, and help page using native form controls.
- [x] Add authenticated API routes and same-origin validation.
- [x] Persist a sequential scan queue before transmission, retain failures for explicit retry, and keep scanner input enabled while saving.
- [x] Add optional camera scanning with automatic rearming and proper camera cleanup.
- [x] Add audit history, finalization, repeatable CSV export, and responsive layouts.
- [x] Support multiple destination shelves per receipt and preserve each queued scan's selected shelf.

## 3. Verification and delivery
- [x] Run integration tests, typecheck, production build, and a dependency audit.
- [x] Test actual HTTP access, multi-shelf scan retries, server-rendered pages, corrections, finalization, and exact CSV download.
- [ ] Complete interactive browser and real-device acceptance. Browser reload was blocked by automatic approval review reporting exhausted workspace credits; no alternate browser was used to bypass that decision.
- [x] Request an independent code review; fix the three material findings and rerun affected checks. A follow-up review of the shelf changes was blocked by exhausted workspace credits.
- [x] Write local setup, scanner configuration, CSV contract, and Coolify deployment instructions.
- [x] Leave a local preview running with a development account; preserve user-supplied deployment environment values.
