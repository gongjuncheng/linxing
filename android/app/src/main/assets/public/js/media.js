// ============================================
//  邻星 · 媒体上传模块
//  图片（ImgBB）和视频（Supabase Storage）上传
// ============================================

import { supabase } from './supabase.js';

/**
 * 上传图片到 Supabase Storage（chat-media 公共桶）。
 * 彻底弃用 ImgBB，密钥不再出现在客户端 / 代码仓库。
 */
export async function uploadImage(file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');

    const fileExt = (file.name && file.name.split('.').pop()) || 'png';
    const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${fileExt}`;

    const { error } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) throw new Error('图片上传失败: ' + error.message);

    const { data } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

    return data.publicUrl;
}

/**
 * 上传视频到 Supabase Storage（7天有效）
 */
export async function uploadVideo(file) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${fileExt}`;

    const { error } = await supabase.storage
        .from('chat-video')
        .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) throw new Error('视频上传失败: ' + error.message);

    const { data } = supabase.storage
        .from('chat-video')
        .getPublicUrl(fileName);

    return data.publicUrl;
}

/**
 * 发送媒体消息
 */
export async function sendMediaMessage(friendId, mediaUrl, mediaType) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');

    const { data, error } = await supabase
        .from('messages')
        .insert({
            from_user_id: user.id,
            to_user_id: friendId,
            content: '',
            media_url: mediaUrl,
            media_type: mediaType,
            is_read: false
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}