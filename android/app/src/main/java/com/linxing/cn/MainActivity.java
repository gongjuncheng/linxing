package com.linxing.cn;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    public MainActivity() {
        // 注册极光推送桥接插件
        registerPlugin(JPushPlugin.class);
    }
}
