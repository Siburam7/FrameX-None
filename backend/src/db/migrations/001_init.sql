-- ==========================================================================
-- FrameX — Step 1 schema: users, roles, shops, shop applications, sessions,
-- one-time tokens (password reset / account setup) and the admin audit log.
--
--   users ──(role)── CUSTOMER | SHOP | ADMIN
--   users.shop_id ──> shops            a SHOP user belongs to exactly one shop
--   shops (address + latitude/longitude)  the shop's real location
--   shop_applications ──> shops        an application may become a shop
--   audit_logs.actor_user_id ──> users who approved / rejected / changed what
--
-- Step 2 tables (products, orders, carts, payments, reviews...) will reference
-- users.id and shops.id; nothing here needs to change for them.
-- ==========================================================================

CREATE TABLE shop_applications (
  id               uuid PRIMARY KEY,
  shop_name        text NOT NULL,
  owner_name       text NOT NULL,
  phone            text NOT NULL,
  email            text NOT NULL,
  address          text NOT NULL,
  city             text NOT NULL,
  state            text NOT NULL,
  postal_code      text NOT NULL,
  business_details text,
  message          text,
  status           text NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
  review_note      text,
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  shop_id          uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_applications_status_idx ON shop_applications (status, created_at DESC);
CREATE INDEX shop_applications_email_idx ON shop_applications (lower(email));

-- Shop IDs: FRX-SHOP-1001, FRX-SHOP-1002, ...
CREATE SEQUENCE shop_code_seq START 1001;

CREATE TABLE shops (
  id              uuid PRIMARY KEY,
  shop_code       text NOT NULL UNIQUE,
  -- Optional link to a shop id in the website's catalogue file (js/edit.js)
  -- until products move into the database in Step 2.
  catalog_ref     text UNIQUE,
  name            text NOT NULL,
  owner_name      text,
  email           text,
  phone           text,
  description     text,
  address_line1   text,
  area            text,
  city            text NOT NULL,
  state           text NOT NULL,
  postal_code     text NOT NULL,
  country         text NOT NULL DEFAULT 'IN',
  latitude        double precision CHECK (latitude BETWEEN -90 AND 90),
  longitude       double precision CHECK (longitude BETWEEN -180 AND 180),
  approval_status text NOT NULL DEFAULT 'PENDING'
                  CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  active_status   text NOT NULL DEFAULT 'INACTIVE'
                  CHECK (active_status IN ('ACTIVE', 'INACTIVE')),
  fulfilment      jsonb NOT NULL DEFAULT '["pickup"]'::jsonb,
  opening_hours   jsonb,
  -- true only for development sample data (never shown as a real shop).
  is_demo         boolean NOT NULL DEFAULT false,
  application_id  uuid REFERENCES shop_applications (id),
  created_by      uuid,
  approved_by     uuid,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- An approved shop always has real coordinates.
  CONSTRAINT shops_approved_has_location
    CHECK (approval_status <> 'APPROVED' OR (latitude IS NOT NULL AND longitude IS NOT NULL)),
  -- Only approved shops can be active.
  CONSTRAINT shops_active_is_approved
    CHECK (active_status <> 'ACTIVE' OR approval_status = 'APPROVED')
);
-- Public discovery only reads APPROVED + ACTIVE shops; the nearby search
-- narrows by this latitude / longitude index before measuring distance.
CREATE INDEX shops_public_geo_idx ON shops (latitude, longitude)
  WHERE approval_status = 'APPROVED' AND active_status = 'ACTIVE';
CREATE INDEX shops_city_idx ON shops (lower(city));

ALTER TABLE shop_applications
  ADD CONSTRAINT shop_applications_shop_fk FOREIGN KEY (shop_id) REFERENCES shops (id);

CREATE TABLE users (
  id                  uuid PRIMARY KEY,
  name                text NOT NULL,
  email               text NOT NULL,
  phone               text,
  -- scrypt hash; NULL until a shop account finishes its password setup.
  password_hash       text,
  role                text NOT NULL CHECK (role IN ('CUSTOMER', 'SHOP', 'ADMIN')),
  status              text NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'PENDING_SETUP', 'DISABLED')),
  shop_id             uuid REFERENCES shops (id),
  last_login_at       timestamptz,
  password_changed_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- A SHOP user always belongs to a shop; nobody else does.
  CONSTRAINT users_shop_role CHECK ((role = 'SHOP') = (shop_id IS NOT NULL))
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE UNIQUE INDEX users_phone_key ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX users_shop_idx ON users (shop_id) WHERE shop_id IS NOT NULL;

ALTER TABLE shop_applications
  ADD CONSTRAINT shop_applications_reviewer_fk FOREIGN KEY (reviewed_by) REFERENCES users (id);
ALTER TABLE shops
  ADD CONSTRAINT shops_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id),
  ADD CONSTRAINT shops_approved_by_fk FOREIGN KEY (approved_by) REFERENCES users (id);

-- Login sessions. Only a hash of the session token is stored.
CREATE TABLE sessions (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  user_agent   text,
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- One-time links: password reset and first-time shop account setup.
-- Random, hashed, expiring, single-use.
CREATE TABLE auth_tokens (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('PASSWORD_RESET', 'ACCOUNT_SETUP')),
  token_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, purpose);

-- Who did what: shop approved / rejected / activated / deactivated, accounts created...
CREATE TABLE audit_logs (
  id            uuid PRIMARY KEY,
  actor_user_id uuid REFERENCES users (id),
  actor_role    text,
  action        text NOT NULL,
  target_type   text NOT NULL,
  target_id     text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_target_idx ON audit_logs (target_type, target_id);
