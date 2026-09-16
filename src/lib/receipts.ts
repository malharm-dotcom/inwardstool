import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, transaction } from "./db";
import { resolveScan } from "./mappings";
import { assertAdmin } from "./admin";
import { HttpError, quantity, skuCode, text, uuid } from "./validation";
import type {
  AdjustmentInput,
  Line,
  Receipt,
  ReceiptDetail,
  ReceiptEvent,
  ReceiptSummary,
  ScanInput,
} from "./types";

const receiptSelect = `SELECT r.*, CASE WHEN r.discarded_at IS NOT NULL THEN 'DISCARDED' ELSE r.status END AS status, u.display_name AS created_by_name, f.display_name AS finalized_by_name
  FROM receipts r JOIN users u ON u.id=r.created_by LEFT JOIN users f ON f.id=r.finalized_by`;

export async function createReceipt(
  input: { reference: string; supplier: string; notes: string },
  userId: string,
): Promise<Receipt> {
  const reference = text(input.reference, "Delivery reference", 100);
  const supplier = text(input.supplier ?? "", "Supplier", 200, false);
  const notes = text(input.notes ?? "", "Notes", 2000, false);
  try {
    const result = await pool.query<Receipt>(
      `INSERT INTO receipts(id,reference,supplier,notes,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [randomUUID(), reference, supplier, notes, userId],
    );
    return result.rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new HttpError(
        409,
        "This delivery reference already exists. Open the existing receipt or use a different reference.",
      );
    throw error;
  }
}
export async function listReceipts(search = "", status = "", page = 1) {
  const pattern = `%${text(search, "Search", 100, false).replace(/[\\%_]/g, "\\$&")}%`;
  const values = [
    pattern,
    ["OPEN", "FINALIZED", "DISCARDED"].includes(status) ? status : "",
  ];
  const where =
    "WHERE (r.reference ILIKE $1 OR r.supplier ILIKE $1) AND (($2='DISCARDED' AND r.discarded_at IS NOT NULL) OR ($2<>'DISCARDED' AND r.discarded_at IS NULL AND ($2='' OR r.status=$2)))";
  const count = await pool.query(
    `SELECT count(*)::int AS count FROM receipts r ${where}`,
    values,
  );
  const rows = await pool.query<ReceiptSummary>(
    `${receiptSelect.replace("SELECT r.*", "SELECT r.*, totals.units, totals.sku_count")}
    LEFT JOIN LATERAL (SELECT coalesce(sum(l.quantity),0)::int AS units, count(DISTINCT coalesce(m.sku,l.sku)) FILTER (WHERE l.quantity>0)::int AS sku_count FROM receipt_lines l LEFT JOIN barcode_mappings m ON m.ean=l.sku WHERE receipt_id=r.id) totals ON true
    ${where} ORDER BY r.created_at DESC LIMIT 30 OFFSET $3`,
    [...values, (Math.max(1, Math.min(page, 100000)) - 1) * 30],
  );
  return { receipts: rows.rows, total: count.rows[0].count as number };
}
export async function getReceipt(id: string): Promise<ReceiptDetail> {
  uuid(id);
  return transaction(async (client) => {
    const result = await client.query<Receipt>(
      `${receiptSelect} WHERE r.id=$1 FOR UPDATE OF r`,
      [id],
    );
    if (!result.rows[0]) throw new HttpError(404, "Receipt not found.");
    if (result.rows[0].status !== "DISCARDED")
      await reconcileMappedLines(client, id);
    const lines = await client.query<Line>(
      "SELECT sku,shelf_code,quantity,updated_at FROM receipt_lines WHERE receipt_id=$1 ORDER BY updated_at DESC,sku,shelf_code",
      [id],
    );
    const events = await client.query<ReceiptEvent>(
      `SELECT e.*,u.display_name AS user_name FROM receipt_events e JOIN users u ON u.id=e.user_id
      WHERE e.receipt_id=$1 ORDER BY e.created_at DESC,e.request_id DESC LIMIT 100`,
      [id],
    );
    return { ...result.rows[0], lines: lines.rows, events: events.rows };
  });
}
async function lockReceipt(client: PoolClient, id: string) {
  const result = await client.query<{ status: string }>(
    "SELECT CASE WHEN discarded_at IS NOT NULL THEN 'DISCARDED' ELSE status END AS status FROM receipts WHERE id=$1 FOR UPDATE",
    [uuid(id)],
  );
  if (!result.rows[0]) throw new HttpError(404, "Receipt not found.");
  if (result.rows[0].status === "DISCARDED")
    throw new HttpError(409, "This receipt has been discarded.");
  await reconcileMappedLines(client, id);
  return result.rows[0];
}

// Caller holds the receipt row lock; retain original audit events for retry identity.
async function reconcileMappedLines(client: PoolClient, id: string) {
  const aliases = await client.query<{
    sku: string;
    shelf_code: string;
    quantity: number;
    target: string;
  }>(
    `SELECT l.sku,l.shelf_code,l.quantity,m.sku AS target FROM receipt_lines l
     JOIN barcode_mappings m ON m.ean=l.sku WHERE l.receipt_id=$1 AND l.sku<>m.sku ORDER BY l.sku,l.shelf_code`,
    [id],
  );
  for (const line of aliases.rows) {
    const current = await client.query(
      "SELECT quantity FROM receipt_lines WHERE receipt_id=$1 AND sku=$2 AND shelf_code=$3",
      [id, line.target, line.shelf_code],
    );
    const total = quantity(line.quantity + (current.rows[0]?.quantity ?? 0));
    await client.query(
      `INSERT INTO receipt_lines(receipt_id,sku,shelf_code,quantity) VALUES ($1,$2,$3,$4)
      ON CONFLICT(receipt_id,sku,shelf_code) DO UPDATE SET quantity=$4,updated_at=clock_timestamp()`,
      [id, line.target, line.shelf_code, total],
    );
    await client.query(
      "DELETE FROM receipt_lines WHERE receipt_id=$1 AND sku=$2 AND shelf_code=$3",
      [id, line.sku, line.shelf_code],
    );
  }
}

export async function discardReceipt(id: string, userId: string) {
  await assertAdmin(userId);
  await transaction(async (client) => {
    await client.query("SELECT id FROM receipts WHERE id=$1 FOR UPDATE", [
      uuid(id),
    ]);
    const result = await client.query(
      "UPDATE receipts SET discarded_at=coalesce(discarded_at,now()),discarded_by=coalesce(discarded_by,$2),updated_at=now() WHERE id=$1 RETURNING id",
      [id, userId],
    );
    if (!result.rowCount) throw new HttpError(404, "Receipt not found.");
  });
}
async function previousRequest(
  client: PoolClient,
  id: string,
  requestId: string,
  sku: string,
  shelfCode: string,
  kind: string,
  userId: string,
  target?: number,
  reason?: string,
) {
  const result = await client.query(
    "SELECT * FROM receipt_events WHERE request_id=$1",
    [uuid(requestId)],
  );
  const previous = result.rows[0];
  if (!previous) return false;
  if (
    previous.receipt_id !== id ||
    previous.sku !== sku ||
    previous.shelf_code !== shelfCode ||
    previous.kind !== kind ||
    previous.user_id !== userId ||
    (target !== undefined &&
      (previous.quantity_after !== target || previous.reason !== reason))
  ) {
    throw new HttpError(
      409,
      "Request ID conflict. This request was already used for another change.",
    );
  }
  return true;
}
export async function scanReceipt(
  id: string,
  input: ScanInput,
  userId: string,
): Promise<void> {
  const scannedCode = skuCode(input.sku),
    shelfCode = skuCode(input.shelfCode, "Shelf code");
  if (!["SCANNER", "CAMERA", "MANUAL"].includes(input.source))
    throw new HttpError(400, "Invalid scan source.");
  await transaction(async (client) => {
    const receipt = await lockReceipt(client, id);
    const previous = (
      await client.query(
        "SELECT scanned_code,sku FROM receipt_events WHERE request_id=$1",
        [uuid(input.requestId)],
      )
    ).rows[0];
    if (previous && previous.scanned_code !== scannedCode)
      throw new HttpError(
        409,
        "Request ID conflict. This request was already used for another change.",
      );
    const sku = previous?.sku ?? (await resolveScan(client, scannedCode));
    if (
      await previousRequest(
        client,
        id,
        input.requestId,
        sku,
        shelfCode,
        "SCAN",
        userId,
      )
    )
      return;
    if (receipt.status !== "OPEN")
      throw new HttpError(
        409,
        "This receipt is finalized. No more scans can be added.",
      );
    const current = await client.query<Line>(
      "SELECT quantity FROM receipt_lines WHERE receipt_id=$1 AND sku=$2 AND shelf_code=$3",
      [id, sku, shelfCode],
    );
    const next = quantity((current.rows[0]?.quantity ?? 0) + 1);
    await client.query(
      `INSERT INTO receipt_lines(receipt_id,sku,shelf_code,quantity) VALUES ($1,$2,$3,$4)
      ON CONFLICT (receipt_id,sku,shelf_code) DO UPDATE SET quantity=$4,updated_at=clock_timestamp()`,
      [id, sku, shelfCode, next],
    );
    await client.query(
      `INSERT INTO receipt_events(request_id,receipt_id,sku,shelf_code,kind,source,delta,quantity_after,user_id,scanned_code,created_at)
      VALUES ($1,$2,$3,$4,'SCAN',$5,1,$6,$7,$8,clock_timestamp())`,
      [
        input.requestId,
        id,
        sku,
        shelfCode,
        input.source,
        next,
        userId,
        scannedCode,
      ],
    );
    await client.query(
      "UPDATE receipts SET updated_at=clock_timestamp() WHERE id=$1",
      [id],
    );
  });
}
export async function adjustReceipt(
  id: string,
  input: AdjustmentInput,
  userId: string,
): Promise<void> {
  const sku = skuCode(input.sku),
    shelfCode = skuCode(input.shelfCode, "Shelf code"),
    target = quantity(input.quantity),
    expected = quantity(input.expectedQuantity);
  const reason = text(input.reason, "Correction reason", 300);
  await transaction(async (client) => {
    const receipt = await lockReceipt(client, id);
    if (
      await previousRequest(
        client,
        id,
        input.requestId,
        sku,
        shelfCode,
        "ADJUST",
        userId,
        target,
        reason,
      )
    )
      return;
    if (receipt.status !== "OPEN")
      throw new HttpError(
        409,
        "This receipt is finalized. Quantities are locked.",
      );
    const current = await client.query<Line>(
      "SELECT quantity FROM receipt_lines WHERE receipt_id=$1 AND sku=$2 AND shelf_code=$3",
      [id, sku, shelfCode],
    );
    if (!current.rows[0])
      throw new HttpError(404, "SKU not found on this receipt.");
    if (current.rows[0].quantity !== expected)
      throw new HttpError(
        409,
        "Quantity changed since you opened this correction. Refresh and review the current quantity.",
      );
    if (target === expected)
      throw new HttpError(
        400,
        "Enter a different quantity to record a correction.",
      );
    await client.query(
      "UPDATE receipt_lines SET quantity=$4,updated_at=clock_timestamp() WHERE receipt_id=$1 AND sku=$2 AND shelf_code=$3",
      [id, sku, shelfCode, target],
    );
    await client.query(
      `INSERT INTO receipt_events(request_id,receipt_id,sku,shelf_code,kind,source,delta,quantity_after,reason,user_id,created_at)
      VALUES ($1,$2,$3,$4,'ADJUST','MANUAL',$5,$6,$7,$8,clock_timestamp())`,
      [
        input.requestId,
        id,
        sku,
        shelfCode,
        target - expected,
        target,
        reason,
        userId,
      ],
    );
    await client.query(
      "UPDATE receipts SET updated_at=clock_timestamp() WHERE id=$1",
      [id],
    );
  });
}
export async function finalizeReceipt(
  id: string,
  userId: string,
): Promise<void> {
  await transaction(async (client) => {
    const receipt = await lockReceipt(client, id);
    if (receipt.status === "FINALIZED") return;
    if (
      (
        await client.query(
          "SELECT 1 FROM receipt_lines WHERE receipt_id=$1 AND quantity>0 AND shelf_code='' LIMIT 1",
          [id],
        )
      ).rowCount
    )
      throw new HttpError(
        409,
        "A destination shelf is missing on an old receipt line. Resolve its shelf before finalizing.",
      );
    const total = await client.query(
      "SELECT coalesce(sum(quantity),0)::int AS units FROM receipt_lines WHERE receipt_id=$1",
      [id],
    );
    if (total.rows[0].units === 0)
      throw new HttpError(400, "An empty receipt cannot be finalized.");
    await client.query(
      "UPDATE receipts SET status='FINALIZED',finalized_at=clock_timestamp(),finalized_by=$2,updated_at=clock_timestamp() WHERE id=$1",
      [id, userId],
    );
    await client.query(
      `INSERT INTO receipt_events(request_id,receipt_id,kind,source,delta,user_id,created_at) VALUES ($1,$2,'FINALIZE','MANUAL',0,$3,clock_timestamp())`,
      [randomUUID(), id, userId],
    );
  });
}
