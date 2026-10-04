// ============================================
//  邻星 · 好友模块
//  好友列表、搜索、添加、请求处理
// ============================================

import { supabase } from './supabase.js';

/**
 * 获取当前用户的好友列表（已接受）
 */
export async function loadFriends(userId) {
    const { data, error } = await supabase
        .from('friends')
        .select('user_id, friend_id')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (error) throw error;
    if (!data || data.length === 0) return [];

    const friendIds = data.map(f => f.user_id === userId ? f.friend_id : f.user_id);

    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, location, user_no')
        .in('id', friendIds);

    if (profilesError) throw profilesError;
    return profiles || [];
}

/**
 * 获取好友请求数量（待处理，发给当前用户的）
 */
export async function getPendingRequestCount(userId) {
    const { count, error } = await supabase
        .from('friends')
        .select('id', { count: 'exact', head: true })
        .eq('friend_id', userId)
        .eq('status', 'pending');

    if (error) throw error;
    return count || 0;
}

/**
 * 获取好友请求列表（待处理，发给当前用户的）
 */
export async function loadPendingRequests(userId) {
    const { data, error } = await supabase
        .from('friends')
        .select('id, user_id, created_at')
        .eq('friend_id', userId)
        .eq('status', 'pending');

    if (error) throw error;
    if (!data || data.length === 0) return [];

    const senderIds = data.map(r => r.user_id);
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url, location, user_no')
        .in('id', senderIds);

    if (profilesError) throw profilesError;

    // 合并数据
    return data.map(req => {
        const profile = profiles.find(p => p.id === req.user_id);
        return { ...req, sender: profile };
    });
}

/**
 * 搜索用户（按 username、display_name 或 user_no）
 */
export async function searchUsers(keyword, excludeUserId) {
    if (!keyword || keyword.trim().length === 0) return [];

    const isNumber = /^\d+$/.test(keyword.trim());
    let query = supabase.from('profiles').select('*');

    if (isNumber) {
        query = query.eq('user_no', parseInt(keyword.trim()));
    } else {
        query = query.or(`username.ilike.%${keyword.trim()}%,display_name.ilike.%${keyword.trim()}%`);
    }

    query = query.neq('id', excludeUserId).limit(20);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * 检查当前用户与目标用户的好友关系状态
 */
export async function checkFriendStatus(userId, targetId) {
    const { data, error } = await supabase
        .from('friends')
        .select('id, status')
        .or(`and(user_id.eq.${userId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${userId})`)
        .maybeSingle();

    if (error) throw error;
    return data || null;
}

/**
 * 发送好友请求
 */
export async function sendFriendRequest(userId, targetId) {
    // 检查是否已存在关系
    const existing = await checkFriendStatus(userId, targetId);
    if (existing) {
        if (existing.status === 'accepted') return { already: 'accepted' };
        if (existing.status === 'pending') return { already: 'pending' };
        if (existing.status === 'rejected') {
            // 重新发送：更新状态为 pending
            const { error } = await supabase
                .from('friends')
                .update({ status: 'pending' })
                .eq('id', existing.id);
            if (error) throw error;
            return { success: true };
        }
    }

    const { error } = await supabase
        .from('friends')
        .insert({ user_id: userId, friend_id: targetId, status: 'pending' });

    if (error) throw error;
    return { success: true };
}

/**
 * 处理好友请求（同意或拒绝）
 */
export async function handleFriendRequest(requestId, action) {
    if (action === 'accept') {
        const { error } = await supabase
            .from('friends')
            .update({ status: 'accepted' })
            .eq('id', requestId);
        if (error) throw error;
        return { action: 'accepted' };
    } else {
        const { error } = await supabase
            .from('friends')
            .delete()
            .eq('id', requestId);
        if (error) throw error;
        return { action: 'rejected' };
    }
}