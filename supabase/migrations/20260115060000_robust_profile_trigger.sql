-- Update handle_new_user to be more robust for different OAuth providers (Google, GitHub, etc.)
create or replace function public.handle_new_user()
returns trigger as $$
declare
  candidate_username text;
begin
  -- Try to get a username from metadata, fallback to email prefix if not found
  candidate_username := coalesce(
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'user_name',
    split_part(new.email, '@', 1)
  );

  -- Ensure username is at least 3 characters for the constraint
  if length(candidate_username) < 3 then
    candidate_username := candidate_username || '_user';
  end if;

  -- Handle potential duplicate usernames by appending short UUID snippet if needed
  -- This is a simple way to avoid the UNIQUE constraint error during signup
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id, 
    candidate_username || '_' || substring(new.id::text, 1, 4), 
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  
  return new;
exception when others then
  -- Fallback to a completely safe insert if something still goes wrong
  -- We don't want to block signups
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substring(new.id::text, 1, 8));
  return new;
end;
$$ language plpgsql security definer;
