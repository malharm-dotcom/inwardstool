import type { ReceiptDetail } from "./types";
import { HttpError, skuCode } from "./validation";

function cell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function receiptCsv(receipt: ReceiptDetail): string {
  if (receipt.status !== "FINALIZED")
    throw new HttpError(
      409,
      "Finalize the receipt before downloading its CSV.",
    );
  const rows = receipt.lines
    .filter((line) => line.quantity > 0)
    .sort((a, b) =>
      a.sku < b.sku
        ? -1
        : a.sku > b.sku
          ? 1
          : a.shelf_code < b.shelf_code
            ? -1
            : a.shelf_code > b.shelf_code
              ? 1
              : 0,
    )
    .map((line) =>
      [
        "ADD",
        skuCode(line.sku),
        skuCode(line.shelf_code, "Shelf code"),
        line.quantity,
      ]
        .map(cell)
        .join(","),
    );
  return ["Adjustment Type,Product Code,Shelf Code,Quantity", ...rows, ""].join(
    "\r\n",
  );
}
