// DOM Elements
const statusBadge = document.getElementById("statusBadge");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const questionCount = document.getElementById("questionCount");
const answeredCount = document.getElementById("answeredCount");

const startBtn = document.getElementById("startBtn");
const startBtnText = document.getElementById("startBtnText");
const pauseBtn = document.getElementById("pauseBtn");
const pauseBtnText = document.getElementById("pauseBtnText");

// Settings Modal Elements
const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const closeSettingsBackdrop = document.getElementById("closeSettingsBackdrop");
const modelList = document.getElementById("modelList");
const addModelBtn = document.getElementById("addModelBtn");

// Edit Model Modal Elements
const editModelModal = document.getElementById("editModelModal");
const closeEditBtn = document.getElementById("closeEditBtn");
const closeEditBackdrop = document.getElementById("closeEditBackdrop");
const editModalTitle = document.getElementById("editModalTitle");
const editNameInput = document.getElementById("editName");
const editBaseUrlInput = document.getElementById("editBaseUrl");
const editApiKeyInput = document.getElementById("editApiKey");
const editModelInput = document.getElementById("editModel");
const editStatus = document.getElementById("editStatus");
const saveModelBtn = document.getElementById("saveModelBtn");
const toggleEditApiKeyBtn = document.getElementById("toggleEditApiKey");

let editingModelId = null;

const logContent = document.getElementById("logContent");
const clearLogBtn = document.getElementById("clearLog");

// State
let isRunning = false;
let hasScanned = false;

// Built-in default model — DeepSeek Flash
// API Key 需用户在设置中自行填入
const BUILTIN_MODEL = {
  id: "builtin-deepseek",
  name: "DeepSeek Flash",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-flash",
  builtin: false,
};

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  await initModels();

  // Check active session —— 以页面里的真实状态为准
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) {
    setRunningState(false);
    return;
  }

  await syncRunningStateFromPage(tabs[0].id);

  chrome.tabs.sendMessage(tabs[0].id, { action: "getStatus" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response) {
      questionCount.textContent = response.questionCount || 0;
      answeredCount.textContent = response.answeredCount || 0;
    }
  });

  // 页面被关掉/跳走后，按钮不应该永远卡在"暂停答题"
  chrome.tabs.onRemoved.addListener(() => setRunningState(false));
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === "loading" && tabId === tabs[0].id) {
      setRunningState(false);
    }
  });
});

// 从页面里读真实运行状态，决定弹窗按钮显示什么
async function syncRunningStateFromPage(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        pilot: window.__unipusAutoPilot
          ? {
              running: !!(window.__unipusAutoPilot.state && window.__unipusAutoPilot.state.running),
              step: window.__unipusAutoPilot.state && window.__unipusAutoPilot.state.step,
            }
          : null,
        answerer: window.__unipusAnswerer
          ? { isRunning: !!window.__unipusAnswerer.isRunning() }
          : null,
      }),
    });
    const r = (results && results[0] && results[0].result) || null;
    const pilotRunning = !!(r && r.pilot && r.pilot.running);
    const answererRunning = !!(r && r.answerer && r.answerer.isRunning);
    if (pilotRunning || answererRunning) {
      setRunningState(true);
    } else {
      setRunningState(false);
    }
    return { pilotRunning, answererRunning };
  } catch (e) {
    // 页面读不到（刚关过页面、系统页等），一律当作未运行
    setRunningState(false);
    return { pilotRunning: false, answererRunning: false };
  }
}

// --- Modal Logic ---
function openModal() {
  settingsModal.classList.add("open");
  renderModelList();
}

function closeModal() {
  settingsModal.classList.remove("open");
}

function openEditModal(modelId = null) {
  editingModelId = modelId;
  editModelModal.classList.add("open");

  if (modelId) {
    editModalTitle.textContent = "编辑模型";
    loadModelForEdit(modelId);
  } else {
    editModalTitle.textContent = "添加模型";
    editNameInput.value = "";
    editBaseUrlInput.value = "https://api.openai.com/v1";
    editApiKeyInput.value = "";
    editModelInput.value = "";
  }
}

function closeEditModal() {
  editModelModal.classList.remove("open");
  editingModelId = null;
}

openSettingsBtn.addEventListener("click", openModal);
closeSettingsBtn.addEventListener("click", closeModal);
closeSettingsBackdrop.addEventListener("click", closeModal);
addModelBtn.addEventListener("click", () => openEditModal());
closeEditBtn.addEventListener("click", closeEditModal);
closeEditBackdrop.addEventListener("click", closeEditModal);

// --- Template Management ---
const openTemplatesBtn = document.getElementById("openTemplatesBtn");
openTemplatesBtn.addEventListener("click", () => {
  window.location.href = "template-manager.html";
});

// --- Model Management Logic ---
toggleEditApiKeyBtn.addEventListener("click", () => {
  const type = editApiKeyInput.type === "password" ? "text" : "password";
  editApiKeyInput.type = type;
  toggleEditApiKeyBtn.style.opacity = type === "text" ? "1" : "0.6";
});

async function initModels() {
  const data = await chrome.storage.sync.get([
    "aiModels",
    "activeModelId",
    "baseUrl",
    "apiKey",
    "model",
  ]);

  // Migrate old config to new structure
  if (!data.aiModels && data.apiKey) {
    const customModel = {
      id: "custom-" + Date.now(),
      name: "自定义模型",
      baseUrl: data.baseUrl || "https://api.openai.com/v1",
      apiKey: data.apiKey,
      model: data.model || "gpt-4o-mini",
      builtin: false,
    };
    await chrome.storage.sync.set({
      aiModels: [customModel],
      activeModelId: customModel.id,
    });
  } else if (!data.aiModels) {
    // First time, set builtin as active
    await chrome.storage.sync.set({
      aiModels: [],
      activeModelId: BUILTIN_MODEL.id,
    });
  }
}

async function getAllModels() {
  const data = await chrome.storage.sync.get(["aiModels"]);
  return [BUILTIN_MODEL, ...(data.aiModels || [])];
}

async function getActiveModel() {
  const data = await chrome.storage.sync.get(["activeModelId"]);
  const models = await getAllModels();
  const activeId = data.activeModelId || BUILTIN_MODEL.id;
  return models.find((m) => m.id === activeId) || BUILTIN_MODEL;
}

async function renderModelList() {
  const models = await getAllModels();
  const data = await chrome.storage.sync.get(["activeModelId"]);
  const activeId = data.activeModelId || BUILTIN_MODEL.id;

  modelList.innerHTML = models
    .map(
      (model) => `
    <div class="model-item ${
      model.id === activeId ? "active" : ""
    }" data-model-id="${model.id}">
      <input type="radio" name="activeModel" class="model-radio" value="${
        model.id
      }" ${model.id === activeId ? "checked" : ""}>
      <div class="model-info">
        <div class="model-name">
          ${model.name}
          ${model.builtin ? '<span class="model-badge">内置</span>' : ""}
        </div>
        <div class="model-meta">${model.model}</div>
      </div>
      <div class="model-actions">
        ${
          !model.builtin
            ? `
          <button class="icon-btn edit-model-btn" data-model-id="${model.id}">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button class="icon-btn delete-model-btn" data-model-id="${model.id}">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        `
            : ""
        }
      </div>
    </div>
  `
    )
    .join("");

  // Add click event to entire model card
  document.querySelectorAll(".model-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      // Don't trigger if clicking on action buttons
      if (
        e.target.closest(".edit-model-btn") ||
        e.target.closest(".delete-model-btn")
      ) {
        return;
      }

      const modelId = item.dataset.modelId;
      const model = models.find((m) => m.id === modelId);

      await chrome.storage.sync.set({ activeModelId: modelId });
      addLog("success", `已使用${model.name}模型`);
      closeModal();
    });
  });

  // Add event listeners for radio buttons
  document.querySelectorAll(".model-radio").forEach((radio) => {
    radio.addEventListener("change", async (e) => {
      e.stopPropagation();
      await chrome.storage.sync.set({ activeModelId: e.target.value });
      renderModelList();
    });
  });

  // Add event listeners for edit buttons
  document.querySelectorAll(".edit-model-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const modelId = e.currentTarget.dataset.modelId;
      openEditModal(modelId);
    });
  });

  // Add event listeners for delete buttons
  document.querySelectorAll(".delete-model-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const modelId = e.currentTarget.dataset.modelId;
      if (!confirm("确定要删除这个模型吗？")) return;

      const data = await chrome.storage.sync.get(["aiModels", "activeModelId"]);
      const models = (data.aiModels || []).filter((m) => m.id !== modelId);

      const updates = { aiModels: models };
      if (data.activeModelId === modelId) {
        updates.activeModelId = BUILTIN_MODEL.id;
      }

      await chrome.storage.sync.set(updates);
      renderModelList();
    });
  });
}

async function loadModelForEdit(modelId) {
  const models = await getAllModels();
  const model = models.find((m) => m.id === modelId);
  if (model) {
    editNameInput.value = model.name;
    editBaseUrlInput.value = model.baseUrl;
    editApiKeyInput.value = model.apiKey;
    editModelInput.value = model.model;
  }
}

saveModelBtn.addEventListener("click", async () => {
  const name = editNameInput.value.trim();
  const baseUrl = editBaseUrlInput.value.trim();
  const apiKey = editApiKeyInput.value.trim();
  const model = editModelInput.value.trim();

  if (!name || !baseUrl || !apiKey || !model) {
    showEditStatus("error", "请填写所有配置项");
    return;
  }

  saveModelBtn.disabled = true;
  saveModelBtn.textContent = "保存中...";

  const data = await chrome.storage.sync.get(["aiModels"]);
  const models = data.aiModels || [];

  if (editingModelId) {
    // Edit existing
    const index = models.findIndex((m) => m.id === editingModelId);
    if (index !== -1) {
      models[index] = { ...models[index], name, baseUrl, apiKey, model };
    }
  } else {
    // Add new
    models.push({
      id: "custom-" + Date.now(),
      name,
      baseUrl,
      apiKey,
      model,
      builtin: false,
    });
  }

  await chrome.storage.sync.set({ aiModels: models });

  setTimeout(() => {
    saveModelBtn.disabled = false;
    saveModelBtn.textContent = "保存";
    showEditStatus("success", "保存成功");
    setTimeout(() => {
      closeEditModal();
      renderModelList();
    }, 500);
  }, 300);
});

function showEditStatus(type, message) {
  editStatus.textContent = message;
  editStatus.className = `config-status ${type}`;
  setTimeout(() => {
    editStatus.textContent = "";
    editStatus.className = "config-status";
  }, 3000);
}

// --- Action Logic ---

// 确保 content script 已注入到目标页面
async function ensureContentScriptInjected(tabId) {
  try {
    // 先尝试发送一个测试消息
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: "getStatus" }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script 未加载，尝试注入
          console.log("[popup] Content script 未加载，尝试注入...");
          injectContentScript(tabId)
            .then(resolve)
            .catch(() => resolve(false));
        } else {
          // 已加载
          resolve(true);
        }
      });
    });
  } catch (e) {
    console.error("[popup] 检查 content script 失败:", e);
    return false;
  }
}

// 程序化注入 content script
async function injectContentScript(tabId) {
  try {
    // 检查是否是可以注入的页面
    const tab = await chrome.tabs.get(tabId);
    if (
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) {
      console.log("[popup] 无法在系统页面注入脚本");
      return false;
    }

    // 注入 CSS
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });

    // 按顺序注入 JS 模块
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        "modules/site-matcher.js",
        "modules/template-manager.js",
        "modules/bank.js",
        "modules/scanner-enhanced.js",
        "modules/unipus-api.js",
        "modules/welearn-api.js",
        "content.js",
      ],
    });

    console.log("[popup] Content script 注入成功");
    // 等待脚本初始化
    await new Promise((resolve) => setTimeout(resolve, 200));
    return true;
  } catch (e) {
    console.error("[popup] 注入 content script 失败:", e);
    return false;
  }
}

// 自动答题（一键：巡页 + 逐页答题）
startBtn.addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab) {
    addLog("error", "无法获取当前标签页");
    return;
  }

  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://") ||
    tab.url.startsWith("about:")
  ) {
    addLog("error", "请切换到有题目的网页");
    return;
  }

  // 关键：每次点击都先以页面真实状态为准，避免上次关页面后 isRunning 卡在 true
  const st = await syncRunningStateFromPage(tab.id);
  if (st.pilotRunning || st.answererRunning) {
    // 页面里确实还在跑 → 这次点击当作暂停
    await safePause(tab.id);
    return;
  }
  // 页面里没在跑 → 无条件复位，然后走启动流程
  setRunningState(false);

  // 0) 先把当前选中的模型配置推给页面里的 content.js
  //    巡页控制器直接调 runOnce() 不会走 {action:"start", config} 那条消息，
  //    config 会一直是 null，handleScan 就会报"请先配置API"。
  const activeModel = await getActiveModel();
  const config = {
    baseUrl: activeModel.baseUrl,
    apiKey: activeModel.apiKey,
    model: activeModel.model,
  };

  if (!config.apiKey) {
    addLog("error", "当前模型没有填写 apiKey，请先在设置里配置");
    return;
  }

  const injected = await ensureContentScriptInjected(tab.id);
  if (!injected) {
    addLog("error", "无法连接到页面，请刷新页面后重试");
    return;
  }

  // 1) 把配置塞进去（先走原来的 start 消息，让 content.js 拿到 config 并扫描一次；
  //    如果页面里没有题目，这一步会自己结束，不影响后面的巡页）
  await new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: "start", config }, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });

  // 2) 启动巡页控制器
  setRunningState(true);
  addLog("info", "🚀 开始巡页自动答题");

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: () => {
        if (!window.__unipusAutoPilot) {
          return { ok: false, error: "__unipusAutoPilot 未加载，请确认 modules/auto-pilot.js 已在 manifest 中" };
        }
        window.__unipusAutoPilot.run();
        return { ok: true, version: window.__unipusAutoPilot.version };
      },
    });
    const r = results && results[0] && results[0].result;
    if (r && r.ok === false) {
      setRunningState(false);
      addLog("error", r.error);
    } else if (r && r.version) {
      addLog("info", "巡页控制器 v" + r.version + " 已启动");
    }
  } catch (e) {
    setRunningState(false);
    addLog("error", "启动巡页失败: " + e.message);
  }
});

// 安全暂停：同时停掉巡页循环和答题循环，并复位界面
async function safePause(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const out = { pilot: false, answerer: false };
        try {
          if (window.__unipusAutoPilot) {
            window.__unipusAutoPilot.stop();
            out.pilot = true;
          }
        } catch (e) {
          out.pilotError = String(e);
        }
        try {
          if (window.__unipusAnswerer) {
            window.__unipusAnswerer.stop();
            out.answerer = true;
          }
        } catch (e) {
          out.answererError = String(e);
        }
        return out;
      },
    });
    addLog("warning", "已安全暂停（巡页 + 答题均已停止）");
  } catch (e) {
    // 页面可能已经关了 → 只复位界面
    addLog("warning", "页面已不可用，已在本地复位");
  }
  setRunningState(false);
}

// 独立的安全暂停按钮
if (pauseBtn) {
  pauseBtn.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) {
      setRunningState(false);
      addLog("warning", "没有可用的标签页，已在本地复位");
      return;
    }
    await safePause(tab.id);
  });
}

function setRunningState(active) {
  isRunning = active;
  if (active) {
    startBtnText.textContent = "暂停答题";
    startBtn.classList.remove("btn-primary");
    startBtn.classList.add("btn-warning");
    updateStatus("running", "答题中...");
  } else {
    startBtnText.textContent = "自动答题";
    startBtn.classList.remove("btn-warning");
    startBtn.classList.add("btn-primary");
    updateStatus("ready", "就绪");
  }
}

// --- Helpers ---

function updateStatus(type, text) {
  statusDot.className = `status-dot ${type}`;
  statusText.textContent = text;
}

function addLog(type, message) {
  const time = new Date().toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const logItem = document.createElement("div");
  logItem.className = `log-item log-${type}`;
  logItem.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-msg">${message}</span>
  `;
  logContent.appendChild(logItem);
  logContent.scrollTop = logContent.scrollHeight;
}

clearLogBtn.addEventListener("click", () => {
  logContent.innerHTML = "";
  addLog("info", "日志已清空");
});

// Message Listener
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case "log":
      addLog(message.level, message.text);
      break;
    case "updateStats":
      questionCount.textContent = message.questionCount;
      answeredCount.textContent = message.answeredCount;
      break;
    case "complete":
      setRunningState(false);
      updateStatus("ready", "完成");
      addLog("success", `🎉 全部完成 (共${message.answeredCount}题)`);
      break;
    case "error":
      setRunningState(false);
      updateStatus("error", "错误");
      addLog("error", message.text);
      break;
  }
});
