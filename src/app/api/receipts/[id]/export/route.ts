import { requireUser, route } from "@/lib/api";
import { getReceipt } from "@/lib/receipts";
import { receiptCsv } from "@/lib/csv";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    await requireUser();
    const receipt = await getReceipt((await context.params).id);
    const filename = receipt.reference
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);
    return new Response(receiptCsv(receipt), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inwards-${filename}.csv"`,
      },
    });
  });
}
