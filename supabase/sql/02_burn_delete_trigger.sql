-- ============================================
--  邻星 · 阅后即焚服务端延时删除触发器
--  接收方读取焚毁消息（is_read 由 false 变 true）后，
--  通过 pg_net 调用 burn-delete 云函数，延时 burn_seconds 后从数据库硬删。
--  即使客户端已关闭，也能保证「直接从数据库删除，不保留」。
-- ============================================

create or replace function public.schedule_burn_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  proj_url text := 'https://tercpgsnqwhbxlwpsbeo.supabase.co';
  anon_key text := 'sb_publishable_Klt3VmsiHPAlsiuCc-zApw_xa_PnqB3';
begin
  begin
    perform net.http_post(
      url     := proj_url || '/functions/v1/burn-delete',
      headers := jsonb_build_object(
                   'Content-Type','application/json',
                   'Authorization','Bearer ' || anon_key),
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
