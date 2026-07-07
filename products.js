const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const sessionText = document.getElementById("sessionText");
const productForm = document.getElementById("productForm");
const formTitle = document.getElementById("formTitle");
const productId = document.getElementById("productId");
const sku = document.getElementById("sku");
const nameInput = document.getElementById("name");
const category = document.getElementById("category");
const brand = document.getElementById("brand");
const specification = document.getElementById("specification");
const unitName = document.getElementById("unitName");
const shelfLifeDays = document.getElementById("shelfLifeDays");
const openedLifeHours = document.getElementById("openedLifeHours");
const minStock = document.getElementById("minStock");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const refreshBtn = document.getElementById("refreshBtn");
const formMessage = document.getElementById("formMessage");
const productList = document.getElementById("productList");

let products = [];
let currentProfile = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nullableInteger(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  return Number.isInteger(number) ? number : null;
}

function showMessage(text, type = "error") {
  formMessage.textContent = text;
  formMessage.className = `form-message ${type}`;
}

async function requireAdmin() {
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

  currentProfile = profile;
  sessionText.textContent = `${profile.display_name} · ${
    profile.staff_role === "admin" ? "管理员" : "员工"
  }`;

  if (profile.staff_role !== "admin") {
    productForm.classList.add("hidden");
    resetBtn.classList.add("hidden");
    showMessage("只有管理员可以新增或编辑商品档案。", "error");
  }

  return session;
}

function resetForm() {
  productForm.reset();
  productId.value = "";
  unitName.value = "瓶";
  minStock.value = "0";
  formTitle.textContent = "新增商品档案";
  saveBtn.textContent = "保存商品档案";
  showMessage("", "");
  sku.focus();
}

function fillForm(product) {
  productId.value = product.id;
  sku.value = product.sku || "";
  nameInput.value = product.name || "";
  category.value = product.category || "";
  brand.value = product.brand || "";
  specification.value = product.specification || "";
  unitName.value = product.unit_name || "件";
  shelfLifeDays.value = product.shelf_life_days ?? "";
  openedLifeHours.value = product.opened_life_hours ?? "";
  minStock.value = product.min_stock ?? 0;
  formTitle.textContent = `编辑：${product.name}`;
  saveBtn.textContent = "保存修改";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderProducts() {
  if (!products.length) {
    productList.innerHTML = `<div class="empty-state">暂无商品档案，请先新增商品。</div>`;
    return;
  }

  productList.innerHTML = products
    .map(
      (product) => `
        <article class="product-row">
          <div class="product-row-main">
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.brand || "未填品牌")} · ${escapeHtml(product.specification || "未填规格")}</span>
            <code>${escapeHtml(product.sku)}</code>
          </div>
          <div class="product-row-meta">
            <small>品类：${escapeHtml(product.category || "—")}</small>
            <small>单位：${escapeHtml(product.unit_name || "件")}</small>
            <small>开封期限：${product.opened_life_hours == null ? "—" : `${product.opened_life_hours}小时`}</small>
            <small>最低库存：${escapeHtml(product.min_stock ?? 0)}</small>
          </div>
          ${
            currentProfile?.staff_role === "admin"
              ? `<button class="secondary-button edit-product-button" type="button" data-id="${escapeHtml(product.id)}">编辑</button>`
              : ""
          }
        </article>
      `
    )
    .join("");

  productList.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const product = products.find((item) => item.id === button.dataset.id);
      if (product) fillForm(product);
    });
  });
}

async function loadProducts() {
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, category, brand, specification, unit_name, shelf_life_days, opened_life_hours, min_stock, is_active, created_at")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error(error);
    productList.innerHTML = `<div class="empty-state error-state">商品加载失败：${escapeHtml(error.message)}</div>`;
    return;
  }

  products = data || [];
  renderProducts();
}

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentProfile?.staff_role !== "admin") return;

  saveBtn.disabled = true;
  saveBtn.textContent = "保存中…";
  showMessage("", "");

  const { error } = await db.rpc("save_inventory_product", {
    p_product_id: productId.value || null,
    p_sku: sku.value.trim(),
    p_name: nameInput.value.trim(),
    p_category: category.value.trim() || null,
    p_brand: brand.value.trim() || null,
    p_specification: specification.value.trim() || null,
    p_unit_name: unitName.value.trim(),
    p_shelf_life_days: nullableInteger(shelfLifeDays.value),
    p_opened_life_hours: nullableInteger(openedLifeHours.value),
    p_min_stock: nullableInteger(minStock.value) ?? 0,
  });

  if (error) {
    console.error(error);
    const message = error.message.includes("products_sku_key")
      ? "商品编码已存在，请换一个编码。"
      : error.message;
    showMessage(`保存失败：${message}`, "error");
    saveBtn.disabled = false;
    saveBtn.textContent = productId.value ? "保存修改" : "保存商品档案";
    return;
  }

  showMessage("商品档案保存成功。", "success");
  await loadProducts();
  resetForm();
});

resetBtn.addEventListener("click", resetForm);
refreshBtn.addEventListener("click", loadProducts);

(async function init() {
  const session = await requireAdmin();
  if (!session) return;
  await loadProducts();
})();
