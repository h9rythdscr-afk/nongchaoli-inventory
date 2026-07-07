const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const unitCard = document.getElementById("unitCard");
const actionCard = document.getElementById("actionCard");
const actionButtons = document.getElementById("actionButtons");
const actionMessage = document.getElementById("actionMessage");
const operationNote = document.getElementById("operationNote");
const eventList = document.getElementById("eventList");
const sessionText = document.getElementById("sessionText");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");

const params = new URLSearchParams(window.location.search);
const unitCode = (params.get("code") || "").trim().toUpperCase();

const STATUS_LABELS = {
  label_generated: "待入库",
  in_stock: "在库未开封",
  opened: "已开封使用中",
  used_up: "已用完",
  discarded: "已报废",
  expired: "已过期",
  lost: "遗失",
};

const EVENT_LABELS = {
  label_generated: "生成标签",
  inbound: "扫码入库",
  open: "开封",
  used_up: "用完",
  discard: "报废",
  expire: "过期",
  lost: "遗失",
  adjust: "库存调整",
  transfer: "移库",
  restore: "恢复",
};

const ACTIONS_BY_STATUS = {
  label_generated: [
    { action: "inbound", label: "确认入库", className: "primary-button" },
    { action: "discard", label: "直接报废", className: "danger-button" },
  ],
  in_stock: [
    { action: "open", label: "登记开封", className: "primary-button" },
    { action: "discard", label: "登记报废", className: "danger-button" },
    { action: "lost", label: "标记遗失", className: "secondary-button" },
  ],
  opened: [
    { action: "used_up", label: "登记用完", className: "primary-button" },
    { action: "discard", label: "登记报废", className: "danger-button" },
    { action: "lost", label: "标记遗失", className: "secondary-button" },
    { action: "undo_open", label: "撤销开封（误操作）", className: "secondary-button" },
  ],
};

let currentUnit = null;
let currentProfile = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showActionMessage(text, type = "error") {
  actionMessage.textContent = text;
  actionMessage.className = `form-message ${type}`;
}

async function requireSession() {
  const {
    data: { session },
    error,
  } = await db.auth.getSession();

  if (error || !session) {
    sessionStorage.setItem("inventory_redirect_after_login", window.location.href);
    window.location.replace("index.html");
    return null;
  }

  const { data: profile, error: profileError } = await db
    .from("staff_profiles")
    .select("display_name, staff_role, is_active")
    .eq("id", session.user.id)
    .single();

  if (profileError || !profile?.is_active) {
    await db.auth.signOut();
    window.location.replace("index.html");
    return null;
  }

  currentProfile = profile;

  sessionText.textContent = `${profile.display_name} · ${
    profile.staff_role === "admin" ? "管理员" : "员工"
  }`;

  return session;
}

function renderUnit(unit) {
  const product = unit.products || {};
  const batch = unit.purchase_batches || {};
  unitCard.innerHTML = `
    <div class="unit-detail-head">
      <div>
        <p class="eyebrow">${escapeHtml(unit.unit_code)}</p>
        <h2>${escapeHtml(product.name || "未命名商品")}</h2>
        <p class="muted">${escapeHtml(product.specification || "")}</p>
      </div>
      <span class="status-badge status-${escapeHtml(unit.status)}">
        ${escapeHtml(STATUS_LABELS[unit.status] || unit.status)}
      </span>
    </div>

    <div class="detail-grid">
      <div><span>单件编码</span><strong>${escapeHtml(unit.unit_code)}</strong></div>
      <div><span>批次号</span><strong>${escapeHtml(batch.batch_no || "—")}</strong></div>
      <div><span>箱内序号</span><strong>${escapeHtml(unit.serial_no || "—")}</strong></div>
      <div><span>存放位置</span><strong>${escapeHtml(unit.storage_location || "—")}</strong></div>
      <div><span>入库时间</span><strong>${formatDate(unit.inbound_at)}</strong></div>
      <div><span>到期日期</span><strong>${unit.expiry_date || "—"}</strong></div>
      <div><span>开封时间</span><strong>${formatDate(unit.opened_at)}</strong></div>
      <div><span>开封后报废期限</span><strong>${formatDate(unit.opened_discard_deadline)}</strong></div>
    </div>
  `;

  const actions = (ACTIONS_BY_STATUS[unit.status] || []).filter(
    (item) => item.action !== "undo_open" || currentProfile?.staff_role === "admin"
  );
  if (!actions.length) {
    actionCard.classList.add("hidden-card");
    return;
  }

  actionCard.classList.remove("hidden-card");
  actionButtons.innerHTML = actions
    .map(
      (item) => `
        <button type="button" class="${item.className} action-button" data-action="${item.action}">
          ${item.label}
        </button>
      `
    )
    .join("");

  actionButtons.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => performAction(button.dataset.action));
  });
}

function renderEvents(events) {
  if (!events?.length) {
    eventList.innerHTML = `<div class="empty-state">暂无操作流水。</div>`;
    return;
  }

  eventList.innerHTML = events
    .map(
      (event) => `
        <article class="event-row">
          <div>
            <strong>${escapeHtml(EVENT_LABELS[event.event_type] || event.event_type)}</strong>
            <span>${escapeHtml(event.from_status || "—")} → ${escapeHtml(event.to_status || "—")}</span>
          </div>
          <div class="event-meta">
            <small>${formatDate(event.created_at)}</small>
            <small>${escapeHtml(event.note || "无备注")}</small>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadUnit() {
  if (!unitCode) {
    unitCard.innerHTML = `<div class="empty-state error-state">链接中缺少单件编码。</div>`;
    actionCard.classList.add("hidden-card");
    return;
  }

  const session = await requireSession();
  if (!session) return;

  const { data: unit, error } = await db
    .from("inventory_units")
    .select(`
      id,
      unit_code,
      serial_no,
      status,
      expiry_date,
      inbound_at,
      opened_at,
      opened_discard_deadline,
      used_up_at,
      discarded_at,
      storage_location,
      note,
      products (name, specification, opened_life_hours),
      purchase_batches (batch_no)
    `)
    .eq("unit_code", unitCode)
    .single();

  if (error || !unit) {
    console.error(error);
    unitCard.innerHTML = `<div class="empty-state error-state">未找到单件：${escapeHtml(unitCode)}</div>`;
    actionCard.classList.add("hidden-card");
    eventList.innerHTML = `<div class="empty-state">无可显示的流水。</div>`;
    return;
  }

  currentUnit = unit;
  renderUnit(unit);

  const { data: events, error: eventError } = await db
    .from("inventory_events")
    .select("id, event_type, from_status, to_status, note, created_at")
    .eq("unit_id", unit.id)
    .order("created_at", { ascending: false });

  if (eventError) {
    console.error(eventError);
    eventList.innerHTML = `<div class="empty-state error-state">操作流水加载失败。</div>`;
    return;
  }

  renderEvents(events || []);
}

async function performAction(action) {
  if (!currentUnit) return;

  const labels = {
    inbound: "确认入库",
    open: "登记开封",
    used_up: "登记用完",
    discard: "登记报废",
    lost: "标记遗失",
    undo_open: "撤销开封",
  };

  if (action === "undo_open" && !operationNote.value.trim()) {
    alert("撤销开封必须填写原因，例如：员工误点，实物未开封。");
    operationNote.focus();
    return;
  }

  const confirmText = action === "discard"
    ? "确定将这件物料标记为报废吗？此操作会保留流水记录。"
    : action === "undo_open"
      ? "确定撤销本次开封吗？仅适用于误操作且实物并未真正开封，系统会保留完整流水。"
      : `确定执行“${labels[action] || action}”吗？`;

  if (!window.confirm(confirmText)) return;

  const buttons = [...actionButtons.querySelectorAll("button")];
  buttons.forEach((button) => (button.disabled = true));
  showActionMessage("正在提交操作…", "");

  const { error } = await db.rpc("transition_inventory_unit", {
    p_unit_code: currentUnit.unit_code,
    p_action: action,
    p_note: operationNote.value.trim() || null,
  });

  if (error) {
    console.error(error);
    showActionMessage(`操作失败：${error.message}`, "error");
    buttons.forEach((button) => (button.disabled = false));
    return;
  }

  operationNote.value = "";
  showActionMessage("操作成功，数据已更新。", "success");
  await loadUnit();
}

logoutBtn.addEventListener("click", async () => {
  await db.auth.signOut();
  window.location.replace("index.html");
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "刷新中…";
  await loadUnit();
  refreshBtn.disabled = false;
  refreshBtn.textContent = "刷新";
});

loadUnit();
