// 邻星 · 阅后即焚服务端延时删除
// 由数据库触发器在「接收方读取焚毁消息」后调用（pg_net -> 本函数）。
// 收到请求后休眠 delay 秒，再从数据库硬删该消息。
// 仅删除 is_burn = true 的消息，避免被滥用删除普通消息。
//
// 安全：本函数通过 --no-verify-jwt 暴露为公开端点（因为调用方是数据库触发器，
// 无法携带 JWT）。为防止外部任意调用删除他人焚毁消息，要求请求携带与触发器
// 一致的共享密钥头 x-burn-secret（密钥存于函数环境变量 BURN_DELETE_SECRET，
// 由触发器从 app_secrets 表读取后随请求发送，密钥不进入代码仓库）。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_DELAY = 600; // 函数内最大休眠秒数，避免触发 Edge Function 超时

Deno.serve(async (req) => {
  try {
    const expectedSecret = Deno.env.get('BURN_DELETE_SECRET') ?? '';
    const providedSecret = req.headers.get('x-burn-secret') ?? '';
    if (!expectedSecret || providedSecret !== expectedSecret) {
      return json({ error: 'unauthorized' }, 401);
    }

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !serviceKey) return json({ error: 'server keys not configured' }, 500);

    const body = await req.json().catch(() => ({}));
    const msgId = Number(body.message_id);
    if (!Number.isInteger(msgId)) return json({ error: 'message_id required' }, 400);

    const delay = Math.min(Math.max(Number(body.delay) || 5, 1), MAX_DELAY);
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
