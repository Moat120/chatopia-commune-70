-- Create a security definer function to check friendship (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.are_friends(_user_id_1 uuid, _user_id_2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships
    WHERE status = 'accepted'
      AND (
        (requester_id = _user_id_1 AND addressee_id = _user_id_2)
        OR (requester_id = _user_id_2 AND addressee_id = _user_id_1)
      )
  )
$$;

-- Create function to check if user has pending request with another user
CREATE OR REPLACE FUNCTION public.has_pending_request(_user_id_1 uuid, _user_id_2 uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships
    WHERE status = 'pending'
      AND (
        (requester_id = _user_id_1 AND addressee_id = _user_id_2)
        OR (requester_id = _user_id_2 AND addressee_id = _user_id_1)
      )
  )
$$;

-- Drop existing overly permissive profile SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

-- Create more restrictive profile viewing policy
-- Users can view: their own profile, friends' profiles, or profiles of users with pending requests
CREATE POLICY "Users can view relevant profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (
  auth.uid() = id 
  OR public.are_friends(auth.uid(), id)
  OR public.has_pending_request(auth.uid(), id)
);

-- Add DELETE policy for profiles (users can delete their own profile)
CREATE POLICY "Users can delete their own profile" 
ON public.profiles 
FOR DELETE 
TO authenticated
USING (auth.uid() = id);

-- Add DELETE policy for private_messages
CREATE POLICY "Users can delete their own messages" 
ON public.private_messages 
FOR DELETE 
TO authenticated
USING ((auth.uid() = sender_id) OR (auth.uid() = receiver_id));

-- Add DELETE policy for private_calls
CREATE POLICY "Users can delete their call history" 
ON public.private_calls 
FOR DELETE 
TO authenticated
USING ((auth.uid() = caller_id) OR (auth.uid() = callee_id));

-- Add index for better performance on friendship lookups
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships(status);
CREATE INDEX IF NOT EXISTS idx_friendships_users ON public.friendships(requester_id, addressee_id);

-- Add index for message lookups
CREATE INDEX IF NOT EXISTS idx_private_messages_users ON public.private_messages(sender_id, receiver_id);

-- Add index for call lookups  
CREATE INDEX IF NOT EXISTS idx_private_calls_users ON public.private_calls(caller_id, callee_id);