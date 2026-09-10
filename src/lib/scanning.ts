import type { ScanInput } from "./types";
import { skuCode, uuid } from "./validation";

export class CameraGate {
  private last = "";
  private missingSince: number | null = null;
  accept(code: string | null, time: number): boolean {
    if (!code) {
      this.missingSince ??= time;
      // ponytail: absence is a camera heuristic; use a hardware scanner for reliable high-volume counting.
      if (time - this.missingSince >= 1000) this.last = "";
      return false;
    }
    this.missingSince = null;
    if (this.last) return false;
    this.last = code;
    return true;
  }
}
export function parseQueue(raw: string | null): ScanInput[] {
  if (raw === null) return [];
  const items: unknown = JSON.parse(raw);
  if (!Array.isArray(items) || items.length > 10000)
    throw new Error("Invalid pending scan data.");
  const ids = new Set<string>();
  return items.map((item) => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid pending scan.");
    const requestId = uuid(item.requestId);
    if (
      ids.has(requestId) ||
      !["SCANNER", "CAMERA", "MANUAL"].includes(item.source)
    )
      throw new Error("Invalid pending scan.");
    ids.add(requestId);
    return {
      requestId,
      sku: skuCode(item.sku),
      shelfCode: skuCode(item.shelfCode, "Shelf code"),
      source: item.source,
    };
  });
}
