-- Password-Protected Room Access
-- 1. Add optional 'password' column to rooms
alter table public.rooms add column if not exists password text;

-- 2. Update join_room function to support password check
create or replace function public.join_room_by_code(invite_code text, supplied_password text default null)
returns json as $$
declare
  target_room_id uuid;
  is_room_open boolean;
  room_password text;
  is_already_member boolean;
begin
  -- 1. Validate Code & Get Room
  select room_id into target_room_id
  from public.room_invites
  where code = invite_code
  and (expires_at is null or expires_at > now());

  if target_room_id is null then
    return json_build_object('success', false, 'error', 'Invalid or expired code');
  end if;

  -- 2. Check Password (if set)
  select password, is_open into room_password, is_room_open 
  from public.rooms where id = target_room_id;

  if room_password is not null and room_password != '' then
     if supplied_password is null or supplied_password != room_password then
        return json_build_object('success', false, 'error', 'Incorrect room password', 'password_required', true);
     end if;
  end if;

  -- 3. Check if Room is Open
  if is_room_open is false then
     return json_build_object('success', false, 'error', 'Room is currently closed by the host');
  end if;

  -- 4. Check if already member
  select exists(
    select 1 from public.room_participants 
    where room_id = target_room_id and profile_id = auth.uid()
  ) into is_already_member;

  if is_already_member then
     return json_build_object('success', true, 'room_id', target_room_id);
  end if;

  -- 5. Add to Participants
  insert into public.room_participants (room_id, profile_id, role)
  values (target_room_id, auth.uid(), 'member');

  return json_build_object('success', true, 'room_id', target_room_id);
end;
$$ language plpgsql security definer;
