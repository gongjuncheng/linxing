// ============================================
//  邻星 · 消息渲染模块
//  渲染各类消息（文本、图片、视频、小纸条、系统消息）
// ============================================

import { formatTime, isVideoExpired } from './ui-utils.js';
import { loadBurnAgreement, loadReadReceiptAgreement } from './agreements.js';

/**
 * 渲染文本消息
 */
export function renderTextMessage(msg, currentUserId, container) {
    const existing = container.querySelector(`[data-msg-id="${msg.id}"]`);
    if (existing) return;

    const div = document.createElement('div');
    div.className = `msg ${msg.from_user_id === currentUserId ? 'sent' : 'received'}`;
    div.dataset.msgId = msg.id;

    let contentHtml = msg.content || '';
    if (msg.is_burn) {
        if (msg.from_user_id === currentUserId) {
            contentHtml += `<span class="burn-badge">🔥 ${msg.burn_seconds}s 后焚毁</span>`;
        } else {
            contentHtml += `<span class="burn-badge burn-incoming">🔥 阅后即焚 · ${msg.burn_seconds}s</span>`;
        }
    }
    if (msg.is_read && msg.from_user_id !== currentUserId) {
        contentHtml += `<span class="read-status">✓ 已读</span>`;
    }

    div.innerHTML = `${contentHtml}<span class="time">${formatTime(msg.created_at)}</span>`;
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

    div.innerHTML = `
        <span class="sticker-label">📝 小纸条</span>
        ${sticker.content}
        <span class="time">${formatTime(sticker.created_at)}</span>
        ${readStatus}
    `;
    container.insertBefore(div, container.querySelector('.typing-bubble'));
    return div;
}

/**
 * 渲染媒体消息（图片/视频）
 */
export function renderMediaMessage(msg, currentUserId, container, expired = false) {
    const existing = container.querySelector(`[data-msg-id="${msg.id}"]`);
    if (existing) return;

    const div = document.createElement('div');
    div.className = `msg ${msg.from_user_id === currentUserId ? 'sent' : 'received'} media`;
    div.dataset.msgId = msg.id;

    let mediaHtml = '';
    if (expired || (msg.media_type === 'video' && isVideoExpired(msg.created_at))) {
        mediaHtml = `
            <div class="media-expired">
                <div class="icon">📎</div>
                <span>文件已过期</span>
            </div>
        `;
    } else if (msg.media_type === 'image') {
        mediaHtml = `<img src="${msg.media_url}" alt="图片" onclick="window.previewImage('${msg.media_url}')" />`;
    } else if (msg.media_type === 'video') {
        mediaHtml = `<video controls preload="metadata"><source src="${msg.media_url}" /></video>`;
    }

    let burnHtml = '';
    if (msg.is_burn) {
        burnHtml = msg.from_user_id === currentUserId
            ? `<span class="burn-badge">🔥 ${msg.burn_seconds}s 后焚毁</span>`
            : `<span class="burn-badge burn-incoming">🔥 阅后即焚 · ${msg.burn_seconds}s</span>`;
    }

    div.innerHTML = `${mediaHtml}${burnHtml}<span class="time">${formatTime(msg.created_at)}</span>`;
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

    // 提取约定ID（真实数据库主键，UUID 格式）
    const agreementIdMatch = msg.content.match(/约定ID[：:]\s*([0-9a-fA-F-]+)/);
    const agreementId = agreementIdMatch ? agreementIdMatch[1] : null;
    const type = msg.system_type === 'burn_agreement' ? 'burn' : 'read_receipt';

    // 约定请求由对方发起（from_user_id），只有「接收方」（to_user_id === 当前用户）才能同意/拒绝
    const iAmRecipient = msg.to_user_id === currentUserId;

    // 解析约定当前状态：已非 pending（已同意/已拒绝/已撤销）则只展示结果，不再显示操作按钮
    let agreementStatus = null;
    if (agreementId && iAmRecipient) {
        try {
            const ag = type === 'burn'
                ? await loadBurnAgreement(msg.from_user_id)
                : await loadReadReceiptAgreement(msg.from_user_id);
            if (ag && ag.id === agreementId) agreementStatus = ag.status;
        } catch (e) {
            // 忽略查询异常，退化为显示按钮
        }
    }

    let actions = '';
    if (agreementId && iAmRecipient && agreementStatus === 'pending') {
        actions = `
            <div class="system-actions" data-msg-id="${msg.id}" data-agreement-id="${agreementId}" data-type="${type}">
                <button class="small success agree-agreement">同意</button>
                <button class="small danger reject-agreement">拒绝</button>
            </div>
        `;
    } else if (agreementId && iAmRecipient && agreementStatus && agreementStatus !== 'pending') {
        const label = agreementStatus === 'accepted' ? '✅ 已同意'
            : agreementStatus === 'rejected' ? '❌ 已拒绝' : '↩️ 已撤销';
        actions = `
            <div class="system-actions" data-agreement-id="${agreementId}" data-type="${type}">
                <span class="agreement-result">${label}</span>
            </div>
        `;
    }

    div.innerHTML = `
        <div class="system-content">${msg.content}</div>
        ${actions}
        <span class="time">${formatTime(msg.created_at)}</span>
    `;

    container.insertBefore(div, container.querySelector('.typing-bubble'));

    // 绑定按钮事件
    div.querySelectorAll('.agree-agreement').forEach(btn => {
        btn.addEventListener('click', () => {
            const container = btn.closest('.system-actions');
            if (onAgree) onAgree(container.dataset.agreementId, container.dataset.type);
        });
    });
    div.querySelectorAll('.reject-agreement').forEach(btn => {
        btn.addEventListener('click', () => {
            const container = btn.closest('.system-actions');
            if (onReject) onReject(container.dataset.agreementId, container.dataset.type);
        });
    });

    return div;
}