-- MEMEINATER 6700 setup. Paste ALL of this into Supabase > SQL Editor and click Run.
-- Safe to run again. CHANGE THE GANG CODE on the very last line before you run it.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (lower(username));

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_everyone boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.sounds (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '🔊',
  path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_sounds (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sound_id uuid not null references public.sounds(id) on delete cascade,
  primary key (user_id, sound_id)
);

create table if not exists public.group_sounds (
  group_id uuid not null references public.groups(id) on delete cascade,
  sound_id uuid not null references public.sounds(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, sound_id)
);

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  sound_id uuid not null references public.sounds(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- helper checks (security definer so the policies below do not loop)
create or replace function public.is_member(gid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

create or replace function public.in_gang() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.group_members where user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.sounds enable row level security;
alter table public.saved_sounds enable row level security;
alter table public.group_sounds enable row level security;
alter table public.shares enable row level security;

-- remove old policies so this file can be re-run
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.in_gang());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy groups_read on public.groups for select to authenticated
  using (public.is_member(id));

create policy members_read on public.group_members for select to authenticated
  using (public.is_member(group_id));
create policy members_leave on public.group_members for delete to authenticated
  using (user_id = auth.uid());

create policy sounds_read on public.sounds for select to authenticated
  using (public.in_gang());
create policy sounds_insert on public.sounds for insert to authenticated
  with check (owner = auth.uid() and public.in_gang());
create policy sounds_update on public.sounds for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy sounds_delete on public.sounds for delete to authenticated
  using (owner = auth.uid());

create policy saved_all on public.saved_sounds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.in_gang());

create policy gsounds_read on public.group_sounds for select to authenticated
  using (public.is_member(group_id));
create policy gsounds_insert on public.group_sounds for insert to authenticated
  with check (public.is_member(group_id) and added_by = auth.uid());
create policy gsounds_delete on public.group_sounds for delete to authenticated
  using (public.is_member(group_id) and added_by = auth.uid());

create policy shares_read on public.shares for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy shares_insert on public.shares for insert to authenticated
  with check (from_user = auth.uid() and public.in_gang());
create policy shares_delete on public.shares for delete to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- sign up / join / create-group go through these functions
create or replace function public.check_code(p_code text) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.groups where code = upper(trim(p_code)) and is_everyone);
$$;

create or replace function public.finish_signup(p_username text, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  uname text := trim(p_username);
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if uname !~ '^[A-Za-z0-9_]{2,20}$' then
    raise exception 'username must be 2-20 letters, numbers or _';
  end if;
  select id into gid from public.groups where code = upper(trim(p_code)) and is_everyone;
  if gid is null then raise exception 'wrong gang code'; end if;
  insert into public.profiles (id, username) values (auth.uid(), uname)
    on conflict (id) do update set username = excluded.username;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid())
    on conflict do nothing;
  return gid;
end $$;

create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  select id into gid from public.groups where code = upper(trim(p_code));
  if gid is null then raise exception 'no group with that code'; end if;
  insert into public.group_members (group_id, user_id) values (gid, auth.uid())
    on conflict do nothing;
  return gid;
end $$;

create or replace function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  c text;
begin
  if auth.uid() is null or not public.in_gang() then raise exception 'not allowed'; end if;
  if length(trim(p_name)) < 1 then raise exception 'give the group a name'; end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.groups where code = c);
  end loop;
  insert into public.groups (name, code, created_by) values (left(trim(p_name), 30), c, auth.uid())
    returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

grant execute on function public.check_code(text) to anon, authenticated;
grant execute on function public.finish_signup(text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.create_group(text) to authenticated;

-- sound files bucket (only people with an account can upload, into their own folder)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sounds', 'sounds', true, 3145728,
  array['audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/mp4','audio/x-m4a','audio/aac'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sounds upload own folder" on storage.objects;
drop policy if exists "sounds delete own" on storage.objects;
drop policy if exists "sounds read" on storage.objects;
create policy "sounds upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'sounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sounds delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'sounds' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sounds read" on storage.objects for select using (bucket_id = 'sounds');

-- THE GANG CODE: everyone who signs up needs this. Change MEMEGANG to your own secret word.
insert into public.groups (name, code, is_everyone) values ('EVERYONE', 'MEMEGANG', true)
on conflict (code) do nothing;
