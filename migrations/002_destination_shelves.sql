-- Keep any pre-shelf development rows visible, but never invent their destination.
ALTER TABLE receipt_lines ADD COLUMN shelf_code text NOT NULL DEFAULT '';
ALTER TABLE receipt_lines ALTER COLUMN shelf_code DROP DEFAULT;
ALTER TABLE receipt_lines DROP CONSTRAINT receipt_lines_pkey;
ALTER TABLE receipt_lines ADD PRIMARY KEY (receipt_id, sku, shelf_code);
ALTER TABLE receipt_lines ADD CONSTRAINT receipt_lines_shelf_code_valid
  CHECK (shelf_code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$') NOT VALID;
ALTER TABLE receipt_events ADD COLUMN shelf_code text;
