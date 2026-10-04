-- One-time codes can now also be delivered by email (password reset by email code).
ALTER TABLE otp_codes DROP CONSTRAINT otp_codes_channel_check;
ALTER TABLE otp_codes ADD CONSTRAINT otp_codes_channel_check CHECK (channel IN ('SMS', 'EMAIL'));
