/*
  # ARCHITECTURE: PRIVATE ROOMS WITH INVITE CODES
  
  ## CORE SECURITY PRINCIPLES
  1. **Private by Default**: Rooms are inherently private. No "public" flag.
  2. **Invite-Only Access**: Access is ONLY granted via:
     - Creation (Owner)
     - Valid Invitation Code (Member)
  3. **Strict RLS**: 
     - Policies deny access unless you are in `room_participants`.
     - `has_room_access()` function is the single source of truth for policies.
  
  ## INVITE FLOW ("Kahoot Style")
  1. Room Owner generates a code (e.g. 'X79-B22') stored in `room_invites`.
  2. Owner shares code offline/privately.
  3. User enters code in UI.
  4. App calls `join_room(code)` RPC function.
  5. Function validates code -> adds user to `room_participants`.
  6. RLS now allows user to see room content.
*/

-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 1. PROFILES (Synced with Auth)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  avatar_url text,
  updated_at timestamp with time zone,
  constraint username_length check (char_length(username) >= 3)
);

alter table public.profiles enable row level security;

-- Profiles are viewable by everyone (needed to see who is chatting)
create policy "Profiles are publicly viewable"
  on public.profiles for select
  using ( true );

-- Users update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. ROOMS
create table if not exists public.rooms (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null, 
  created_by uuid references public.profiles(id) not null,
  is_open boolean default false, -- THE TOGGLE: If false, room is "closed" (only owner can view).
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.rooms enable row level security;


-- 3. ROOM PARTICIPANTS (The Access List)
create table if not exists public.room_participants (
  room_id uuid references public.rooms(id) on delete cascade not null,
  profile_id uuid references public.profiles(id) on delete cascade not null,
  role text default 'member',
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (room_id, profile_id)
);

alter table public.room_participants enable row level security;


-- 4. ROOM INVITES
create table if not exists public.room_invites (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  code text unique not null,
  created_by uuid references public.profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone 
);

alter table public.room_invites enable row level security;


-- 5. ACCESS CONTROL FUNCTION (Enforces "Close Room" logic)
create or replace function public.has_room_access(_room_id uuid)
returns boolean as $$
begin
  -- Case 1: Owner always has access (Subject to finding their own history)
  if exists (select 1 from public.rooms where id = _room_id and created_by = auth.uid()) then
    return true;
  end if;

  -- Case 2: Participants have access ONLY if room is OPEN
  return exists (
    select 1 from public.rooms r
    join public.room_participants rp on r.id = rp.room_id
    where r.id = _room_id 
      and rp.profile_id = auth.uid()
      and r.is_open = true -- Critical: If toggle is OFF, participants lose access
  );
end;
$$ language plpgsql security definer;


-- 6. RPC: JOIN ROOM BY CODE
create or replace function public.join_room_by_code(invite_code text)
returns json as $$
declare
  target_room_id uuid;
  is_room_open boolean;
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

  -- 2. Check if Room is Open (Cannot join a closed room)
  select is_open into is_room_open from public.rooms where id = target_room_id;
  if is_room_open is false then
     return json_build_object('success', false, 'error', 'Room is currently closed by the host');
  end if;

  -- 3. Check if already member
  select exists(
    select 1 from public.room_participants 
    where room_id = target_room_id and profile_id = auth.uid()
  ) into is_already_member;

  if is_already_member then
     return json_build_object('success', true, 'room_id', target_room_id);
  end if;

  -- 4. Add to Participants
  insert into public.room_participants (room_id, profile_id, role)
  values (target_room_id, auth.uid(), 'member');

  return json_build_object('success', true, 'room_id', target_room_id);
end;
$$ language plpgsql security definer; 
-- SECURITY DEFINER is critical here: it runs with admin privileges to read the code 
-- and insert the participant, even if the user technically didn't have access yet.


-- 7. RLS POLICIES

-- ROOMS
create policy "View Rooms" on public.rooms for select
  using ( public.has_room_access(id) );

create policy "Insert Rooms" on public.rooms for insert
  with check ( auth.role() = 'authenticated' );

-- PARTICIPANTS
create policy "View Participants" on public.room_participants for select
  using ( public.has_room_access(room_id) );

-- INVITES (Only viewable by room admins/creators)
create policy "Manage Invites" on public.room_invites for all
  using ( 
    exists (
      select 1 from public.rooms where id = room_id and created_by = auth.uid()
    ) or exists (
       select 1 from public.room_participants 
       where room_id = room_invites.room_id 
       and profile_id = auth.uid() 
       and role = 'admin'
    )
  );

-- 8. CONTENT TABLES (Models & Messages)

-- Room Models
create table if not exists public.room_models (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  model_id text not null, 
  added_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.room_models enable row level security;
create policy "View Room Models" on public.room_models for select using ( public.has_room_access(room_id) );
create policy "Add Room Models" on public.room_models for insert with check ( public.has_room_access(room_id) );
create policy "Update Room Models" on public.room_models for update using ( public.has_room_access(room_id) );

-- Messages
create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade not null,
  profile_id uuid references public.profiles(id), 
  content text not null,
  is_ai boolean default false,
  ai_model_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.messages enable row level security;
create policy "View Messages" on public.messages for select using ( public.has_room_access(room_id) );
create policy "Insert Messages" on public.messages for insert with check ( public.has_room_access(room_id) );


-- 9. REALTIME
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.room_models;
alter publication supabase_realtime add table public.room_participants; 
-- Profiles are public so safe to stream
alter publication supabase_realtime add table public.profiles; 
