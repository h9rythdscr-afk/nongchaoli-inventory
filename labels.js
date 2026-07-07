const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const batchSelect = document.getElementById("batchSelect");
const labelGrid = document.getElementById("labelGrid");
const labelSummary = document.getElementById("labelSummary");
const sessionText = document.getElementById("sessionText");
const printBtn = document.getElementById("printBtn");

let units = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

  sessionText.textContent = `${profile.display_name} · ${
    profile.staff_role === "admin" ? "管理员" : "员工"
  }`;

  return session;
}

function makeScanUrl(code) {
  const url = new URL("scan.html", window.location.href);
  url.searchParams.set("code", code);
  return url.href;
}

function renderBatchOptions() {
  const batches = new Map();
  units.forEach((unit) => {
    const batch = unit.purchase_batches || {};
    if (batch.batch_no) batches.set(batch.batch_no, batch.batch_no);
  });

  batchSelect.innerHTML = [...batches.keys()]
    .map((batchNo) => `<option value="${escapeHtml(batchNo)}">${escapeHtml(batchNo)}</option>`)
    .join("");
}

function renderLabels() {
  const selectedBatch = batchSelect.value;
  const rows = units.filter(
    (unit) => (unit.purchase_batches || {}).batch_no === selectedBatch
  );

  labelSummary.textContent = `当前批次共 ${rows.length} 件，每件对应一个独立二维码。`;

  if (!rows.length) {
    labelGrid.innerHTML = `<div class="empty-state">当前批次暂无单件。</div>`;
    return;
  }

  labelGrid.innerHTML = rows
    .map((unit, index) => {
      const product = unit.products || {};
      const batch = unit.purchase_batches || {};
      return `
        <article class="qr-label">
          <div class="qr-label-copy">
            <strong>${escapeHtml(product.name || "未命名商品")}</strong>
            <span>${escapeHtml(product.specification || "")}</span>
            <code>${escapeHtml(unit.unit_code)}</code>
            <small>批次：${escapeHtml(batch.batch_no || "—")}</small>
            <small>序号：${escapeHtml(unit.serial_no || index + 1)}</small>
          </div>
          <div id="qr-${index}" class="qr-box" data-url="${escapeHtml(makeScanUrl(unit.unit_code))}"></div>
        </article>
      `;
    })
    .join("");

  rows.forEach((unit, index) => {
    const target = document.getElementById(`qr-${index}`);
    new QRCode(target, {
      text: makeScanUrl(unit.unit_code),
      width: 112,
      height: 112,
      correctLevel: QRCode.CorrectLevel.M,
    });
  });
}

async function loadLabels() {
  const session = await requireSession();
  if (!session) return;

  const { data, error } = await db
    .from("inventory_units")
    .select(`
      unit_code,
      serial_no,
      status,
      products (name, specification),
      purchase_batches (batch_no, purchase_date)
    `)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    labelGrid.innerHTML = `<div class="empty-state error-state">标签加载失败：${escapeHtml(error.message)}</div>`;
    return;
  }

  units = data || [];
  renderBatchOptions();
  renderLabels();
}

batchSelect.addEventListener("change", renderLabels);
printBtn.addEventListener("click", () => window.print());

loadLabels();
