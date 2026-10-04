// ============================================
//  邻星 · 极光推送客户端封装
//  - 仅在原生（Capacitor）环境下初始化，浏览器环境优雅降级
//  - 原生桥接由 android/app 下的 JPushPlugin 提供（插件名 "JPush"）
// ============================================

import { supabase } from './supabase.js';

// 是否原生环境（Capacitor 包裹的 App）
const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const JPush = isNative ? window.Capacitor.Plugins?.JPush : null;

/**
 * 初始化推送：初始化 SDK、上报设备、设置别名
 * @param {{id:string, user_metadata?:any, email?:string}} user 当前登录用户
 */
export async function initPush(user) {
    if (!isNative || !JPush) {
        console.info('[push] 非原生环境，跳过推送初始化');
        return { ok: false, reason: 'not_native' };
    }
    if (!user || !user.id) {
        return { ok: false, reason: 'no_user' };
    }
    try {
        await JPush.startJPush();

        // 监听：点击通知 -> 跳转到对应聊天
        JPush.addListener('notificationOpened', onNotificationOpened);
        // 监听：注册成功 -> 保存设备
        JPush.addListener('receiveRegistrationId', async (data) => {
            const rid = data?.registrationId;
            if (rid) await saveDevice(rid, user.id);
        });

        // 主动取一次（有时 onRegister 已在启动前触发）
        const { registrationId } = await JPush.getRegistrationID();
        if (registrationId) await saveDevice(registrationId, user.id);

        // 别名 = userId，方便服务端按别名推送
        await JPush.setAlias({ alias: user.id });

        console.info('[push] 初始化成功，用户', user.id);
        return { ok: true };
    } catch (e) {
        console.error('[push] 初始化失败', e);
        return { ok: false, reason: String(e) };
    }
}

/**
 * 保存/更新设备 RegistrationID 到 Supabase
 */
async function saveDevice(registrationId, userId) {
    if (!registrationId) return;
    try {
        await supabase
            .from('devices')
            .upsert(
                { user_id: userId, registration_id: registrationId, platform: 'android' },
                { onConflict: 'user_id,registration_id' }
            );
    } catch (e) {
        console.error('[push] 保存设备失败', e);
    }
}

/**
 * 点击通知：解析 extras 跳转到对应聊天
 */
function onNotificationOpened(data) {
    try {
        const extra = data?.rawData?.extra || {};
        const fromUserId = extra.fromUserId || extra.chatId;
        const userName = extra.userName || '好友';
        if (fromUserId) {
            // 已在聊天页则直接刷新，否则跳转
            window.location.href = `./chat.html?userId=${fromUserId}&userName=${encodeURIComponent(userName)}`;
        }
    } catch (e) {
        console.error('[push] 点击通知处理失败', e);
    }
}

/**
 * 退出登录时清除别名（可选）
 */
export async function clearPushAlias() {
    if (!isNative || !JPush) return;
    try {
        await JPush.deleteAlias({});
    } catch (e) {
        console.error('[push] 清除别名失败', e);
    }
}
