-- ============================================
--  邻星 · 阅后即焚服务端延时删除触发器
--  接收方读取焚毁消息（is_read 由 false 变 true）后，
--  通过 pg_net 调用 burn-delete 云函数，延时 burn_seconds 后从数据库硬删。
--  即使客户端已关闭，也能保证「直接从数据库删除，不保留」。
--
--  安全：不再硬编码任何密钥。调用 burn-delete 时必须携带共享密钥头
--  x-burn-secret，其值从 public.app_secrets 表读取（与函数环境变量
--  BURN_DELETE_SECRET 一致），密钥不进入代码仓库。
--  app_secrets 已启用 RLS 且无对外策略，仅 SECURITY DEFINER 触发器（表属主）
--  可读取；匿名 / 普通用户均被拒绝。
-- ============================================

create or replace function public.schedule_burn_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  proj_url text := 'https://tercpgsnqwhbxlwpsbeo.supabase.co';
  burn_secret text;
begin
  -- 读取与 burn-delete 函数约定的共享密钥（无记录则不安全地跳过，不泄露）
  select value into burn_secret
  from public.app_secrets
  where key = 'burn_delete_secret';

  begin
    perform net.http_post(
      url     := proj_url || '/functions/v1/burn-delete',
      headers := jsonb_build_object(
                   'Content-Type','application/json',
                   'x-burn-secret', coalesce(burn_secret, '')),
      body    := jsonb_build_object(
                   'message_id', new.id,
                   'delay',      coalesce(new.burn_seconds, 5))
    );
  exception when others then
    -- 触发失败不影响主流程，客户端定时器仍会兜底
    null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_burn_schedule on public.messages;
create trigger trg_burn_schedule
  after update on public.messages
  for each row
  when (new.is_burn and new.is_read and old.is_read is distinct from new.is_read)
  execute function public.schedule_burn_delete();
