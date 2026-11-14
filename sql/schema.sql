-- Smart Order Management - skema database
-- Dijalankan otomatis oleh container postgres saat pertama kali dibuat
-- (file ini di-mount ke /docker-entrypoint-initdb.d/).

CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,
  order_id        TEXT        NOT NULL,          -- id pesanan dari sumber (mis. ORD-1001, #1001 Shopify)
  source          TEXT        NOT NULL DEFAULT 'web',
  customer_name   TEXT,
  email           TEXT,
  phone           TEXT,                          -- format 628xxxxxxxxx
  address         TEXT,
  city            TEXT,
  postal_code     TEXT,
  items           JSONB       NOT NULL DEFAULT '[]'::jsonb,
  item_qty        INTEGER     NOT NULL DEFAULT 0,
  payment_method  TEXT,
  total           NUMERIC(14,2) NOT NULL DEFAULT 0,
  risk_score      INTEGER     NOT NULL DEFAULT 0,
  risk_level      TEXT,                          -- LOW | MEDIUM | HIGH
  risk_reasons    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tags            JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- klasifikasi: high_value, bulk, cod, ...
  ai_verdict      TEXT,                          -- APPROVE | REVIEW | REJECT
  ai_confidence   NUMERIC(3,2),
  ai_reason       TEXT,
  status          TEXT        NOT NULL,          -- APPROVED_AUTO | PENDING_REVIEW | APPROVED_MANUAL | REJECTED | INVALID
  decided_by      TEXT,                          -- rules | ai | @username
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_source_order_id_key UNIQUE (source, order_id)
);

CREATE INDEX IF NOT EXISTS orders_phone_created_idx ON orders (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx        ON orders (status);

-- Jejak semua kejadian per pesanan (audit log)
CREATE TABLE IF NOT EXISTS order_logs (
  id          BIGSERIAL PRIMARY KEY,
  order_id    TEXT        NOT NULL,
  source      TEXT,
  action      TEXT        NOT NULL,              -- RECEIVED | DUPLICATE | INVALID | APPROVED_AUTO | PENDING_REVIEW | APPROVED_MANUAL | REJECTED
  actor       TEXT        NOT NULL DEFAULT 'system',
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_logs_order_idx ON order_logs (order_id, created_at);
