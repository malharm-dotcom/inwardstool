import { body, requireUser, route } from "@/lib/api";
import { createReceipt, listReceipts } from "@/lib/receipts";

export async function GET(request: Request) {
  return route(async () => {
    await requireUser();
    const params = new URL(request.url).searchParams;
    return Response.json(
      await listReceipts(
        params.get("q") ?? "",
        params.get("status") ?? "",
        Number(params.get("page")) || 1,
      ),
    );
  });
}
export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const input = await body(request);
    return Response.json(
      await createReceipt(
        input as { reference: string; supplier: string; notes: string },
        user.id,
      ),
      { status: 201 },
    );
  });
}
