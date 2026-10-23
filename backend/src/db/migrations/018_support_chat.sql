-- FrameX's own help chat (owner, 2026-10-23): a logged-in customer writes to FrameX from any page, FrameX staff
-- answer in Admin -> Chats, and the customer gets an email when FrameX answers. Only adds tables; nothing existing
-- changes.
--
--   support_threads    one conversation of a customer; at most one OPEN at a time
--     order_number     the order the customer last asked about (optional)
--     customer_read_at the customer last saw the conversation (staff messages after it are unread for them)
--     staff_read_at    a FrameX admin last opened it (customer messages after it are unread for staff)
--     staff_alerted_at when FrameX was last emailed about it (at most one email per 15 minutes per conversation)
--   support_messages   what was written, by the customer or by FrameX staff
CREATE TABLE IF NOT EXISTS support_threads (
  id               uuid PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  topic            text NOT NULL DEFAULT '',
  order_number     text,
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  customer_read_at timestamptz,
  staff_read_at    timestamptz,
  staff_alerted_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS support_threads_one_open ON support_threads (user_id) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS support_threads_recent ON support_threads (status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id             uuid PRIMARY KEY,
  thread_id      uuid NOT NULL REFERENCES support_threads (id) ON DELETE CASCADE,
  author         text NOT NULL CHECK (author IN ('CUSTOMER', 'STAFF')),
  author_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  body           text NOT NULL,
  order_number   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_thread ON support_messages (thread_id, created_at);
