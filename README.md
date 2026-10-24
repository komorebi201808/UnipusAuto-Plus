
基于 yuanarcsin/unipus_auto 优化的 U 校园自动答题工具，主要以浏览器扩展形式提供，另有 Python 独立脚本和 Java 桌面客户端。
本项目是 vibecoding 产物，浏览器扩展已经验证大部分功能可用，但仍可能存在一些问题，欢迎任何形式的贡献。
---
快速开始（浏览器扩展）
适合大多数用户，无需命令行操作。
下载
```bash
(https://github.com/komorebi201808/UnipusAuto-Plus)
```
或者点击页面右上角绿色「Code」→「Download ZIP」，解压到本地文件夹。
安装扩展

Edge 浏览器：
地址栏输入 `edge://extensions/` 并回车
开启左下角的「开发人员模式」
点击「加载解压缩的扩展」
选择文件夹中的 `AutoUnipus/extension/` 目录（注意：不是根目录，是里面的 extension 文件夹）
安装成功后工具栏会出现扩展图标

Chrome 浏览器：
地址栏输入 `chrome://extensions/` 并回车
开启右上角的「开发者模式」
点击「加载已解压的扩展程序」
选择 `AutoUnipus/extension/` 目录

使用

打开 U 校园练习页面
点击工具栏的扩展图标打开面板
在设置中填写你的 API Key 并保存，并选中该模型（必须配置，见下方说明）
首次启动按f12打开控制台，在左上角top点击倒三角选择AI自动答题助手
点击「开始答题」— 自动完成所有题目
关闭页面前必须点击安全暂停
> **必须配置 API Key。** 但 Key 只在 **AI 兜底** 时才使用：U 校园 的答案优先走官方接口解密，只有接口没给出答案、需要 AI 补答时才会调用模型。没有配置 Key，这类题目就只能跳过。
> 修改了扩展目录里的任何文件后，必须回到 `chrome://extensions/` 或 `edge://extensions/` 点一次「重新加载」，否则浏览器仍在使用旧代码。
---
项目说明
本项目由三个子项目组成，它们互不依赖，可独立使用：
1. 浏览器扩展（推荐）
位置： AutoUnipus/extension/
Chrome/Edge 插件，支持 U 校园、问卷星、腾讯问卷、WE Learn 等平台。自动识别题目、获取答案并填入。
支持的平台：
平台	策略	何时用 API Key	准确率
U 校园（Unipus）	服务端 API 直取	仅 AI 兜底时	~100%
WE Learn	数据 HTML 解析	仅 AI 兜底时	~100%
问卷星（WJX）	模板扫描 + AI	基本都靠 AI	高
腾讯问卷	模板扫描 + AI	基本都靠 AI	高
其他站点	AI 分析	基本都靠 AI	依赖模型
> **API Key 必须配置**，但它只在 **AI 兜底** 时才被使用。U 校园 的答案优先走官方接口解密，不消耗 AI；接口没有给出答案的题目才回落到 AI，这时才真正用上 Key。
2. Python 独立脚本
位置： AutoUnipus/
适用于有 Python 环境的用户，通过 Playwright 操作浏览器。
3. Java 桌面应用
位置： UnipusHelperPro/
一个独立的 Java 桌面客户端项目，拥有完整 GUI 界面，支持任务管理、答案获取与提交。
> ⚠️ 这是**他人开发的开源项目**，非本项目原创。原项目来自 [Duster-Cule/UnipusHelperPro](https://github.com/Duster-Cule/UnipusHelperPro)，此处仅作为子模块收录，方便统一使用。如需了解详情或提交 issue，请访问原项目仓库。
---
本版本改动（v2）
在原版的基础上，本版本重点修了两个直接影响"能不能填对"的问题，其余行为与原版保持一致。
1. 填入的答案统一为纯文本
原版有时会把接口返回的富文本原样塞进输入框，导致输入框里出现 `<p>`、`<br>`、`&ndash;`、`&nbsp;` 之类的符号。
现在所有答案在写入之前都会经过一次清洗（U 校园填空题、写作题、其他站点走的是同一条路径）：
还原 `\u003c` / `\u003e` / `\u0026` 这类 JSON 转义字符
`<br>`、`</p>`、`</div>` 等块级标签转换行
其余 HTML 标签全部剥离
`&nbsp;` `&amp;` `&lt;` `&gt;` `&quot;` 等实体还原成正常字符
合并多余空白与空行
效果就是输入框里得到的是一段干净的纯文本，不再夹带任何 `< >` 符号。
2. 修复写作题（writing）获取答案为空
现象： 写作题扫描到了、答题也执行了，但 textarea 里什么都没有；或者反过来，被塞入了一段 AI 现编的、和题目要求无关的文章。
原因： U 校园接口返回的写作题答案结构和其它题型不同——
填空题等题型的答案在 `answer.children[].answers` 里；
写作题的 `answer.children[].answers` 是空的，真正要填的作文正文藏在 `analysis.analysis` 字段里，而且是一段带 `\u003c` 转义的 JSON 字符串。
旧版解析只读 `answer.children[].answers`，于是写作题拿到的永远是空数组。答案为空之后，程序会退回 AI 分支，用模型现写一篇交上去——这正是"AI 写了一篇没用的话"的来源。
修复内容：
`modules/unipus-api.js` 的 `parseAnswers` 增加 `analysis` 解析：同时处理 `analysis.children`（可能为空）与顶层 `analysis.analysis`，字段本身还是 JSON 字符串时会再解一层
新增递归收集函数 `collectText()`，把嵌套结构里的正文全部取出来
作文正文统一插到答案数组第一位，保证写作题一定先拿到正文而不是解析
`content.js` 新增 `looksLikeEssayText()`，用「长度 ≥ 30 且（含换行或中文字符占比 < 30%）」判断一段文本像不像作文，避免把填空题的短答案（如 `importance`）误当成作文
3. 新增自动巡页（auto-pilot）
原版的「开始答题」只处理当前这一页：答完就停，要换到下一个 Task、下一节，得自己手动点。
本版本加入了自动巡页控制器 `modules/auto-pilot.js`。现在弹窗里的「自动答题」按钮点一下即可从头跑到尾，不需要任何命令行操作。
它能做什么
按下「自动答题」后，扩展会按下面的顺序自己走完整本书：
逐条走完左侧目录（Quotation → Preview → Reading the text → Reading comprehension → Language focus → …）
进入某一条后，先走完页内的 Task / 子标签页
例如 `Learning` 下面的 `Task 1`、`Task 2`
Task 走完再走其它子标签页（`Practicing`、`Banked cloze` 等）
页内走完才进入目录的下一条
遇到「确定」弹窗自动点掉，继续往下走
顺序遵循「由内到外」：最内层的子标签页先走完，再逐层向外推进，不会跳过任何一个 Task。
两个按钮
按钮	作用
自动答题（蓝色）	启动巡页。第一次点击开始，运行中再点一次等于暂停
安全暂停（橙色）	随时停止。同时停掉巡页循环和当前页的答题循环
「安全暂停」是为运行中「停不下来」准备的：巡页在后台持续点页面，控制台日志刷新很快，靠命令行敲 `stop()` 往往来不及。直接点这个橙色按钮最稳妥。
设计上的几点考量
不点提交：巡页只点标签页和目录，不会触碰提交按钮。U 校园 的作答是自动保存的，答完即可。
只在真正有题的页面作答：页面没有题目时直接跳过，不会卡在阅读页。
失败不阻塞：某一页扫描失败或答题失败，会记录到失败列表并继续往下走，跑完统一打印一份「一题都没答上的页面」清单。
防原地打转：页内标签页走完会回到第一个；认不出选中态时不会乱点。另有步数上限（默认 200 步）兜底。
先推配置再启动：启动时会先把当前选中的模型配置交给页面脚本，保证后续每页答题都能正常读取，避免出现「请先配置 API」。
进度怎么看
巡页的详细日志打在页面控制台（F12 → Console），形如：
```
[巡页] 已加载 v1.9  DRY_RUN=false ｜ __unipusAnswerer=就绪
[巡页] ──────── 第 1 步 ────────
[巡页]   顶层tab: 共 4 个 [Reading, Listening, ...]，当前=#0
[巡页]   Task/子tab: 共 2 个 [Task 1, Task 2]，当前=#0
[巡页] 答题结果: 3/3
```
`答题结果: 3/3` 表示这一页扫到 3 道、答了 3 道。
需要自己调的时候
巡页参数集中在 `modules/auto-pilot.js` 顶部的 `CFG`：
```js
var CFG = {
  DRY_RUN: false,        // true = 干跑，只打印不点击
  MAX_STEPS: 200,        // 单次巡页最多走多少步
  PAGE_SETTLE_MS: 10000, // 点完标签页后等页面稳定的最长时间
  SETTLE_POLL_MS: 300,   // 轮询间隔
  AFTER_ANSWER_MS: 600,  // 答完一页后额外等待
  AFTER_CLICK_MS: 900,   // 点一次标签页后的等待
};
```
页面加载慢就把 `PAGE_SETTLE_MS` 调大；只想看路线不想真点，把 `DRY_RUN` 改成 `true`。
也可以在页面控制台（需先切到扩展上下文）单独控制：
```js
__unipusAutoPilot.inspect()        // 查看本页识别到的 tab / 目录 / 确认按钮
__unipusAutoPilot.run()            // 启动巡页
__unipusAutoPilot.stop()           // 停止
__unipusAutoPilot.setDryRun(true)  // 运行时切到干跑
```
4. 扫描失败不再回退到 AI
原版在模板扫描失败时会自动切换到 AI 分析页面结构（控制台会打出「正在使用 AI 分析页面结构，请耐心等待…」），这一步往往要等很久，而且对 U 校园这种结构固定的站点完全没有必要。
本版本改成：模板扫描失败直接跳过本页。
模板匹配上但没有扫到题目 → 跳过本页
模板扫描过程中报错 → 跳过本页
根本没有匹配的站点模板 → 跳过本页
关于 API Key
必须配置 API Key：在弹窗设置的模型列表里填好 `baseUrl`、`apiKey`、`model`，并选中这一个模型。没有可用的 Key，AI 兜底那一步必然失败。
但 Key 只在 AI 兜底时才被用到。 具体来说：
U 校园：答案优先从官方接口解密取得，这条路不调用 AI、不消耗 Key
接口没给出答案的题：回落到 AI 补答，这时才真正用上 Key
问卷星、腾讯问卷等站点：本身就靠 AI，Key 是主要消耗方
因此一次 U 校园 答题里，接口能覆盖的题目完全不碰 AI；只有接口答不出来的那几道才会走 AI。
涉及的文件
文件	说明
`AutoUnipus/extension/content.js`	答案清洗、写作题识别与填充、日志、扫描失败直接跳过
`AutoUnipus/extension/modules/unipus-api.js`	接口答案解析（含写作题 `analysis` 正文）
`AutoUnipus/extension/modules/auto-pilot.js`	新增，自动巡页控制器
`AutoUnipus/extension/popup.js`	「自动答题」改为启动巡页，新增「安全暂停」按钮
`AutoUnipus/extension/popup.html`	新增「安全暂停」按钮
`AutoUnipus/extension/manifest.json`	`content_scripts` 中注册 `modules/auto-pilot.js`
`AutoUnipus/extension/templates/unipus.json`	题型模板，`writing` 已排在 `questionTypes` 第一位
---
许可
本项目集合了多个开源项目的代码，许可证情况如下：
浏览器扩展部分 — 基于 AI-ANSWER-ASSISTANT（GPL-3.0）和 AutoUnipus（BSD 3-Clause）改造
Java 桌面应用部分 — 来自 UnipusHelperPro，遵循其原始许可证
整体项目 — 因包含 GPL-3.0 代码，整体遵循 GPL-3.0 协议
详见根目录的 LICENSE 和 LICENSE.BSD。
> 本项目仅用于学习研究，请遵守相关平台的使用条款，不得用于非法用途。
