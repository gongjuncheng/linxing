// ============================================
//  邻星 · 小纸条模块
//  发送、接收、已读标记
// ============================================

import { supabase } from './supabase.js';

/**
 * 发送小纸条
 */
export async function sendSticker(friendId, content) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');

    const { data, error } = await supabase
        .from('stickers')
        .insert({
            from_user_id: user.id,
            to_user_id: friendId,
            content: content,
            is_read: false
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * 标记小纸条已读（仅接收者）
 */
export async function markStickersRead(friendId, userId) {
    const { data, error } = await supabase
        .from('stickers')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('to_user_id', userId)
        .eq('from_user_id', friendId)
        .eq('is_read', false);

    if (error) console.error('标记小纸条已读失败', error);
    return data;
}

/**
 * 获取小纸条列表（与好友的）
 */
export async function loadStickers(friendId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
        .from('stickers')
        .select('*')
        .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${user.id})`)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
}