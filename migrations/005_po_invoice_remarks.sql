-- Existing unique references become invoice numbers; old receipts have no known PO.
ALTER TABLE receipts ADD COLUMN po_number text NOT NULL DEFAULT '';
ALTER TABLE receipts ADD COLUMN closing_remarks text NOT NULL DEFAULT '';
ALTER TABLE receipt_events DROP CONSTRAINT receipt_events_kind_check;
ALTER TABLE receipt_events ADD CONSTRAINT receipt_events_kind_check CHECK (kind IN ('SCAN','ADJUST','FINALIZE','REMARK'));
