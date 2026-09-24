---
name: actions-npm
description: "Use when creating or debugging GitHub Actions workflows that publish npm packages with trusted publishing / OIDC. Triggers on npm publish in CI, ENEEDAUTH, E404 or E422 during publish, tag-triggered releases, setup-node auth behavior, or provenance issues in public vs private GitHub repositories."
---

# Actions NPM Publish (Trusted Publishing)

## Workflow Template

See [assets/release-npm.yml](assets/release-npm.yml) — 可直接复制到 `.github/workflows/` 使用。

## How It Works

trusted publishing 用 GitHub OIDC 替代长期有效的 `NPM_TOKEN`：

1. workflow 运行在 GitHub-hosted runner 上
2. job 具备 `permissions.id-token: write`
3. npm / `actions/setup-node` 用 GitHub OIDC 身份换取发布凭证
4. `npm publish` 使用该凭证发布

**不需要 `NPM_TOKEN` secret。**

## Verified Requirements

- workflow 必须在 `.github/workflows/`
- 必须使用 GitHub-hosted runner
- 必须有 `id-token: write`
- npm trusted publisher 必须精确匹配仓库和 workflow 文件名，例如 `release-auth-sdk.yml`
- `package.json.repository.url` 必须匹配 GitHub 仓库 URL
- 推荐 `actions/setup-node@v6`
- 推荐 Node 24；如果保留 Node 22，需确认 npm 已升级到 `11.5.1+`

## Important Gotchas

- 使用 `actions/setup-node@v6` 时，不要再手动设置 `NODE_AUTH_TOKEN: ""`。按实测，这种组合会导致 `ENEEDAUTH`；优先让 `setup-node` 自己处理发布凭证。
- `npm notice Publishing to https://registry.npmjs.org/` 之后再报 `E404`，通常说明认证已经通过，但 npm 侧的包权限、scope 权限，或 trusted publisher 元数据仍不匹配。
- `E422 ... Unsupported GitHub Actions source repository visibility: "private"` 表示 private GitHub 仓库不支持 `--provenance`。此时去掉 `--provenance`，保留普通 trusted publishing 即可。
- provenance 目前只适用于 public source repository。

## Publish Command

- public GitHub repo: `npm publish --provenance --access public`
- private GitHub repo: `npm publish --access public`

## Quick Checklist

- `actions/setup-node@v6`
- `node-version: "24"`
- `registry-url: https://registry.npmjs.org/`
- 不配置 `NPM_TOKEN`
- 不手动覆盖 `NODE_AUTH_TOKEN`
- npm 后台 trusted publisher 中的 workflow filename 与实际文件名完全一致
