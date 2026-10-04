package com.linxing.cn;

import android.content.Context;
import cn.jpush.android.api.CustomMessage;
import cn.jpush.android.api.NotificationMessage;
import cn.jpush.android.service.JPushMessageReceiver;

public class PushMessageReceiver extends JPushMessageReceiver {
    private static final String TAG = "LinxingPushReceiver";

    // 自定义消息
    @Override
    public void onMessage(Context context, CustomMessage message) {
        JLogger.e(TAG, "[onMessage] " + message);
        JPushPlugin.handleNotificationListener("notificationReceived", message);
    }

    // 通知送达
    @Override
    public void onNotifyMessageArrived(Context context, NotificationMessage message) {
        JLogger.e(TAG, "[onNotifyMessageArrived] " + message);
        JPushPlugin.handleNotificationListener("notificationReceived", message);
    }

    // 点击通知
    @Override
    public void onNotifyMessageOpened(Context context, NotificationMessage message) {
        JLogger.e(TAG, "[onNotifyMessageOpened] " + message);
        JPushPlugin.handleNotificationListener("notificationOpened", message);
    }

    // 注册成功回调
    @Override
    public void onRegister(Context context, String registrationId) {
        JLogger.e(TAG, "[onRegister] " + registrationId);
        JPushPlugin.transmitReceiveRegistrationId(registrationId);
    }
}
