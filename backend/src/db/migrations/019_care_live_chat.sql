-- FrameX Care live chat (owner, 2026-10-24). On top of the help chat (018):
--   - a CARE role: FrameX Care staff, created only by an admin (Admin -> Care team), who can open only the chats;
--     users.care_available = they chose "Available" (they get new chat requests while their care desk is open);
--   - a live episode on a conversation: the customer asks for a person, a care person accepts within 2 minutes
--     and the customer sees their first name, or nobody does and the customer leaves a message instead;
--   - each message remembers the first name of the staff member who wrote it, and the chat's own notes
--     ("Siburam joined the chat") are SYSTEM messages.
-- Only adds a role, columns and allowed values; nothing existing changes meaning.
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER', 'SHOP', 'ADMIN', 'ARTIST', 'CARE'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS care_available boolean NOT NULL DEFAULT false;

--   live_state      NULL = an ordinary conversation (messages answered later)
--                   WAITING = the customer asked for a person (live_requested_at), LIVE = agent_* accepted,
--                   ENDED = the live chat finished, MISSED = nobody accepted in time
--   live_question   what the customer asked before asking for a person (shown on the request)
--   agent_name      the first name the customer sees ("You're chatting with Siburam"), kept as it was then
--   rating          the customer's thumbs up (1) / down (-1) after a live chat
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS live_state text CHECK (live_state IN ('WAITING', 'LIVE', 'ENDED', 'MISSED'));
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS live_question text NOT NULL DEFAULT '';
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS live_requested_at timestamptz;
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS live_accepted_at timestamptz;
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS live_ended_at timestamptz;
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS agent_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS agent_name text;
ALTER TABLE support_threads ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating IN (-1, 1));
CREATE INDEX IF NOT EXISTS support_threads_live ON support_threads (live_state, live_requested_at) WHERE live_state IN ('WAITING', 'LIVE');

ALTER TABLE support_messages DROP CONSTRAINT support_messages_author_check;
ALTER TABLE support_messages ADD CONSTRAINT support_messages_author_check CHECK (author IN ('CUSTOMER', 'STAFF', 'SYSTEM'));
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS author_name text;
