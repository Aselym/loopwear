CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY, name_tr TEXT NOT NULL, name_en TEXT NOT NULL, campus_label TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', default_station_id TEXT REFERENCES stations(id), wallet_balance INT NOT NULL DEFAULT 0,
  public_code TEXT NOT NULL UNIQUE, lang TEXT NOT NULL DEFAULT 'tr', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), client_key TEXT, category TEXT NOT NULL, material TEXT NOT NULL,
  size TEXT NOT NULL, condition TEXT NOT NULL, condition_source TEXT NOT NULL DEFAULT 'user', color TEXT NOT NULL,
  station_id TEXT NOT NULL REFERENCES stations(id), point_value INT NOT NULL, status TEXT NOT NULL,
  drop_token TEXT UNIQUE, drop_token_used BOOLEAN NOT NULL DEFAULT FALSE, status_reason TEXT, scoring_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), ready_at TIMESTAMPTZ, UNIQUE(owner_id, client_key)
);
CREATE INDEX IF NOT EXISTS items_status ON items(status);
CREATE INDEX IF NOT EXISTS items_owner ON items(owner_id);
CREATE TABLE IF NOT EXISTS item_images (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, data BYTEA NOT NULL,
  mime TEXT NOT NULL, sort_order INT NOT NULL, image_type TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_item ON item_images(item_id);
CREATE TABLE IF NOT EXISTS impact_snapshots (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE, weight_kg REAL, co2_factor REAL, water_factor REAL,
  co2e_reference DOUBLE PRECISION, water_reference DOUBLE PRECISION, methodology_version TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), item_id TEXT, type TEXT NOT NULL, amount INT NOT NULL,
  balance_after INT NOT NULL, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tx_user ON transactions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), buyer_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL,
  amount INT NOT NULL, requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), approved_at TIMESTAMPTZ, pickup_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ, qr_token TEXT UNIQUE, qr_used BOOLEAN NOT NULL DEFAULT FALSE, reason TEXT
);
CREATE INDEX IF NOT EXISTS res_item ON reservations(item_id);
CREATE INDEX IF NOT EXISTS res_buyer ON reservations(buyer_id);
CREATE UNIQUE INDEX IF NOT EXISTS res_one_active ON reservations(item_id) WHERE status IN ('PENDING_PICKUP','PICKUP_READY');
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL REFERENCES reservations(id), status TEXT NOT NULL, reason TEXT,
  decision_reason TEXT, requested_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ret_one_open ON returns(reservation_id) WHERE status='PENDING';
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id TEXT NOT NULL REFERENCES users(id), item_id TEXT NOT NULL REFERENCES items(id), active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id, item_id)
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id), item_id TEXT NOT NULL REFERENCES items(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, item_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, reservation_id TEXT NOT NULL UNIQUE REFERENCES reservations(id), reviewer_id TEXT NOT NULL REFERENCES users(id),
  reviewed_owner_id TEXT NOT NULL REFERENCES users(id), score INT NOT NULL CHECK (score BETWEEN 1 AND 5), comment TEXT,
  hidden BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, params JSONB NOT NULL DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, actor_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
  old_value TEXT, new_value TEXT, reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_time ON audit_log(created_at DESC);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, message TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS support_status ON support_requests(status, created_at);
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY, lang TEXT NOT NULL, title TEXT NOT NULL, source TEXT, url TEXT, summary_tr TEXT, summary_en TEXT, body TEXT,
  image BYTEA, image_mime TEXT, published_on DATE, created_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY, name_tr TEXT NOT NULL, name_en TEXT NOT NULL, points INT NOT NULL, stock INT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gift_orders (
  id TEXT PRIMARY KEY, gift_id TEXT NOT NULL REFERENCES gifts(id), user_id TEXT NOT NULL REFERENCES users(id), amount INT NOT NULL,
  status TEXT NOT NULL, qr_token TEXT UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), redeemed_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS tour_seen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS desc_tr TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS desc_en TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS unlimited BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS instant BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS impact_co2 DOUBLE PRECISION;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS impact_water DOUBLE PRECISION;
