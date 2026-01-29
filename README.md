# 🎹 AI Music Editor

一个基于 ABC 记谱法和 AI 技术的智能音乐编辑器。支持实时预览、语法高亮、双向交互和 AI 辅助创作。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)

## ✨ 核心特性

### 🎼 专业编辑器
- **语法高亮**：为 ABC 记谱法提供彩色语法高亮，提升代码可读性
- **实时预览**：左侧编辑代码，右侧即时显示五线谱
- **纸张效果**：五线谱渲染为逼真的乐谱纸张效果
- **撤销/重做**：完整的历史记录管理（支持快捷键）

### 🔄 双向交互
- **代码选中 → 五线谱高亮**：选中 ABC 代码，对应的音符在五线谱上高亮显示
- **五线谱点击 → 代码定位**：点击五线谱上的音符，自动跳转到对应代码位置
- **智能匹配**：选中内容会自动高亮所有相同的乐句（相同内容显示灰色）

### 🤖 AI 辅助创作
- **自然语言编辑**：用中文描述需求，AI 自动修改乐谱
- **快捷建议**：预设常用修改指令，一键应用
- **智能理解**：支持调性转换、节奏变化、和声添加等复杂操作

### 🎵 音频播放
- **内置播放器**：支持播放、暂停、循环、速度调节
- **自动更新**：编辑乐谱后播放器自动刷新
- **进度显示**：实时显示播放进度

### 💾 多格式导出
- **MIDI 导出**：导出为标准 MIDI 文件
- **PDF 打印**：打印或保存为 PDF 格式
- **音频导出**：导出为 WAV 音频文件

### 📑 模板库
- 内置多个示例模板（C大调音阶、小星星、生日快乐等）
- 快速开始创作

## 🛠 技术栈

- **框架**：React 18 + React Router
- **语言**：TypeScript 5
- **编辑器**：CodeMirror 6
- **乐谱渲染**：abcjs 6.5.2
- **样式**：TailwindCSS
- **构建工具**：Vite
- **AI**：OpenAI API (GPT-4)

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

启动开发服务器（支持 HMR）：

```bash
npm run dev
```

应用将在 `http://localhost:5173` 运行。

### 生产构建

创建生产版本：

```bash
npm run build
```

## 📖 使用说明

### 1. 配置 API Key

点击右上角的 ⚙️ 设置按钮，输入你的 OpenAI API Key（以 `sk-` 开头）。

**如何获取 API Key？**
1. 访问 [platform.openai.com](https://platform.openai.com)
2. 登录或注册账号
3. 进入 API Keys 页面
4. 创建新的 API Key 并复制

> 💡 API Key 只会保存在浏览器本地，不会上传到服务器。

### 2. 选择模板或编写代码

- 点击 📑 模板按钮，选择预设模板快速开始
- 或者直接在左侧编辑器中输入 ABC 代码

### 3. 使用 AI 辅助

在底部的 AI 对话框中输入修改需求，例如：
- "改为 G 大调"
- "把节奏改快一点"
- "添加和弦符号"
- "改成 3/4 拍"

### 4. 交互式编辑

- **选中代码**：拖动鼠标选中代码，五线谱上对应音符会高亮（黄色）
- **点击五线谱**：点击五线谱上的音符，编辑器会自动定位到对应代码

### 5. 播放和导出

- 点击播放器的 ▶️ 播放按钮试听
- 点击右上角的 💾 导出按钮，选择导出格式（MIDI / PDF / WAV）

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + Z` | 撤销 |
| `Cmd/Ctrl + Shift + Z` | 重做 |
| `Cmd/Ctrl + Enter` | 发送 AI 请求 |
| `Tab` | 缩进 |

## 📁 项目结构

```
abcjs-ai-editor/
├── app/
│   ├── components/          # React 组件
│   │   └── AbcEditor.tsx   # CodeMirror 编辑器组件
│   ├── utils/              # 工具函数
│   │   └── abc-language.ts # ABC 语法高亮定义
│   ├── routes/             # 路由页面
│   │   └── _index.tsx      # 主页面
│   ├── app.css             # 全局样式
│   └── root.tsx            # 根组件
├── public/                 # 静态资源
├── build/                  # 构建输出
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🎨 ABC 记谱法简介

ABC 记谱法是一种用 ASCII 字符表示音乐的文本格式。

### 基本语法

```abc
X:1              % 曲目编号
T:My Song        % 标题
M:4/4            % 拍号 (4/4拍)
L:1/4            % 默认音符长度 (四分音符)
K:C              % 调号 (C大调)
C D E F | G A B c |]  % 音符
```

### 常用符号

- **音符**：`C D E F G A B` (低音) / `c d e f g a b` (高音)
- **时值**：`C2` (二分音符) / `C/2` (八分音符) / `C3` (附点)
- **升降号**：`^C` (升) / `_C` (降) / `=C` (还原)
- **小节线**：`|` (单小节线) / `||` (双小节线) / `|]` (结束线)
- **休止符**：`z` (休止) / `x` (不可见休止)
- **和弦**：`"C"C` (C和弦)

更多信息请访问 [abcnotation.com](https://abcnotation.com)

## 🔧 配置说明

### 环境变量

项目不需要特殊的环境变量配置。OpenAI API Key 由用户在前端设置。

### 自定义配置

如需修改 AI 模型或其他设置，编辑 `app/routes/_index.tsx` 中的配置：

```typescript
// AI 模型配置
model: "gpt-4o"  // 可改为 gpt-3.5-turbo 等

// 系统提示词
const SYSTEM_PROMPT = `...`

// 预设建议
const AI_SUGGESTIONS = [...]
```

## 🚢 部署

### Docker 部署

```bash
# 构建镜像
docker build -t abcjs-ai-editor .

# 运行容器
docker run -p 3000:3000 abcjs-ai-editor
```

### 静态部署

支持部署到任何 Node.js 环境或静态托管平台：

- Vercel
- Netlify
- AWS Amplify
- Cloudflare Pages
- Railway
- Fly.io

## 📝 开发计划

- [ ] 支持更多 AI 模型（Claude、Gemini 等）
- [ ] 乐谱版本管理和云端同步
- [ ] 多人协作编辑
- [ ] 更多导出格式（MusicXML、LilyPond）
- [ ] 移动端适配
- [ ] 插件系统

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [abcjs](https://github.com/paulrosen/abcjs) - ABC 记谱法渲染和播放
- [CodeMirror](https://codemirror.net/) - 代码编辑器
- [React Router](https://reactrouter.com/) - 路由框架
- [OpenAI](https://openai.com/) - AI 能力支持

---

Built with ❤️ by AI Music Editor Team
