# 🚀 Cloudflare Pages Git 集成部署指南

你的项目已经推送到 GitHub (`git@github.com:zernel/abcjs-ai-editor.git`)，现在可以通过 Cloudflare Pages 的 Git 集成功能自动部署。

## 📋 前置检查

✅ **已完成**：
- [x] 项目已推送到 GitHub
- [x] `react-router.config.ts` 已配置为 SPA 模式 (`ssr: false`)
- [x] `public/_redirects` 文件已创建（用于 SPA 路由）
- [x] `.gitignore` 已正确配置（排除 build/ 目录）

## 🎯 部署步骤

### 步骤 1: 登录 Cloudflare Dashboard

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 如果没有账号，先注册/登录

### 步骤 2: 创建 Pages 项目

1. 在左侧菜单中找到 **Workers & Pages**
2. 点击 **Create application**
3. 选择 **Pages** 标签页
4. 点击 **Connect to Git**

### 步骤 3: 连接 GitHub 仓库

1. **授权 Cloudflare**：
   - 点击 **Connect to GitHub**（或 GitLab/Bitbucket）
   - 按照提示授权 Cloudflare 访问你的 GitHub 账号
   - 选择需要授权的仓库范围（建议选择 `zernel/abcjs-ai-editor`）

2. **选择仓库**：
   - 在仓库列表中找到 `zernel/abcjs-ai-editor`
   - 点击 **Begin setup**

### 步骤 4: 配置构建设置

在 **Build configuration** 页面，配置以下设置：

#### 基本设置

- **Project name**: `abcjs-ai-editor`（或你喜欢的名称）
- **Production branch**: `main`（或你的主分支名称，通常是 `main` 或 `master`）

#### 构建设置（重要！）

- **Framework preset**: 选择 **None**（React Router 不在预设列表中）
- **Build command**: 
  ```
  npm ci && npm run build
  ```
  > 💡 `npm ci` 用于安装依赖（比 `npm install` 更快且可重复）
  
- **Build output directory**: 
  ```
  build/client
  ```
  > ⚠️ 这是 React Router 构建输出的静态文件目录

- **Root directory**: 留空（使用项目根目录）

> ✅ **好消息**：React Router v7 在 SPA 模式下会自动生成 `build/client/index.html`，无需手动创建！
> 
> 已自动配置的文件：
> - ✅ `public/_redirects` - SPA 路由重定向规则
> - ✅ `react-router.config.ts` - 已设置为 SPA 模式 (`ssr: false`)

#### 环境变量（可选）

如果需要设置环境变量，点击 **Environment variables**：

- `NODE_VERSION`: `20`（推荐使用 Node.js 20）
- `NPM_FLAGS`: `--legacy-peer-deps`（如果遇到依赖冲突）

> 💡 你的项目使用 OpenAI API，但 API Key 是用户在前端设置的，不需要在这里配置。

### 步骤 5: 保存并部署

1. 点击 **Save and Deploy**
2. Cloudflare 会开始：
   - 克隆你的仓库
   - 安装依赖 (`npm ci`)
   - 构建项目 (`npm run build`)
   - 部署静态文件

### 步骤 6: 等待部署完成

部署过程通常需要 2-5 分钟。你可以：
- 在部署页面查看实时构建日志
- 等待部署完成

部署成功后，你会看到：
- ✅ 绿色的成功提示
- 🌐 预览 URL（格式：`https://abcjs-ai-editor.pages.dev`）

## ✅ 验证部署

部署成功后，访问预览 URL 并测试：

1. **页面加载**：检查页面是否正常显示
2. **编辑器功能**：测试 ABC 代码编辑器
3. **五线谱渲染**：检查五线谱是否正常渲染
4. **路由导航**：测试页面路由是否正常（SPA 路由）
5. **AI 功能**：测试 AI 对话框（需要用户设置 API Key）

## 🔄 自动部署

配置完成后，每次你推送代码到 GitHub 的 `main` 分支时，Cloudflare Pages 会自动：
1. 检测到新的提交
2. 重新构建项目
3. 部署新版本

你可以在 Cloudflare Dashboard 中查看所有部署历史。

## 🎨 自定义域名

### 添加自定义域名

1. 在 Cloudflare Dashboard 中，进入你的 Pages 项目
2. 点击 **Custom domains** 标签
3. 点击 **Set up a custom domain**
4. 输入你的域名（例如：`music-editor.example.com`）
5. 按照提示配置 DNS：
   - 如果域名在 Cloudflare 管理：自动配置
   - 如果不在：需要手动添加 CNAME 记录

### DNS 配置（如果域名不在 Cloudflare）

在你的 DNS 提供商处添加：
- **类型**: CNAME
- **名称**: `music-editor`（或你想要的子域名）
- **值**: `abcjs-ai-editor.pages.dev`（你的 Pages 域名）

## 🐛 常见问题

### 1. 构建失败：找不到模块

**问题**：构建日志显示 `Cannot find module` 错误

**解决**：
- 检查 `package.json` 中是否所有依赖都已列出
- 确保 `package-lock.json` 已提交到 Git
- 尝试在环境变量中添加 `NPM_FLAGS: --legacy-peer-deps`

### 2. 构建成功但页面空白

**问题**：部署成功但页面显示空白或 404

**解决**：
- 检查 **Build output directory** 是否为 `build/client`
- 确认 `public/_redirects` 文件存在（用于 SPA 路由）
- 查看浏览器控制台是否有错误

### 3. 路由不工作

**问题**：直接访问子路由返回 404

**解决**：
- 确认 `public/_redirects` 文件包含：`/*    /index.html   200`
- 在 Cloudflare Dashboard → **Settings** → **Functions** → **Redirects** 中添加规则

### 4. 静态资源 404

**问题**：CSS/JS 文件加载失败

**解决**：
- 检查构建输出目录是否正确
- 确认所有静态资源都在 `build/client` 目录中
- 查看网络请求，检查资源路径是否正确

### 5. Node.js 版本不兼容

**问题**：构建失败，提示 Node.js 版本问题

**解决**：
- 在环境变量中设置 `NODE_VERSION: 20`
- 或在 `package.json` 中添加 `engines` 字段：
  ```json
  {
    "engines": {
      "node": ">=18.0.0"
    }
  }
  ```

## 📊 查看部署日志

如果部署失败，可以：
1. 在 Cloudflare Dashboard 中查看构建日志
2. 检查错误信息
3. 根据错误信息调整配置

## 🔧 高级配置

### 预览部署

Cloudflare Pages 会为每个 Pull Request 创建预览部署：
1. 在 GitHub 创建 Pull Request
2. Cloudflare 自动创建预览部署
3. 在 PR 中会显示预览链接

### 回滚部署

如果需要回滚到之前的版本：
1. 在 Cloudflare Dashboard 中进入你的项目
2. 点击 **Deployments** 标签
3. 找到要回滚的版本
4. 点击 **Retry deployment** 或 **Rollback**

## 📝 下一步

部署成功后，你可以：
- ✅ 分享你的应用链接
- ✅ 配置自定义域名
- ✅ 设置环境变量（如需要）
- ✅ 配置自动部署规则

---

**需要帮助？** 查看 [cloudflare-deploy.md](./cloudflare-deploy.md) 了解更多部署选项。
