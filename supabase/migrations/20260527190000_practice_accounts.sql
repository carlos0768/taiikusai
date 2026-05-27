alter table public.profiles
  add column if not exists is_practice boolean not null default false;

update auth.users au
set raw_app_meta_data = coalesce(au.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'is_practice',
    coalesce(p.is_practice, false)
  )
from public.profiles p
where p.id = au.id;
