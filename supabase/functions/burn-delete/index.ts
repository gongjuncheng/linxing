// 邻星 · 阅后即焚服务端延时删除
// 由数据库触发器在「接收方读取焚毁消息」后调用（pg_net -> 本函数）。
// 收到请求后休眠 delay 秒，再从数据库硬删该消息。
// 仅删除 is_burn = true 的消息，避免被滥用删除普通消息。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !serviceKey) return json({ error: 'server keys not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const msgId = Number(body.message_id);
    if (!Number.isInteger(msgId)) return json({ error: 'message_id required' }, 400);

    const delay = Math.max(Number(body.delay) || 5, 1);
    // 休眠到约定时间（函数超时则由客户端定时器兜底，不会提前删）
    await new Promise((r) => setTimeout(r, delay * 1000));

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 仅当该消息确实存在且为焚毁消息时才删除
    const { data: msg, error: selErr } = await admin
      .from('messages')
      .select('id, is_burn')
      .eq('id', msgId)
      .maybeSingle();
    if (selErr) return json({ error: selErr.message }, 500);
    if (!msg) return json({ ok: true, skipped: 'not_found' });
    if (!msg.is_burn) return json({ ok: true, skipped: 'not_burn' });

    const { error: delErr } = await admin.from('messages').delete().eq('id', msgId);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
