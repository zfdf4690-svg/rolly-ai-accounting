# Rolly AI 记账 - 需求拆解文档

## 产品概述

- **产品类型**: 移动 H5 记账工具应用
- **场景类型**: <scene_type>prototype-app</scene_type>
- **目标用户**: 有记账需求但嫌麻烦、喜欢趣味互动的年轻用户
- **核心价值**: 用聊天式交互 + 毒舌 AI 吐槽，把记账从"任务"变成"互动"，降低记账门槛
- **界面语言**: 中文
- **主题偏好**: 浅色（马卡龙低饱和色系）
- **导航模式**: 路径导航
- **导航布局**: 底部 Tab 导航（手机端 H5 优先，3 个一级入口）

---

## 页面结构总览

| 页面名称 | 文件名 | 路由 | 页面类型 | 入口来源 |
|---------|-------|------|---------|---------|
| 记账聊天页 | `ChatPage.tsx` | `/` | 一级 | 底部导航"记账" |
| 日历页 | `CalendarPage.tsx` | `/calendar` | 一级 | 底部导航"日历" |
| 统计页 | `StatsPage.tsx` | `/stats` | 一级 | 底部导航"统计" |

> **说明**：3 个一级页面对应用户明确要求的底部 Tab（记账、日历、统计），均为独立任务目标，符合页面收敛原则。

---

## 页面布局建议

### 记账聊天页
- **布局模式**: 上下分区（聊天流区 + 底部输入栏）—— 类微信对话风格，符合手机端聊天习惯
- **视觉重心**: 聊天流区（对话气泡 + 交易卡片滚动呈现）
- **结果承载区**: 聊天流内的 AI 回复气泡 + 交易卡片；初始态为欢迎语气泡 + 空状态提示（可爱机器人形象）

### 日历页
- **布局模式**: 上下分区（月历视图 + 当日交易明细）—— 点击日期展开下方明细
- **视觉重心**: 月历网格（每日支出一目了然）
- **结果承载区**: 当日交易明细列表；初始态默认选中当天，无数据显示空状态

### 统计页
- **布局模式**: 上下分区（KPI 大字 + 分类饼图 + 柱状图趋势）—— 垂直滚动浏览
- **视觉重心**: 当月总支出大字 + 分类饼图
- **结果承载区**: 图表区；初始态无数据时显示空状态机器人 + 引导文案

---

## 插件规划

| 插件实例名称 | 基于官方插件 | 业务用途 | 输出模式 | 所属页面 |
|------------|-----------|---------|---------|---------|
| 文本记账解析 | `ai-text-to-json` | 解析用户输入的自然语言记账文本，拆分成多笔结构化交易（金额、分类、备注） | unary | 记账聊天页 |
| 记账吐槽生成 | `ai-text-generate` | 根据交易内容生成毒舌/俏皮的 AI 回复文案，带有人设风格 | stream | 记账聊天页 |
| 小票图片识别 | `ai-image-to-json` | 识别用户上传的小票图片，提取商家、日期、总金额、商品条目等结构化信息 | unary | 记账聊天页 |

> **说明**：
> - 文本记账走"文本记账解析 → 记账吐槽生成"链式调用
> - 小票识别走"小票图片识别 → 记账吐槽生成"链式调用
> - 吐槽生成使用流式输出，打字机效果增强互动感

---

## 导航配置

- **导航布局**: 底部 Tab 导航（手机端 H5 竖屏体验优先）
- **导航项**（3 个一级页面）:

| 导航文字 | 路由 | 图标 |
|---------|------|------|
| 记账 | `/` | 💬（气泡/聊天图标） |
| 日历 | `/calendar` | 📅（日历图标） |
| 统计 | `/stats` | 📊（图表图标） |

---

## 数据来源声明

| 数据/操作 | 来源类型 | 实现要求 | mock 兜底 |
|---|---|---|---|
| 交易记录持久化 | backend-db | Postgres `transactions` 表，通过 `/api/rolly/transactions` CRUD，按 user_id RLS 行级隔离，首次加载自动迁移 localStorage 旧数据 | 无（服务端初始化后为空） |
| 聊天消息历史 | backend-db | Postgres `chat_messages` 表，通过 `/api/rolly/messages` CRUD，按 user_id RLS 行级隔离 | 无 |
| 文本记账解析 | real-plugin | capabilityClient 调「文本记账解析」实例，传入用户输入的记账文本，返回结构化交易列表 | 失败提示（toast "AI 暂时没听清，再试一次？"） |
| AI 吐槽回复 | real-plugin | capabilityClient.callStream 调「记账吐槽生成」实例，传入交易内容和人设指令，流式输出吐槽文案 | 失败提示（气泡显示"呃……我今天脑壳有点卡，先记上了。"） |
| 小票图片识别 | real-plugin | capabilityClient 调「小票图片识别」实例，传入用户选中的小票图片，返回结构化的小票信息 | 失败提示（气泡显示"这张糊得我都看不清字了，重拍一张？手别抖！"） |
| 语音转文字 | demo-mock（浏览器原生 API） | 使用浏览器 Web Speech API（SpeechRecognition）做语音转文字，不涉及后端插件 | 不支持时隐藏语音按钮 + toast 提示"当前浏览器不支持语音输入" |
| 日历交易统计 | backend-db | 从云端 `transactions` 表查询当前用户当月数据，前端聚合计算每日/每月收支 | 无（数据来自云端） |
| 分类统计/图表数据 | backend-db | 从云端 `transactions` 表查询当前用户当月数据，前端聚合计算分类占比、每日趋势 | 无（数据来自云端） |

> **插件兜底约束**：所有 real-plugin 类型行的 mock 兜底均为**失败提示**，不提供任何具体识别结果/生成文案的 mock 值，确保插件为核心链路唯一数据源。

---

## 功能列表

### 记账聊天页（主页）

- **页面目标**: 通过聊天式交互完成记账，让记账变得有趣
- **功能点**:
  - **对话式记账**: 用户发送自然语言文本（如"咖啡15，电影30"），AI 调用「文本记账解析」插件拆分成多笔结构化交易，再调用「记账吐槽生成」插件流式输出毒舌回复，交易以卡片形式嵌入聊天流
  - **交易卡片展示**: 聊天流中嵌入交易卡片，显示分类 emoji 图标、金额（支出红色/收入绿色）、备注文字、日期时间，卡片来自 AI 解析结果
  - **删除交易**: 交易卡片支持左滑/长按删除，删除后弹出确认气泡，同步更新 localStorage
  - **语音输入记账**: 底部输入栏"按住说话"按钮，使用 Web Speech API 语音转文字，识别成功后自动发送文本走对话记账流程
  - **小票拍照识别**: 点击相机按钮上传/拍摄小票图片，调用「小票图片识别」插件提取商家、日期、金额、商品条目，识别成功生成交易卡片 + 吐槽回复，失败时以吐槽语气提示重拍
  - **聊天流空状态**: 无交易记录时显示可爱的 Rolly 机器人小形象 + 欢迎引导文案

### 日历页

- **页面目标**: 按日历视图查看每日收支情况，快速浏览消费节奏
- **功能点**:
  - **月历视图展示**: 显示当月日历网格，每个日期格子显示当日支出总金额，支出红色、收入绿色、超支日期标红高亮
  - **当月收支概览**: 日历顶部显示当月总收入、总支出、结余三个数字卡片
  - **日期明细展开**: 点击某一日期格子，下方展开当天的交易明细列表，显示每笔交易的分类、金额、备注
  - **月份切换**: 左右滑动/点击箭头切换月份，数据同步更新
  - **空日期处理**: 无交易的日期格子不显示金额，点击提示"这天没有记录哦~"

### 统计页

- **页面目标**: 可视化展示当月消费结构和趋势，帮助用户了解花钱去向
- **功能点**:
  - **当月总支出大字展示**: 页面顶部大号字体展示当月总支出金额，下方小字标注环比变化（可选）
  - **分类饼图**: 展示餐饮/交通/购物/娱乐/家居/健康/其他 7 个分类的支出占比，使用 emoji + 马卡龙配色，hover/点击显示具体金额
  - **每日支出柱状图**: 当月每日支出趋势柱状图，直观查看消费波动
  - **空状态**: 当月无数据时显示可爱机器人形象 + "这个月还没记账哦，去记一笔吧~"引导文案

---

## 数据共享配置

| 存储键名 | 数据说明 | 使用页面 |
|---------|---------|---------|
| `__rolly_transactions` | 所有交易记录，类型 `ITransaction[]` | 记账聊天页、日历页、统计页 |
| `__rolly_chat_messages` | 聊天消息历史，类型 `IChatMessage[]` | 记账聊天页 |

```ts
interface ITransaction {
  id: string;
  type: 'income' | 'expense';
  amount: number; // 单位：元，保留 2 位小数
  category: 'food' | 'transport' | 'shopping' | 'entertainment' | 'home' | 'health' | 'other';
  categoryEmoji: string; // 对应 emoji：🍜🚗🛍️🎮🏠💊📦
  note?: string; // 备注/商品名
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  merchant?: string; // 商家名称（小票识别时填充）
  source: 'text' | 'voice' | 'receipt' | 'mock'; // 记录来源
  createdAt: number; // 时间戳
}

interface IChatMessage {
  id: string;
  role: 'user' | 'ai';
  type: 'text' | 'transaction-card' | 'image';
  content: string; // 文本内容 / 图片地址 / 交易 JSON 字符串
  transactionIds?: string[]; // 关联的交易 ID（卡片类型消息用）
  timestamp: number;
}
```

---

## 视觉设计规范摘要

- **配色**: 马卡龙低饱和色系 — 浅绿（主色/收入）、浅粉（支出强调）、浅蓝（AI 气泡）、奶黄（背景点缀）、米白（页面背景）
- **分类 icon**: 🍜 餐饮 / 🚗 交通 / 🛍️ 购物 / 🎮 娱乐 / 🏠 家居 / 💊 健康 / 📦 其他
- **圆角**: 全局大圆角（气泡 20px+，卡片 16px，按钮 12px）
- **动效**: 气泡弹出动画（弹性出现）、卡片入场下滑、消息发送滑入
- **AI 角色**: Rolly — 毒舌但可爱的记账闺蜜人设，头像为圆滚滚的卡通小球/机器人形象
- **适配**: 手机端竖屏优先，最大宽度 480px 居中展示，模拟 App 体验

-------

<scene_type>prototype-app</scene_type>

# UI 设计指南

## 1. 设计推导依据

- **参考意图**: Free Direction —— 无参考图，按产品语义和情绪自主设计
- **核心情绪 / 应用类型**: 毒舌可爱的 AI 记账闺蜜 / 聊天式工具型 H5 应用
- **独特记忆点**: 马卡龙渐变色聊天气泡 + 嵌入式交易卡片 + emoji 分类图标，把记账从填表变成跟 Rolly 的日常对话

## 2. Art Direction

- **方向名**: 马卡龙软萌聊天风
- **Design Style**: Soft Blocks 柔色块 + Rounded 圆润几何 —— 低饱和马卡龙色营造治愈松弛感，大圆角和气泡动效呼应"闺蜜聊天"的轻松互动调性
- **DNA 参数**: 圆角 `rounded-2xl` ~ `rounded-full` / 阴影 subtle `shadow-sm`，卡片用极软投影 / 间距 spacious `gap-4 ~ gap-6` / 字体方向圆润俏皮中文字体 / 装饰手法 emoji 图标 + 气泡弹出动效 + 微渐变底色
- **应用类型**: Tool（聊天式工具） —— 单栏全屏手机竖屏，底部 Tab 导航

## 3. Color System

**色彩关系**: 薄荷奶绿主色 + 樱花粉辅助 + 奶油白背景 + 浅蓝/奶黄点缀，全色系低饱和度
**配色设计理由**: 薄荷奶绿作为 primary 传递清新治愈不压人；樱花粉 accent 营造闺蜜感和俏皮氛围；奶油白 bg 柔化视觉疲劳；全色系低饱和确保长时间聊天不刺眼，同时保持文字高对比可读
**主色推导**: 从"治愈 + 马卡龙 + AI 记账助手"语义出发，薄荷绿关联轻松、成长、财务管理的正向感，降饱和后成为不抢戏的温柔主色，符合"毒舌但可爱"的角色反差
**使用比例**: 60% 奶油中性 / 30% 马卡龙辅助（粉/蓝/黄点缀） / 10% 薄荷绿 primary；primary 只用于 CTA 按钮、Tab 激活、AI 气泡标识，不铺满界面

| 角色 | CSS 变量 | Tailwind Class | HSL 值 | 设计说明 |
|---|---|---|---|---|
| bg | `--background` | `bg-background` | hsl(40 30% 97%) | 奶油白页面背景，微暖不刺眼 |
| card | `--card` | `bg-card` | hsl(0 0% 100%) | 纯白卡片、交易卡、弹层 |
| text | `--foreground` | `text-foreground` | hsl(220 15% 20%) | 深灰正文，柔和不生硬 |
| textMuted | `--muted-foreground` | `text-muted-foreground` | hsl(220 8% 55%) | 辅助文字、时间戳、金额说明 |
| primary | `--primary` | `bg-primary` / `text-primary` | hsl(145 35% 65%) | 薄荷奶绿，主交互、AI 角色色 |
| primaryForeground | `--primary-foreground` | `text-primary-foreground` | hsl(145 40% 20%) | 深薄荷绿文字，主色上的高对比 |
| accent | `--accent` | `bg-accent` | hsl(0 40% 94%) | 樱花粉浅底，hover/选中/用户气泡 |
| accentForeground | `--accent-foreground` | `text-accent-foreground` | hsl(0 30% 35%) | 深玫瑰粉，accent 上的文字 |
| border | `--border` | `border-border` | hsl(40 15% 90%) | 极浅米黄边框，柔和分隔 |

**语义色提示**: 
- 收入/结余绿：`hsl(140 40% 92%)` bg / `hsl(140 35% 75%)` border / `hsl(140 35% 35%)` text，与 primary 色温对齐，饱和度接近
- 支出/超支红：`hsl(0 40% 94%)` bg / `hsl(0 35% 78%)` border / `hsl(0 40% 45%)` text，与 accent 粉共源，提升饱和度表达警示
- 图表分类色：餐饮 hsl(20 50% 75%) / 交通 hsl(200 40% 75%) / 购物 hsl(320 40% 78%) / 娱乐 hsl(270 40% 78%) / 家居 hsl(40 45% 75%) / 健康 hsl(140 35% 75%) / 其他 hsl(220 20% 75%)，统一低饱和马卡龙调性

## 4. 字体与节奏

- **font-display**: ZCOOL QingKe HuangYou —— 圆润俏皮，贴合卡通可爱调性，用于标题和金额大字
- **font-body**: Noto Sans SC —— 清晰友好，保证聊天正文和交易信息的可读性
- **字号**: H1（总支出）text-5xl；H2（页面标题）text-2xl；body text-base；muted text-sm；交易金额 text-lg
- **圆角**: 大（气泡/卡片 `rounded-2xl`，按钮 `rounded-full`）—— 呼应软萌治愈感，避免尖锐棱角

## 5. 全局布局契约

- **Reference Layout Use**: 按需求结构推导，三页底部 Tab 架构
- **Page / Section Order**: 记账聊天页 / 日历页 / 统计页，与需求 1:1 对齐
- **Standard Content Zone**: Tool `max-w-md`（手机竖屏宽度 420px 上限）+ `mx-auto`，桌面端居中显示手机尺寸容器
- **Shell / Frame Alignment**: 底部 Tab 导航为固定 chrome，内容区独立滚动，安全区内边距适配 iPhone 底部横条
- **Padding & Rhythm**: `px-4 py-4`（移动端），保持 4/8/12/16/24 的 spacing 节奏
- **Full-bleed Zones**: 输入栏、底部 Tab 全宽贴边；聊天消息区左右留白 16px
- **Local Narrowing**: 统计页大字和图表区域在 max-w-md 内居中，不额外收窄
- **Overflow Strategy**: 日历月视图网格自适应；交易列表纵向滚动；不出现横向滚动
- **Flexibility Boundary**: 允许移动端卡片内边距和气泡间距微调；不允许修改主色、圆角、字体和 Tab 导航结构

## 6. 视觉与动效

- **装饰**: emoji 分类图标 + 气泡微渐变 + Rolly 机器人小形象（空状态/头像）
- **阴影/边界**: 轻 —— 卡片用 `shadow-sm`，极软投影，边界用透明感描边替代硬边框
- **动效**: 精致轻快 —— 气泡弹入（scale + translateY）、卡片滑入、Tab 切换淡入淡出，时长 200ms ~ 300ms，ease-out 曲线，避免笨重

## 7. 组件原则

- 按钮、输入框、交易卡必须有 Default / Hover / Active / Focus / Disabled 状态
- Primary 承担发送按钮、Tab 激活、AI 角色标识；Secondary/Outline 用于辅助操作（删除、取消）
- 聊天气泡：AI 侧左对齐薄荷绿渐变，用户侧右对齐樱花粉，嵌入式交易卡片为白色卡片穿插在 AI 回复中
- 空状态用 Rolly 机器人形象 + 俏皮文案，延续角色人设，不用默认空状态图标

## 8. Image Direction

- **Image Role**: 品牌角色插画（Rolly 机器人） + 空状态插图 + 聊天头像
- **Image Art Direction**: 圆润卡通 3D 柔陶风格的小机器人 Rolly，圆滚滚身体，短手短脚，表情带点傲娇毒舌的小挑眉；主色薄荷绿身体 + 粉色腮红点缀；柔光均匀，材质像软糖/马卡龙；构图居中主体，背景透明或极浅渐变；情绪是"嘴上吐槽但心里关心你的钱袋子"的可爱反差感
- **Image Prompt Keywords**: cute round robot character, macaron mint green body, pink blush cheeks, smug expression, soft clay 3D style, pastel colors, soft lighting, kawaii aesthetic, transparent background, minimal clean design
- **Image Avoidance**: 避免金属机械感机器人、棱角分明的科技风、高饱和刺眼配色、复杂背景、商务素材图库感、人形比例角色

## 9. Anti-patterns

- **Split personality**: 三个页面各自用不同色系或圆角；全站共享马卡龙色板和大圆角系统
- **Default SaaS drift**: 回到默认蓝色按钮和通用卡片堆叠；用薄荷绿 + 樱花粉 + 奶油白塑造 Rolly 的专属视觉
- **Invisible interaction**: 只做了气泡动效，丢了 focus-visible；输入框、按钮、可点击卡片都要有键盘可见状态
- **Mono-hue tyranny**: 薄荷绿铺满按钮、Tab、图标、边框、链接；按 60-30-10 比例收回 primary，其余用 accent 和中性色
- **Status color drift**: 超支红色饱和度飙升到刺眼；语义红与 accent 粉共源，饱和度控制在 40% 以内
- **Chat bubble chaos**: AI 和用户气泡左右不分、颜色混乱；严格左 AI（薄荷绿）右用户（樱花粉），交易卡白色嵌在 AI 回复气泡内