// ============================================
//  邻星 · UI 工具函数
// ============================================

/**
 * 格式化文件大小
 */
export function formatSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + 'MB';
    return (bytes / 1073741824).toFixed(2) + 'GB';
}

/**
 * 格式化时间（本地时间字符串）
 */
export function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 检查视频是否超过7天
 */
export function isVideoExpired(createdAt) {
    return Date.now() - new Date(createdAt).getTime() > 7 * 24 * 60 * 60 * 1000;
}

/**
 * 获取 URL 参数
 */
export function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}

/**
 * 创建用户头像（首字母）
 */
export function createAvatar(name) {
    return (name || '?')[0];
}

/**
 * 防抖
 */
export function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}