if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/OMNIPLAY-CSR-Support/sw.js?v=20260809-mobile-cards1', { updateViaCache: 'none' });
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
  // ⛔ 死規則(2026-08-13 中魁):「返回 MyERP」導覽鈕不可移除/改名/改成登出;
  // 任何登入/登出/導覽重構都必須原樣保留(見 AGENTS.md 規則 10)。
  // goldbricks.synology.me 的 5173 沒對外轉發(2026-08-13 實測死鏈),該域名改指公司固定 IP;其餘照本機 hostname。
  const myerpPortalHost = /goldbricks\.synology\.me$/i.test(location.hostname) ? '61.216.37.16' : location.hostname;
  const myerpReturnLink = /github\.io$/i.test(location.hostname)
    ? ''
    : `<a class="myerp-return-btn" id="myerpReturnBtn" href="http://${myerpPortalHost}:5173/portal" title="返回 MyERP 首頁"><span class="icon">⏎</span><span class="label">返回 MyERP</span></a>`;
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="logo"><span class="logo-mark">OP</span><span class="label">CSR Support</span></div>
      <strong class="mobile-current-page" aria-current="page">${activePage?.icon || '🏠'} ${activePage?.label || '首頁'}</strong>
      <button class="toggle-btn mobile-menu-btn" id="sidebarToggle" type="button" aria-label="展開功能表">☰</button>
    </div>
    ${activeGroup ? `<nav class="mobile-quick-nav" aria-label="${activeGroup.title}快速功能列">
      ${activeGroup.items.map(renderSidebarLink).join('')}
    </nav>` : ''}
    <nav class="menu" aria-label="主功能表">
      <div class="top-nav-primary-links">
        ${renderSidebarLink(sidebarItems[0])}
        ${sidebarItems.slice(1).map((group) => `<a class="top-nav-category${group === activeGroup ? ' is-active' : ''}" data-group="${group.id}" href="${sidebarPath(group.items[0].href)}" aria-controls="${group.id}Menu" aria-expanded="false"><span class="icon">${group.icon}</span><span class="label">${group.title}</span><span class="mobile-category-caret" aria-hidden="true">›</span></a>`).join('')}
      </div>
      <div class="top-nav-secondary">
        ${sidebarItems.slice(1).map((group) => `<section class="sidebar-group${group === activeGroup ? ' is-current-group' : ''}" data-group="${group.id}" aria-labelledby="${group.id}" id="${group.id}Menu">
          <h2 class="sidebar-group-title" id="${group.id}"><span class="icon">${group.icon}</span><span class="label">${group.title}</span></h2>
          <div class="top-nav-submenu">${group.items.map(renderSidebarLink).join('')}</div>
        </section>`).join('')}
      </div>
    </nav>
    <div class="sidebar-footer" id="sidebarUserFooter">
      ${myerpReturnLink}
      <div class="theme-switch-row"><span>☀️淺色</span><button class="theme-toggle" data-theme-toggle="true" type="button"></button><span>🌙深色</span></div>
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


const THEME_STORAGE_KEY = 'omniplayTheme';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'omniplaySidebarCollapsed';
const getStoredTheme = () => localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
const MENU_ICON_MAP = {
  '休假表': '🌴',
  '排程表': '📅',
  'KPI': '📊',
  '日誌': '📒',
  '交接': '🤝',
  '提報': '📣',
  '對接追蹤': '🔎',
  'PROD告警紀錄': '🚨',
  'Game List 管理': '🎮',
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
const isMobileViewport = () => window.matchMedia('(max-width: 1200px)').matches;
const closeMobileSidebar = () => {
  sidebar?.classList.remove('is-open');
  sidebarOverlay?.classList.remove('is-visible');
  document.documentElement.classList.remove('mobile-menu-open');
  sidebarToggle?.setAttribute('aria-label', '開啟左側功能表');
  sidebarToggle?.setAttribute('aria-expanded', 'false');
  sidebarCollapsedToggle.classList.add('is-visible');
};
const setMobileSidebarGroup = (groupId, forceOpen = false) => {
  if (!sidebar || !groupId) return;
  const target = sidebar.querySelector(`.sidebar-group[data-group="${groupId}"]`);
  const shouldOpen = Boolean(target) && (forceOpen || !target.classList.contains('is-mobile-expanded'));
  sidebar.querySelectorAll('.sidebar-group').forEach((group) => {
    group.classList.toggle('is-mobile-expanded', shouldOpen && group === target);
  });
  sidebar.querySelectorAll('.top-nav-category').forEach((category) => {
    category.setAttribute('aria-expanded', String(shouldOpen && category.dataset.group === groupId));
  });
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
  sidebar.querySelectorAll('.home-link, .sidebar-sub-item').forEach((item) => {
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
  code: 'omniplayStaffCode',
  name: 'omniplayStaffName',
  account: 'omniplayStaffAccount',
  permissions: 'omniplayPermissions'
};

const loginPath = isIndexPage ? 'index.html' : '../index.html';

const getCurrentStaff = () => ({ id: 'system', code: 'SYSTEM', name: 'System', account: 'SYSTEM' });
const isLoggedIn = () => true;
if (!sessionStorage.getItem(SESSION_KEYS.name)) sessionStorage.setItem(SESSION_KEYS.name, 'System');

const isOmniplayAdmin = () => true;

const PAGE_KEYS = {
  'index.html': 'home',
  'leave.html': 'leave',
  'schedule.html': 'schedule',
  'kpi.html': 'kpi',
  'log.html': 'log',
  'log-new.html': 'log',
  'inbox.html': 'inbox',
  'handover.html': 'handover',
  'report.html': 'report',
  'tracking.html': 'tracking',
  'alert.html': 'alert',
  'meeting.html': 'meeting',
  'knowledge.html': 'knowledge',
  'ai-database.html': 'ai_database'
};

const currentPageKey = () => PAGE_KEYS[window.location.pathname.split('/').pop() || 'index.html'] || 'home';
const FULL_PERMISSION = { view: true, edit: true, delete: true, design: true };
const EMPTY_PERMISSION = { view: false, edit: false, delete: false, design: false };
const makeDefaultPermissions = () => ({ pages: Object.fromEntries([...new Set(Object.values(PAGE_KEYS))].map((page) => [page, { ...FULL_PERMISSION }])) });
const getStoredPermissions = () => {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEYS.permissions) || '{}'); } catch { return {}; }
};
const getPagePermission = () => ({ ...FULL_PERMISSION });
const canUse = (pageOrAction, maybeAction) => {
  const page = maybeAction ? pageOrAction : currentPageKey();
  const action = maybeAction || pageOrAction;
  return getPagePermission(page)[action] === true;
};


const applyPermissionUi = () => {};

window.getPagePermission = getPagePermission;
window.canUse = canUse;
window.isOmniplayAdmin = isOmniplayAdmin;

const loadCurrentPermissions = async () => { sessionStorage.removeItem(SESSION_KEYS.permissions); };

window.loadCurrentPermissions = loadCurrentPermissions;
window.permissionReady = loadCurrentPermissions();

const setAppVisibility = () => { if (appShell) { appShell.hidden = false; appShell.removeAttribute('aria-hidden'); appShell.classList.remove('is-hidden'); } loginView?.remove(); };


const makeThemeToggleButton = () => {
  const button = document.createElement('button');
  button.dataset.themeToggle = 'true';
  button.className = 'theme-toggle';
  button.type = 'button';
  button.addEventListener('click', toggleTheme);
  return button;
};

const renderThemeToggle = () => { applyTheme(getStoredTheme()); };

const renderSidebarUser = () => {
  if (!sidebar) return;
  const footer = sidebar.querySelector('#sidebarUserFooter');
  const sidebarThemeToggle = footer?.querySelector('[data-theme-toggle]');
  if (sidebarThemeToggle) sidebarThemeToggle.onclick = toggleTheme;
  enhanceSidebarNavigation();
};

enhanceSidebarNavigation();

sidebarToggle?.addEventListener('click', toggleSidebar);
sidebarOverlay?.addEventListener('click', closeMobileSidebar);
window.addEventListener('resize', () => applySidebarState(getStoredSidebarCollapsed()));
sidebar?.querySelectorAll('.top-nav-category').forEach((category) => {
  category.addEventListener('click', (event) => {
    if (!isMobileViewport()) return;
    event.preventDefault();
    setMobileSidebarGroup(category.dataset.group);
  });
});
sidebar?.querySelectorAll('.home-link, .sidebar-sub-item').forEach((link) => {
  link.addEventListener('click', () => {
    if (isMobileViewport()) closeMobileSidebar();
  });
});

sidebarCollapsedToggle.addEventListener('click', toggleSidebar);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isMobileViewport() && sidebar?.classList.contains('is-open')) {
    closeMobileSidebar();
    sidebarToggle?.focus();
  }
});
  

// Convert list tables to phone-friendly cards while keeping desktop tables unchanged.
const MOBILE_CARD_TABLE_SELECTOR = [
  '#ragicListView .ragic-table',
  '#meetingListView table',
  '.staff-panel table',
  '.inbox-shell table'
].join(',');
let mobileTableLabelFrame = 0;
const applyMobileTableLabels = () => {
  mobileTableLabelFrame = 0;
  document.querySelectorAll(MOBILE_CARD_TABLE_SELECTOR).forEach((table) => {
    table.classList.add('mobile-card-table');
    const labels = [...table.querySelectorAll('thead th')].map((header) =>
      String(header.querySelector('.col-label')?.textContent || header.textContent || '').replace(/[▼↑↓]/g, '').trim()
    );
    table.querySelectorAll('tbody tr').forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName === 'TD') cell.dataset.mobileLabel = labels[index] || `欄位 ${index + 1}`;
      });
    });
  });
};
const scheduleMobileTableLabels = () => {
  if (mobileTableLabelFrame) return;
  mobileTableLabelFrame = requestAnimationFrame(applyMobileTableLabels);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleMobileTableLabels, { once: true });
else scheduleMobileTableLabels();
new MutationObserver(scheduleMobileTableLabels).observe(document.body, { childList: true, subtree: true });

renderThemeToggle();
setAppVisibility();
window.permissionReady?.then(() => { renderSidebarUser(); });
// 手機版／加入主畫面的 PWA：從頁面頂端下拉並放開即可重新整理。
const setupPullToRefresh = () => {
  const mobilePointer = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  if (!mobilePointer || document.querySelector('[data-pull-refresh]')) return;

  const indicator = document.createElement('div');
  indicator.dataset.pullRefresh = 'true';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  Object.assign(indicator.style, {
    position: 'fixed',
    zIndex: '10000',
    top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
    left: '50%',
    minWidth: '150px',
    padding: '10px 16px',
    border: '1px solid rgba(148, 163, 184, .45)',
    borderRadius: '999px',
    background: 'rgba(255, 255, 255, .96)',
    boxShadow: '0 8px 24px rgba(15, 23, 42, .18)',
    color: '#334155',
    fontSize: '14px',
    fontWeight: '700',
    textAlign: 'center',
    opacity: '0',
    pointerEvents: 'none',
    transform: 'translate(-50%, -72px)',
    transition: 'transform 160ms ease, opacity 160ms ease'
  });
  document.body.appendChild(indicator);

  const threshold = 82;
  let startY = 0;
  let distance = 0;
  let tracking = false;
  let refreshing = false;

  const atPageTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  const resetIndicator = () => {
    indicator.style.opacity = '0';
    indicator.style.transform = 'translate(-50%, -72px)';
    indicator.textContent = '';
  };

  document.addEventListener('touchstart', (event) => {
    if (refreshing || event.touches.length !== 1 || !atPageTop()) return;
    if (event.target.closest('input, textarea, select, [contenteditable="true"], .ragic-table-wrap')) return;
    startY = event.touches[0].clientY;
    distance = 0;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (!tracking || refreshing || event.touches.length !== 1) return;
    const delta = event.touches[0].clientY - startY;
    if (delta <= 0 || !atPageTop()) {
      tracking = false;
      resetIndicator();
      return;
    }
    event.preventDefault();
    distance = Math.min(120, delta * 0.55);
    indicator.textContent = distance >= threshold ? '↻ 放開重新整理' : '↓ 下拉重新整理';
    indicator.style.opacity = String(Math.min(1, distance / 34));
    indicator.style.transform = `translate(-50%, ${Math.min(18, distance - 72)}px)`;
  }, { passive: false });

  document.addEventListener('touchend', async () => {
    if (!tracking || refreshing) return;
    tracking = false;
    if (distance < threshold) {
      resetIndicator();
      return;
    }
    refreshing = true;
    indicator.textContent = '↻ 正在重新整理…';
    indicator.style.opacity = '1';
    indicator.style.transform = 'translate(-50%, 8px)';
    try { await navigator.serviceWorker?.getRegistration()?.then((registration) => registration?.update()); } catch (_) {}
    window.location.reload();
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    tracking = false;
    if (!refreshing) resetIndicator();
  }, { passive: true });
};

setupPullToRefresh();
