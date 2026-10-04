// ============================================
//  邻星 · 认证模块
//  登录、注册、退出、会话检查
// ============================================

import { supabase } from './supabase.js';

/**
 * 检查当前会话，返回当前用户（user）或 null
 * 注意：调用方都把它当作 user 使用（.id / .user_metadata），
 * 因此这里直接返回 session.user。
 */
export async function getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
}

/**
 * 获取当前用户
 */
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * 登录
 */
export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

/**
 * 注册
 */
export async function register(email, password, metadata) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: metadata // { display_name, username, birthday, location }
        }
    });
    if (error) throw error;
    return data;
}

/**
 * 退出登录
 */
export async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

/**
 * 检查并跳转（用于入口页）
 * 如果有 session 则跳转到 main.html，否则跳转到 login.html
 */
export async function redirectBasedOnAuth() {
    const session = await getSession();
    if (session) {
        window.location.href = './main.html';
    } else {
        window.location.href = './login.html';
    }
}

/**
 * 获取当前用户的 profile 信息
 */
export async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
}