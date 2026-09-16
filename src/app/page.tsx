import Link from "next/link";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { pageUser } from "@/lib/api";
import { listReceipts } from "@/lib/receipts";
import { pool } from "@/lib/db";
import { dateTime } from "@/lib/client";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await pageUser();
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const { receipts, total } = await listReceipts(
    params.q ?? "",
    params.status ?? "",
    page,
  );
  const stats = (
    await pool.query(`SELECT count(*) FILTER (WHERE status='OPEN')::int AS open,
    count(*) FILTER (WHERE status='FINALIZED')::int AS finalized,
    (SELECT coalesce(sum(l.quantity),0)::bigint::text FROM receipt_lines l JOIN receipts r ON r.id=l.receipt_id WHERE r.discarded_at IS NULL) AS units FROM receipts WHERE discarded_at IS NULL`)
  ).rows[0];
  const pageLink = (number: number) =>
    `/?${new URLSearchParams({ q: params.q ?? "", status: params.status ?? "", page: String(number) })}`;
  return (
    <Shell user={user}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">RECEIVING WORKSPACE</div>
          <h1>
            Stock comes in.
            <br className="mobile-only" /> Clarity follows.
          </h1>
          <p className="muted">
            Start a receipt, scan your EAN or SKU tags, and keep every piece
            accounted for.
          </p>
        </div>
        <Link href="/receipts/new" className="button primary">
          <Icon name="plus" size={18} />
          New receipt
        </Link>
      </div>
      <section className="stats-grid" aria-label="Receiving totals">
        <div className="stat-card">
          <span className="stat-icon green">
            <Icon name="scan" />
          </span>
          <div>
            <span>Open receipts</span>
            <strong>{stats.open}</strong>
            <small>Ready to continue scanning</small>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">
            <Icon name="check" />
          </span>
          <div>
            <span>Finalized receipts</span>
            <strong>{stats.finalized}</strong>
            <small>Reviewed and ready to export</small>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">
            <Icon name="box" />
          </span>
          <div>
            <span>Total units received</span>
            <strong>{Number(stats.units).toLocaleString("en-IN")}</strong>
            <small>Across all saved receipts</small>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Receipts <span className="count-badge">{total}</span>
            </h2>
            <p>All your receiving activity, in one place.</p>
          </div>
          <span className="small muted">Latest first</span>
        </div>
        <form className="filter-bar" action="/">
          <div className="search-field">
            <Icon name="search" size={18} />
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Search reference or supplier…"
              aria-label="Search receipts"
              maxLength={100}
            />
          </div>
          <select
            name="status"
            defaultValue={params.status ?? ""}
            aria-label="Receipt status"
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="FINALIZED">Finalized</option>
            <option value="DISCARDED">Discarded</option>
          </select>
          <button className="button secondary compact">Filter</button>
          {(params.q || params.status) && (
            <Link className="text-link" href="/">
              Clear
            </Link>
          )}
        </form>
        {receipts.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>DELIVERY REFERENCE</th>
                  <th>SUPPLIER</th>
                  <th>RECEIVED</th>
                  <th className="numeric">SKUS</th>
                  <th className="numeric">UNITS</th>
                  <th>STATUS</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td>
                      <Link
                        className="reference-link"
                        href={`/receipts/${receipt.id}`}
                      >
                        {receipt.reference}
                      </Link>
                      <small>{receipt.created_by_name}</small>
                    </td>
                    <td>{receipt.supplier || "—"}</td>
                    <td className="muted nowrap">
                      {dateTime(receipt.created_at)}
                    </td>
                    <td className="numeric mono">{receipt.sku_count}</td>
                    <td className="numeric mono strong">
                      {receipt.units.toLocaleString("en-IN")}
                    </td>
                    <td>
                      <span
                        className={`badge ${receipt.status === "OPEN" ? "open" : "finalized"}`}
                      >
                        <span />
                        {receipt.status === "OPEN"
                          ? "Open"
                          : receipt.status === "DISCARDED"
                            ? "Discarded"
                            : "Finalized"}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="row-link"
                        href={`/receipts/${receipt.id}`}
                        aria-label={`Open ${receipt.reference}`}
                      >
                        <Icon name="arrow" size={18} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="box" size={32} />
            </span>
            <h3>
              {params.q || params.status
                ? "No matching receipts"
                : "Your next delivery starts here."}
            </h3>
            <p>
              {params.q || params.status
                ? "Try another reference, supplier, or status."
                : "Create your first receipt and start scanning. Import EAN mappings in Admin before scanning EAN tags."}
            </p>
            <Link
              className="button secondary"
              href={params.q || params.status ? "/" : "/receipts/new"}
            >
              {params.q || params.status
                ? "Clear filters"
                : "Create first receipt"}
              <Icon name="arrow" size={17} />
            </Link>
          </div>
        )}
        <div className="table-footer">
          <span>
            {total
              ? `${(page - 1) * 30 + 1}–${Math.min(page * 30, total)} of ${total} receipts`
              : "No receipts yet"}
          </span>
          <div>
            {page > 1 && (
              <Link className="text-link" href={pageLink(page - 1)}>
                Previous
              </Link>
            )}
            {page * 30 < total && (
              <Link className="text-link" href={pageLink(page + 1)}>
                Next
              </Link>
            )}
          </div>
        </div>
      </section>
      <div className="tip-banner">
        <Icon name="scan" size={22} />
        <div>
          <strong>Plug in. Scan. Keep moving.</strong>
          <p>
            Set your handheld or USB scanner to end each scan with Enter or Tab.
          </p>
        </div>
        <Link href="/help">
          Scanner guide <Icon name="arrow" size={16} />
        </Link>
      </div>
    </Shell>
  );
}
