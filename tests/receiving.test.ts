import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
) {
  throw new Error(
    "TEST_DATABASE_URL must name a dedicated database ending in _test.",
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { pool } = await import("../src/lib/db");
const {
  createReceipt,
  scanReceipt,
  adjustReceipt,
  finalizeReceipt,
  getReceipt,
} = await import("../src/lib/receipts");
const { hashPassword, verifyPassword, signIn, getSession } =
  await import("../src/lib/auth");
const { receiptCsv } = await import("../src/lib/csv");

after(async () => {
  await pool.end();
});

test("receiving preserves piece counts through retries, concurrency, correction and finalization", async () => {
  const username = `test-${randomUUID()}`;
  const userId = randomUUID();
  await pool.query(
    "INSERT INTO users (id, username, display_name, password_hash) VALUES ($1,$2,$3,$4)",
    [
      userId,
      username,
      "Test Operator",
      await hashPassword("test-password-123"),
    ],
  );
  const receipt = await createReceipt(
    {
      reference: `TEST-${randomUUID()}`,
      supplier: 'Supplier, "One"',
      notes: "",
    },
    userId,
  );
  const firstId = randomUUID();
  const first = {
    requestId: firstId,
    sku: "4MST2268-03-L",
    shelfCode: "FRONT_OFFICE",
    source: "SCANNER" as const,
  };
  await scanReceipt(receipt.id, first, userId);
  await scanReceipt(receipt.id, first, userId);
  await Promise.all(
    Array.from({ length: 4 }, () =>
      scanReceipt(receipt.id, { ...first, requestId: randomUUID() }, userId),
    ),
  );
  let saved = await getReceipt(receipt.id);
  assert.equal(saved.lines[0].quantity, 5);
  assert.equal(saved.events.length, 5);
  await scanReceipt(
    receipt.id,
    { ...first, requestId: randomUUID(), shelfCode: "RACK_A01" },
    userId,
  );
  saved = await getReceipt(receipt.id);
  assert.equal(saved.lines.length, 2);
  assert.equal(
    saved.lines.find((line) => line.shelf_code === "FRONT_OFFICE")?.quantity,
    5,
  );
  assert.equal(
    saved.lines.find((line) => line.shelf_code === "RACK_A01")?.quantity,
    1,
  );
  await assert.rejects(
    scanReceipt(receipt.id, { ...first, shelfCode: "RACK_A01" }, userId),
    /request|conflict/i,
  );
  await assert.rejects(
    scanReceipt(receipt.id, { ...first, sku: "DIFFERENT" }, userId),
    /request|conflict/i,
  );
  await assert.rejects(
    scanReceipt(
      receipt.id,
      { ...first, requestId: randomUUID(), sku: "=SUM(1)" },
      userId,
    ),
    /SKU/i,
  );
  await assert.rejects(
    scanReceipt(
      receipt.id,
      { ...first, requestId: randomUUID(), shelfCode: "" },
      userId,
    ),
    /shelf/i,
  );
  await assert.rejects(
    adjustReceipt(
      receipt.id,
      {
        requestId: randomUUID(),
        sku: first.sku,
        shelfCode: first.shelfCode,
        quantity: 2,
        expectedQuantity: 4,
        reason: "Recount",
      },
      userId,
    ),
    /changed/i,
  );
  await adjustReceipt(
    receipt.id,
    {
      requestId: randomUUID(),
      sku: first.sku,
      shelfCode: first.shelfCode,
      quantity: 3,
      expectedQuantity: 5,
      reason: "Two tags scanned twice",
    },
    userId,
  );
  saved = await getReceipt(receipt.id);
  assert.equal(saved.lines[0].quantity, 3);
  assert.equal(saved.events[0].delta, -2);
  await finalizeReceipt(receipt.id, userId);
  // A lost response can be retried even after another operator finalized the receipt.
  await scanReceipt(receipt.id, first, userId);
  await assert.rejects(
    scanReceipt(receipt.id, { ...first, requestId: randomUUID() }, userId),
    /finalized/i,
  );
  await assert.rejects(
    adjustReceipt(
      receipt.id,
      {
        requestId: randomUUID(),
        sku: first.sku,
        shelfCode: first.shelfCode,
        quantity: 1,
        expectedQuantity: 3,
        reason: "Recount",
      },
      userId,
    ),
    /finalized/i,
  );
  saved = await getReceipt(receipt.id);
  assert.equal(saved.status, "FINALIZED");
  const csv = receiptCsv(saved);
  assert.equal(
    csv,
    "Adjustment Type,Product Code,Shelf Code,Quantity\r\nADD,4MST2268-03-L,FRONT_OFFICE,3\r\nADD,4MST2268-03-L,RACK_A01,1\r\n",
  );
  assert.equal(receiptCsv(await getReceipt(receipt.id)), csv);
  const empty = await createReceipt(
    { reference: `EMPTY-${randomUUID()}`, supplier: "", notes: "" },
    userId,
  );
  await assert.rejects(finalizeReceipt(empty.id, userId), /empty/i);
  await assert.rejects(
    createReceipt(
      { reference: receipt.reference, supplier: "", notes: "" },
      userId,
    ),
    /invoice/i,
  );
});

test("password verification and database sessions reject wrong credentials", async () => {
  const hash = await hashPassword("correct-password");
  assert.equal(await verifyPassword("correct-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
  const username = `auth-${randomUUID()}`;
  await pool.query(
    "INSERT INTO users (id, username, display_name, password_hash) VALUES ($1,$2,$3,$4)",
    [randomUUID(), username, "Operator", hash],
  );
  await assert.rejects(
    signIn(username, "wrong-password"),
    /username or password/i,
  );
  const token = await signIn(username, "correct-password");
  assert.equal((await getSession(token))?.username, username);
  assert.equal(await getSession("invalid"), null);
});

test("PO numbers repeat, invoice numbers remain unique and closing remarks do not change stock", async () => {
  const { saveClosingRemarks } = await import("../src/lib/receipts");
  const id = randomUUID();
  await pool.query(
    "INSERT INTO users(id,username,display_name,password_hash) VALUES ($1,$2,'Test','unused')",
    [id, `po-${id}`],
  );
  const details = {
    reference: `INV-${randomUUID()}`,
    poNumber: "REPEATED-PO",
    supplier: "",
    notes: "",
  };
  const first = await createReceipt(details, id);
  const second = await createReceipt(
    { ...details, reference: `INV-${randomUUID()}` },
    id,
  );
  assert.equal(first.po_number, second.po_number);
  await assert.rejects(
    createReceipt({ ...details, poNumber: "ANOTHER-PO" }, id),
    /invoice/i,
  );
  await assert.rejects(
    saveClosingRemarks(first.id, id, "Before closing", ""),
    /close/i,
  );
  await scanReceipt(
    first.id,
    {
      requestId: randomUUID(),
      sku: "SKU-REMARKS",
      shelfCode: "RACK_A",
      source: "SCANNER",
    },
    id,
  );
  await finalizeReceipt(first.id, id);
  const before = receiptCsv(await getReceipt(first.id));
  await saveClosingRemarks(first.id, id, "Received in good condition", "");
  await assert.rejects(
    saveClosingRemarks(first.id, id, "Stale change", ""),
    /changed/i,
  );
  const saved = await getReceipt(first.id);
  assert.equal(saved.closing_remarks, "Received in good condition");
  assert.equal(saved.events[0].kind, "REMARK");
  assert.equal(receiptCsv(saved), before);
});
