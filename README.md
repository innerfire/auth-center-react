# @innerfire/auth-center-react

面向 React SPA 的统一账户中心 SDK。包内封装 Casdoor Authorization Code + PKCE、Zustand Token Store、加密持久化、Gateway Bearer Client、Profile Query Store 及账户中心 UI；宿主只需提供同源 rewrite 与公开 OAuth 配置。

## 功能

- 桌面端使用 Popover 展示用户信息卡片。
- 小于 `768px` 时使用 Bottom Sheet（Ant Design Drawer）。
- 展示用户头像和昵称。
- 头像缺失或加载失败时自动使用占位头像。
- 编辑资料：仅展示显示名称和邮箱；只提交实际修改字段。
- 编辑头像：支持 JPEG、PNG，原文件最大 2 MiB，支持 1:1 拖动和缩放裁剪。
- 修改密码：校验原密码、新密码和确认密码；新密码至少 8 位并同时包含字母和数字。
- 退出登录：二次确认，清除 App 会话后进入 Casdoor 前台登出流程。
- 支持外部点击、再次点击头像和 `Esc` 关闭。
- 操作热区不小于 44×44px，并提供键盘、焦点恢复和中文错误提示。
- Profile 使用认证作用域绑定的 TanStack Query Store 缓存；焦点、可见性和重复挂载不会重复请求，资料 mutation 更新缓存，401/退出清空缓存。

> Token 密文存入 `localStorage`，不可导出的 AES-GCM Key 单独存入 IndexedDB。该机制保护静态存储，不抵御已能在页面执行代码的 XSS；宿主仍必须部署 CSP、依赖审计和 HTTPS。

## 安装

安装包及 peer dependencies：

```bash
pnpm add @innerfire/auth-center-react styled-components react react-dom
```

Ant Design、图标、TanStack Query 和 Zustand 是包的普通 dependencies，会随包自动安装。React、ReactDOM 和 styled-components 由宿主共享，避免运行时出现多个实例。

Next.js App Router 不需要 `transpilePackages` 或 CSS loader。建议开启 styled-components 编译支持：

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: { styledComponents: true },
};

export default nextConfig;
```

App Router 的 Client Components 需要按 Next.js 官方 CSS-in-JS 指南在根布局配置 styled-components Registry，以便服务端把首屏样式写入 `<head>`。Registry 使用 `ServerStyleSheet`、`StyleSheetManager` 和 `useServerInsertedHTML`，并包裹根布局的 `children`。本仓库可参考 `apps/app/src/lib/styled-components-registry.tsx`。

Vite React SPA 不需要 CSS plugin 或额外样式 import。严格 CSP 场景应由宿主通过 `StyleSheetManager nonce={nonce}` 提供每请求 nonce；不要创建第二个 styled-components 实例。

## 基本使用

```tsx
"use client";

import {
  AccountCenter,
  AccountCenterCallback,
  AccountCenterProvider,
} from "@innerfire/auth-center-react";

const config = {
  casdoor: {
    authorizationEndpoint: "https://casdoor.example.com/login/oauth/authorize",
    tokenEndpoint: "/casdoor-spa/token",
    clientId: "spa-public-client",
    redirectUri: "https://app.example.com/login/callback",
    scopes: ["openid", "profile", "email"],
  },
  gateway: {
    baseUrl: "/gateway",
  },
  routes: { afterLogin: "/", afterLogout: "/login" },
};

export function Root() {
  return (
    <AccountCenterProvider config={config}>
      <AccountCenter themeColor="#0075de" avatarSize={32} />
    </AccountCenterProvider>
  );
}

// 在 redirectUri 对应页面渲染：<AccountCenterCallback />
```

`AccountCenterProvider` 内部提供独立 QueryClient，宿主不需要为账户中心配置 TanStack Query。建议将入口放在受保护页面顶部导航栏右侧。当前接入位置包括：

- `/`
- `/chat/**`
- `/profile/**`

登录页不应渲染该组件。

## 配置

`AccountCenter` 只开放 `themeColor`、`avatarSize` 和兼容用 `adapter`。认证与接口配置统一由 `AccountCenterProvider` 管理：

| 配置 | 说明 |
| --- | --- |
| `casdoor.authorizationEndpoint` | 浏览器可访问的 Casdoor authorize URL。 |
| `casdoor.tokenEndpoint` | 由宿主 rewrite 提供的同源 token endpoint。 |
| `casdoor.clientId` | Casdoor Public Client ID；禁止配置 client secret。 |
| `casdoor.applicationOwner` | 当前项目 Casdoor Application owner，用于可信 front-channel logout。 |
| `casdoor.applicationName` | 当前项目 Casdoor Application name，不是 clientId。 |
| `casdoor.redirectUri` | 精确注册的 SPA callback URL。 |
| `gateway.baseUrl` | Gateway 同源 rewrite 前缀，例如 `/gateway`。 |
| `gateway.resourceUri` | 可选 RFC 8707 Resource URI；省略时 Casdoor 按当前应用 clientId 签发 audience。 |
| `storageKey` | 可选的加密 Zustand 持久化命名空间。 |
| `capabilities` | 可选能力配置；密码修改默认开启，头像上传默认关闭。 |

Next.js rewrite 示例：

```ts
{
  source: "/gateway/:path*",
  destination: `${gatewayOrigin}/:path*`,
},
{
  source: "/casdoor-spa/token",
  destination: `${casdoorOrigin}/api/login/oauth/access_token`,
}
```

## 直接 Gateway 契约

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/v1/auth/profile` | 获取当前用户资料。 |
| `PATCH` | `/v1/auth/profile` | 白名单差量更新资料。 |
| `POST` | `/v1/auth/avatar` | 上传 multipart `file`。 |
| `POST` | `/v1/auth/password` | 修改密码；成功必须返回 204。 |
| `POST` | `/v1/auth/logout` | 尽力注销 Casdoor 服务端会话，并优先返回可信 `redirectUrl`。 |

账户接口请求由 DirectGatewayAdapter 自动添加 Bearer Token；401 会清除 Token 和 Profile 缓存，并执行与显式退出相同的 Gateway 优先、应用配置兜底流程，回到 `auto=0` 的登录页。非幂等请求不会自动重放。

## Token 生命周期

- 登录使用 Authorization Code + PKCE S256，并校验一次性 `state`；仅在宿主明确配置 `gateway.resourceUri` 时才发送 RFC 8707 `resource`。
- Access Token 到期前 30 秒使用 Refresh Token 单飞刷新。
- Zustand 只持久化 TokenSet，不持久化方法、Profile 或权限派生状态。
- TokenSet 使用 AES-GCM 加密；不可导出密钥存于 IndexedDB，密文存于 localStorage。
- 登录、刷新、401、修改密码和退出都会同步轮换认证作用域并清理 Profile Cache。

## 安全边界

- Casdoor 应用必须配置为 Public Client，并启用 PKCE；SPA 中不得存在 client secret。
- 生产 authorization、redirectUri、Gateway 与 Casdoor rewrite 上游必须使用 HTTPS。
- Gateway 必须验证 JWT、用户状态和字段白名单；浏览器校验不能替代服务端校验。
- CSP、依赖供应链审计和输出编码仍是必须项；客户端加密无法抵御 XSS。
- `apps/app` 必须提供 `CASDOOR_APPLICATION_OWNER` 与 `CASDOOR_APPLICATION_NAME`。它们用于 Gateway 未返回合法 `redirectUrl` 时的 `/cas/{owner}/{application}/logout` fallback。每组织独立应用另外把该 owner 写成授权 `client_id` 的 `-org-{organization}` 后缀；省略 `organization` 时 `client_id` 保持原值。
- Gateway `/v1/auth/logout` 返回的 `redirectUrl` 优先，但必须通过可信 Casdoor origin、无 query/hash 和 logout 路径校验；失败、缺失或非法时才使用应用配置 fallback。
- 无论 Gateway 成功、401、超时还是返回 5xx，退出都会清除本地 Token/Profile Cache；显式退出使用 `reason=logout&auto=0`，401 使用 `reason=unauthorized&auto=0`。

## 开发与验证

```bash
pnpm --filter @innerfire/auth-center-react test
pnpm --filter @innerfire/auth-center-react typecheck
pnpm --filter @innerfire/auth-center-react lint
pnpm --filter @innerfire/auth-center-react build
pnpm --filter @innerfire/auth-center-react validate:package
pnpm --filter @repo/app test
NEXT_PUBLIC_APP_URL=https://app.example.com \
AUTH_GATEWAY_URL=https://gateway.example.com \
CASDOOR_ENDPOINT=https://casdoor.example.com \
CASDOOR_CLIENT_ID=spa-public-client \
CASDOOR_APPLICATION_OWNER=built-in \
CASDOOR_APPLICATION_NAME=genaiw-app \
pnpm --filter @repo/app build
```

自动化测试覆盖 Profile DTO、Bearer 请求、资料字段映射、401 清理、密码 204、AES-GCM 静态加密、缓存隔离以及桌面/移动端交互。真实 Casdoor PKCE、Refresh Token、头像 Storage provider 和 SSO Logout Callback 仍需环境联调。
