-- Stores MAX dialog chat_id per user (needed to send DMs to users)
-- MAX API only accepts chat_id for sending messages, not user_id
CREATE TABLE IF NOT EXISTS max_user_dialogs (
    max_user_id BIGINT PRIMARY KEY,
    dialog_chat_id BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
