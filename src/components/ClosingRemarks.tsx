"use client";
import { useState } from "react";
import { request } from "@/lib/client";
import type { ReceiptDetail } from "@/lib/types";
export default function ClosingRemarks({
  receipt,
  userId,
  onSaved,
}: {
  receipt: ReceiptDetail;
  userId: string;
  onSaved: (receipt: ReceiptDetail) => void;
}) {
  const [value, setValue] = useState(receipt.closing_remarks);
  const [expected, setExpected] = useState(receipt.closing_remarks);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="panel form-panel">
      <h2>Receipt remarks</h2>
      <p className="muted">
        Add any observations after closing this receipt. Quantities stay locked.
      </p>
      <form
        className="form-stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const saved = await request<ReceiptDetail>(
              `/api/receipts/${receipt.id}`,
              {
                action: "remarks",
                actorId: userId,
                remarks: value,
                expectedRemarks: expected,
              },
            );
            setExpected(saved.closing_remarks);
            setValue(saved.closing_remarks);
            onSaved(saved);
            setMessage("Remarks saved.");
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Remarks <span className="optional">Optional</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Shortages, damaged pieces, or other receiving observations"
          />
        </label>
        {message && <p role="status">{message}</p>}
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save remarks"}
        </button>
      </form>
    </section>
  );
}
