# START HERE — 运动记录 WebApp 原型

目的：让你亲手体验「Gem 聊天 → 复制 JSON → 粘贴进 App → 写进自己的私有 GitHub 仓库」这条录入流程有多顺，以便在方便和隐私之间做取舍。全程用假数据。

- App 地址（开启 Pages 后）：`https://hellorockstar.github.io/fitness-log/`
- 代码仓库：`hellorockstar/fitness-log`（公开，只有代码，没有任何数据或密钥）
- 数据仓库：`hellorockstar/fitness-log-data`（私有，你自己建）

---

## 一、从零开始的操作步骤

### 1. 开启 GitHub Pages（一次，约 1 分钟）

1. 打开 `https://github.com/hellorockstar/fitness-log` → **Settings** → 左侧 **Pages**。
2. **Build and deployment → Source** 选 **Deploy from a branch**。
3. **Branch** 选 `main`，文件夹选 `/ (root)` → **Save**。
4. 等 1–2 分钟，页面顶部出现 “Your site is live at …” 即可。

### 2. 创建私有数据仓库（一次）

1. GitHub 右上角 **+ → New repository**。
2. 名字填 `fitness-log-data`，选 **Private**，勾 **Add a README file**（不勾也行，App 能处理完全空的仓库）。
3. **Create repository**。

### 3. 创建 fine-grained PAT（一次）

1. 打开 `https://github.com/settings/personal-access-tokens/new`
   （或：头像 → **Settings** → 最下方 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**）。
2. **Token name**：`fitness-log`（随意）。
3. **Expiration**：自选（如 90 天；过期后 App 会提示 “Token 无效或已过期”，重新生成并到 App 设置里替换即可）。
4. **Resource owner**：你自己（hellorockstar）。
5. **Repository access**：选 **Only select repositories** → 只选 `fitness-log-data`。
6. **Permissions → Repository permissions**：
   - **Contents** → **Read and write**（唯一需要手动设置的项）
   - **Metadata** → Read-only（GitHub 会自动加上，必需，不用管）
   - 其他全部保持 **No access**。Account permissions 全部不动。
7. **Generate token**，复制 `github_pat_…` 开头的 token（只显示一次）。

> 这个 token 只能读写 `fitness-log-data` 这一个仓库的文件，碰不到你的其他仓库。

### 4. 添加到主屏幕并首次设置（一次）

1. iPhone **Safari** 打开 `https://hellorockstar.github.io/fitness-log/`。
2. 分享按钮 → **添加到主屏幕** → 添加。
3. **从主屏幕图标打开 App**，在「设置」页填：token、owner（`hellorockstar`）、仓库名（默认已填 `fitness-log-data`）→ **保存并测试连接**。看到 “✅ 连接成功 …（私有…）” 即完成。

> ⚠️ 必须在**主屏幕打开的 App 里**设置。iOS 上主屏幕 App 和 Safari 的本地存储是分开的，在 Safari 里填的设置主屏幕 App 看不到。

### 5. 配置 Gemini Gem（一次）

1. Gemini → 新建 Gem → 把 [`gem-instructions.md`](gem-instructions.md) 里「===== 开始 =====」到「===== 结束 =====」之间的内容粘进「指令」。
2. 导入过几次之后：App「记录 → 动作历史」底部点 **复制动作库清单**，粘到 Gem 的「知识」或指令里「我的动作库」一节，让 Gem 用统一的动作名。

### 6. 导入样例数据（测试）

App「设置」页底部有 **样例数据（测试用，一键复制）** 链接（即 `samples.html`），每条都有「复制」按钮。按顺序：

| 样例 | 内容 | 预期结果 |
|---|---|---|
| `01-力量-BodyPump.json` | 多组力量训练 | 预览 “1 次运动 + 11 组，新动作 4 个：…”（首次导入，动作库为空） |
| `02-跑步.json` | 一次有氧（10 月） | 写入 `workouts/2026-10.json` |
| `03-力量-含新动作.json` | 带新动作 | 预览 “新动作 1 个：相扑硬拉”，详情里该动作带「新动作」标记 |
| `04-重复-覆盖01.json` | 和 01 同日期+开始时间 | 提示 “2026-11-02 18:30 已有一条记录”，可选 覆盖 / 取消 |
| `05-饮食-午餐.json` | 饮食（加分项） | 写入 `meals/2026-11.json` |
| `99-错误示例.json` | 故意写错 | 列出 4 处错误（未知字段 calorie、缺 calories、时间格式、类型），什么都不写入 |

导入后到「记录」页看「最近运动」，在「动作历史」里选 **杠铃深蹲**，应看到两次记录（11-05 和 11-02）每组的负重、次数、挑战感。

样例 JSON 也在仓库 [`samples/`](samples/) 目录里。

---

## 二、日常录入：实际步骤数和点击数

| # | 动作 | 点击 |
|---|---|---|
| 1 | 在 Gem 里点代码块的「复制」 | 1 |
| — | 上滑回主屏幕（手势，不算点击） | — |
| 2 | 点主屏幕「运动记录」图标 | 2 |
| 3 | 点「📋 粘贴 Gem 的 JSON」 | 3 |
| 4 | iOS 弹出系统的「粘贴」小气泡，点它 | 4 |
| 5 | 看预览（「确认写入」按钮就在摘要下方，不用滚动），点「确认写入」 | 5 |

**结果：5 次点击，比目标（≤ 4）多 1 次。**

原因：多出来的是第 4 步。iOS Safari / 主屏幕 Web App 读取**来自其他 App 的剪贴板**时，系统强制弹出「粘贴」确认气泡，网页无法绕过（这是 iOS 的隐私保护）。退路「长按输入框 → 粘贴」也同样是 2 次点击（输入框粘贴后会自动预览，不需要再点“预览”）。

其他情况：
- 重复记录：第 5 步变成「覆盖」，次数不变；选「取消」就结束。
- 首次使用：额外一次性设置（见上文第 4 步）。token、owner、仓库名只填一次，存在本机。
- 如果 App 已在后台打开，第 2 步变成从 App 切换器切过去，次数相同。

能把点击降到 4 次以下的方案（都没做，见「没做的事」）：iOS 快捷指令（Shortcuts）直接读剪贴板写 GitHub（可省掉系统粘贴确认，但预览要在快捷指令里做，体验差）；或做原生 App。

---

## 三、设计决定及理由

### 数据仓库的文件组织

```
fitness-log-data/
├── meta.json                    # App 标识 + schema 版本
├── exercises.json               # 动作库（全部动作，一个文件）
├── workouts/2026-11.json        # 按月：该月所有运动，每次运动内嵌它的各组
├── meals/2026-11.json           # 按月：饮食（加分项）
└── imports/2026-11/imp-20261105-183012-ab12.json   # 每次导入一个文件：原始 JSON 原样存档 + 摘要
```

- **按月分文件**（而不是按天或一个大文件）：
  - 按天：一年 300+ 个文件，看“最近 10 次”或“某动作最近 5 次”要发几十个请求，手机上慢。
  - 一个大文件：每次写入都要下载、修改、上传整个历史，几年后越来越慢，也更容易冲突。
  - 按月：一个文件一般 10–60 KB；看最近记录通常只需读 1–2 个文件；追加只改当月文件。
- **一次运动内嵌它的组**（而不是 workouts / sets 两张表分文件）：一次运动和它的组总是一起写、一起读、一起覆盖，内嵌后覆盖就是“整条替换”，不会出现孤儿组。导出 CSV 时再展平成两张表（见 `tools/export_csv.py`）。
- **动作库单独一个文件**：小（几百个动作也才几十 KB），每次预览都要用来判断“新动作”。
- **导入存档每批一个文件**：只新增、从不修改，不需要先读再写；原始 JSON 存为字符串（`raw`），一字不改。
- **JSON 格式化缩进存储**：在 GitHub 网页上能直接看懂、改错，git diff 也清楚。

### ID

- **运动 ID = `日期T开始时间`**（如 `2026-11-02T18:30`）：判重的“日期 + 开始时间”本身就是自然主键，直接当 ID，判重不需要额外索引，人也看得懂。代价：同一分钟开始两次运动会被当成重复（实际几乎不会发生；真发生了把其中一次开始时间改一分钟即可）。
- **组**没有独立 ID：用「运动 ID + 动作名 + 组序号」定位。
- **动作**用**动作名**作主键（需求里动作名本来就唯一），组里直接写动作名，CSV 导出不用查表。代价：改名需要改历史记录（见已知限制）。
- **导入批次 ID** = `imp-本地时间戳-4位随机`，按时间可排序。

### 饮食（加分项）

- 和运动走同一个粘贴入口：App 按 JSON 的 `kind`（`workout` / `meal`）自动区分，不用先选类型（省一次点击）。
- 判重键 = 日期 + 餐别（如 `2026-11-05#午餐`）。重复时可选 **追加**（把这次的食物加进已有那餐，适合“午饭后又吃了个水果”）、**覆盖**、**取消**。
- 存在 `meals/YYYY-MM.json`，「记录 → 饮食」查看。不做营养计算。

### schema 版本

- 导入 JSON 和每个数据文件都带 `schema_version: 1`。以后改格式时升到 2，App 可以按版本号做迁移，旧文件不用一次性全改。

### 写入：原子 + 防并发

- 不用 Contents API 逐个文件写（一次导入要写 2–3 个文件，中途失败会留下“写了一半”的数据）。
- 改用 **Git Data API**：在预览时记下分支头 commit → 确认时一次性创建包含所有改动文件的 tree 和 commit → **非强制**更新分支引用。
  - 网络断在中途：只会留下 GitHub 上看不见的游离对象，分支不动 = 什么都没写。
  - 期间别处（另一台设备、你在网页上改）写过：GitHub 拒绝更新（非 fast-forward）→ App 显示“写入冲突，本次没有写入任何内容”，并按最新数据**重新预览**（判重结果可能变了），你再点一次确认。
  - 网络在最后一步断开、无法确认是否成功：App 如实提示“无法确认”，再点一次即可自检——如果其实已写入，会触发冲突 → 重新预览 → 显示“已有记录”。
- 每次导入 = 数据仓库里一个 commit，commit 信息里写着摘要，GitHub 上就是完整的修改历史，可以随时回退。
- 数据仓库为空（只有 README，甚至完全没有 commit）时，第一次写入自动创建 `meta.json`、`exercises.json`、月文件和导入存档。

### 校验

- 只接受 schema 规定的字段；**拼错的字段名会被指出**（如 `calorie` → “未知字段”），而不是悄悄丢掉。
- 所有错误一次列全，带字段路径（如 `sets[3].reps`），什么都不写入。
- 允许 Gem 把 JSON 包在 \`\`\`json 代码块里（自动剥掉外层围栏；存档仍存原文）。
- 不确定但不致命的情况给“注意”提示，不拦截（如力量训练没有组、非杠铃动作填了杆重）。

### 新动作识别

- Gem 看不到你的动作库，所以让 Gem 在 `exercises` 里**声明本次用到的所有动作**，由 App 和动作库比对：库里没有的才算新动作，预览摘要和详情里标出「新动作」。组里出现了既不在库里也没声明的动作 → 报错。
- 为了让 Gem 用统一的名字，App 提供「复制动作库清单」按钮，贴给 Gem。
- 和任务描述的偏差：任务里设想的是 `new_exercises`（只列新动作）。改成“列出全部动作”是因为 Gem 无法可靠判断哪些是新的；App 判断更准确。

### 负重与总重

- 按需求只存口述的 `load_kg` 和杠铃的 `bar_kg`（未说明默认 2.64），**总重不存储**，显示时算：杠铃 = 杆重 + 负重 × 2；哑铃显示“单只”；其他显示负重本身。
- 数值**按原值存储**、显示时保留 1 位小数（杆重 2.64 如果存成 2.6，总重会差 0.04 kg，所以存储不截断）。杆重是默认 2.64 时不在每组重复显示。

### localStorage

- 只用 4 个 key：`fitlog_token`、`fitlog_owner`、`fitlog_repo`、`fitlog_last_exercise`（动作历史上次选的动作）。
- 所有读写都经过 `js/storage.js`，它强制加 `fitlog_` 前缀；“清除设置”只逐个删除这几个 key，代码里没有任何 `localStorage.clear()`，不会碰同域名下单词 App 的 `gh_token`、`prismaVocab` 等。
- 运动数据本身**不缓存到本机**，只在内存里（关掉 App 就没了），每次从 GitHub 读。

### 其他

- 纯静态文件，无构建步骤，**不用任何 CDN、第三方库、统计脚本**（样式是手写 CSS）。所有网络请求只发往 `api.github.com`。
- 没做 Service Worker（离线缓存）：原型阶段改代码频繁，SW 会让你看到旧版本，反而难调试。
- 加了 `.nojekyll`，让 GitHub Pages 原样发布文件。

---

## 四、已知限制

- **隐私相关（请重点看）**
  - token 存在本机 localStorage。`hellorockstar.github.io` 下所有 Pages（包括单词 App）是**同一个源**，技术上任一页面的脚本都能读到 `fitlog_token`。两个 App 都是你自己的代码所以风险可控，但任何一个 App 若被注入恶意脚本（例如它引用的 CDN 资源被篡改），都可能拿到这个 token。缓解：token 只授权一个仓库、设置较短的过期时间。彻底隔离需要换独立域名。
  - 运动数据会经过 Google（你在 Gem 里描述的内容）和 GitHub（私有仓库）。
  - 在 Safari（非主屏幕）里使用时，iOS 可能在 7 天未访问后清除本地存储，需要重新填 token；主屏幕 App 一般不受影响。
- **不能在 App 里编辑或删除**：改记录 = 让 Gem 输出同一日期+开始时间的完整 JSON 再导入（覆盖）；删除只能去 GitHub 网页改 JSON 文件。
- **动作改名**：动作名是主键，改名需要在 GitHub 上同时改 `exercises.json` 和历史月文件。
- **动作库只增不改**：Gem 声明的动作属性和库里不一致时，以库为准并提示，不会修改库。
- **改开始时间 = 新记录**：如果第一次开始时间写错，用正确时间重新导入会变成两条，需要手动删旧的。
- **没有离线模式**：没网时不能录入或查看。
- **历史读取按月**：「动作历史」从最近的月份往前找，直到凑够 5 次。很久没做的动作要读较多月份文件（每月一个请求）。
- 导入存档每次一个文件，几年后会有几千个小文件；GitHub 能轻松承受，App 读取目录时一次列出全部文件（每个文件约 100 字节的列表项），到时可改为按月合并。
- 只在 Chromium（模拟 iPhone 尺寸）+ 模拟 GitHub API 下做了自动化测试，**没有在真实 iPhone 和真实 GitHub 仓库上测过**（我没有权限访问你的数据仓库）。真实首次使用时如有问题，设置页和错误提示里都有「技术细节」可以展开。

## 五、没做的事

- 营养/热量计算（按要求，原型不做）。
- 数据图表、统计（周训练量、某动作重量趋势图等）。
- App 内编辑/删除记录。
- CSV 导出按钮：数据格式已为此设计，目前提供了命令行脚本 `tools/export_csv.py`（clone 数据仓库后运行，输出 workouts / sets / exercises / meals 四个 CSV，含计算后的总重，Excel 直接打开不乱码）。
- iOS 快捷指令方案、原生 App（可把点击数降到 4 以下，但超出原型范围）。
- 离线缓存 / Service Worker。

---

## 六、文件说明

| 文件 | 作用 |
|---|---|
| `index.html`、`styles.css` | 页面骨架和样式 |
| `js/app.js` | 界面逻辑（录入 / 记录 / 设置） |
| `js/schema.js` | 导入 JSON 的校验、写入计划（纯函数） |
| `js/repo.js` | 数据层：快照、判重、原子写入 |
| `js/github.js` | GitHub API 客户端 |
| `js/storage.js` | localStorage 唯一入口（强制 `fitlog_` 前缀） |
| `samples.html`、`samples/` | 样例假数据 + 一键复制页 |
| `gem-instructions.md` | 粘进 Gemini Gem 的指令 |
| `tools/export_csv.py` | 数据仓库 → CSV |
| `manifest.webmanifest`、`icons/` | 添加到主屏幕用 |
