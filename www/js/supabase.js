// ============================================
//  邻星 · Supabase 客户端
//  所有页面共用此客户端
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://tercpgsnqwhbxlwpsbeo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Klt3VmsiHPAlsiuCc-zApw_xa_PnqB3';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase 客户端已初始化');