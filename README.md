# 弄潮里单件库存追溯系统｜登录框架

本版本用于验证：

1. Supabase 邮箱密码登录
2. staff_profiles 员工启用状态
3. RLS 登录权限
4. inventory_units 库存数据读取
5. 退出登录

## 使用步骤

1. 打开 `config.js`
2. 将 `SUPABASE_PUBLISHABLE_KEY` 替换为新 Supabase 项目的 Publishable key
3. 将全部文件上传到 GitHub 仓库根目录
4. GitHub 仓库：Settings → Pages
5. Source 选择 `Deploy from a branch`
6. Branch 选择 `main`，目录选择 `/(root)`
7. 打开 GitHub Pages 地址
8. 使用已经在 Supabase Authentication 中创建的管理员邮箱和密码登录

## 安全提醒

网页中只能使用 Publishable key 或 Legacy anon key。
不要把 Secret key 或 service_role key 上传到 GitHub。
