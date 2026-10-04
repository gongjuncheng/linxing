-- ============================================
--  邻星 · 设备注册表（极光推送）
--  保存各设备的 RegistrationID，供服务端按设备推送
-- ============================================

create table if not exists public.devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  registration_id text not null,
  platform        text default 'android',
  alias           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (user_id, registration_id)
);

comment on table public.devices is '极光推送设备注册表：每个设备一条 RegistrationID 记录';

alter table public.devices enable row level security;

-- 用户只能读写自己的设备
create policy "设备：本人可读" on public.devices
  for select using (auth.uid() = user_id);
create policy "设备：本人可写" on public.devices
  for insert with check (auth.uid() = user_id);
create policy "设备：本人可删" on public.devices
  for delete using (auth.uid() = user_id);
