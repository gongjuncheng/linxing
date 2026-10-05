// 邻星 · 消息硬删除（阅后即焚用）
// 由前端在「接收方已读后 N 秒」调用。用 service role 删除，但先校验
// 调用者 JWT 身份必须是该消息的发送方或接收方，防止越权删除。
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'missing token' }, 401);

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!url || !anonKey || !serviceKey) {
      return json({ error: 'server keys not configured' }, 500);
    }

    // 用 anon key 校验调用者的 JWT，拿到真实 user
    const authClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authErr } = await authClient.auth.getUser(jwt);
    if (authErr || !user) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const msgId = Number(body.message_id);
    if (!Number.isInteger(msgId)) return json({ error: 'message_id required' }, 400);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 查归属
    const { data: msg, error: selErr } = await admin
      .from('messages')
      .select('from_user_id, to_user_id')
      .eq('id', msgId)
      .maybeSingle();
    if (selErr) return json({ error: selErr.message }, 500);
    if (!msg) return json({ ok: true, skipped: 'not_found' });

    // 越权校验
    if (msg.from_user_id !== user.id && msg.to_user_id !== user.id) {
      return json({ error: 'forbidden' }, 403);
    }

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
