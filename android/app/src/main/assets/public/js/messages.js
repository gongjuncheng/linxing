// ============================================
//  邻星 · 消息渲染模块
//  渲染各类消息（文本、图片、视频、小纸条、系统消息）
//  安全约束：所有来自对方（不可信）的动态文本必须转义，禁止 innerHTML 拼接。
// ============================================

import { formatTime, isVideoExpired } from './ui-utils.js';
import { supabase } from './supabase.js';

/**
 * 转义 HTML 特殊字符，防止存储型 XSS。
 * 用于所有需要放进 innerHTML / 属性中的不可信文本（消息内容、媒体 URL 等）。
 */
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}

/**
 * 渲染文本消息
 */
export function renderTextMessage(msg, currentUserId, container, readReceipt = false) {
    const existing = container.querySelector(`[data-msg-id="${msg.id}"]`);
    if (existing) return;

    const div = document.createElement('div');
    div.className = `msg ${msg.from_user_id === currentUserId ? 'sent' : 'received'}`;
    div.dataset.msgId = msg.id;

    // 消息内容来自对方，必须转义
    let contentHtml = escapeHtml(msg.content || '');
    if (msg.is_burn) {
        if (msg.from_user_id === currentUserId) {
            contentHtml += `<span class="burn-badge">🔥 ${msg.burn_seconds}s 后焚毁</span>`;
        } else {
            contentHtml += `<span class="burn-badge burn-incoming">🔥 阅后即焚 · ${msg.burn_seconds}s</span>`;
        }
    }
    // 已读回执：仅在我「发出」的消息上展示「对方是否已读」（约定生效时）
    if (msg.from_user_id === currentUserId && readReceipt) {
        contentHtml += msg.is_read
            ? `<span class="read-status">✓ 已读</span>`
            : `<span class="read-status unread">未读</span>`;
    }

    div.innerHTML = `${contentHtml}<span class="time">${escapeHtml(formatTime(msg.created_at))}</span>`;
    container.insertBefore(div, container.querySelector('.typing-bubble'));
    return div;
}

/**
 * 渲染小纸条消息
 */
export function renderStickerMessage(sticker, currentUserId, container) {
    const existing = container.querySelector(`[data-sticker-id="${sticker.id}"]`);
    if (existing) return;

    const div = document.createElement('div');
    div.className = `msg ${sticker.from_user_id === currentUserId ? 'sent' : 'received'} sticker`;
    div.dataset.stickerId = sticker.id;

    let readStatus = '';
    if (sticker.from_user_id !== currentUserId && sticker.is_read) {
        readStatus = `<span class="read-status">✓ 已读</span>`;
    }

    // sticker.content 来自对方，必须转义
    div.innerHTML = `
        <span class="sticker-label">📝 小纸条</span>
        ${escapeHtml(sticker.content)}
        <span class="time">${escapeHtml(formatTime(sticker.created_at))}</span>
        ${readStatus}
    `;
    container.insertBefore(div, container.querySelector('.typing-bubble'));
    return div;
}

/**
 * 渲染媒体消息（图片/视频）
 * 图片 URL 通过 setAttribute 赋值（而非字符串拼进属性），并改用 addEventListener 预览，避免注入。
 */
export function renderMediaMessage(msg, currentUserId, container, expired = false) {
    const existing = container.querySelector(`[data-msg-id="${msg.id}"]`);
    if (existing) return;

    const div = document.createElement('div');
    div.className = `msg ${msg.from_user_id === currentUserId ? 'sent' : 'received'} media`;
    div.dataset.msgId = msg.id;

    let mediaNode = null;
    if (expired || (msg.media_type === 'video' && isVideoExpired(msg.created_at))) {
        const expiredBox = document.createElement('div');
        expiredBox.className = 'media-expired';
        const icon = document.createElement('div');
        icon.className = 'icon';
        icon.textContent = '📎';
        const label = document.createElement('span');
        label.textContent = '文件已过期';
        expiredBox.appendChild(icon);
        expiredBox.appendChild(label);
        mediaNode = expiredBox;
    } else if (msg.media_type === 'image') {
        const img = document.createElement('img');
        img.alt = '图片';
        // 用 setAttribute 赋值 URL，避免引号注入
        img.setAttribute('src', msg.media_url || '');
        img.addEventListener('click', () => {
            if (typeof window.previewImage === 'function') window.previewImage(msg.media_url);
        });
        mediaNode = img;
    } else if (msg.media_type === 'video') {
        const video = document.createElement('video');
        video.controls = true;
        video.preload = 'metadata';
        const source = document.createElement('source');
        source.setAttribute('src', msg.media_url || '');
        video.appendChild(source);
        mediaNode = video;
    }

    if (mediaNode) div.appendChild(mediaNode);

    if (msg.is_burn) {
        const burn = document.createElement('span');
        burn.className = msg.from_user_id === currentUserId ? 'burn-badge' : 'burn-badge burn-incoming';
        burn.textContent = msg.from_user_id === currentUserId
            ? `🔥 ${msg.burn_seconds}s 后焚毁`
            : `🔥 阅后即焚 · ${msg.burn_seconds}s`;
        div.appendChild(burn);
    }

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatTime(msg.created_at);
    div.appendChild(time);

    container.insertBefore(div, container.querySelector('.typing-bubble'));
    return div;
}

/**
 * 渲染系统消息（约定）
 */
export async function renderSystemMessage(msg, currentUserId, container, onAgree, onReject) {
    const existing = container.querySelector(`[data-msg-id="${msg.id}"]`);
    if (existing) return;

    const div = document.createElement('div');
    div.className = 'msg system';
    div.dataset.msgId = msg.id;

    // 提取约定ID（真实数据库主键，整数格式）
    const agreementIdMatch = msg.content.match(/约定ID[：:]\s*([0-9a-fA-F-]+)/);
    const agreementId = agreementIdMatch ? agreementIdMatch[1] : null;
    const type = msg.system_type === 'burn_agreement' ? 'burn' : 'read_receipt';

    // 约定请求由对方发起（from_user_id），只有「接收方」（to_user_id === 当前用户）才能同意/拒绝
    const iAmRecipient = msg.to_user_id === currentUserId;

    // 直接按主键 id 查约定状态（最稳健，避免 from/to 推断与 id 类型不匹配）
    // - 查到且为 accepted/rejected/revoked → 仅展示结果
    // - 查到且为 pending，或查询出错 → 乐观显示按钮
    // - 行不存在（旧数据残留）→ 不显示按钮，避免点到无意义的死按钮
    let agreementStatus = null;
    let agreementNotFound = false;
    if (agreementId && iAmRecipient) {
        try {
            const table = type === 'burn' ? 'burn_agreements' : 'read_receipt_agreements';
            const { data: ag, error } = await supabase
                .from(table)
                .select('id, status')
                .eq('id', agreementId)
                .maybeSingle();
            if (error) {
                agreementStatus = null; // 查询出错，乐观显示按钮
            } else if (ag) {
                agreementStatus = ag.status;
            } else {
                agreementNotFound = true; // 行不存在（旧数据）
            }
        } catch (e) {
            // 忽略异常，乐观显示按钮
        }
    }

    const finalized = agreementStatus === 'accepted' || agreementStatus === 'rejected' || agreementStatus === 'revoked';

    let actions = '';
    if (agreementId && iAmRecipient && !agreementNotFound && !finalized) {
        actions = `
            <div class="system-actions" data-msg-id="${msg.id}" data-agreement-id="${agreementId}" data-type="${type}">
                <button class="small success agree-agreement">同意</button>
                <button class="small danger reject-agreement">拒绝</button>
            </div>
        `;
    } else if (agreementId && iAmRecipient && agreementStatus) {
        const label = agreementStatus === 'accepted' ? '✅ 已同意'
            : agreementStatus === 'rejected' ? '❌ 已拒绝' : '↩️ 已撤销';
        actions = `
            <div class="system-actions" data-agreement-id="${agreementId}" data-type="${type}">
                <span class="agreement-result">${label}</span>
            </div>
        `;
    }

    // msg.content 来自对方，必须转义
    div.innerHTML = `
        <div class="system-content">${escapeHtml(msg.content)}</div>
        ${actions}
        <span class="time">${escapeHtml(formatTime(msg.created_at))}</span>
    `;

    container.insertBefore(div, container.querySelector('.typing-bubble'));

    // 绑定按钮事件
    div.querySelectorAll('.agree-agreement').forEach(btn => {
        btn.addEventListener('click', () => {
            const el = btn.closest('.system-actions');
            if (onAgree) onAgree(el.dataset.agreementId, el.dataset.type);
        });
    });
    div.querySelectorAll('.reject-agreement').forEach(btn => {
        btn.addEventListener('click', () => {
            const el = btn.closest('.system-actions');
            if (onReject) onReject(el.dataset.agreementId, el.dataset.type);
        });
    });

    return div;
}
