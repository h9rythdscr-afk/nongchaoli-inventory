const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `form-message ${type}`;
}

function setLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.textContent = isLoading ? "正在登录…" : "登录";
}

function configurationIsValid() {
  return (
    typeof SUPABASE_URL === "string" &&
    SUPABASE_URL.startsWith("https://") &&
    typeof SUPABASE_PUBLISHABLE_KEY === "string" &&
    !SUPABASE_PUBLISHABLE_KEY.includes("请替换") &&
    SUPABASE_PUBLISHABLE_KEY.length > 20
  );
}

if (!configurationIsValid()) {
  showMessage("系统尚未配置 Publishable key，请先修改 config.js。", "error");
  loginBtn.disabled = true;
}

const db = configurationIsValid()
  ? supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

async function redirectExistingSession() {
  if (!db) return;

  const {
    data: { session },
  } = await db.auth.getSession();

  if (session) {
    window.location.replace("dashboard.html");
  }
}

redirectExistingSession();

togglePassword.addEventListener("click", () => {
  const isPassword = passwordInput.type === "password";
  passwordInput.type = isPassword ? "text" : "password";
  togglePassword.textContent = isPassword ? "隐藏" : "显示";
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showMessage("请填写邮箱和密码。", "error");
    return;
  }

  setLoading(true);
  showMessage("", "");

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error("未获取到用户信息");

    const { data: profile, error: profileError } = await db
      .from("staff_profiles")
      .select("display_name, staff_role, is_active")
      .eq("id", data.user.id)
      .single();

    if (profileError) throw profileError;

    if (!profile?.is_active) {
      await db.auth.signOut();
      throw new Error("该员工账号已停用");
    }

    showMessage(`欢迎回来，${profile.display_name || "员工"}。`, "success");
    window.setTimeout(() => {
      window.location.replace("dashboard.html");
    }, 350);
  } catch (error) {
    console.error(error);
    const text = String(error?.message || "");

    if (text.includes("Invalid login credentials")) {
      showMessage("邮箱或密码不正确。", "error");
    } else if (text.includes("Email not confirmed")) {
      showMessage("该邮箱尚未确认，请在 Supabase 后台确认用户。", "error");
    } else if (text.includes("停用")) {
      showMessage("该员工账号已停用。", "error");
    } else {
      showMessage(`登录失败：${text || "请稍后重试"}`, "error");
    }
  } finally {
    setLoading(false);
  }
});
