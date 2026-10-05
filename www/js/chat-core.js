// ============================================
//  邻星 · 聊天核心模块
//  加载消息、发送消息、广播订阅、标记已读、阅后即焚
// ============================================

import { supabase } from './supabase.js';
import { loadBurnAgreement, handleBurnAgreement, handleReadReceiptAgreement } from './agreements.js';
import {
    renderTextMessage,
    renderStickerMessage,
    renderMediaMessage,
    renderSystemMessage
} from './messages.js';

// Supabase 项目地址（用于调用 Edge Function）
const SUPABASE_URL = 'https://tercpgsnqwhbxlwpsbeo.supabase.co';

// ===== 状态 =====
let currentChatUserId = null;
let currentUserId = null;
let currentContainer = null;   // 当前聊天消息容器，供焚毁时移除 DOM
let typingChannel = null;
let typingTimeout = null;
let typingInputHandler = null;
const burnTimers = {};         // messageId -> setTimeout 句柄，避免重复安排

/**
 * 初始化聊天
 */
export function initChat(friendId, userId, container, options = {}) {
    currentChatUserId = friendId;
    currentUserId = userId;
    currentContainer = container;

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

    // 标记已读 + 安排阅后即焚
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

    currentContainer = container;

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
            renderSystemMessage(item, user.id, container, onAgreeAgreement, rejectAgreement);
        } else if (item.media_url) {
            renderMediaMessage(item, user.id, container, false);
        } else {
            renderTextMessage(item, user.id, container);
        }
    });

    container.scrollTop = container.scrollHeight;
}

/**
 * 标记消息已读 + 安排阅后即焚
 * - 已读回执约定生效时，才把 is_read 标记给对方看
 * - 阅后即焚独立生效：接收方看到的 is_burn 消息，会在 burn_seconds 后真正删除
 */
export async function markMessagesRead(friendId, userId) {
    // 1) 阅后即焚：找出「对方发给我、未读、且 is_burn」的消息，安排焚毁
    const { data: unreadBurn } = await supabase
        .from('messages')
        .select('id, burn_seconds')
        .eq('to_user_id', userId)
        .eq('from_user_id', friendId)
        .eq('is_read', false)
        .eq('is_burn', true);

    if (unreadBurn && unreadBurn.length) {
        unreadBurn.forEach(m => scheduleBurn(m, userId));
    }

    // 2) 已读回执约定：生效时才标记 is_read（让发送方看到「已读」）
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
            // 阅后即焚：接收方实时收到自己的未读焚毁消息，立即安排焚毁
            if (msg.is_burn && msg.to_user_id === user.id) {
                scheduleBurn({ id: msg.id, burn_seconds: msg.burn_seconds }, user.id);
            }
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

    // 消息被焚毁删除：移除本地 DOM
    typingChannel.on('broadcast', { event: 'message_deleted' }, ({ payload }) => {
        removeMessageFromUI(payload.message_id);
    });

    typingChannel.subscribe((status) => {
        console.log('📡 订阅状态:', status);
    });

    return typingChannel;
}

/**
 * 发送文本消息
 * 若为阅后即焚消息，必须双方已达成 accepted 的约定，否则降级为普通消息
 */
export async function sendMessage(friendId, content, isBurn = false, burnSeconds = 0) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');

    // 约定校验：阅后即焚需双方同意
    let effectiveBurn = isBurn;
    let effectiveSeconds = burnSeconds;
    if (effectiveBurn) {
        const agreement = await loadBurnAgreement(friendId);
        if (!agreement || agreement.status !== 'accepted') {
            console.warn('未达成阅后即焚约定，已降级为普通消息');
            effectiveBurn = false;
            effectiveSeconds = 0;
        }
    }

    const { data: inserted, error } = await supabase
        .from('messages')
        .insert({
            from_user_id: user.id,
            to_user_id: friendId,
            content: content,
            is_burn: effectiveBurn,
            burn_seconds: effectiveSeconds,
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
 * 安排阅后即焚：N 秒后真正删除该消息（数据库硬删），并通知对端移除
 */
function scheduleBurn(msg, userId) {
    if (burnTimers[msg.id]) return; // 已安排，避免重复
    const secs = Number(msg.burn_seconds) || 5;
    burnTimers[msg.id] = setTimeout(async () => {
        delete burnTimers[msg.id];
        await deleteMessage(msg.id);
        removeMessageFromUI(msg.id);
        // 通知对端也移除
        if (typingChannel) {
            typingChannel.send({
                type: 'broadcast',
                event: 'message_deleted',
                payload: { message_id: msg.id }
            });
        }
    }, secs * 1000);
}

/**
 * 从聊天界面移除某条消息节点
 */
function removeMessageFromUI(msgId) {
    if (!currentContainer) return;
    const el = currentContainer.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) el.remove();
}

/**
 * 调用后端函数真正删除消息（service role 硬删，带归属校验）
 */
async function deleteMessage(msgId) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        await fetch(`${SUPABASE_URL}/functions/v1/delete-message`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message_id: msgId })
        });
    } catch (e) {
        console.error('焚毁删除失败', e);
    }
}

/**
 * 清理聊天资源
 */
export function cleanup() {
    if (typingChannel) {
        typingChannel.unsubscribe();
        typingChannel = null;
    }
    // 清空未触发的焚毁定时器
    Object.keys(burnTimers).forEach(id => {
        clearTimeout(burnTimers[id]);
        delete burnTimers[id];
    });
    if (typingInputHandler) {
        // 由调用方移除事件监听
    }
}

// ===== 系统消息「同意 / 拒绝」约定按钮回调 =====
// 与 chat.html 中的 handleAgreementAction 等价，但点击即生效（不二次确认），
// 用于历史加载消息的渲染（loadMessages）以及对外统一暴露。
async function resolveAgreement(agreementId, type, action) {
    if (!agreementId) return;
    try {
        if (type === 'burn') {
            await handleBurnAgreement(agreementId, action);
        } else if (type === 'read_receipt') {
            await handleReadReceiptAgreement(agreementId, action);
        }
    } catch (e) {
        console.error('处理约定失败', e);
        alert('操作失败：' + (e?.message || e));
        return;
    }
    // 更新该条系统消息的按钮区域为结果
    if (currentContainer) {
        currentContainer
            .querySelectorAll(`.system-actions[data-agreement-id="${agreementId}"]`)
            .forEach(el => {
                el.innerHTML = `<span class="agreement-result">${action === 'agree' ? '✅ 已同意' : '❌ 已拒绝'}</span>`;
            });
    }
    // 广播对端，触发其状态刷新
    if (typingChannel) {
        typingChannel.send({
            type: 'broadcast',
            event: 'agreement_update',
            payload: { agreementId, type, action }
        });
    }
}

export const onAgreeAgreement = (id, type) => resolveAgreement(id, type, 'agree');
export const rejectAgreement = (id, type) => resolveAgreement(id, type, 'reject');
