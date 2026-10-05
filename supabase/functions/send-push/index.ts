// 邻星 · 极光推送服务端 Edge Function（长连接版，已去除厂商通道依赖）
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JPushAppKey = Deno.env.get('JPUSH_APP_KEY') ?? '';
const JPushMasterSecret = Deno.env.get('JPUSH_MASTER_SECRET') ?? '';
const SupabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
// 线上存在两个密钥名，优先用标准 service_role key；若其值无效则回退到 SECRET_KEYS
const KeyPrimary = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KeyFallback = Deno.env.get('SUPABASE_SECRET_KEYS') ?? '';

function adminClient(k: string) {
  return createClient(SupabaseUrl, k, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface PushBody {
  toUserId: string;
  fromUserId?: string;
  content?: string;
}

Deno.serve(async (req) => {
  try {
    const body: PushBody = await req.json();
    const { toUserId, fromUserId, content } = body;

    if (!toUserId) return json({ error: 'toUserId required' }, 400);
    if (!JPushAppKey || !JPushMasterSecret) return json({ error: 'JPush 密钥未配置' }, 500);
    if (!KeyPrimary && !KeyFallback) return json({ error: 'Supabase 密钥未配置' }, 500);

    // 探测可用密钥：优先 KeyPrimary，Invalid API key 等异常时回退 KeyFallback
    let supabaseAdmin = adminClient(KeyPrimary || KeyFallback);
    const probe = await supabaseAdmin.from('devices').select('registration_id').limit(1);
    if (probe.error && KeyFallback && KeyPrimary !== KeyFallback) {
      supabaseAdmin = adminClient(KeyFallback);
    }

    const { data: devices, error: devErr } = await supabaseAdmin
      .from('devices')
      .select('registration_id')
      .eq('user_id', toUserId);
    if (devErr) return json({ error: 'devices 查询失败: ' + devErr.message }, 500);

    const rids = (devices ?? [])
      .map((d: any) => d.registration_id)
      .filter(Boolean);

    if (rids.length === 0) {
      return json({ ok: true, skipped: 'no_devices', toUserId });
    }

    let title = '邻星';
    if (fromUserId) {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('display_name, username')
        .eq('id', fromUserId)
        .maybeSingle();
      if (prof) title = prof.display_name || prof.username || '邻星';
    }

    const alert = content || '你有一条新消息';
    const payload = {
      platform: ['android'],
      audience: { registration_id: rids },
      notification: {
        alert,
        android: {
          alert,
          title,
          extras: {
            type: 'chat',
            fromUserId: fromUserId ?? '',
            userName: title,
            chatId: fromUserId ?? ''
          }
        }
      },
      // time_to_live: 离线消息在极光侧保留时长（秒）。
      // 对方 App 不在线时消息先留存，待其联网/重新打开 App 时补送，避免丢消息。
      options: { time_to_live: 86400 }
    };

    const auth = btoa(`${JPushAppKey}:${JPushMasterSecret}`);
    const resp = await fetch('https://api.jpush.cn/v3/push', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'User-Agent': 'linxing-push/1.0'
      },
      body: JSON.stringify(payload)
    });

    const respText = await resp.text();
    return json(
      { ok: resp.ok, status: resp.status, toUserId, deviceCount: rids.length, result: respText },
      resp.ok ? 200 : 502
    );
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
