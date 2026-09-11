ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'STAFF' CHECK (role IN ('ADMIN','STAFF'));
-- The original bootstrap account becomes the administrator; other accounts remain staff.
UPDATE users SET role='ADMIN' WHERE id=(SELECT id FROM users ORDER BY created_at,id LIMIT 1);
CREATE TABLE barcode_mappings (
  ean text PRIMARY KEY CHECK (ean ~ '^[0-9]{8,14}$'),
  sku text NOT NULL CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$'),
  imported_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX barcode_mappings_sku ON barcode_mappings(sku);
ALTER TABLE receipt_events ADD COLUMN scanned_code text;
UPDATE receipt_events SET scanned_code=sku WHERE kind='SCAN';
