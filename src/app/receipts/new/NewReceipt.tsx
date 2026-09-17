"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { request } from "@/lib/client";

export default function NewReceipt() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Link className="back-link" href="/">
        <Icon name="back" size={16} />
        All receipts
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LET’S GET RECEIVING</div>
          <h1>New receipt</h1>
          <p className="muted">
            A few delivery details, then you’re ready to scan.
          </p>
        </div>
        <span className="step-label">
          01 <span>/ 02 &nbsp; SCAN & REVIEW</span>
        </span>
      </div>
      <div className="new-grid">
        <section className="panel form-panel">
          <div className="panel-heading">
            <h2>Delivery details</h2>
          </div>
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(event.currentTarget);
              try {
                const receipt = await request<{ id: string }>(
                  "/api/receipts",
                  Object.fromEntries(form),
                );
                router.push(`/receipts/${receipt.id}`);
              } catch (error) {
                setError((error as Error).message);
                setBusy(false);
              }
            }}
          >
            <label>
              PO Number <span className="required">*</span>
              <input
                name="poNumber"
                required
                autoFocus
                maxLength={100}
                placeholder="e.g. PO-2026-001"
              />
              <small>The same PO can be used for multiple invoices.</small>
            </label>
            <label>
              Invoice Number <span className="required">*</span>
              <input
                name="invoiceNumber"
                required
                maxLength={100}
                placeholder="e.g. INV-2026-001"
              />
              <small>
                Must be unique across all receipts, including discarded
                receipts.
              </small>
            </label>
            <label>
              Supplier / source <span className="optional">Optional</span>
              <input
                name="supplier"
                maxLength={200}
                placeholder="Where is this stock coming from?"
              />
            </label>
            <label>
              Notes <span className="optional">Optional</span>
              <textarea
                name="notes"
                rows={3}
                maxLength={2000}
                placeholder="Any details the receiving team should know"
              />
            </label>
            {error && (
              <div className="notice danger" role="alert">
                {error}
              </div>
            )}
            <div className="form-actions">
              <Link className="button secondary" href="/">
                Cancel
              </Link>
              <button className="button primary" disabled={busy}>
                {busy ? "Creating…" : "Create & start scanning"}
                <Icon name="arrow" size={18} />
              </button>
            </div>
          </form>
        </section>
        <aside className="how-card">
          <span className="stat-icon green">
            <Icon name="scan" size={24} />
          </span>
          <h2>
            One scan.
            <br />
            One more piece.
          </h2>
          <p>
            Scan the SKU printed on each tag. Identical SKU codes add to the
            same line.
          </p>
          <div className="example-sku">
            4MST2268-03-L <span>× 5 scans</span>
            <strong>
              5 units received <Icon name="check" size={18} />
            </strong>
          </div>
          <small>
            Progress saves as you scan. Review quantities before finalizing your
            receipt.
          </small>
        </aside>
      </div>
    </>
  );
}
