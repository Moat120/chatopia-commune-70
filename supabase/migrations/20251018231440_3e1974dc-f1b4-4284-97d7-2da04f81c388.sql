-- Update the handle_new_user function to also create a default server
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_server_id UUID;
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  
  -- Create a default server for the new user
  INSERT INTO public.servers (name, owner_id)
  VALUES ('Mon Serveur', new.id)
  RETURNING id INTO new_server_id;
  
  -- Add the user as a member of their own server
  INSERT INTO public.server_members (server_id, user_id)
  VALUES (new_server_id, new.id);
  
  -- Create default channels
  INSERT INTO public.channels (server_id, name, type)
  VALUES 
    (new_server_id, 'général', 'text'),
    (new_server_id, 'random', 'text');
  
  RETURN new;
END;
$$;