const WORKER_ID = "01KPD6M5YVHWCNQCRK3W1JD9W2";
const BASE_URL = "https://openapi.coreclaw.com/api/v2";
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_TIMES = 48;

const form = document.getElementById("scraper-form");
const apiTokenInput = document.getElementById("apiToken");
const usernamesInput = document.getElementById("usernames");
const submitBtn = document.getElementById("submitBtn");
const fillDemoBtn = document.getElementById("fillDemoBtn");
const statusBox = document.getElementById("statusBox");
const summaryCards = document.getElementById("summaryCards");
const jsonOutput = document.getElementById("jsonOutput");
const copyJsonBtn = document.getElementById("copyJsonBtn");

let latestJson = "";

fillDemoBtn.addEventListener("click", () => {
  usernamesInput.value = "nasa\ninstagram\nnatgeo";
});

copyJsonBtn.addEventListener("click", async () => {
  if (!latestJson) return;

  try {
    await navigator.clipboard.writeText(latestJson);
    updateStatus("JSON 已复制到剪贴板。", "success");
  } catch (error) {
    updateStatus(`复制失败：${error.message}`, "error");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const token = apiTokenInput.value.trim();
  const usernames = parseUsernames(usernamesInput.value);

  if (!token) {
    updateStatus("请先输入 CoreClaw API Token。", "error");
    return;
  }

  if (usernames.length === 0) {
    updateStatus("请至少输入一个 Instagram 用户名。", "error");
    return;
  }

  setLoading(true);
  renderEmptyCards("正在准备运行任务...");
  setJsonOutput("正在提交请求...");
  updateStatus("正在创建抓取任务...", "loading");

  try {
    const runData = await createWorkerRun(token, usernames);
    const runId = runData?.run_slug || runData?.id;

    if (!runId) {
      throw new Error("未拿到 runId，请检查接口返回。");
    }

    updateStatus(`任务已创建，runId: ${runId}。正在轮询状态...`, "loading");

    const finalRun = await pollRunUntilFinished(token, runId);
    const finalStatus = resolveRunStatus(finalRun);

    if (!["SUCCEEDED", "SUCCESS", "FINISHED", "COMPLETED"].includes(finalStatus)) {
      throw new Error(`任务未成功完成，当前状态：${finalStatus}`);
    }

    updateStatus("任务完成，正在拉取结果...", "loading");
    const resultData = await getRunResult(token, runId);
    const records = normalizeRecords(resultData);

    renderSummary(records);
    setJsonOutput(JSON.stringify(resultData, null, 2));
    updateStatus(`抓取完成，共返回 ${records.length} 条记录。`, "success");
  } catch (error) {
    renderEmptyCards("当前没有可展示的数据，请检查 token、用户名或接口状态后重试。");
    setJsonOutput(error.stack || error.message || "请求失败");
    updateStatus(`请求失败：${error.message}`, "error");
  } finally {
    setLoading(false);
  }
});

function parseUsernames(raw) {
  return raw
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((username) => ({ string: username.replace(/^@/, "") }));
}

async function createWorkerRun(token, usernames) {
  const response = await fetch(`${BASE_URL}/workers/${WORKER_ID}/runs`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({
      is_async: true,
      input: {
        parameters: {
          custom: {
            username: usernames,
          },
        },
      },
    }),
  });

  const json = await response.json();
  ensureResponseOk(response, json, "创建任务失败");
  return json.data;
}

async function pollRunUntilFinished(token, runId) {
  for (let i = 0; i < MAX_POLL_TIMES; i += 1) {
    const runData = await getRun(token, runId);
    const status = resolveRunStatus(runData);

    updateStatus(`任务状态：${status || "UNKNOWN"}（第 ${i + 1} 次轮询）`, "loading");

    if (["SUCCEEDED", "SUCCESS", "FINISHED", "COMPLETED"].includes(status)) {
      return runData;
    }

    if (["FAILED", "ERROR", "ABORTED", "CANCELLED"].includes(status)) {
      throw new Error(`任务执行失败，状态：${status}`);
    }

    await wait(POLL_INTERVAL_MS);
  }

  throw new Error("轮询超时，请稍后重试。");
}

async function getRun(token, runId) {
  const response = await fetch(`${BASE_URL}/worker-runs/${runId}`, {
    method: "GET",
    headers: buildHeaders(token),
  });

  const json = await response.json();
  ensureResponseOk(response, json, "查询任务状态失败");
  return json.data;
}

async function getRunResult(token, runId) {
  const response = await fetch(`${BASE_URL}/worker-runs/${runId}/result`, {
    method: "GET",
    headers: buildHeaders(token),
  });

  const json = await response.json();
  ensureResponseOk(response, json, "获取任务结果失败");
  return json.data;
}

function normalizeRecords(resultData) {
  if (Array.isArray(resultData)) return resultData;
  if (Array.isArray(resultData?.items)) return resultData.items;
  if (Array.isArray(resultData?.result)) return resultData.result;
  if (Array.isArray(resultData?.rows)) return resultData.rows;
  return [];
}

function resolveRunStatus(runData) {
  return (
    runData?.status ||
    runData?.state ||
    runData?.run_status ||
    runData?.meta?.status ||
    ""
  )
    .toString()
    .toUpperCase();
}

function buildHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function ensureResponseOk(response, json, fallbackMessage) {
  if (!response.ok || (typeof json?.code !== "undefined" && json.code !== 0)) {
    const message = json?.message || fallbackMessage;
    throw new Error(message);
  }
}

function renderSummary(records) {
  if (!records.length) {
    renderEmptyCards("任务成功执行，但结果为空。");
    return;
  }

  summaryCards.classList.remove("empty-state");
  summaryCards.innerHTML = records
    .slice(0, 12)
    .map((record) => {
      const username = safeText(record.username || record.ownerUsername || "unknown");
      const fullName = safeText(record.fullName || record.name || "未提供名称");
      const bio = safeText(record.biography || record.bio || "暂无简介");
      const followers = formatNumber(record.followersCount);
      const follows = formatNumber(record.followsCount);
      const posts = formatNumber(record.postsCount);
      const verified = record.isVerified || record.is_verified ? "是" : "否";

      return `
        <article class="summary-card">
          <h3>@${username}</h3>
          <p>${fullName}</p>
          <div class="meta-list">
            <div class="meta-item"><span>粉丝</span><strong>${followers}</strong></div>
            <div class="meta-item"><span>关注</span><strong>${follows}</strong></div>
            <div class="meta-item"><span>帖子数</span><strong>${posts}</strong></div>
            <div class="meta-item"><span>已认证</span><strong>${verified}</strong></div>
          </div>
          <p class="status-meta">${bio}</p>
        </article>
      `;
    })
    .join("");
}

function renderEmptyCards(message) {
  summaryCards.innerHTML = `<div class="empty-card">${safeText(message)}</div>`;
}

function updateStatus(message, type) {
  statusBox.textContent = message;
  statusBox.className = `status-box ${type}`;
}

function setJsonOutput(value) {
  latestJson = value;
  jsonOutput.textContent = value;
  copyJsonBtn.disabled = !value || value === "暂无结果";
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  fillDemoBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "抓取中..." : "开始抓取";
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? new Intl.NumberFormat("zh-CN").format(num) : "-";
}

function safeText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
