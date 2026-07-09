:root {
  --bg: #eef3f9;
  --panel: #ffffff;
  --primary: #2563eb;
  --primary-dark: #1d4ed8;
  --sidebar: #0f172a;
  --sidebar-soft: #1e293b;
  --sidebar-text: #cbd5e1;
  --text: #172033;
  --muted: #64748b;
  --border: #dbe4ef;
  --success: #16a34a;
  --shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  font-family: "Noto Sans TC", "Microsoft JhengHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--text);
  background: radial-gradient(circle at top left, #dbeafe 0, transparent 34%), var(--bg);
}

button {
  border: 0;
  border-radius: 14px;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  transition: transform .2s, background .2s, box-shadow .2s;
}

button:hover { transform: translateY(-1px); }

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 288px 1fr;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  color: var(--sidebar-text);
  background: var(--sidebar);
  transition: width .25s;
}

.sidebar.is-collapsed { width: 84px; }

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 18px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
  font-weight: 900;
  white-space: nowrap;
}

.logo-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 14px;
  background: var(--primary);
}

.toggle-btn {
  width: 42px;
  height: 42px;
  color: white;
  background: var(--sidebar-soft);
}

.menu { padding: 18px 12px 28px; }

.home-link {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border-radius: 14px;
  color: var(--sidebar-text);
  background: transparent;
  text-decoration: none;
  font-weight: 800;
}

.home-link:hover,
.home-link.is-active {
  color: white;
  background: rgba(37, 99, 235, .42);
}

.menu-section { margin-bottom: 12px; }

.section-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 14px;
  color: white;
  background: transparent;
  text-align: left;
}

.section-button:hover,
.section-button.is-open { background: var(--sidebar-soft); }

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.icon { width: 24px; text-align: center; flex: 0 0 auto; }
.chevron { transition: transform .2s; }
.section-button.is-open .chevron { transform: rotate(90deg); }

.submenu {
  display: none;
  margin: 6px 0 0;
  padding: 0 0 0 48px;
  list-style: none;
}

.submenu.is-open { display: block; }

.submenu a {
  display: block;
  padding: 11px 12px;
  border-radius: 12px;
  color: var(--sidebar-text);
  text-decoration: none;
}

.submenu a:hover,
.submenu a.is-active {
  color: white;
  background: rgba(37, 99, 235, .42);
}

.sidebar.is-collapsed .label,
.sidebar.is-collapsed .chevron { display: none; }
.sidebar.is-collapsed .sidebar-header { justify-content: center; flex-direction: column; }
.sidebar.is-collapsed .home-link { justify-content: center; }
.sidebar.is-collapsed .submenu { padding-left: 0; }
.sidebar.is-collapsed .submenu a { text-align: center; font-size: 12px; }
.sidebar.is-collapsed .section-button { justify-content: center; }

.main {
  min-width: 0;
  padding: 30px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 26px;
  padding: 22px 24px;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: rgba(255,255,255,.88);
  box-shadow: 0 14px 32px rgba(15, 23, 42, .07);
}

.topbar h1 { margin: 0 0 6px; font-size: 28px; }
.topbar p { margin: 0; color: var(--muted); }

.user-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #166534;
  font-weight: 800;
  white-space: nowrap;
}

.placeholder-card {
  min-height: 300px;
  display: grid;
  place-items: center;
  padding: 42px;
  border: 1px dashed var(--border);
  border-radius: 22px;
  background: white;
  box-shadow: 0 12px 28px rgba(15, 23, 42, .06);
  text-align: center;
}

.placeholder-card h2 { margin: 0 0 12px; font-size: 30px; }
.placeholder-card p { max-width: 560px; margin: 0; color: var(--muted); line-height: 1.8; }

@media (max-width: 900px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { position: relative; height: auto; }
  .sidebar.is-collapsed { width: auto; }
}

@media (max-width: 560px) {
  .main { padding: 18px; }
  .topbar { align-items: flex-start; flex-direction: column; }
}
