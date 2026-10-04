// 邻星 · 极光推送服务端 Edge Function
// 由数据库触发器（新消息）调用，向接收方设备推送通知
//
// 部署：
//   supabase functions deploy send-push
//   supabase secrets set JPUSH_APP_KEY=xxxx JPUSH_MASTER_SECRET=yyyy
//
// 环境变量（Supabase 自动注入）：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const JPushAppKey = Deno.env.get('JPUSH_APP_KEY') ?? '';
const JPushMasterSecret = Deno.env.get('JPUSH_MASTER_SECRET') ?? '';

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
    if (!JPushAppKey || !JPushMasterSecret) {
      return json({ error: 'JPush 密钥未配置（请在 Supabase 设置 JPUSH_APP_KEY / JPUSH_MASTER_SECRET）' }, 500);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 查询接收方设备 RegistrationID
    const { data: devices } = await supabaseAdmin
      .from('devices')
      .select('registration_id')
      .eq('user_id', toUserId);

    const rids = (devices ?? [])
      .map((d: any) => d.registration_id)
      .filter(Boolean);

    if (rids.length === 0) {
      return json({ ok: true, skipped: 'no_devices', toUserId });
    }

    // 取发送方昵称作为通知标题
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
      }
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
