export type User = {
  id: string;
  username: string;
  display_name: string;
  role: "ADMIN" | "STAFF";
};
export type Receipt = {
  id: string;
  reference: string;
  po_number: string;
  closing_remarks: string;
  supplier: string;
  notes: string;
  status: "OPEN" | "FINALIZED" | "DISCARDED";
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  created_by_name: string;
  finalized_by_name: string | null;
};
export type Line = {
  sku: string;
  shelf_code: string;
  quantity: number;
  updated_at: string;
};
export type ReceiptEvent = {
  scanned_code: string | null;
  request_id: string;
  sku: string | null;
  shelf_code: string | null;
  kind: "SCAN" | "ADJUST" | "FINALIZE" | "REMARK";
  source: "SCANNER" | "CAMERA" | "MANUAL";
  delta: number;
  quantity_after: number | null;
  reason: string;
  created_at: string;
  user_name: string;
};
export type ReceiptDetail = Receipt & { lines: Line[]; events: ReceiptEvent[] };
export type ReceiptSummary = Receipt & { units: number; sku_count: number };
export type ScanInput = {
  requestId: string;
  sku: string;
  shelfCode: string;
  source: "SCANNER" | "CAMERA" | "MANUAL";
};
export type AdjustmentInput = {
  requestId: string;
  sku: string;
  shelfCode: string;
  quantity: number;
  expectedQuantity: number;
  reason: string;
};
