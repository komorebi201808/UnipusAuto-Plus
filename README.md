# UnipusAuto-Plus
基于 yuanarcsin/unipus_auto 优化的 U 校园自动答题扩展：填入答案统一为纯文本（消除 &lt;p>、&lt;br> 等符号），修复写作题（writing）获取答案为空、改用接口正解直接填入而不调用 AI。
---
## 快速开始（浏览器扩展）
适合大多数用户，无需命令行操作。
### 下载
```bash
git clone https://github.com/yuanarcsin/unipus_auto.git
```
或者点击页面右上角绿色「Code」→「Download ZIP」，解压到本地文件夹。
### 安装扩展
**Edge 浏览器：**
1. 地址栏输入 `edge://extensions/` 并回车
2. 开启左下角的「开发人员模式」
3. 点击「加载解压缩的扩展」
4. 选择文件夹中的 `AutoUnipus/extension/` 目录（注意：不是根目录，是里面的 extension 文件夹）
5. 安装成功后工具栏会出现扩展图标
**Chrome 浏览器：**
1. 地址栏输入 `chrome://extensions/` 并回车
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `AutoUnipus/extension/` 目录
### 使用
1. 打开 U 校园练习页面
2. 点击工具栏的扩展图标打开面板
3. 在设置中填写你的 API Key 并保存（仅在使用 AI 兜底的站点需要）
4. 点击「扫描题目」— 扩展会自动识别页面上的题目
5. 点击「开始答题」— 自动完成所有题目
> U 校园的答案直接从官方接口解密获取，**不需要配置任何 AI 模型**。
> 修改了扩展目录里的任何文件后，必须回到 `chrome://extensions/` 或 `edge://extensions/` 点一次「重新加载」，否则浏览器仍在使用旧代码。
---
## 项目说明
本项目由三个子项目组成，它们**互不依赖**，可独立使用：
### 1. 浏览器扩展（推荐）
**位置：** [AutoUnipus/extension/](AutoUnipus/extension/)
Chrome/Edge 插件，支持 U 校园、问卷星、腾讯问卷、WE Learn 等平台。自动识别题目、获取答案并填入。
**支持的平台：**
| 平台 | 策略 | 准确率 |
|------|------|--------|
| U 校园（Unipus） | 服务端 API 直取 | ~100% |
| WE Learn | 数据 HTML 解析 | ~100% |
| 问卷星（WJX） | 模板扫描 + AI | 高 |
| 腾讯问卷 | 模板扫描 + AI | 高 |
| 其他站点 | AI 分析 | 依赖模型 |
> 对于 U 校园，扩展直接从官方接口获取加密答案并解密，无需调用 AI 模型，准确率 100%。
### 2. Python 独立脚本
**位置：** [AutoUnipus/](AutoUnipus/)
适用于有 Python 环境的用户，通过 Playwright 操作浏览器。
### 3. Java 桌面应用
**位置：** [UnipusHelperPro/](UnipusHelperPro/)
一个独立的 Java 桌面客户端项目，拥有完整 GUI 界面，支持任务管理、答案获取与提交。
> ⚠️ 这是**他人开发的开源项目**，非本项目原创。原项目来自 [Duster-Cule/UnipusHelperPro](https://github.com/Duster-Cule/UnipusHelperPro)，此处仅作为子模块收录，方便统一使用。如需了解详情或提交 issue，请访问原项目仓库。
---
## 本版本改动
在原版的基础上，本版本重点修了两个直接影响"能不能填对"的问题，其余行为与原版保持一致。
### 1. 填入的答案统一为纯文本
原版有时会把接口返回的富文本原样塞进输入框，导致输入框里出现 `<p>`、`<br>`、`&ndash;`、`&nbsp;` 之类的符号。
现在所有答案在写入之前都会经过一次清洗（U 校园填空题、写作题、其他站点走的是同一条路径）：
- 还原 `\u003c` / `\u003e` / `\u0026` 这类 JSON 转义字符
- `<br>`、`</p>`、`</div>` 等块级标签转换行
- 其余 HTML 标签全部剥离
- `&nbsp;` `&amp;` `&lt;` `&gt;` `&quot;` 等实体还原成正常字符
- 合并多余空白与空行
效果就是输入框里得到的是一段干净的纯文本，不再夹带任何 `< >` 符号。
### 2. 修复写作题（writing）获取答案为空
**现象：** 写作题扫描到了、答题也执行了，但 textarea 里什么都没有；或者反过来，被塞入了一段 AI 现编的、和题目要求无关的文章。
**原因：** U 校园接口返回的写作题答案结构和其它题型不同——
- 填空题等题型的答案在 `answer.children[].answers` 里；
- 写作题的 `answer.children[].answers` 是**空的**，真正要填的作文正文藏在 `analysis.analysis` 字段里，而且是一段带 `\u003c` 转义的 JSON 字符串。
旧版解析只读 `answer.children[].answers`，于是写作题拿到的永远是空数组。答案为空之后，程序会退回 AI 分支，用模型现写一篇交上去——这正是"AI 写了一篇没用的话"的来源。
**修复内容：**
- `modules/unipus-api.js` 的 `parseAnswers` 增加 `analysis` 解析：同时处理 `analysis.children`（可能为空）与顶层 `analysis.analysis`，字段本身还是 JSON 字符串时会再解一层
- 新增递归收集函数 `collectText()`，把嵌套结构里的正文全部取出来
- 作文正文统一插到答案数组第一位，保证写作题一定先拿到正文而不是解析
- `content.js` 新增 `looksLikeEssayText()`，用「长度 ≥ 30 且（含换行或中文字符占比 < 30%）」判断一段文本像不像作文，避免把填空题的短答案（如 `importance`）误当成作文
### 3. 写作题的识别与填充更稳
- 保证写作框独立成一道题：页面存在 `textarea.question-textarea-content` 时，即使被其它题型容器包住，也会拆出来单独识别，不会和填空题挤在一起
- 写作页上跳过"把整个写作区包住"的容器，避免同一片区域被答两次
- 题型名没能对上、但页面上确实存在写作框时，按写作题兜底填入，不再整题跳过
- 写作题**只填接口给的正解**，代码里不再触发任何 AI 写作
### 4. 排查更方便
扫描与答题过程中会额外打印几行日志，遇到问题时可以按 F12 打开控制台对照：
```
[AI答题助手] API 答案摘要: [{"i":0,"id":"...","len":1249,"head":"To continue to study..."}]
[AI答题助手] 写作题已填入(API答案)，长度=1249，框内现值=1249
[AI答题助手] 写入内容开头: To continue to study...
[AI答题助手] 框内实际开头: To continue to study...
```
`len` 是解析出来的正文长度。如果它是 0，说明解析这一层没覆盖到该页面返回的结构；如果它正常、但"框内实际开头"和"写入内容开头"不一致，则说明是页面自身的输入框拦截了写入。
### 涉及的文件
| 文件 | 说明 |
|------|------|
| `AutoUnipus/extension/content.js` | 答案清洗、写作题识别与填充、日志 |
| `AutoUnipus/extension/modules/unipus-api.js` | 接口答案解析（含写作题 `analysis` 正文） |
| `AutoUnipus/extension/templates/unipus.json` | 题型模板，`writing` 已排在 `questionTypes` 第一位 |
---
## 许可
本项目集合了多个开源项目的代码，许可证情况如下：
- **浏览器扩展部分** — 基于 [AI-ANSWER-ASSISTANT](https://github.com/rehuan/AI-ANSWER-ASSISTANT)（GPL-3.0）和 [AutoUnipus](https://github.com/CXRunfree/AutoUnipus)（BSD 3-Clause）改造
- **Java 桌面应用部分** — 来自 [UnipusHelperPro](https://github.com/Duster-Cule/UnipusHelperPro)，遵循其原始许可证
- **整体项目** — 因包含 GPL-3.0 代码，整体遵循 GPL-3.0 协议
详见根目录的 [LICENSE](LICENSE) 和 [LICENSE.BSD](LICENSE.BSD)。
> 本项目仅用于学习研究，请遵守相关平台的使用条款，不得用于非法用途。
