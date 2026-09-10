import { body, requireUser, route } from "@/lib/api";
import {
  getReceipt,
  scanReceipt,
  adjustReceipt,
  finalizeReceipt,
} from "@/lib/receipts";
import { HttpError } from "@/lib/validation";
import type { ScanInput, AdjustmentInput } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return route(async () => {
    await requireUser();
    return Response.json(await getReceipt((await context.params).id));
  });
}
export async function POST(request: Request, context: Context) {
  return route(async () => {
    const user = await requireUser();
    const input = await body(request);
    if (input.actorId !== user.id)
      throw new HttpError(
        401,
        "The signed-in account changed. Sign in with the original account to save its pending work.",
      );
    const { id } = await context.params;
    if (input.action === "scan")
      await scanReceipt(id, input as unknown as ScanInput, user.id);
    else if (input.action === "adjust")
      await adjustReceipt(id, input as unknown as AdjustmentInput, user.id);
    else if (input.action === "finalize") await finalizeReceipt(id, user.id);
    else throw new HttpError(400, "Unknown receipt action.");
    return Response.json(await getReceipt(id));
  });
}
