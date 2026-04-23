-- Track when invitation emails are sent via the send-invitation-email Edge Function.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
