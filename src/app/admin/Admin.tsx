"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/client";
import type { User } from "@/lib/types";

type Staff = User & { active: boolean };
type Mappings = { rows: { sku: string; ean: string }[]; total: number };
export default function Admin() {
  const [users, setUsers] = useState<Staff[]>([]);
  const [mappings, setMappings] = useState<Mappings>({ rows: [], total: 0 });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  async function refresh() {
    const [staff, mapped] = await Promise.all([
      request<Staff[]>("/api/admin/users"),
      request<Mappings>("/api/admin/mappings"),
    ]);
    setUsers(staff);
    setMappings(mapped);
  }
  useEffect(() => {
    refresh().catch((error) => setError(error.message));
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="admin-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h1>Team & barcode mappings</h1>
          <p className="muted">
            Give your team access and connect scanned EANs to product SKUs.
          </p>
        </div>
      </div>
      {error && (
        <p className="admin-message error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-message" role="status">
          {notice}
        </p>
      )}
      <section className="admin-panel">
        <h2>Warehouse users</h2>
        <p className="muted">
          Staff can create receipts, scan, correct quantities, finalize
          shipments and download CSVs.
        </p>
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            void run(async () => {
              await request("/api/admin/users", {
                username: data.get("username"),
                displayName: data.get("displayName"),
                password: data.get("password"),
              });
              form.reset();
              await refresh();
              setNotice(
                "Staff account created. Share the username and password directly with the staff member.",
              );
            });
          }}
        >
          <label>
            Display name
            <input
              name="displayName"
              required
              maxLength={100}
              autoComplete="off"
            />
          </label>
          <label>
            Username
            <input
              name="username"
              required
              maxLength={80}
              pattern="[a-zA-Z0-9._@\-]+"
              autoComplete="off"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
              placeholder="At least 12 characters"
            />
          </label>
          <button className="button primary" disabled={busy}>
            Create user
          </button>
        </form>
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.display_name}</td>
                  <td>{user.username}</td>
                  <td>{user.role === "ADMIN" ? "Admin" : "Staff"}</td>
                  <td>{user.active ? "Active" : "Disabled"}</td>
                  <td>
                    {user.role === "STAFF" && (
                      <button
                        disabled={busy}
                        className="button secondary compact"
                        onClick={() =>
                          void run(async () => {
                            await request(
                              "/api/admin/users",
                              { userId: user.id, active: !user.active },
                              "PATCH",
                            );
                            await refresh();
                            setNotice(
                              user.active
                                ? "Staff access disabled."
                                : "Staff access enabled.",
                            );
                          })
                        }
                      >
                        {user.active ? "Disable" : "Enable"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="admin-panel">
        <h2>SKU–EAN mapping</h2>
        <p className="muted">
          Upload a CSV with SKU and EAN columns. Keep EANs as text to preserve
          leading zeros. Each EAN must identify one SKU; multiple EANs can
          identify the same SKU.
        </p>
        <a
          className="button secondary compact"
          href="/mapping-template.csv"
          download
        >
          Download CSV template
        </a>
        <form
          className="admin-form mapping-upload"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              if (!file) throw new Error("Choose a CSV file.");
              if (file.size > 5_000_000)
                throw new Error("File must be 5 MB or smaller.");
              const result = await request<{
                added: number;
                unchanged: number;
              }>("/api/admin/mappings", { csv: await file.text() });
              await refresh();
              setNotice(
                `Import complete: ${result.added} added, ${result.unchanged} already present.`,
              );
            });
          }}
        >
          <label>
            Mapping file
            <input
              type="file"
              accept=".csv,text/csv"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="button primary" disabled={busy || !file}>
            Import mappings
          </button>
        </form>
        <p className="small muted">
          Maximum 50,000 rows / 5 MB. Conflicting mappings reject the entire
          import. Existing EAN lines merge into their mapped SKU when a receipt
          is opened or refreshed, retaining total quantities. After importing a
          missing barcode, use Retry on the receipt to save its pending scans.
        </p>
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () =>
              setMappings(
                await request<Mappings>(
                  `/api/admin/mappings?q=${encodeURIComponent(query)}`,
                ),
              ),
            );
          }}
        >
          <label>
            Find SKU or EAN
            <input
              value={query}
              maxLength={128}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button disabled={busy} className="button secondary">
            Search
          </button>
        </form>
        <p className="small muted">
          {mappings.total.toLocaleString()} mappings · showing up to 100 matches
        </p>
        <div className="admin-table">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>EAN</th>
              </tr>
            </thead>
            <tbody>
              {mappings.rows.map((row) => (
                <tr key={row.ean}>
                  <td className="mono">{row.sku}</td>
                  <td className="mono">{row.ean}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!mappings.rows.length && <p className="muted">No mappings found.</p>}
        </div>
      </section>
    </div>
  );
}
