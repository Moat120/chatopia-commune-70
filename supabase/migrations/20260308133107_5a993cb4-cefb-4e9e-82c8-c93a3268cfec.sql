
-- Add edited_at column to private_messages for edit tracking
ALTER TABLE public.private_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL;

-- Add edited_at column to group_messages for edit tracking  
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL;
