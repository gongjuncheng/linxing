// ============================================
//  邻星 · 约定模块
//  阅后即焚 + 已读回执
// ============================================

import { supabase } from './supabase.js';

// ============================================
//  阅后即焚
// ============================================

/**
 * 加载阅后即焚约定
 */
export async function loadBurnAgreement(friendId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
        .from('burn_agreements')
        .select('*')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('friend_id', friendId)
        .maybeSingle();

    return data || null;
}

/**
 * 发送阅后即焚约定（通过系统消息）
 */
export async function sendBurnAgreement(friendId, seconds) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');

    // 检查已有约定
    const existing = await loadBurnAgreement(friendId);
    if (existing) {
        if (existing.status === 'pending') {
            throw new Error('已有待同意的约定');
        }
        if (existing.status === 'accepted') {
            throw new Error('已有生效的约定');
        }
    }

    const content = `🔥 阅后即焚约定：对方已读后 ${seconds} 秒自动删除（约定ID:${Date.now()}）`;

    // 插入系统消息
    const { data: msg, error: msgError } = await supabase
        .from('messages')
        .insert({
            from_user_id: user.id,
            to_user_id: friendId,
            content: content,
            is_system: true,
            system_type: 'burn_agreement',
            is_read: false
        })
        .select()
        .single();

    if (msgError) throw msgError;

    // 创建约定记录
    const { error } = await supabase
        .from('burn_agreements')
        .upsert({
            user_id: user.id,
            friend_id: friendId,
            burn_seconds: seconds,
            status: 'pending'
        }, { onConflict: 'user_id, friend_id' });

    if (error) throw error;

    return msg;
}

/**
 * 处理阅后即焚约定（同意/拒绝/撤销）
 */
export async function handleBurnAgreement(agreementId, action) {
    const statusMap = {
        agree: 'accepted',
        reject: 'rejected',
        revoke: 'revoked'
    };

    const { error } = await supabase
        .from('burn_agreements')
        .update({ status: statusMap[action], updated_at: new Date().toISOString() })
        .eq('id', agreementId);

    if (error) throw error;
    return statusMap[action];
}

// ============================================
//  已读回执
// ============================================

/**
 * 加载已读回执约定
 */
export async function loadReadReceiptAgreement(friendId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
        .from('read_receipt_agreements')
        .select('*')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('friend_id', friendId)
        .maybeSingle();

    return data || null;
}

/**
 * 发送已读回执约定（通过系统消息）
 */
export async function sendReadReceiptAgreement(friendId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');

    // 检查已有约定
    const existing = await loadReadReceiptAgreement(friendId);
    if (existing) {
        if (existing.status === 'pending') {
            throw new Error('已有待同意的约定');
        }
        if (existing.status === 'accepted') {
            throw new Error('已有生效的约定');
        }
    }

    const content = `👁️ 已读回执约定：对方将能看到消息已读状态（约定ID:${Date.now()}）`;

    // 插入系统消息
    const { data: msg, error: msgError } = await supabase
        .from('messages')
        .insert({
            from_user_id: user.id,
            to_user_id: friendId,
            content: content,
            is_system: true,
            system_type: 'read_receipt_agreement',
            is_read: false
        })
        .select()
        .single();

    if (msgError) throw msgError;

    // 创建约定记录
    const { error } = await supabase
        .from('read_receipt_agreements')
        .upsert({
            user_id: user.id,
            friend_id: friendId,
            status: 'pending'
        }, { onConflict: 'user_id, friend_id' });

    if (error) throw error;

    return msg;
}

/**
 * 处理已读回执约定（同意/拒绝/撤销）
 */
export async function handleReadReceiptAgreement(agreementId, action) {
    const statusMap = {
        agree: 'accepted',
        reject: 'rejected',
        revoke: 'revoked'
    };

    const { error } = await supabase
        .from('read_receipt_agreements')
        .update({ status: statusMap[action], updated_at: new Date().toISOString() })
        .eq('id', agreementId);

    if (error) throw error;
    return statusMap[action];
}

/**
 * 获取约定状态显示文本
 */
export function getAgreementStatusText(agreement, type) {
    if (!agreement) return '';
    const map = {
        pending: '⏳ 等待对方同意',
        accepted: type === 'burn' ? `🔥 阅后即焚 (${agreement.burn_seconds}s)` : '👁️ 已读回执已生效',
        rejected: '❌ 已拒绝',
        revoked: '↩️ 已撤销'
    };
    return map[agreement.status] || '';
}