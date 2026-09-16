import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test")
)
  throw new Error("Dedicated test database required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { pool } = await import("../src/lib/db");
after(() => pool.end());

test("admin access, atomic mapping import and EAN scans preserve SKU exports and retries", async () => {
  const { createStaff, setStaffActive, listStaff } =
    await import("../src/lib/admin");
  const { importMappings, parseMappingCsv } =
    await import("../src/lib/mappings");
  const { hashPassword, signIn, getSession } = await import("../src/lib/auth");
  const { createReceipt, scanReceipt, getReceipt, finalizeReceipt } =
    await import("../src/lib/receipts");
  const { receiptCsv } = await import("../src/lib/csv");
  const adminId = randomUUID();
  await pool.query(
    "INSERT INTO users(id,username,display_name,password_hash,role) VALUES ($1,$2,'Admin',$3,'ADMIN')",
    [adminId, `admin-${adminId}`, await hashPassword("test-password-123")],
  );
  const staff = await createStaff(adminId, {
    username: `staff-${randomUUID()}`,
    displayName: "Receiver",
    password: "test-password-123",
  });
  assert.equal(staff.role, "STAFF");
  await assert.rejects(
    createStaff(staff.id, {
      username: "blocked",
      displayName: "Blocked",
      password: "test-password-123",
    }),
    /admin/i,
  );
  await assert.rejects(listStaff(staff.id), /admin/i);
  await assert.rejects(setStaffActive(adminId, adminId, false), /own|admin/i);
  const token = await signIn(staff.username, "test-password-123");
  assert.equal((await getSession(token))?.role, "STAFF");
  await setStaffActive(adminId, staff.id, false);
  assert.equal(await getSession(token), null);
  await setStaffActive(adminId, staff.id, true);
  assert.equal(await getSession(token), null);
  assert.deepEqual(
    parseMappingCsv('\uFEFFSKU,EAN\r\n"TEST-L","0012345678901"\r\n'),
    [{ sku: "TEST-L", ean: "0012345678901" }],
  );
  assert.throws(
    () => parseMappingCsv("SKU,EAN\nTEST-L,1.234E+12"),
    /EAN|digits/i,
  );
  assert.throws(
    () => parseMappingCsv("SKU,EAN\nA,0012345678901\nB,0012345678901"),
    /conflict|different/i,
  );
  const ean = "0" + String(Date.now()).slice(-12);
  const sku = `MAP-${randomUUID()}`;
  await assert.rejects(importMappings(staff.id, [{ sku, ean }]), /admin/i);
  await importMappings(adminId, [{ sku, ean }]);
  const otherEan = "9" + ean.slice(1);
  await assert.rejects(
    importMappings(adminId, [
      { sku, ean: otherEan },
      { sku: "CONFLICT", ean },
    ]),
    /already|conflict/i,
  );
  assert.equal(
    (
      await pool.query("SELECT 1 FROM barcode_mappings WHERE ean=$1", [
        otherEan,
      ])
    ).rowCount,
    0,
  );
  const receipt = await createReceipt(
    { reference: `MAP-${randomUUID()}`, supplier: "", notes: "" },
    staff.id,
  );
  const input = {
    requestId: randomUUID(),
    sku: ean,
    shelfCode: "RACK_A",
    source: "SCANNER" as const,
  };
  await scanReceipt(receipt.id, input, staff.id);
  await scanReceipt(receipt.id, input, staff.id);
  await scanReceipt(
    receipt.id,
    { ...input, requestId: randomUUID(), sku },
    staff.id,
  );
  await assert.rejects(
    scanReceipt(
      receipt.id,
      { ...input, requestId: randomUUID(), sku: "99999999" },
      staff.id,
    ),
    /mapping|mapped/i,
  );
  await finalizeReceipt(receipt.id, staff.id);
  await pool.query("DELETE FROM barcode_mappings WHERE ean=$1", [ean]);
  await scanReceipt(receipt.id, input, staff.id);
  const saved = await getReceipt(receipt.id);
  assert.equal(saved.lines[0].quantity, 2);
  assert.equal(saved.lines[0].sku, sku);
  assert.equal(
    receiptCsv(saved),
    `Adjustment Type,Product Code,Shelf Code,Quantity\r\nADD,${sku},RACK_A,2\r\n`,
  );
  await pool.query(
    "INSERT INTO receipt_lines(receipt_id,sku,shelf_code,quantity) VALUES ($1,$2,$3,3)",
    [receipt.id, ean, "RACK_A"],
  );
  await importMappings(adminId, [{ sku, ean }]);
  const merged = await getReceipt(receipt.id);
  assert.equal(merged.lines.length, 1);
  assert.equal(merged.lines[0].sku, sku);
  assert.equal(merged.lines[0].quantity, 5);
  assert.equal((await getReceipt(receipt.id)).lines[0].quantity, 5);
  const { discardReceipt, listReceipts } = await import("../src/lib/receipts");
  await assert.rejects(discardReceipt(receipt.id, staff.id), /admin/i);
  await discardReceipt(receipt.id, adminId);
  await discardReceipt(receipt.id, adminId);
  const discarded = await getReceipt(receipt.id);
  assert.equal(discarded.status, "DISCARDED");
  assert.equal((await listReceipts(receipt.reference)).total, 0);
  assert.equal((await listReceipts(receipt.reference, "DISCARDED")).total, 1);
  assert.throws(() => receiptCsv(discarded), /discarded/i);
  await assert.rejects(
    scanReceipt(receipt.id, { ...input, requestId: randomUUID() }, staff.id),
    /discarded/i,
  );
  await assert.rejects(finalizeReceipt(receipt.id, staff.id), /discarded/i);
});
