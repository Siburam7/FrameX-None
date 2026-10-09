/* ==========================================================================
   Messages from the Contact page.

   The form used to open the visitor's own email app. It now sends the message
   to the server: it is kept here for the admin panel ("Messages"), and an
   alert email goes to FrameX's own address (ADMIN_NOTIFY_EMAIL, or the admin
   accounts).

   alert = what happened to that email:
     PENDING         being sent
     SENT            the email provider accepted it
     DEV             development mailbox only (nothing was really sent)
     NOT_CONFIGURED  no email provider is configured
     NO_RECIPIENT    no address to send it to
     FAILED          the provider refused it
     LIMIT           too many alerts this hour; the message is in the panel
   Nothing existing is changed.
   ========================================================================== */
CREATE TABLE contact_messages (
  id         uuid PRIMARY KEY,
  user_id    uuid REFERENCES users (id) ON DELETE SET NULL,   -- the account, when the sender was logged in
  name       text NOT NULL,
  email      text NOT NULL,
  phone      text NOT NULL DEFAULT '',
  subject    text NOT NULL,
  message    text NOT NULL,
  status     text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'READ')),
  alert      text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX contact_messages_created_idx ON contact_messages (created_at DESC);
CREATE INDEX contact_messages_new_idx ON contact_messages (created_at DESC) WHERE status = 'NEW';
