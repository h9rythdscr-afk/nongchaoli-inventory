const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const form = document.getElementById("passwordForm");
const currentPasswordInput =
  document.getElementById("currentPassword");
const newPasswordInput =
  document.getElementById("newPassword");
const confirmPasswordInput =
  document.getElementById("confirmPassword");
const submitBtn = document.getElementById("submitBtn");
const message = document.getElementById("message");

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `password-message ${type}`;
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading
    ? "正在修改…"
    : "确认修改";
}

async function requireLogin() {
  const {
    data: { session },
    error
  } = await db.auth.getSession();

  if (error || !session) {
    window.location.replace("index.html");
    return null;
  }

  return session;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const session = await requireLogin();
  if (!session) return;

  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showMessage("请填写完整的密码信息。");
    return;
  }

  if (newPassword.length < 8) {
    showMessage("新密码至少需要8位。");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage("两次输入的新密码不一致。");
    return;
  }

  if (currentPassword === newPassword) {
    showMessage("新密码不能和当前密码相同。");
    return;
  }

  setLoading(true);
  showMessage("");

  try {
    /*
     * 先用当前邮箱和旧密码重新登录，
     * 用于确认旧密码输入正确。
     */
    const { error: verifyError } =
      await db.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword
      });

    if (verifyError) {
      throw new Error("当前密码不正确");
    }

    /*
     * 更新登录密码。
     */
    const { error: updateError } =
      await db.auth.updateUser({
        password: newPassword
      });

    if (updateError) {
      throw updateError;
    }

    showMessage(
      "密码修改成功，即将退出，请使用新密码重新登录。",
      "success"
    );

    window.setTimeout(async () => {
      await db.auth.signOut();
      window.location.replace("index.html");
    }, 1500);
  } catch (error) {
    console.error(error);

    const errorText = String(error?.message || "");

    if (
      errorText.includes("Invalid login credentials") ||
      errorText.includes("当前密码不正确")
    ) {
      showMessage("当前密码不正确，请重新输入。");
    } else if (
      errorText.toLowerCase().includes("password")
    ) {
      showMessage(
        "新密码不符合安全要求，请增加长度并混合字母、数字。"
      );
    } else {
      showMessage(
        `修改失败：${errorText || "请稍后重试"}`
      );
    }
  } finally {
    setLoading(false);
  }
});

requireLogin();
