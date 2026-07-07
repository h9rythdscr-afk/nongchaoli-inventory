const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const sessionText = document.getElementById("sessionText");
const inboundForm = document.getElementById("inboundForm");
const productSelect = document.getElementById("productSelect");
const productHint = document.getElementById("productHint");
const supplier = document.getElementById("supplier");
const storageLocation = document.getElementById("storageLocation");
const purchaseDate = document.getElementById("purchaseDate");
const inboundAt = document.getElementById("inboundAt");
const productionDate = document.getElementById("productionDate");
const expiryDate = document.getElementById("expiryDate");
const quantity = document.getElementById("quantity");
const unitCost = document.getElementById("unitCost");
const note = document.getElementById("note");
const submitBtn = document.getElementById("submitBtn");
const formMessage = document.getElementById("formMessage");
const resultCard = document.getElementById("resultCard");
const resultDetails = document.getElementById("resultDetails");
const printLabelsLink = document.getElementById("printLabelsLink");
const continueBtn = document.getElementById("continueBtn");

let products = [];
let expiryWasAutoFilled = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function nullableNumber(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function showMessage(text, type = "error") {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`;
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

function selectedProduct() {
  return products.find((item) => item.id === productSelect.value) || null;
}

function updateProductHint() {
  const product = selectedProduct();
  if (!product) {
    productHint.textContent = "先在“商品档案”中建立牛奶、糖浆、咖啡豆等标准商品。";
    return;
  }

  const parts = [
    product.sku,
    product.specification || "未填规格",
    product.opened_life_hours == null
      ? "未设置开封期限"
      : `开封后${product.opened_life_hours}小时内使用`,
  ];
  productHint.textContent = parts.join(" · ");
  tryAutoFillExpiry();
}

function tryAutoFillExpiry() {
  const product = selectedProduct();
  const production = productionDate.value;

  if (!product || !production || product.shelf_life_days == null) return;
  if (expiryDate.value && !expiryWasAutoFilled) return;

  const date = new Date(`${production}T00:00:00`);
  date.setDate(date.getDate() + Number(product.shelf_life_days));
  expiryDate.value = localDateValue(date);
  expiryWasAutoFilled = true;
}

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, brand, specification, unit_name, shelf_life_days, opened_life_hours")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error(error);
    productSelect.innerHTML = `<option value="">商品加载失败</option>`;
    showMessage(`商品加载失败：${error.message}`, "error");
    return;
  }

  products = data || [];
  productSelect.innerHTML = [
    `<option value="">请选择商品</option>`,
    ...products.map(
      (product) =>
        `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}｜${escapeHtml(product.specification || "未填规格")}</option>`
    ),
  ].join("");

  if (!products.length) {
    showMessage("尚未建立商品档案，请先进入“商品档案”新增商品。", "error");
    submitBtn.disabled = true;
  }
}

function resetInboundForm() {
  inboundForm.reset();
  storageLocation.value = "门店仓库";
  purchaseDate.value = localDateValue();
  inboundAt.value = localDateTimeValue();
  quantity.value = "1";
  expiryWasAutoFilled = false;
  resultCard.classList.add("hidden");
  showMessage("", "");
  productSelect.focus();
}

function renderResult(result) {
  resultDetails.innerHTML = `
    <div><span>商品</span><strong>${escapeHtml(result.product_name)}</strong></div>
    <div><span>批次号</span><strong>${escapeHtml(result.batch_no)}</strong></div>
    <div><span>生成数量</span><strong>${escapeHtml(result.quantity)} 件</strong></div>
    <div><span>编码范围</span><strong>${escapeHtml(result.first_unit_code)}<br>至<br>${escapeHtml(result.last_unit_code)}</strong></div>
  `;

  printLabelsLink.href = `labels.html?batch=${encodeURIComponent(result.batch_no)}`;
  resultCard.classList.remove("hidden");
  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

productSelect.addEventListener("change", updateProductHint);
productionDate.addEventListener("change", tryAutoFillExpiry);
expiryDate.addEventListener("input", () => {
  expiryWasAutoFilled = false;
});

inboundForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("", "");

  if (!productSelect.value) {
    showMessage("请选择商品。", "error");
    return;
  }

  const count = Number(quantity.value);
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    showMessage("单次进货数量必须是1至500之间的整数。", "error");
    return;
  }

  if (productionDate.value && expiryDate.value && expiryDate.value < productionDate.value) {
    showMessage("到期日期不能早于生产日期。", "error");
    return;
  }

  const confirmed = window.confirm(
    `确认登记 ${count} 件库存吗？系统将立即生成 ${count} 个不可重复的单件编码。`
  );
  if (!confirmed) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "正在生成批次和单件编码…";

  const inboundIso = new Date(inboundAt.value).toISOString();

  const { data, error } = await db.rpc("create_inventory_inbound_batch", {
    p_product_id: productSelect.value,
    p_supplier: supplier.value.trim() || null,
    p_purchase_date: purchaseDate.value,
    p_inbound_at: inboundIso,
    p_production_date: productionDate.value || null,
    p_expiry_date: expiryDate.value || null,
    p_quantity: count,
    p_unit_cost: nullableNumber(unitCost.value),
    p_storage_location: storageLocation.value.trim(),
    p_note: note.value.trim() || null,
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "确认入库并生成单件编码";

  if (error) {
    console.error(error);
    showMessage(`进货登记失败：${error.message}`, "error");
    return;
  }

  showMessage("进货登记成功，单件编码和入库流水已生成。", "success");
  renderResult(data);
});

continueBtn.addEventListener("click", resetInboundForm);

(async function init() {
  purchaseDate.value = localDateValue();
  inboundAt.value = localDateTimeValue();

  const session = await requireSession();
  if (!session) return;
  await loadProducts();
})();
