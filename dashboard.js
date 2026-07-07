const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const welcomeText = document.getElementById("welcomeText");
const stockCount = document.getElementById("stockCount");
const openedCount = document.getElementById("openedCount");
const usedCount = document.getElementById("usedCount");
const wasteCount = document.getElementById("wasteCount");
const unitList = document.getElementById("unitList");
const logoutBtn = document.getElementById("logoutBtn");
const refreshBtn = document.getElementById("refreshBtn");

const STATUS_LABELS = {
  label_generated: "待入库",
  in_stock: "在库未开封",
  opened: "已开封",
  used_up: "已用完",
  discarded: "已报废",
  expired: "已过期",
  lost: "遗失",
};

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

async function requireSession() {
  const {
    data: { session },
    error,
  } = await db.auth.getSession();

  if (error || !session) {
    window.location.replace("index.html");
    return null;
  }

  return session;
}

async function loadDashboard() {
  const session = await requireSession();
  if (!session) return;

  const { data: profile, error: profileError } = await db
    .from("staff_profiles")
    .select("display_name, staff_role, is_active")
    .eq("id", session.user.id)
    .single();

  if (profileError || !profile?.is_active) {
    await db.auth.signOut();
    window.location.replace("index.html");
    return;
  }

  welcomeText.textContent = `${profile.display_name} · ${
    profile.staff_role === "admin" ? "管理员" : "员工"
  }`;

  const { data: units, error } = await db
    .from("inventory_units")
    .select(`
      id,
      unit_code,
      status,
      storage_location,
      inbound_at,
      created_at,
      products (name, specification),
      purchase_batches (batch_no)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    unitList.innerHTML = `<div class="empty-state error-state">库存加载失败：${escapeHtml(
      error.message
    )}</div>`;
    return;
  }

  const rows = units || [];
  stockCount.textContent = rows.filter((item) => item.status === "in_stock").length;
  openedCount.textContent = rows.filter((item) => item.status === "opened").length;
  usedCount.textContent = rows.filter((item) => item.status === "used_up").length;
  wasteCount.textContent = rows.filter((item) =>
    ["discarded", "expired"].includes(item.status)
  ).length;

  const recentRows = rows.slice(0, 12);

  if (!recentRows.length) {
    unitList.innerHTML = `<div class="empty-state">暂无单件库存数据。</div>`;
    return;
  }

  unitList.innerHTML = recentRows
    .map((item) => {
      const product = item.products || {};
      const batch = item.purchase_batches || {};
      return `
        <article class="unit-row">
          <div class="unit-main">
            <strong>${escapeHtml(product.name || "未命名商品")}</strong>
            <span>${escapeHtml(product.specification || "")}</span>
            <code>${escapeHtml(item.unit_code)}</code>
          </div>
          <div class="unit-meta">
            <span class="status-badge status-${escapeHtml(item.status)}">
              ${escapeHtml(STATUS_LABELS[item.status] || item.status)}
            </span>
            <small>批次：${escapeHtml(batch.batch_no || "—")}</small>
            <small>位置：${escapeHtml(item.storage_location || "—")}</small>
            <small>入库：${formatDate(item.inbound_at)}</small>
          </div>
        </article>
      `;
    })
    .join("");
}

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;
  logoutBtn.textContent = "退出中…";
  await db.auth.signOut();
  window.location.replace("index.html");
});

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "刷新中…";
  await loadDashboard();
  refreshBtn.disabled = false;
  refreshBtn.textContent = "刷新";
});

loadDashboard();
