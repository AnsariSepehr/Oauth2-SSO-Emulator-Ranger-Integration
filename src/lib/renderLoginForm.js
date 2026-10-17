function renderLoginForm({ systemName, hidden, errorMessage }) {
  const hiddenInputs = Object.entries(hidden)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ورود به سامانه SSO</title>
  <style>
    body { font-family: Tahoma, Arial, sans-serif; background: #f2f4f7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #fff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); width: 340px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    p.subtitle { color: #666; font-size: 13px; margin-top: 0; margin-bottom: 20px; }
    label { display: block; margin-bottom: 6px; font-size: 13px; color: #333; }
    input[type=text], input[type=password] { width: 100%; padding: 10px; margin-bottom: 14px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; }
    button { width: 100%; padding: 10px; background: #2f6feb; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    button:hover { background: #1f56c4; }
    .error { background: #fdeaea; color: #b0231c; padding: 10px; border-radius: 6px; margin-bottom: 14px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Example SSO</h1>
    <p class="subtitle">ورود به ${escapeHtml(systemName || 'سامانه متصل')}</p>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ''}
    <form method="POST">
      ${hiddenInputs}
      <label for="username">نام کاربری</label>
      <input type="text" id="username" name="username" autofocus required>
      <label for="password">رمز عبور</label>
      <input type="password" id="password" name="password" required>
      <button type="submit">ورود</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { renderLoginForm };
