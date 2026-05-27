alter table public.profiles
  add column if not exists username text;

update public.profiles
set username = coalesce(
  nullif(username, ''),
  login_id,
  lower(regexp_replace(display_name, '[^a-zA-Z0-9]', '', 'g')),
  id::text
)
where username is null
   or username = '';

alter table public.profiles
  alter column username drop not null;
