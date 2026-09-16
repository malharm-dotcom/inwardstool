ALTER TABLE receipts ADD COLUMN discarded_at timestamptz;
ALTER TABLE receipts ADD COLUMN discarded_by uuid REFERENCES users(id);
