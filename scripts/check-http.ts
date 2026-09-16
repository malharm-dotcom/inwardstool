import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import type { ReceiptDetail } from "../src/lib/types";

const base = new URL(process.env.APP_URL ?? "http://localhost:3100");
const database = new URL(process.env.DATABASE_URL ?? "");
if (
  ![base.hostname, database.hostname].every((host) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(host),
  )
) {
  throw new Error(
    "This HTTP check is restricted to a local app and local database.",
  );
}
const userId = randomUUID(),
  username = `http-${randomUUID()}`,
  password = randomUUID();
let receiptId: string | undefined;
let cookie = "";
let createdStaffId: string | undefined;
const mappingEan = "0" + String(Date.now()).slice(-12);
async function call(
  path: string,
  data?: unknown,
  method = "POST",
  origin = base.origin,
) {
  return fetch(new URL(path, base), {
    method: data === undefined ? "GET" : method,
    headers: {
      Cookie: cookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(30000),
  });
}
async function json<T>(path: string, data?: unknown): Promise<T> {
  const response = await call(path, data);
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  return result as T;
}

try {
  assert.equal((await call("/api/health")).status, 200);
  assert.equal((await call("/api/receipts")).status, 401);
  await pool.query(
    "INSERT INTO users(id,username,display_name,password_hash) VALUES ($1,$2,$3,$4)",
    [userId, username, "HTTP Test Operator", await hashPassword(password)],
  );
  const login = await call("/api/auth", { username, password });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=strict/i);
  cookie = setCookie.split(";")[0];
  assert.equal((await call("/api/admin/users")).status, 403);
  assert.equal((await call("/api/admin/mappings")).status, 403);
  assert.equal(
    (
      await call("/api/admin/users", {
        username: "forbidden",
        displayName: "Forbidden",
        password: "password-123456",
      })
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/admin/mappings", { csv: "SKU,EAN\nTEST,0012345678901" }))
      .status,
    403,
  );
  await pool.query("UPDATE users SET role='ADMIN' WHERE id=$1", [userId]);
  assert.equal((await call("/admin")).status, 200);
  const newStaff = await json<{ id: string; role: string }>(
    "/api/admin/users",
    {
      username: `new-${randomUUID()}`,
      displayName: "New Receiver",
      password: "test-password-123",
    },
  );
  createdStaffId = newStaff.id;
  assert.equal(newStaff.role, "STAFF");
  assert.equal(
    (
      await call(
        "/api/admin/users",
        { userId: newStaff.id, active: false },
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/admin/users", { userId: userId, active: false }, "PATCH"))
      .status,
    400,
  );
  assert.equal(
    (
      await call("/api/admin/mappings", {
        csv: `SKU,EAN\n4MST2268-03-L,${mappingEan}`,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/receipts",
        { reference: "SHOULD-NOT-EXIST" },
        "POST",
        "https://outside.example",
      )
    ).status,
    403,
  );
  const receipt = await json<{ id: string }>("/api/receipts", {
    reference: `HTTP-CHECK-${randomUUID()}`,
    supplier: "Local automated check",
    notes: "",
  });
  receiptId = receipt.id;
  const path = `/api/receipts/${receiptId}`;
  const scan = {
    action: "scan",
    actorId: userId,
    requestId: randomUUID(),
    sku: "4MST2268-03-L",
    shelfCode: "FRONT_OFFICE",
    source: "SCANNER",
  };
  assert.equal((await call(`${path}/export`)).status, 409);
  assert.equal(
    (await call(path, { ...scan, actorId: randomUUID() })).status,
    401,
  );
  assert.equal((await call(path, { ...scan, shelfCode: "" })).status, 400);
  await json(path, { ...scan, sku: mappingEan });
  await json(path, { ...scan, sku: mappingEan });
  await Promise.all(
    Array.from({ length: 4 }, () =>
      json(path, { ...scan, requestId: randomUUID() }),
    ),
  );
  await json(path, { ...scan, requestId: randomUUID(), shelfCode: "RACK_A01" });
  let saved = await json<ReceiptDetail>(path);
  assert.equal(
    saved.lines.find((line) => line.shelf_code === "FRONT_OFFICE")?.quantity,
    5,
  );
  assert.equal(
    saved.lines.find((line) => line.shelf_code === "RACK_A01")?.quantity,
    1,
  );
  const list = await json<{
    receipts: Array<{ id: string; units: number; sku_count: number }>;
  }>("/api/receipts?q=HTTP-CHECK");
  assert.equal(list.receipts.find((row) => row.id === receiptId)?.units, 6);
  assert.equal(list.receipts.find((row) => row.id === receiptId)?.sku_count, 1);
  for (const route of ["/", "/help", "/receipts/new", `/receipts/${receiptId}`])
    assert.equal((await call(route)).status, 200);
  saved = await json(path, {
    action: "adjust",
    actorId: userId,
    requestId: randomUUID(),
    sku: scan.sku,
    shelfCode: scan.shelfCode,
    expectedQuantity: 5,
    quantity: 3,
    reason: "Physical recount",
  });
  assert.equal(
    saved.lines.find((line) => line.shelf_code === "FRONT_OFFICE")?.quantity,
    3,
  );
  await json(path, { action: "finalize", actorId: userId });
  assert.equal(
    (await call(path, { ...scan, requestId: randomUUID() })).status,
    409,
  );
  const download = await call(`${path}/export`);
  assert.equal(download.status, 200);
  assert.match(
    download.headers.get("content-disposition")!,
    /attachment; filename="inwards-HTTP-CHECK-/,
  );
  assert.equal(
    await download.text(),
    "Adjustment Type,Product Code,Shelf Code,Quantity\r\nADD,4MST2268-03-L,FRONT_OFFICE,3\r\nADD,4MST2268-03-L,RACK_A01,1\r\n",
  );
  assert.equal(
    (await call(path, { action: "discard", actorId: userId })).status,
    200,
  );
  assert.equal((await call(`${path}/export`)).status, 409);
  assert.equal(
    (await call(path, { ...scan, requestId: randomUUID() })).status,
    409,
  );
  assert.equal((await call("/api/auth", {}, "DELETE")).status, 200);
  assert.equal((await call(path)).status, 401);
  console.log(
    "PASS: real HTTP login, access/origin/actor checks, multi-shelf scans, retry, concurrent counts, pages, correction, finalization, exact CSV, logout.",
  );
} finally {
  // Only records created by this invocation are removed; never reset application tables.
  if (receiptId) {
    await pool.query("DELETE FROM receipt_events WHERE receipt_id=$1", [
      receiptId,
    ]);
    await pool.query("DELETE FROM receipt_lines WHERE receipt_id=$1", [
      receiptId,
    ]);
    await pool.query("DELETE FROM receipts WHERE id=$1 AND created_by=$2", [
      receiptId,
      userId,
    ]);
  }
  await pool.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
  await pool.query("DELETE FROM barcode_mappings WHERE imported_by=$1", [
    userId,
  ]);
  if (createdStaffId)
    await pool.query("DELETE FROM users WHERE id=$1", [createdStaffId]);
  await pool.query("DELETE FROM login_attempts WHERE username=$1", [username]);
  await pool.query("DELETE FROM users WHERE id=$1 AND username=$2", [
    userId,
    username,
  ]);
  await pool.end();
}
