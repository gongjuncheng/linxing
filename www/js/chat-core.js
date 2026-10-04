// ============================================
//  邻星 · 聊天核心模块
//  加载消息、发送消息、广播订阅、标记已读
// ============================================

import { supabase } from './supabase.js';
import {
    renderTextMessage,
    renderStickerMessage,
    renderMediaMessage,
    renderSystemMessage
} from './messages.js';

// ===== 状态 =====
let currentChatUserId = null;
let currentUserId = null;
let typingChannel = null;
let typingTimeout = null;
let typingInputHandler = null;

/**
 * 初始化聊天
 */
export function initChat(friendId, userId, container, options = {}) {
    currentChatUserId = friendId;
    currentUserId = userId;

    const {
        onNewMessage,
        onNewSticker,
        onAgreementUpdate,
        onTypingStart,
        onTypingEnd
    } = options;

    // 加载消息
    loadMessages(friendId, container);

    // 订阅广播
    subscribeToChannel(friendId, userId, {
        onNewMessage,
        onNewSticker,
        onAgreementUpdate,
        onTypingStart,
        onTypingEnd
    });

    // 标记已读
    markMessagesRead(friendId, userId);

    return {
        sendMessage,
        loadMessages,
        markMessagesRead,
        cleanup,
        // 暴露当前广播频道，供聊天页做实时推送（chat.html 里用到 chatApi._channel）
        get _channel() {
            return typingChannel;
        }
    };
}

/**
 * 加载消息
 */
export async function loadMessages(friendId, container) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [msgRes, stickerRes] = await Promise.all([
        supabase
            .from('messages')
            .select('*')
            .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${user.id})`)
            .order('created_at', { ascending: true }),
        supabase
            .from('stickers')
            .select('*')
            .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${user.id})`)
            .order('created_at', { ascending: true })
    ]);

    // 清空消息容器，保留打字气泡
    container.innerHTML = '';
    const typingBubble = document.createElement('div');
    typingBubble.className = 'typing-bubble hidden';
    typingBubble.id = 'typing-bubble';
    container.appendChild(typingBubble);

    const all = [
        ...(msgRes.data || []),
        ...(stickerRes.data || []).map(s => ({ ...s, is_sticker: true }))
    ];
    all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    all.forEach(item => {
        if (item.is_sticker) {
            renderStickerMessage(item, user.id, container);
        } else if (item.is_system) {
            renderSystemMessage(item, user.id, container);
        } else if (item.media_url) {
            renderMediaMessage(item, user.id, container, false);
        } else {
            renderTextMessage(item, user.id, container);
        }
    });

    container.scrollTop = container.scrollHeight;
}

/**
 * 标记消息已读（仅在已读回执约定生效时）
 */
export async function markMessagesRead(friendId, userId) {
    // 检查是否有已读回执约定且生效
    const { data: readAgreement } = await supabase
        .from('read_receipt_agreements')
        .select('status')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('friend_id', friendId)
        .maybeSingle();

    if (readAgreement && readAgreement.status === 'accepted') {
        const { error } = await supabase
            .from('messages')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('to_user_id', userId)
            .eq('from_user_id', friendId)
            .eq('is_read', false);
        if (error) console.error('标记已读失败', error);
    }
}

/**
 * 订阅广播频道
 */
function subscribeToChannel(friendId, userId, handlers) {
    if (typingChannel) {
        typingChannel.unsubscribe();
        typingChannel = null;
    }

    const ids = [userId, friendId].sort();
    const shortIds = ids.map(id => id.slice(0, 8));
    const channelName = `typing-${shortIds[0]}-${shortIds[1]}`;

    typingChannel = supabase.channel(channelName);

    // 打字流
    typingChannel.on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.sender === userId) return;
        if (payload.content && payload.content.length > 0) {
            if (handlers.onTypingStart) handlers.onTypingStart(payload.content);
        } else {
            if (handlers.onTypingEnd) handlers.onTypingEnd();
        }
    });

    // 新消息
    typingChannel.on('broadcast', { event: 'new_message' }, async ({ payload }) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (payload.from_user_id === user.id) return;
        if (payload.to_user_id !== user.id && payload.from_user_id !== user.id) return;

        const { data: msg } = await supabase
            .from('messages')
            .select('*')
            .eq('id', payload.message_id)
            .single();

        if (msg) {
            if (handlers.onNewMessage) handlers.onNewMessage(msg);
        }
    });

    // 新小纸条
    typingChannel.on('broadcast', { event: 'new_sticker' }, async ({ payload }) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (payload.from_user_id === user.id) return;
        if (payload.to_user_id !== user.id && payload.from_user_id !== user.id) return;

        const { data: sticker } = await supabase
            .from('stickers')
            .select('*')
            .eq('id', payload.sticker_id)
            .single();

        if (sticker) {
            if (handlers.onNewSticker) handlers.onNewSticker(sticker);
        }
    });

    // 约定更新
    typingChannel.on('broadcast', { event: 'agreement_update' }, async ({ payload }) => {
        if (handlers.onAgreementUpdate) handlers.onAgreementUpdate(payload);
    });

    typingChannel.subscribe((status) => {
        console.log('📡 订阅状态:', status);
    });

    return typingChannel;
}

/**
 * 发送文本消息
 */
export async function sendMessage(friendId, content, isBurn = false, burnSeconds = 0) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');

    const { data: inserted, error } = await supabase
        .from('messages')
        .insert({
            from_user_id: user.id,
            to_user_id: friendId,
            content: content,
            is_burn: isBurn,
            burn_seconds: burnSeconds,
            is_read: false
        })
        .select()
        .single();

    if (error) throw error;

    // 广播
    if (typingChannel) {
        typingChannel.send({
            type: 'broadcast',
            event: 'new_message',
            payload: {
                message_id: inserted.id,
                from_user_id: user.id,
                to_user_id: friendId
            }
        });
    }

    return inserted;
}

/**
 * 清理聊天资源
 */
export function cleanup() {
    if (typingChannel) {
        typingChannel.unsubscribe();
        typingChannel = null;
    }
    if (typingInputHandler) {
        // 由调用方移除事件监听
    }
}