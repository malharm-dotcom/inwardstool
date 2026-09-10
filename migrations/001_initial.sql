CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (
  username text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE receipts (
  id uuid PRIMARY KEY,
  reference text NOT NULL UNIQUE CHECK (length(reference) BETWEEN 1 AND 100),
  supplier text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FINALIZED')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  finalized_by uuid REFERENCES users(id),
  CHECK ((status = 'OPEN' AND finalized_at IS NULL AND finalized_by IS NULL)
    OR (status = 'FINALIZED' AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL))
);
CREATE INDEX receipts_recent ON receipts(created_at DESC);
CREATE TABLE receipt_lines (
  receipt_id uuid NOT NULL REFERENCES receipts(id),
  sku text NOT NULL CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$'),
  quantity integer NOT NULL CHECK (quantity BETWEEN 0 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(receipt_id, sku)
);
CREATE TABLE receipt_events (
  request_id uuid PRIMARY KEY,
  receipt_id uuid NOT NULL REFERENCES receipts(id),
  sku text,
  kind text NOT NULL CHECK (kind IN ('SCAN','ADJUST','FINALIZE')),
  source text NOT NULL CHECK (source IN ('SCANNER','CAMERA','MANUAL')),
  delta integer NOT NULL,
  quantity_after integer,
  reason text NOT NULL DEFAULT '',
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receipt_events_history ON receipt_events(receipt_id, created_at DESC);
