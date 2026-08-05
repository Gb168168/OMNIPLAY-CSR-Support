if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/OMNIPLAY-CSR-Support/sw.js?v=20260805-reminder-view2', { updateViaCache: 'none' });
}

// 所有客服系統頁面都載入共用提醒監聽器。
if (!document.querySelector('script[data-csr-reminders]')) {
  const reminderScript = document.createElement('script');
  reminderScript.src = `${window.location.pathname.includes('/work/') || window.location.pathname.includes('/service/') || window.location.pathname.includes('/meeting/') || window.location.pathname.includes('/resource/') ? '../' : ''}assets/reminders.js?v=20260805-background-push1`;
  reminderScript.dataset.csrReminders = 'true';
  document.head.appendChild(reminderScript);
}

const sidebar = document.querySelector('#sidebar');

const isIndexPage = /(^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname.endsWith('/');
const sidebarPath = (path) => isIndexPage ? path : `../${path}`;
const sidebarItems = [
  { label: '首頁', icon: '🏠', href: 'index.html', className: 'home-link' },
  { title: '客服內部', icon: '👥', id: 'serviceGroupTitle', items: [
    { label: '人員管理', icon: '👤', href: 'service/staff.html' },
    { label: '休假表', icon: '🌴', href: 'service/leave.html' },
    { label: '排程表', icon: '📅', href: 'service/schedule.html' },
    { label: 'KPI', icon: '📊', href: 'service/kpi.html' }
  ] },
  { title: '作業管理', icon: '🗂️', id: 'workGroupTitle', items: [
    { label: '日誌', icon: '📒', href: 'work/log.html' },
    { label: '日誌 NEW', icon: '✨', href: 'work/log-new.html' },
    { label: '收件匣', icon: '📥', href: 'work/inbox.html' },
    { label: '交接', icon: '🤝', href: 'work/handover.html' },
    { label: '提報', icon: '📣', href: 'work/report.html' },
    { label: '對接追蹤', icon: '🔎', href: 'work/tracking.html' },
    { label: 'PROD告警紀錄', icon: '🚨', href: 'work/alert.html' }
  ] },
  { title: '會議歷程', icon: '📁', id: 'meetingGroupTitle', items: [
    { label: '會議紀錄', icon: '📝', href: 'meeting/meeting.html' }
  ] },
  { title: '資料庫', icon: '🧠', id: 'resourceGroupTitle', items: [
    { label: '知識庫', icon: '📚', href: 'resource/knowledge.html' },
    { label: 'AI 資料庫', icon: '🤖', href: 'resource/ai-database.html' }
  ] }
  ];
const isActiveSidebarHref = (href) => (href === 'index.html' && isIndexPage) || window.location.pathname.split('/').pop() === href.split('/').pop();
const currentSidebarGroup = () => sidebarItems.slice(1).find((group) => group.items.some((item) => isActiveSidebarHref(item.href))) || null;
const renderSidebarLink = (item) => {
  const classes = [item.className || 'sidebar-sub-item'];
  if (isActiveSidebarHref(item.href)) classes.push('is-active');
  return `<a class="${classes.join(' ')}" href="${sidebarPath(item.href)}"><span class="icon">${item.icon}</span><span class="label">${item.label}</span></a>`;
};
const renderSidebar = () => {
  if (!sidebar) return;
  const activeGroup = currentSidebarGroup();
  const activePage = sidebarItems[0].href === 'index.html' && isIndexPage
    ? sidebarItems[0]
    : activeGroup?.items.find((item) => isActiveSidebarHref(item.href));
  sidebar.className = 'sidebar top-navigation';
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="logo"><span class="logo-mark">OP</span><span class="label">CSR Support</span></div>
      <strong class="mobile-current-page" aria-current="page">${activePage?.icon || '🏠'} ${activePage?.label || '首頁'}</strong>
      <button class="toggle-btn mobile-menu-btn" id="sidebarToggle" type="button" aria-label="展開功能表">☰</button>
    </div>
    <nav class="menu" aria-label="主功能表">
      <div class="top-nav-primary-links">
        ${renderSidebarLink(sidebarItems[0])}
        ${sidebarItems.slice(1).map((group) => `<a class="top-nav-category${group === activeGroup ? ' is-active' : ''}" data-group="${group.id}" href="${sidebarPath(group.items[0].href)}"><span class="icon">${group.icon}</span><span class="label">${group.title}</span></a>`).join('')}
      </div>
      <div class="top-nav-secondary">
        ${sidebarItems.slice(1).map((group) => `<section class="sidebar-group${group === activeGroup ? ' is-current-group' : ''}" data-group="${group.id}" aria-labelledby="${group.id}">
          <h2 class="sidebar-group-title" id="${group.id}"><span class="icon">${group.icon}</span><span class="label">${group.title}</span></h2>
          <div class="top-nav-submenu">${group.items.map(renderSidebarLink).join('')}</div>
        </section>`).join('')}
      </div>
    </nav>
    <div class="sidebar-footer" id="sidebarUserFooter">
      <div class="theme-switch-row"><span>☀️淺色</span><button class="theme-toggle" data-theme-toggle="true" type="button"></button><span>🌙深色</span></div>
      <div class="sidebar-user-row">
        <div class="sidebar-user-info"><span class="sidebar-user-label label">登入者</span><strong class="sidebar-user-name label"></strong></div>
        <button class="logout-button" id="logoutButton" type="button"><span class="icon">⎋</span><span class="label">登出</span></button>
      </div>
    </div>
  `;
};
window.renderSidebar = renderSidebar;
renderSidebar();
const sidebarToggle = document.querySelector('#sidebarToggle');
const sidebarOverlay = document.querySelector('#sidebarOverlay');
const sidebarCollapsedToggle = document.createElement('button');
sidebarCollapsedToggle.className = 'sidebar-toggle-btn';
sidebarCollapsedToggle.type = 'button';
sidebarCollapsedToggle.textContent = '☰';
sidebarCollapsedToggle.setAttribute('aria-label', '展開左側功能表');
if (sidebar) document.body.appendChild(sidebarCollapsedToggle);
const appShell = document.querySelector('.app-shell');
const loginView = document.querySelector('#loginView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const setupForm = document.querySelector('#setupForm');
const setupMessage = document.querySelector('#setupMessage');
const englishAlphanumericInputs = document.querySelectorAll('#account, #loginPassword, #setupCode, #setupAccount, #setupPassword');


const THEME_STORAGE_KEY = 'omniplayTheme';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'omniplaySidebarCollapsed';
const getStoredTheme = () => localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
const MENU_ICON_MAP = {
  '人員管理': '👤',
  '休假表': '🌴',
  '排程表': '📅',
  'KPI': '📊',
  '日誌': '📒',
  '交接': '🤝',
  '提報': '📣',
  '對接追蹤': '🔎',
  'PROD告警紀錄': '🚨',
  '會議紀錄': '📝',
  '知識庫': '📚',
  'AI 資料庫': '🤖'
};

const applyTheme = (theme) => {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-label', theme === 'light' ? '切換為深色模式' : '切換為淺色模式');
    button.title = theme === 'light' ? '切換為深色模式' : '切換為淺色模式';
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  });
};
const toggleTheme = () => {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
};
applyTheme(getStoredTheme());

const getStoredSidebarCollapsed = () => false;
const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;
const closeMobileSidebar = () => {
  sidebar?.classList.remove('is-open');
  sidebarOverlay?.classList.remove('is-visible');
  document.documentElement.classList.remove('mobile-menu-open');
  sidebarToggle?.setAttribute('aria-label', '開啟左側功能表');
  sidebarToggle?.setAttribute('aria-expanded', 'false');
  sidebarCollapsedToggle.classList.add('is-visible');
};
const openMobileSidebar = () => {
  sidebar?.classList.remove('is-collapsed');
  sidebar?.classList.add('is-open');
  sidebarOverlay?.classList.add('is-visible');
  document.documentElement.classList.add('mobile-menu-open');
  sidebarToggle?.setAttribute('aria-label', '關閉左側功能表');
  sidebarToggle?.setAttribute('aria-expanded', 'true');
  sidebarCollapsedToggle.classList.remove('is-visible');
};
const applySidebarState = (collapsed) => {
  if (!sidebar) return;
  if (isMobileViewport()) {
    sidebar.classList.remove('is-collapsed');
    closeMobileSidebar();
    sidebarToggle?.setAttribute('aria-label', '開啟左側功能表');
    return;
  }
  sidebar.classList.toggle('is-collapsed', collapsed);
  sidebarToggle?.setAttribute('aria-label', collapsed ? '展開左側功能表' : '收合左側功能表');
  sidebarToggle?.setAttribute('aria-expanded', String(!collapsed));
  sidebarCollapsedToggle.classList.toggle('is-visible', collapsed);
};
const toggleSidebar = () => {
  if (isMobileViewport()) {
    if (sidebar?.classList.contains('is-open')) closeMobileSidebar();
    else openMobileSidebar();
    return;
  }
  const collapsed = !sidebar?.classList.contains('is-collapsed');
  localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  applySidebarState(collapsed);
};

const enhanceSidebarNavigation = () => {
  if (!sidebar) return;
  sidebar.querySelectorAll('.home-link, .sidebar-sub-item, .logout-button').forEach((item) => {
    const label = item.querySelector('.label') || item.querySelector('.sidebar-text');
    const tooltipText = (label?.textContent || item.textContent || '').trim();
    if (tooltipText) {
      item.dataset.tooltip = tooltipText;
      item.setAttribute('title', tooltipText);
    }
  });

};
applySidebarState(getStoredSidebarCollapsed());

const SESSION_KEYS = {
  id: 'omniplayStaffId',