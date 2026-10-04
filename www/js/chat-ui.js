// ============================================
//  邻星 · 聊天UI操作
//  面板切换、对话框控制、弹窗管理
// ============================================

/**
 * 控制功能面板（加号面板）
 */
export function setupActionSheet(plusBtn, actionSheet, closeBtn) {
    plusBtn.addEventListener('click', () => {
        actionSheet.classList.remove('hidden');
    });

    closeBtn.addEventListener('click', () => {
        actionSheet.classList.add('hidden');
    });

    actionSheet.addEventListener('click', (e) => {
        if (e.target === actionSheet) actionSheet.classList.add('hidden');
    });
}

/**
 * 控制小纸条对话框
 */
export function setupStickerDialog(entryBtn, dialog, cancelBtn, sendBtn, contentTextarea) {
    entryBtn.addEventListener('click', () => {
        dialog.classList.remove('hidden');
        contentTextarea.value = '';
        contentTextarea.focus();
    });

    cancelBtn.addEventListener('click', () => {
        dialog.classList.add('hidden');
    });

    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.classList.add('hidden');
    });

    return {
        show: () => dialog.classList.remove('hidden'),
        hide: () => dialog.classList.add('hidden'),
        getContent: () => contentTextarea.value.trim()
    };
}

/**
 * 控制阅后即焚对话框
 */
export function setupBurnDialog(entryBtn, dialog, cancelBtn, sendBtn, secondsInput, statusEl) {
    entryBtn.addEventListener('click', () => {
        dialog.classList.remove('hidden');
        statusEl.textContent = '';
    });

    cancelBtn.addEventListener('click', () => {
        dialog.classList.add('hidden');
    });

    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.classList.add('hidden');
    });

    return {
        show: () => dialog.classList.remove('hidden'),
        hide: () => dialog.classList.add('hidden'),
        getSeconds: () => parseInt(secondsInput.value) || 5,
        setStatus: (msg) => { statusEl.textContent = msg; }
    };
}

/**
 * 控制已读回执对话框
 */
export function setupReadReceiptDialog(entryBtn, dialog, cancelBtn, sendBtn, statusEl) {
    entryBtn.addEventListener('click', () => {
        dialog.classList.remove('hidden');
        statusEl.textContent = '';
    });

    cancelBtn.addEventListener('click', () => {
        dialog.classList.add('hidden');
    });

    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.classList.add('hidden');
    });

    return {
        show: () => dialog.classList.remove('hidden'),
        hide: () => dialog.classList.add('hidden'),
        setStatus: (msg) => { statusEl.textContent = msg; }
    };
}

/**
 * 控制图片预览
 */
export function setupImagePreview(overlay, imageEl, closeBtn) {
    window.previewImage = function(url) {
        imageEl.src = url;
        overlay.classList.remove('hidden');
    };

    closeBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    });
}