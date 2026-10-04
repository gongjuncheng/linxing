# 邻星（Linxing）

基于 **Capacitor 5 + Supabase** 的即时通讯（IM）App，支持好友、单聊/群聊、小纸条、图片/视频、阅后即焚、已读回执，并已集成 **极光推送（JPush）** 实现新消息通知。

> 包名：`com.linxing.cn` ｜ 应用名：邻星

## 目录结构

```
.
├── www/                      # Web 应用（Capacitor webDir）
│   ├── index.html
│   ├── main.html             # 好友主页（登录后首屏）
│   ├── chat.html             # 聊天页
│   ├── login.html / register.html / setting.html
│   ├── terms.html / privacy.html
│   ├── css/style.css
│   └── js/                  # 模块化 JS（auth / supabase / chat-core / messages / push ...）
├── android/                  # 原生 Android 工程（已纳入版本控制）
│   └── app/src/main/
│       ├── AndroidManifest.xml           # 极光权限 + 自定义组件
│       └── java/com/linxing/cn/
│           ├── MainActivity.java         # 注册 JPush 插件
│           ├── JPushPlugin.java          # 极光桥接插件
│           ├── PushMessageReceiver.java   # 消息/点击回调
│           ├── PushService.java
│           ├── JLogger.java / JPush.java
├── supabase/
│   ├── functions/send-push/  # 服务端推送 Edge Function（调用极光 REST API）
│   └── sql/                  # devices 表 + 新消息触发器
├── capacitor.config.json     # 应用配置（含极光 appKey 占位）
└── package.json
```

## 本地开发

```bash
npm install
npx cap sync          # 把 www/ 同步进 android 原生工程
npx cap open android  # 用 Android Studio 打开
```

## 推送（极光 JPush）配置

1. 在 [极光控制台](https://www.jiguang.cn) 创建应用，拿到 **AppKey**（及服务端用的 **Master Secret**）。
2. 客户端：把 AppKey 填入 `capacitor.config.json` 的 `plugins.JPush.appKey`（或 `android/app/src/main/AndroidManifest.xml` 的 `JPUSH_APPKEY`）。
   - 用户登录后，`js/push.js` 会自动初始化极光、上报 `registration_id` 到 Supabase、并把别名设为 userId。
3. 服务端：
   - Supabase SQL Editor 执行 `supabase/sql/00_devices.sql` 与 `01_push_trigger.sql`（建表 + 新消息自动触发推送）。
   - 部署函数：
     ```bash
     supabase functions deploy send-push
     supabase secrets set JPUSH_APP_KEY=你的AppKey JPUSH_MASTER_SECRET=你的MasterSecret
     ```
   - 触发逻辑：新消息写入 `messages` 表 → 触发器调用 `send-push` → 极光 REST API 下发到接收方设备。

> 厂商通道（小米/OPPO/Vivo/荣耀/魅族等）已在 `android/app/build.gradle` 中通过 Maven 依赖接入；各厂商的 AppId/Key 在**极光控制台**对应通道配置即可，无需改代码（华为/FCM 见注释，需额外 agconnect/google 配置）。

## CI 自动打包

`.github/workflows/build.yml` 在 `push` 到 `main` 时自动 `cap sync` 并签名打包 APK。
签名密钥通过仓库 Secrets（`KEYSTORE_BASE64` / `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD`）注入。
