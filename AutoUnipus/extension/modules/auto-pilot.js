/**
 * U校园 自动巡页控制器  v1.9
 * ------------------------------------------------------------
 * 修复点（v1.2）：
 *   - 选中态同时识别父元素的 activity 类（顶层 tab 的选中态在 ant-col 父级上）
 *   - 左侧目录改用 [data-role="micro"] 抓取，选中态看 pc-menu-activity
 *   - 认不出选中态时用面包屑文字兜底，认不出就不再点击（防原地打转）
 *   - 上一版（v1.1）的修复：
 *   - 整个文件包在 try/catch 里，任何异常都不会让 window.__unipusAutoPilot 消失
 *   - 所有 chrome.* 调用都做了可用性检测
 *   - 加载成功/失败都会在控制台打印 [巡页] 字样，便于确认是否已注入
 * ------------------------------------------------------------
 * 用法（F12 控制台）：
 *   __unipusAutoPilot.inspect()   查看本页识别到的 tab / 目录 / 确认按钮
 *   __unipusAutoPilot.run()       开始巡页（默认干跑，只打印不点击）
 *   __unipusAutoPilot.stop()      停止
 * 确认路线无误后，把下面 CFG.DRY_RUN 改成 false，重载扩展。
 * ------------------------------------------------------------
 */
(function () {
  "use strict";

  // 先把标记打出来：看到这一行就说明文件已被注入并开始执行
  try {
    console.log("%c[巡页] 脚本开始执行", "color:#0aa;font-weight:bold");
  } catch (_) {}

  var CFG = {
    DRY_RUN: false,
    MAX_STEPS: 200,
    PAGE_SETTLE_MS: 10000,
    SETTLE_POLL_MS: 300,
    AFTER_ANSWER_MS: 600,
    AFTER_CLICK_MS: 900,
  };

  var state = { running: false, step: 0, failedPages: [] };

  function log() {
    try {
      var a = Array.prototype.slice.call(arguments);
      console.log.apply(console, ["%c[巡页]", "color:#0aa;font-weight:bold"].concat(a));
    } catch (_) {}
  }
  function warn() {
    try {
      var a = Array.prototype.slice.call(arguments);
      console.warn.apply(console, ["[巡页]"].concat(a));
    } catch (_) {}
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  // ---------- DOM 工具 ----------
  function isUsable(el) {
    try {
      if (!el || !el.isConnected) return false;
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      var cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  // 选中状态可能落在元素自己身上（.pc-task -> pc-task-activity），
  // 也可能落在父元素上（.pc-tab-view-container 的父级 ant-col 带 pc-header-tab-activity）
  function clsOf(el) {
    try {
      var c = el && el.className;
      return typeof c === "string" ? c : "";
    } catch (_) {
      return "";
    }
  }

  // 页面用 xxx-activity / xxx-default 成对标记，default 明确表示"未选中"。
  // 只看有没有 activity 会把 default 也算进来，必须先排除 default。
  function markedActive(c) {
    if (!c) return false;
    if (/\bdefault\b/.test(c)) return false;
    if (/\bactivity\b/.test(c)) return true;
    if (/\b(active|selected|current|checked)\b/.test(c)) return true;
    return false;
  }

  function isActive(el) {
    try {
      if (!el) return false;
      if (markedActive(clsOf(el))) return true;
      if (markedActive(clsOf(el.parentElement))) return true;
      if (el.getAttribute("aria-selected") === "true") return true;
      if (el.getAttribute("aria-current") === "true") return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  // 面包屑文字：用于"页面上一个选中态都认不出"时兜底定位
  function breadcrumbText() {
    try {
      var el = document.querySelector(".ant-breadcrumb, [class*='breadcrumb']");
      if (el) return (el.innerText || "").replace(/\s+/g, " ");
      var h = document.querySelector(".pc-slider-Content-header");
      return h ? (h.innerText || "").replace(/\s+/g, " ") : "";
    } catch (_) {
      return "";
    }
  }

  function txt(el) {
    try {
      return (el.textContent || "").replace(/\s+/g, " ").trim();
    } catch (_) {
      return "";
    }
  }

  // ============================================================
  // 找到 Task/子tab 真正所属的那个"顶层tab容器"
  // .pc-task 在 DOM 里可能同时存在多组（其它顶层tab的，只是被隐藏），
  // 直接 document.querySelectorAll('.pc-task') 会把别人的也抓进来。
  // 这里做三步收敛：
  //   1) 只要可见的（isUsable 已经排除 display:none / 0x0）
  //   2) 从 Task 往上找它属于哪个 .pc-tab-view-container
  //   3) 和"当前选中的顶层tab"取交集；拿不到选中态时退回可见集合
  // ============================================================
  function visibleTasks() {
    return Array.prototype.filter.call(
      document.querySelectorAll(".pc-task"),
      isUsable
    );
  }

  function currentActiveTabEl() {
    var tabs = Array.prototype.filter.call(
      document.querySelectorAll(".pc-tab-view-container"),
      isUsable
    );
    for (var i = 0; i < tabs.length; i++) {
      if (isActive(tabs[i])) return tabs[i];
    }
    return null;
  }

  function tasksInActiveTab() {
    var all = visibleTasks();
    if (!all.length) return [];

    // 先按"最近的那个 .pc-tab-view-container"分组
    var byTab = [];
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      var owner = null;
      try {
        owner = t.closest(".pc-tab-view-container");
      } catch (_) {}
      var g = null;
      for (var k = 0; k < byTab.length; k++) {
        if (byTab[k].owner === owner) {
          g = byTab[k];
          break;
        }
      }
      if (!g) {
        g = { owner: owner, items: [] };
        byTab.push(g);
      }
      g.items.push(t);
    }

    // 只有一组可见 → 就是它，不需要猜
    if (byTab.length === 1) return byTab[0].items;

    // 多组都可见 → 用当前选中的顶层tab去匹配
    var active = currentActiveTabEl();
    if (active) {
      for (var m = 0; m < byTab.length; m++) {
        if (byTab[m].owner === active) return byTab[m].items;
      }
      // owner 不是它的后代（Task 容器是 tab 的兄弟/祖父）→ 用面包屑文字兜底
      var actText = txt(active);
      for (var n = 0; n < byTab.length; n++) {
        var ownerText = byTab[n].owner ? txt(byTab[n].owner) : "";
        if (ownerText && ownerText.indexOf(actText) === -1 && actText.indexOf(ownerText) === -1) {
          continue;
        }
        return byTab[n].items;
      }
    }

    // 兜底：取元素最多的那组（真正的当前页一般 DOM 最完整）
    var best = byTab[0];
    for (var p = 1; p < byTab.length; p++) {
      if (byTab[p].items.length > best.items.length) best = byTab[p];
    }
    return best.items;
  }

  var ROWS = [
    {
      name: "顶层tab",
      get: function () {
        return Array.prototype.filter.call(
          document.querySelectorAll(".pc-tab-view-container"),
          isUsable
        );
      },
    },
    {
      name: "Task/子tab",
      get: function () {
        return tasksInActiveTab();
      },
    },
  ];

  // 左侧目录的叶子条目：data-role="micro"
  // 选中态：元素自身或父级带 pc-menu-activity / active
  function getMenuItems() {
    var list = Array.prototype.slice.call(document.querySelectorAll('[data-role="micro"]'));
    if (!list.length) {
      // 兜底：老结构
      list = Array.prototype.slice.call(document.querySelectorAll(".menu-li"));
      list = list.filter(function (el) {
        return !el.querySelector(".menu-li");
      });
    }
    return list.filter(isUsable);
  }

  function activeMenuIndex(items) {
    for (var i = 0; i < items.length; i++) {
      if (markedActive(clsOf(items[i]))) return i;
      if (markedActive(clsOf(items[i].parentElement))) return i;
      if (items[i].getAttribute("aria-current") === "true") return i;
    }
    return -1;
  }

  // ============================================================
  // 游标：记录"当前走到第几个"
  //   干跑(DRY_RUN)：页面不会真的跳转，游标是唯一真相，完全不读页面选中态
  //   真跑：每次点击后页面会变，游标失效，改读页面真实选中态
  // 两者彻底分开，避免"读了页面又读了游标"互相打架导致的原地打转
  // ============================================================
  var cursor = {};
  function resetCursor() {
    cursor = {};
  }
  function cursorHas(k) {
    return Object.prototype.hasOwnProperty.call(cursor, k);
  }

  // 读页面真实选中态（人工点过的地方就体现在这里）
  //   1) 元素自身/父级带 activity 标记 → 这就是"人工点过的那一个"
  //   2) 面包屑里出现的文字
  // 返回 -1 表示真的认不出来
  function pageIndexInRow(items) {
    for (var i = 0; i < items.length; i++) {
      if (isActive(items[i])) return i;
    }
    var bc = breadcrumbText();
    if (bc) {
      for (var k = 0; k < items.length; k++) {
        var t = txt(items[k]);
        if (t && bc.indexOf(t) !== -1) return k;
      }
    }
    return -1;
  }

  // 读取某一行"当前应该处于第几个"
  function currentIndexInRow(row) {
    var items = row.get();
    if (!items.length) return { items: items, curIdx: -1 };
    if (CFG.DRY_RUN) {
      // 干跑：只用游标；第一次进入时初始化为页面状态
      if (!cursorHas(row.name)) {
        var init = pageIndexInRow(items);
        cursor[row.name] = init >= 0 ? init : 0;
      }
      var c = cursor[row.name];
      if (c >= 0 && c < items.length) return { items: items, curIdx: c };
      return { items: items, curIdx: -1 };
    }
    // 真跑：只读页面
    return { items: items, curIdx: pageIndexInRow(items) };
  }

  // 一旦进入更下层的控件，上层游标要清掉，否则会卡在上层
  function clearDeeperCursor(depth) {
    for (var i = depth + 1; i < ROWS.length; i++) delete cursor[ROWS[i].name];
  }

  // 进入新的目录页后，页内控件从当前位置重新识别
  function resetTabCursorOnly() {
    delete cursor["顶层tab"];
    delete cursor["Task/子tab"];
  }

  // 层级关系：顶层tab 是父，Task/子tab 是子。
  // 正确的走法 = 先把当前父页下面的子 tab 走完，子 tab 到头了再换父 tab，
  // 换了父 tab 之后子 tab 从第 0 个重新开始。
  // 所以这里要【从最内层往外】找，而不是从最外层往里找。
  function resolveNextTab() {
    var snapshot = [];
    for (var i = 0; i < ROWS.length; i++) {
      var r = currentIndexInRow(ROWS[i]);
      snapshot.push({ depth: i, row: ROWS[i], items: r.items, curIdx: r.curIdx });
      if (!r.items.length) continue;
      log(
        "  " +
          ROWS[i].name +
          ": 共 " +
          r.items.length +
          " 个 [" +
          r.items
            .map(function (e) {
              return txt(e);
            })
            .join(" | ") +
          "]，当前=#" +
          r.curIdx
      );
    }

    // 找出"最深的有内容层"（子层）。子层没走完就只走子层。
    var deepest = -1;
    for (var m = snapshot.length - 1; m >= 0; m--) {
      if (snapshot[m].items.length > 0) {
        deepest = m;
        break;
      }
    }

    // 第 1 轮：从内往外，谁还有下一个就走谁（子层优先）
    for (var d = deepest; d >= 0; d--) {
      var s = snapshot[d];
      if (!s.items.length) continue;
      if (s.curIdx < 0) continue;
      var next = s.items[s.curIdx + 1] || null;
      if (!next) {
        // 这一层走到头了：回卷到第 0 个，让上层继续前进
        if (CFG.DRY_RUN) cursor[s.row.name] = 0;
        continue;
      }
      return { depth: d, row: s.row.name, el: next, text: txt(next), wrapped: false };
    }

    // 第 2 轮：所有层都走到头了才说明当前页确实没有下一个
    return null;
  }

  function findConfirmButton() {
    var all = Array.prototype.slice.call(
      document.querySelectorAll("button, .ant-btn, [role='button'], div, span")
    );
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!isUsable(el)) continue;
      var t = txt(el);
      if (t !== "确定" && t !== "OK" && t !== "确认") continue;
      if (el.querySelectorAll("button, [role='button']").length > 0) continue;
      return el;
    }
    return null;
  }

  async function handleConfirm() {
    var btn = findConfirmButton();
    if (!btn) return false;
    log("发现弹窗，点「确定」");
    if (!CFG.DRY_RUN) {
      btn.click();
      await sleep(500);
    }
    return true;
  }

  function pageFingerprint() {
    var body = "";
    try {
      body = (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 3000);
    } catch (_) {}
    return [
      location.href,
      body,
      document.querySelectorAll("input").length,
      document.querySelectorAll(".question-common-abs-question-container").length,
    ].join("|");
  }

  function hasQuestions() {
    return (
      document.querySelectorAll(".question-common-abs-question-container").length > 0 ||
      document.querySelectorAll("[class*='question-abs-material']").length > 0
    );
  }

  // ---------- config：不再依赖 chrome.storage ----------
  async function getConfig() {
    // 优先用 content.js 暴露出来的 config（它是闭包里那一个，最可靠）
    try {
      if (window.__unipusAnswerer && window.__unipusAnswerer.configValue) {
        return window.__unipusAnswerer.configValue;
      }
    } catch (_) {}
    // 退路：chrome.storage（可能不可用，全部包住）
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        return await new Promise(function (res) {
          try {
            chrome.storage.local.get(["config"], function (v) {
              res(v && v.config ? v.config : null);
            });
          } catch (_) {
            res(null);
          }
        });
      }
    } catch (_) {}
    return null;
  }

  async function answerCurrentPage(cfg) {
    if (!window.__unipusAnswerer || typeof window.__unipusAnswerer.runOnce !== "function") {
      warn("找不到 __unipusAnswerer.runOnce，请确认 content.js 已替换并重载扩展");
      return { answered: 0, total: -1 };
    }
    if (!hasQuestions()) {
      log("本页没有题目，跳过答题");
      return { answered: 0, total: 0 };
    }
    log("开始答题…");
    var r = await window.__unipusAnswerer.runOnce(cfg);
    log("答题结果: " + r.answered + "/" + r.total);
    if (r.total > 0 && r.answered === 0) {
      state.failedPages.push("第" + state.step + "页: " + location.href.slice(-60));
    }
    return r;
  }

  async function run() {
    if (state.running) {
      log("已在运行中");
      return;
    }
    state.running = true;
    state.step = 0;
    state.failedPages = [];
    resetCursor();

    var cfg = await getConfig();
    if (!cfg) warn("没读到 config，答题可能走 AI 分支");

    log("开始巡页  DRY_RUN=" + CFG.DRY_RUN + "  URL=" + location.href);

    var lastClickKey = "";
    var sameClickCount = 0;

    for (var i = 0; i < CFG.MAX_STEPS && state.running; i++) {
      state.step = i + 1;
      log("──────── 第 " + state.step + " 步 ────────");

      await handleConfirm();

      var r = await answerCurrentPage(cfg);
      await sleep(CFG.AFTER_ANSWER_MS);

      // 先看页内控件（顶层 tab → 子 tab）
      var next = resolveNextTab();
      var clickKey = "";
      if (next) {
        clickKey = "tab:" + next.row + ":" + next.text;
        log("→ 点【" + next.row + "】的「" + next.text + "」");
        if (!CFG.DRY_RUN) {
          try {
            next.el.scrollIntoView({ block: "center" });
          } catch (_) {}
          await sleep(200);
          next.el.click();
          await sleep(CFG.AFTER_CLICK_MS);
          // 跨层：换父 tab 时，子 tab 要从第一个重新走
          if (next.depth === 0) clearDeeperCursor(0);
        } else {
          // 干跑：推进虚拟游标，模拟"已经点到这一页"
          var before = currentIndexInRow(ROWS[next.depth]).curIdx;
          cursor[next.row] = before + 1;
          // 换父 tab 时，子 tab 游标要清掉，让它从第一个重新开始
          clearDeeperCursor(next.depth);
        }
      } else {
        // 页内控件全走完 → 看目录
        var items = getMenuItems();
        // 干跑不点目录：页面不会真的翻过去，点目录只推游标，
        // 下一步页内tab又会从#0重走一遍 → 无限循环。直接收工。
        if (CFG.DRY_RUN) {
          log("页内控件已走完（干跑不点目录）。本节共走 " + state.step + " 步，结束");
          break;
        }
        var ai = activeMenuIndex(items);
        log("页内控件已走完。目录共 " + items.length + " 条，当前=#" + ai);
        if (ai < 0 && items.length > 0) {
          warn("认不出目录当前项，为避免乱点，停止");
          break;
        }
        var nextMenu = ai >= 0 ? items[ai + 1] || null : items[0] || null;
        if (!nextMenu) {
          log("目录也走完了，巡页结束");
          break;
        }
        clickKey = "menu:" + txt(nextMenu).slice(0, 40);
        log("→ 点目录「" + txt(nextMenu).slice(0, 40) + "」");
        if (!CFG.DRY_RUN) {
          try {
            nextMenu.scrollIntoView({ block: "center" });
          } catch (_) {}
          await sleep(200);
          nextMenu.click();
          await sleep(CFG.AFTER_CLICK_MS);
        }
        cursor["menu"] = ai + 1;
        resetTabCursorOnly(); // 进入新的目录页，页内控件从头开始
      }

      // 防死循环：连续 3 次要点同一个东西 → 停
      if (clickKey && clickKey === lastClickKey) {
        sameClickCount++;
        if (sameClickCount >= 3) {
          warn("连续 3 次都要点「" + clickKey + "」，判定为原地打转，停止");
          break;
        }
      } else {
        sameClickCount = 0;
        lastClickKey = clickKey;
      }
    }

    state.running = false;
    log("巡页结束，共走 " + state.step + " 步");
    if (state.failedPages.length) {
      warn("以下页面一题都没答上：\n" + state.failedPages.join("\n"));
    }
  }

  function stop() {
    state.running = false;
    log("收到停止指令");
  }

  function inspect() {
    log("=== 当前页结构 ===");
    ROWS.forEach(function (row) {
      var items = row.get();
      log(row.name + ": " + items.length + " 个");
      items.forEach(function (e, i) {
        log("   #" + i + " " + JSON.stringify(txt(e).slice(0, 30)) + " active=" + isActive(e));
      });
    });
    var menus = getMenuItems();
    log("目录: " + menus.length + " 条，当前=#" + activeMenuIndex(menus));
    menus.slice(0, 40).forEach(function (e, i) {
      log(
        "   #" +
          i +
          " " +
          JSON.stringify(txt(e).slice(0, 30)) +
          " active=" +
          /active|selected|current/i.test(String(e.className || ""))
      );
    });
    log("有题目: " + hasQuestions() + "   确认按钮: " + !!findConfirmButton());
    log("__unipusAnswerer: " + (window.__unipusAnswerer ? "已就绪" : "缺失"));
  }

  // ---------- 挂载 ----------
  try {
    window.__unipusAutoPilot = {
      version: "1.9",
      cfg: CFG,
      run: run,
      stop: stop,
      state: state,
      inspect: inspect,
      // 运行时切换干跑/真跑，不用重载扩展
      setDryRun: function (v) {
        CFG.DRY_RUN = !!v;
        log("DRY_RUN 已切换为 " + CFG.DRY_RUN);
        return CFG.DRY_RUN;
      },
    };
    log(
      "已加载 v1.9  DRY_RUN=" +
        CFG.DRY_RUN +
        " ｜ __unipusAnswerer=" +
        (window.__unipusAnswerer ? "就绪" : "缺失")
    );
    log("用法：__unipusAutoPilot.inspect() / .run() / .stop()");
  } catch (e) {
    try {
      window.__unipusAutoPilot = {
        error: String(e && e.message ? e.message : e),
        run: function () {
          warn("加载失败：" + this.error);
        },
      };
    } catch (_) {}
    warn("挂载失败", e);
  }
})();
