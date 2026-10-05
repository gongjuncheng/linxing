// ============================================
//  邻星 · 媒体上传模块
//  图片（ImgBB）和视频（Supabase Storage）上传
// ============================================

import { supabase } from './supabase.js';
import { IMGBB_API_KEY } from './config.js';

/**
 * 上传图片到 ImgBB。
 * 按用户要求不使用 Supabase Storage 桶（避免占用存储/带宽资源），
 * 明文 key 写入 config.js（用户已知晓并同意）。
 */
export async function uploadImage(file) {
    const formData = new FormData();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', file);

    const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`ImgBB 上传失败 (${response.status}): ${text}`);
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(data.error?.message || 'ImgBB 上传失败');
    }

    return data.data.url;
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
