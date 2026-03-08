
-- Emoji reactions table (works for both private and group messages)
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('private', 'group')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji, message_type)
);

-- Enable RLS
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read reactions on messages they have access to
CREATE POLICY "Users can read reactions" ON public.message_reactions
  FOR SELECT TO authenticated USING (true);

-- RLS: users can insert their own reactions
CREATE POLICY "Users can add reactions" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- RLS: users can delete their own reactions
CREATE POLICY "Users can remove own reactions" ON public.message_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Reply support: add reply_to_id to both message tables
ALTER TABLE public.private_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.private_messages(id) ON DELETE SET NULL;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.group_messages(id) ON DELETE SET NULL;

-- Enable realtime for reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
