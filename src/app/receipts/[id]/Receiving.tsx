"use client";
import Link from "next/link";
import Camera from "@/components/Camera";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import Modal from "@/components/Modal";
import { dateTime, request } from "@/lib/client";
import { skuCode } from "@/lib/validation";
import { parseQueue } from "@/lib/scanning";
import type { Line, ReceiptDetail, ScanInput, User } from "@/lib/types";

export default function Receiving({
  initial,
  user,
}: {
  initial: ReceiptDetail;
  user: User;
}) {
  const [receipt, setReceipt] = useState(initial),
    [pending, setPending] = useState<ScanInput[]>([]);
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [focused, setFocused] = useState(false);
  const [queueError, setQueueError] = useState(""),
    [notice, setNotice] = useState(""),
    [fatal, setFatal] = useState("");
  const [lastScan, setLastScan] = useState(""),
    [search, setSearch] = useState(""),
    [camera, setCamera] = useState(false);
  const [shelf, setShelf] = useState(""),
    [changingShelf, setChangingShelf] = useState(true),
    [lastShelf, setLastShelf] = useState("");
  const shelfInput = useRef<HTMLInputElement>(null);
  const [correction, setCorrection] = useState<Line | null>(null),
    [finalize, setFinalize] = useState(false),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    queue = useRef<ScanInput[]>([]),
    processing = useRef(false),
    active = useRef(false);
  const release = useRef<(() => void) | null>(null),
    failed = useRef(false);
  const generation = useRef(0);
  const key = `inwards:pending:${user.id}:${initial.id}`,
    url = `/api/receipts/${initial.id}`;
  const open = receipt.status === "OPEN";

  const persist = useCallback(
    (items: ScanInput[]) => {
      localStorage.setItem(key, JSON.stringify(items));
      queue.current = items;
      setPending(items);
    },
    [key],
  );

  const drain = useCallback(async () => {
    if (!active.current || processing.current || failed.current) return;
    processing.current = true;
    setSaving(true);
    try {
      while (active.current && queue.current.length) {
        const item = queue.current[0];
        generation.current++;
        const saved = await request<ReceiptDetail>(url, {
          action: "scan",
          actorId: user.id,
          ...item,
        });
        if (!active.current) break;
        // Remove only after acknowledgement. A failed local write retains the same idempotency key.
        persist(queue.current.slice(1));
        setReceipt(saved);
      }
    } catch (error) {
      failed.current = true;
      if (active.current)
        setQueueError(
          (error as Error).message ||
            "Save interrupted. Your pending scans are kept on this device.",
        );
    } finally {
      processing.current = false;
      if (active.current) setSaving(false);
      else release.current?.();
    }
  }, [persist, url, user.id]);

  useEffect(() => {
    let canceled = false;
    if (!navigator.locks || !crypto.randomUUID) {
      setFatal(
        "Open the application over HTTPS (or localhost) in a current browser to safely store scans.",
      );
      return;
    }
    navigator.locks
      .request(key, { ifAvailable: true }, async (lock) => {
        if (canceled) return;
        if (!lock) {
          setFatal(
            "This receipt is already open for scanning in another tab. Close that tab and reload this page.",
          );
          return;
        }
        try {
          const items = parseQueue(localStorage.getItem(key));
          localStorage.setItem(key, JSON.stringify(items));
          const rememberedShelf = localStorage.getItem(`${key}:shelf`);
          if (rememberedShelf) {
            setShelf(skuCode(rememberedShelf, "Shelf code"));
            setChangingShelf(false);
          }
          active.current = true;
          queue.current = items;
          setPending(items);
          setReady(true);
          const holding = new Promise<void>((resolve) => {
            release.current = resolve;
          });
          void drain();
          await holding;
        } catch {
          setFatal(
            "Browser storage is unavailable or pending scan data is damaged. Keep this browser data intact and contact your administrator.",
          );
        }
      })
      .catch(() =>
        setFatal("Could not reserve this scanner tab. Reload the page."),
      );
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queue.current.length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      canceled = true;
      active.current = false;
      if (!processing.current) release.current?.();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [key, drain]);

  useEffect(() => {
    if (ready && open && !correction && !finalize && !camera) {
      if (changingShelf || !shelf) shelfInput.current?.focus();
      else input.current?.focus();
    }
  }, [ready, open, correction, finalize, camera, changingShelf, shelf]);
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (
        !active.current ||
        processing.current ||
        queue.current.length ||
        document.hidden
      )
        return;
      const version = generation.current;
      try {
        const saved = await request<ReceiptDetail>(url);
        if (
          active.current &&
          version === generation.current &&
          !processing.current &&
          !queue.current.length
        )
          setReceipt(saved);
      } catch {
        /* The scanner save path surfaces connection failures. */
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [url]);

  function enqueue(raw: string, source: ScanInput["source"] = "SCANNER") {
    if (
      !raw.trim() ||
      !ready ||
      !open ||
      !shelf ||
      changingShelf ||
      correction ||
      finalize ||
      busy ||
      fatal
    )
      return false;
    try {
      const sku = skuCode(raw);
      if (queue.current.length >= 10000)
        throw new Error(
          "The pending queue is full. Restore the connection and save it before scanning more.",
        );
      persist([
        ...queue.current,
        { requestId: crypto.randomUUID(), sku, shelfCode: shelf, source },
      ]);
      setLastScan(sku);
      setLastShelf(shelf);
      setNotice("");
      if (input.current) input.current.value = "";
      if (source !== "CAMERA") input.current?.focus();
      void drain();
      return true;
    } catch (error) {
      setNotice(
        (error as Error).message ||
          "Could not store this scan. Stop scanning and check browser storage.",
      );
      return false;
    }
  }
  async function refresh() {
    const version = generation.current;
    try {
      const saved = await request<ReceiptDetail>(url);
      if (
        version === generation.current &&
        !processing.current &&
        !queue.current.length
      ) {
        setReceipt(saved);
        setNotice("");
      }
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  const total = receipt.lines.reduce((sum, line) => sum + line.quantity, 0);
  const skuCount = new Set(
    receipt.lines.filter((line) => line.quantity > 0).map((line) => line.sku),
  ).size;
  const shelfCount = new Set(
    receipt.lines
      .filter((line) => line.quantity > 0)
      .map((line) => line.shelf_code),
  ).size;
  const lines = receipt.lines.filter((line) =>
    `${line.sku} ${line.shelf_code}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const canChange = ready && !pending.length && !saving && !busy && !fatal;

  return (
    <>
      <Link className="back-link" href="/">
        <Icon name="back" size={16} />
        All receipts
      </Link>
      <div className="page-heading receipt-heading">
        <div>
          <div className="eyebrow">RECEIPT WORKSPACE</div>
          <h1>
            {receipt.reference}
            <span className={`badge ${open ? "open" : "finalized"}`}>
              <span />
              {open
                ? "Open"
                : receipt.status === "DISCARDED"
                  ? "Discarded"
                  : "Finalized"}
            </span>
          </h1>
          <p className="muted">
            {receipt.supplier || "No supplier specified"}
            <span className="dot-separator">·</span>
            {dateTime(receipt.created_at)} IST
            <span className="dot-separator">·</span>
            {receipt.created_by_name}
          </p>
        </div>
        {open ? (
          <button
            className="button primary"
            disabled={!canChange || !total}
            onClick={() => {
              setFinalize(true);
              setCamera(false);
              setNotice("");
            }}
          >
            <Icon name="check" size={18} />
            Finalize receipt
          </button>
        ) : receipt.status === "FINALIZED" ? (
          <a className="button primary" href={`${url}/export`}>
            <Icon name="download" size={18} />
            Download CSV
          </a>
        ) : null}
        {user.role === "ADMIN" && receipt.status !== "DISCARDED" && (
          <button
            className="button secondary"
            disabled={busy || saving}
            onClick={async () => {
              if (
                !window.confirm(
                  `Discard delivery ${receipt.reference}? It will be removed from active totals and cannot be scanned or exported. ${pending.length} pending scans on this device will also be discarded. This does not reverse any inventory already uploaded to another system.`,
                )
              )
                return;
              setBusy(true);
              setCamera(false);
              generation.current++;
              try {
                setReceipt(
                  await request<ReceiptDetail>(url, {
                    action: "discard",
                    actorId: user.id,
                  }),
                );
                persist([]);
                setQueueError("");
                failed.current = false;
              } catch (error) {
                setNotice((error as Error).message);
              } finally {
                generation.current++;
                setBusy(false);
              }
            }}
          >
            Discard delivery
          </button>
        )}
      </div>
      {fatal && (
        <div className="notice danger" role="alert">
          {fatal}
        </div>
      )}
      {notice && (
        <div className="notice danger" role="alert">
          {notice}
        </div>
      )}
      {queueError && (
        <div className="notice danger" role="alert">
          <strong>Scans waiting to save.</strong> {queueError}
          <div className="notice-actions">
            <button
              className="button secondary compact"
              onClick={() => {
                failed.current = false;
                setQueueError("");
                void drain();
              }}
            >
              Retry pending scans
            </button>
            <a href="/login" className="text-link">
              Sign in again
            </a>
            <button
              className="text-button"
              onClick={() => {
                const blob = new Blob(
                  [
                    JSON.stringify(
                      { receipt: receipt.reference, pending: queue.current },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                );
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `pending-${receipt.id}.json`;
                link.click();
                URL.revokeObjectURL(link.href);
              }}
            >
              Download pending backup
            </button>
          </div>
        </div>
      )}
      {receipt.status === "DISCARDED" && (
        <div className="notice" role="status">
          Delivery discarded. Scanning and CSV export are disabled. History is
          retained.
        </div>
      )}
      {receipt.status === "FINALIZED" && (
        <div className="notice success">
          <Icon name="lock" size={18} />
          <div>
            <strong>Receipt finalized. Quantities are locked.</strong>
            <p>
              {receipt.finalized_by_name} · {dateTime(receipt.finalized_at!)}{" "}
              IST. Download the CSV whenever you need it.
            </p>
          </div>
        </div>
      )}
      <div className="receiving-grid">
        <div className="receiving-main">
          {open && (
            <section
              className={`scanner-panel ${focused ? "scanner-focused" : ""}`}
            >
              <div className="scanner-title">
                <span>
                  <Icon name="scan" size={20} />
                  <strong>Scan EAN or SKU tags</strong>
                </span>
                <span
                  className={`scanner-state ${focused && ready ? "is-ready" : ""}`}
                >
                  <span />
                  {!ready
                    ? "Preparing scanner"
                    : changingShelf || !shelf
                      ? "Select a shelf"
                      : focused
                        ? "Ready to scan"
                        : "Scanner paused"}
                </span>
              </div>
              {changingShelf || !shelf ? (
                <form
                  className="shelf-picker"
                  onSubmit={(event) => {
                    event.preventDefault();
                    try {
                      const selected = skuCode(
                        shelfInput.current?.value,
                        "Shelf code",
                      );
                      localStorage.setItem(`${key}:shelf`, selected);
                      setShelf(selected);
                      setChangingShelf(false);
                      setNotice("");
                    } catch (error) {
                      setNotice((error as Error).message);
                    }
                  }}
                >
                  <label htmlFor="shelf-input">Destination shelf</label>
                  <div>
                    <input
                      id="shelf-input"
                      ref={shelfInput}
                      required
                      defaultValue={shelf}
                      maxLength={128}
                      list="receipt-shelves"
                      placeholder="e.g. FRONT_OFFICE"
                      autoComplete="off"
                      autoCapitalize="off"
                      disabled={!ready || !!fatal}
                    />
                    <datalist id="receipt-shelves">
                      {[
                        ...new Set(
                          receipt.lines.map((line) => line.shelf_code),
                        ),
                      ]
                        .filter(Boolean)
                        .map((code) => (
                          <option key={code} value={code} />
                        ))}
                    </datalist>
                    <button
                      className="button primary compact"
                      disabled={!ready || !!fatal}
                    >
                      Use shelf
                    </button>
                    {shelf && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setChangingShelf(false)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <small>
                    Enter the shelf code exactly as it exists in the receiving
                    system.
                  </small>
                </form>
              ) : (
                <div className="active-shelf">
                  <span>
                    Scanning into <strong className="mono">{shelf}</strong>
                  </span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setChangingShelf(true);
                      setCamera(false);
                    }}
                  >
                    Change shelf
                  </button>
                </div>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  enqueue(input.current?.value ?? "");
                }}
              >
                <label htmlFor="sku-input" className="sr-only">
                  Scan EAN or SKU barcode
                </label>
                <div className="scan-input-wrap">
                  <Icon name="scan" size={27} />
                  <input
                    id="sku-input"
                    ref={input}
                    name="sku"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder={
                      !shelf || changingShelf
                        ? "Select a destination shelf first…"
                        : "Scan a barcode or enter SKU…"
                    }
                    disabled={
                      !ready ||
                      !!fatal ||
                      !shelf ||
                      changingShelf ||
                      !!correction ||
                      finalize ||
                      busy
                    }
                    maxLength={128}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Tab" &&
                        event.currentTarget.value.trim()
                      ) {
                        event.preventDefault();
                        enqueue(event.currentTarget.value);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    className="scan-submit"
                    disabled={
                      !ready ||
                      !!fatal ||
                      !shelf ||
                      changingShelf ||
                      !!correction ||
                      finalize ||
                      busy
                    }
                    aria-label="Add scanned barcode"
                  >
                    <Icon name="arrow" size={22} />
                  </button>
                </div>
              </form>
              <div className="scanner-caption">
                <span>
                  One scan = one unit <span className="dot-separator">·</span>{" "}
                  Enter or Tab to add
                </span>
                {!focused && ready && shelf && !changingShelf && (
                  <button
                    className="text-button"
                    onClick={() => input.current?.focus()}
                  >
                    Resume scanning
                  </button>
                )}
              </div>
              <div className="scan-feedback" role="status" aria-live="polite">
                {lastScan ? (
                  <>
                    <span className="feedback-check">
                      <Icon name="check" size={15} />
                    </span>
                    <strong className="mono">{lastScan}</strong>
                    <span>+1 → {lastShelf}</span>
                  </>
                ) : (
                  <>
                    <Icon name="box" size={16} />
                    <span>Your next scan will appear here.</span>
                  </>
                )}
                <span className="save-indicator">
                  {pending.length
                    ? `${pending.length} pending`
                    : "All scans saved"}
                </span>
              </div>
            </section>
          )}
          {camera && open && !correction && !finalize && (
            <Camera
              onScan={(sku) => enqueue(sku, "CAMERA")}
              onClose={() => setCamera(false)}
            />
          )}
          <section className="panel items-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  Received items <span className="count-badge">{skuCount}</span>
                </h2>
                <p>Saved quantities, grouped by SKU and destination shelf.</p>
              </div>
              <button
                className="text-button"
                onClick={refresh}
                disabled={saving || pending.length > 0}
              >
                Refresh
              </button>
            </div>
            {receipt.lines.length > 0 && (
              <div className="item-search search-field">
                <Icon name="search" size={17} />
                <input
                  placeholder="Find a SKU or shelf…"
                  aria-label="Find a SKU or shelf"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            )}
            {lines.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>SKU CODE</th>
                      <th>SHELF CODE</th>
                      <th className="numeric">QUANTITY</th>
                      {open && (
                        <th>
                          <span className="sr-only">Correction</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr
                        key={`${line.sku}:${line.shelf_code}`}
                        className={
                          (line.sku === lastScan ||
                            receipt.events.some(
                              (event) =>
                                event.kind === "SCAN" &&
                                event.scanned_code === lastScan &&
                                event.sku === line.sku,
                            )) &&
                          line.shelf_code === lastShelf
                            ? "last-scanned-row"
                            : ""
                        }
                      >
                        <td>
                          <span className="sku-cell">
                            <Icon name="box" size={17} />
                            <strong className="mono">{line.sku}</strong>
                          </span>
                          <small>{dateTime(line.updated_at)}</small>
                        </td>
                        <td className="muted small mono">
                          {line.shelf_code || "Unassigned"}
                        </td>
                        <td className="numeric">
                          <span className="quantity-pill">{line.quantity}</span>
                        </td>
                        {open && (
                          <td className="numeric">
                            <button
                              className="text-button"
                              disabled={!canChange}
                              onClick={() => {
                                setCorrection(line);
                                setNotice("");
                                setCamera(false);
                              }}
                              aria-label={`Correct ${line.sku} on ${line.shelf_code}`}
                            >
                              Correct
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state item-empty">
                <span className="empty-icon">
                  <Icon name="scan" size={30} />
                </span>
                <h3>
                  {search ? "No matching items" : "Ready for your first scan."}
                </h3>
                <p>
                  {search
                    ? "Try a different SKU or shelf code."
                    : "Choose a shelf, then scan a tag to add your first piece."}
                </p>
                <span className="barcode-decoration" aria-hidden="true" />
              </div>
            )}
            <div className="table-footer">
              <span>
                {skuCount} unique SKUs · {shelfCount} shelves
              </span>
              <strong>{total.toLocaleString("en-IN")} units saved</strong>
            </div>
          </section>
          {receipt.notes && (
            <section className="receipt-notes">
              <strong>Delivery notes</strong>
              <p>{receipt.notes}</p>
            </section>
          )}
        </div>
        <aside className="receipt-aside">
          <section className="summary-card">
            <div className="eyebrow">THIS RECEIPT</div>
            <div className="big-total">
              {total.toLocaleString("en-IN")}
              <span>units received</span>
            </div>
            <div className="summary-row">
              <span>Unique SKUs</span>
              <strong>{skuCount}</strong>
            </div>
            <div className="summary-row">
              <span>Destination shelves</span>
              <strong>{shelfCount}</strong>
            </div>
            <div className="summary-row">
              <span>Pending scans</span>
              <strong className={pending.length ? "amber-text" : "green-text"}>
                {pending.length}
              </strong>
            </div>
            <div className="summary-save">
              <span className={pending.length ? "pending-dot" : "live-dot"} />
              {pending.length
                ? saving
                  ? "Saving your scans…"
                  : "Waiting to save"
                : "All scans saved"}
            </div>
          </section>
          {open && (
            <section className="camera-option">
              <Icon name="camera" size={21} />
              <strong>No scanner nearby?</strong>
              <p>
                {!shelf || changingShelf
                  ? "Select a destination shelf above to enable camera scanning."
                  : "Use your phone camera for an occasional scan."}
              </p>
              <button
                className="button secondary full compact"
                disabled={
                  !ready ||
                  !!fatal ||
                  !shelf ||
                  changingShelf ||
                  !!correction ||
                  finalize
                }
                onClick={() => setCamera((value) => !value)}
              >
                {camera ? "Close camera" : "Use camera"}
              </button>
            </section>
          )}
          <section className="activity-panel">
            <h3>
              Recent activity <Icon name="clock" size={16} />
            </h3>
            <p className="small muted">
              Latest {Math.min(receipt.events.length, 100)} changes · IST
            </p>
            {receipt.events.length ? (
              <ol className="activity-list">
                {receipt.events.map((event) => (
                  <li key={event.request_id}>
                    <span
                      className={`activity-dot ${event.kind === "ADJUST" ? "adjusted" : ""}`}
                    />
                    <div>
                      <strong>
                        {event.kind === "FINALIZE"
                          ? "Receipt finalized"
                          : event.kind === "ADJUST"
                            ? "Quantity corrected"
                            : `${event.delta > 0 ? "+" : ""}${event.delta} unit scanned`}
                      </strong>
                      {event.sku && <span className="mono">{event.sku}</span>}
                      {event.scanned_code &&
                        event.scanned_code !== event.sku && (
                          <span className="small muted">
                            EAN: {event.scanned_code}
                          </span>
                        )}
                      {event.shelf_code && (
                        <span className="mono">→ {event.shelf_code}</span>
                      )}
                      {event.reason && <p>{event.reason}</p>}
                      <small>
                        {event.user_name} · {dateTime(event.created_at)}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="activity-placeholder">
                Your scan history will appear here.
              </p>
            )}
          </section>
        </aside>
      </div>
      <div className="export-note">
        <Icon name="download" size={16} />
        <span>Inventory adjustment CSV · ADD · one row per SKU and shelf</span>
      </div>
      {correction && (
        <Modal
          title="correction-title"
          busy={busy}
          onClose={() => setCorrection(null)}
        >
          <div className="modal-heading">
            <h2 id="correction-title">Correct quantity</h2>
            <button
              className="icon-button"
              aria-label="Close correction"
              disabled={busy}
              onClick={() => setCorrection(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          <p className="mono">
            {correction.sku} → {correction.shelf_code}
          </p>
          <p className="muted">
            Currently {correction.quantity} units on this shelf. Every
            correction is recorded.
          </p>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setNotice("");
              generation.current++;
              const form = new FormData(event.currentTarget);
              try {
                setReceipt(
                  await request<ReceiptDetail>(url, {
                    action: "adjust",
                    actorId: user.id,
                    requestId: crypto.randomUUID(),
                    sku: correction.sku,
                    shelfCode: correction.shelf_code,
                    expectedQuantity: correction.quantity,
                    quantity: Number(form.get("quantity")),
                    reason: form.get("reason"),
                  }),
                );
                setCorrection(null);
              } catch (error) {
                setNotice((error as Error).message);
              } finally {
                generation.current++;
                setBusy(false);
              }
            }}
          >
            <label>
              Correct quantity
              <input
                type="number"
                name="quantity"
                autoFocus
                min={0}
                max={1000000}
                step={1}
                required
                defaultValue={correction.quantity}
              />
            </label>
            <label>
              Reason
              <input
                name="reason"
                maxLength={300}
                required
                placeholder="e.g. Recounted two duplicate scans"
              />
            </label>
            {notice && (
              <div className="notice danger" role="alert">
                {notice}
              </div>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setCorrection(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Save correction"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {finalize && (
        <Modal
          title="finalize-title"
          busy={busy}
          onClose={() => setFinalize(false)}
        >
          <span className="stat-icon green">
            <Icon name="check" size={25} />
          </span>
          <h2 id="finalize-title">Finish this receipt?</h2>
          <p>
            You’re finalizing <strong>{total} units</strong> across{" "}
            <strong>{skuCount} SKUs</strong> and{" "}
            <strong>{shelfCount} shelves</strong>.
          </p>
          <p className="muted">
            Make sure all operators have finished scanning and saved their work.
            Finalizing locks quantities and makes the CSV available.
          </p>
          {notice && (
            <div className="notice danger" role="alert">
              {notice}
            </div>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setFinalize(false)}
            >
              Keep scanning
            </button>
            <button
              className="button primary"
              disabled={busy || !!pending.length}
              onClick={async () => {
                setBusy(true);
                setNotice("");
                generation.current++;
                try {
                  setReceipt(
                    await request<ReceiptDetail>(url, {
                      action: "finalize",
                      actorId: user.id,
                    }),
                  );
                  setFinalize(false);
                } catch (error) {
                  setNotice((error as Error).message);
                } finally {
                  generation.current++;
                  setBusy(false);
                }
              }}
            >
              {busy ? "Finalizing…" : "Finalize receipt"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
