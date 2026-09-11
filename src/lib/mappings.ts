import type { PoolClient } from "pg";
import { pool, transaction } from "./db";
import { assertAdmin } from "./admin";
import { HttpError, skuCode } from "./validation";

export type Mapping = { sku: string; ean: string };
export function validateMappings(value: unknown): Mapping[] {
  if (!Array.isArray(value) || !value.length || value.length > 50000)
    throw new HttpError(400, "Import 1–50,000 mapping rows at a time.");
  const unique = new Map<string, string>();
  for (const [index, row] of value.entries()) {
    if (!row || typeof row !== "object")
      throw new HttpError(400, `Invalid row ${index + 2}.`);
    const sku = skuCode(row.sku);
    if (typeof row.ean !== "string" || !/^\d{8,14}$/.test(row.ean.trim()))
      throw new HttpError(
        400,
        `Row ${index + 2}: EAN must be 8–14 digits stored as text, without scientific notation.`,
      );
    const ean = row.ean.trim();
    if (unique.has(ean) && unique.get(ean) !== sku)
      throw new HttpError(
        400,
        `Row ${index + 2}: EAN ${ean} has conflicting SKUs.`,
      );
    unique.set(ean, sku);
  }
  return Array.from(unique, ([ean, sku]) => ({ ean, sku }));
}
export function parseMappingCsv(csv: string): Mapping[] {
  // Codes cannot contain commas or newlines, so a strict two-column CSV needs no general CSV engine.
  const lines = csv
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim());
  const cells = (line: string) =>
    line.split(",").map((cell) => {
      const value = cell.trim();
      if (/^"[^"]*"$/.test(value)) return value.slice(1, -1);
      if (value.includes('"'))
        throw new HttpError(
          400,
          "Invalid CSV quoting. Use the supplied SKU,EAN template.",
        );
      return value;
    });
  const headers = cells(lines.shift() ?? "").map((value) =>
    value.toUpperCase(),
  );
  if (
    headers.length !== 2 ||
    !headers.includes("SKU") ||
    !headers.includes("EAN")
  )
    throw new HttpError(400, "CSV must have exactly two headers: SKU,EAN.");
  return validateMappings(
    lines.map((line, index) => {
      const values = cells(line);
      if (values.length !== 2)
        throw new HttpError(400, `Row ${index + 2}: expected two columns.`);
      return {
        sku: values[headers.indexOf("SKU")],
        ean: values[headers.indexOf("EAN")],
      };
    }),
  );
}
export async function importMappings(actorId: string, input: unknown) {
  await assertAdmin(actorId);
  const rows = validateMappings(input);
  return transaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(71003003)");
    const conflict = await client.query(
      `SELECT m.ean FROM barcode_mappings m JOIN jsonb_to_recordset($1::jsonb) AS x(ean text,sku text) ON m.ean=x.ean WHERE m.sku<>x.sku LIMIT 1`,
      [JSON.stringify(rows)],
    );
    if (conflict.rowCount)
      throw new HttpError(
        409,
        `EAN ${conflict.rows[0].ean} already maps to another SKU. No rows imported.`,
      );
    const result = await client.query(
      `INSERT INTO barcode_mappings(ean,sku,imported_by)
      SELECT x.ean,x.sku,$2 FROM jsonb_to_recordset($1::jsonb) AS x(ean text,sku text)
      ON CONFLICT(ean) DO NOTHING RETURNING ean`,
      [JSON.stringify(rows), actorId],
    );
    return {
      added: result.rowCount ?? 0,
      unchanged: rows.length - (result.rowCount ?? 0),
    };
  });
}
export async function resolveScan(client: PoolClient, code: string) {
  const mapped = await client.query<{ sku: string }>(
    "SELECT sku FROM barcode_mappings WHERE ean=$1",
    [code],
  );
  if (mapped.rows[0]) return mapped.rows[0].sku;
  if (/^\d+$/.test(code)) {
    const knownSku = await client.query(
      "SELECT 1 FROM barcode_mappings WHERE sku=$1 LIMIT 1",
      [code],
    );
    if (!knownSku.rowCount)
      throw new HttpError(
        400,
        `Barcode ${code} is not mapped. Ask an admin to import its SKU–EAN mapping, then retry pending scans.`,
      );
  }
  return code;
}
export async function listMappings(actorId: string, search = "") {
  await assertAdmin(actorId);
  const q = search.slice(0, 128).replace(/[\\%_]/g, "\\$&");
  const rows = await pool.query(
    "SELECT ean,sku FROM barcode_mappings WHERE ean ILIKE $1 OR sku ILIKE $1 ORDER BY sku,ean LIMIT 100",
    [`%${q}%`],
  );
  const count = await pool.query(
    "SELECT count(*)::int AS total FROM barcode_mappings",
  );
  return { rows: rows.rows as Mapping[], total: count.rows[0].total as number };
}
