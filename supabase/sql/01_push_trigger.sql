-- ============================================
--  邻星 · 新消息自动推送触发器
--  任意新消息入库后，调用 send-push Edge Function 推送至接收方
-- ============================================

create or replace function public.notify_new_message()
returns trigger
language plpgsql
as $$
begin
  -- 仅推送有正文（content）的普通消息；系统/约定消息跳过
  if new.content is null then
    return new;
  end if;

  -- 调用 Edge Function；用异常保护，确保推送失败不会影响消息入库
  begin
    perform supabase.functions.invoke(
      'send-push',
      jsonb_build_object(
        'toUserId',  new.to_user_id,
        'fromUserId', new.from_user_id,
        'content',    coalesce(new.content, '你有一条新消息')
      )
    );
  exception when others then
    -- 推送异常吞掉，不影响主流程
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_new_message on public.messages;
create trigger trg_notify_new_message
  after insert on public.messages
  for each row execute function public.notify_new_message();
