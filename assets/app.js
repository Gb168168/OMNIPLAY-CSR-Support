if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/OMNIPLAY-CSR-Support/sw.js');
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
const renderSidebarLink = (item) => {
  const classes = [item.className || 'sidebar-sub-item'];
  if (isActiveSidebarHref(item.href)) classes.push('is-active');
  const bullet = item.className === 'home-link' ? '' : '<span class="bullet">•</span>';
  return `<a class="${classes.join(' ')}" href="${sidebarPath(item.href)}">${bullet}<span class="icon">${item.icon}</span><span class="label">${item.label}</span></a>`;
};
const renderSidebar = () => {
  if (!sidebar) return;
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="logo"><span class="logo-mark">OP</span><span class="label">CSR<br />Support</span></div>
      <button class="toggle-btn mobile-menu-btn" id="sidebarToggle" type="button" aria-label="收合左側功能表">☰</button>
    </div>
    <nav class="menu" aria-label="主功能表">
      ${renderSidebarLink(sidebarItems[0])}
      ${sidebarItems.slice(1).map((group) => `
        <section class="sidebar-group" aria-labelledby="${group.id}">
          <h2 class="sidebar-group-title" id="${group.id}"><span class="icon">${group.icon}</span><span class="label">${group.title}</span></h2>
          ${group.items.map(renderSidebarLink).join('')}
        </section>
      `).join('')}
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

const getStoredSidebarCollapsed = () => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;
const closeMobileSidebar = () => {
  sidebar?.classList.remove('is-open');
  sidebarOverlay?.classList.remove('is-visible');
  sidebarToggle?.setAttribute('aria-expanded', 'false');
  sidebarCollapsedToggle.classList.add('is-visible');
};
const openMobileSidebar = () => {
  sidebar?.classList.remove('is-collapsed');
  sidebar?.classList.add('is-open');
  sidebarOverlay?.classList.add('is-visible');
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
  code: 'omniplayStaffCode',
  name: 'omniplayStaffName',
  account: 'omniplayStaffAccount',
  permissions: 'omniplayPermissions'
};

const loginPath = isIndexPage ? 'index.html' : '../index.html';

const getCurrentStaff = () => ({
  id: sessionStorage.getItem(SESSION_KEYS.id),
  code: sessionStorage.getItem(SESSION_KEYS.code),
  name: sessionStorage.getItem(SESSION_KEYS.name),
  account: sessionStorage.getItem(SESSION_KEYS.account)
});

const isLoggedIn = () => Boolean(getCurrentStaff().code && getCurrentStaff().name);

// 閒置自動登出
let idleTimer = null;
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 分鐘

function resetIdleTimer() {
  clearTimeout(idleTimer);
  if (!isLoggedIn()) return;

  idleTimer = setTimeout(() => {
    alert('已閒置超過 30 分鐘，系統將自動登出。');
    logout();
  }, IDLE_TIMEOUT);
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach((event) => {
  document.addEventListener(event, resetIdleTimer);
});
const isOmniplayAdmin = () => {
  const staff = getCurrentStaff();
  return [staff.account, staff.code, staff.name].some((value) => String(value || '').toUpperCase() === 'OMNIPLAY');
};

const PAGE_KEYS = {
  'index.html': 'home',
  'staff.html': 'staff',
  'leave.html': 'leave',
  'schedule.html': 'schedule',
  'kpi.html': 'kpi',
  'log.html': 'log',
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
const getPagePermission = (page = currentPageKey()) => {
  if (isOmniplayAdmin()) return { ...FULL_PERMISSION };
  const pages = getStoredPermissions().pages;
  if (!pages) return { ...EMPTY_PERMISSION };
  if (!pages[page]) return { ...FULL_PERMISSION };
  return { ...EMPTY_PERMISSION, ...(pages[page] || {}) };
};
const canUse = (pageOrAction, maybeAction) => {
  const page = maybeAction ? pageOrAction : currentPageKey();
  const action = maybeAction || pageOrAction;
  return getPagePermission(page)[action] === true;
};


const applyPermissionUi = () => {
  if (!isLoggedIn()) return;
  const permissions = getStoredPermissions();
  const restrict = !isOmniplayAdmin() && permissions.pages;
  document.querySelectorAll('.menu a[href]').forEach((link) => {
    const page = PAGE_KEYS[link.getAttribute('href').split('/').pop()];
    if (page && restrict && !permissions.pages?.[page]?.view) link.remove();
  });
  document.querySelectorAll('.sidebar-group').forEach((group) => {
    if (!group.querySelector('.sidebar-sub-item')) group.remove();
  });
  if (restrict && !getPagePermission().view && !isIndexPage) window.location.href = loginPath;
};

window.getPagePermission = getPagePermission;
window.canUse = canUse;
window.isOmniplayAdmin = isOmniplayAdmin;

const loadCurrentPermissions = async () => {
  if (!isLoggedIn() || isOmniplayAdmin()) { sessionStorage.removeItem(SESSION_KEYS.permissions); applyPermissionUi(); return; }
  const staffId = getCurrentStaff().id;
  const permissionsCollection = window.omniplayDb?.collection('permissions');
  if (!staffId || !permissionsCollection) { applyPermissionUi(); return; }
  try {
    const doc = await permissionsCollection.doc(staffId).get();
    if (doc.exists) sessionStorage.setItem(SESSION_KEYS.permissions, JSON.stringify(doc.data()));
    else sessionStorage.setItem(SESSION_KEYS.permissions, JSON.stringify(makeDefaultPermissions()));
  } catch (error) { console.error('讀取權限失敗：', error); }
  applyPermissionUi();
};

window.loadCurrentPermissions = loadCurrentPermissions;
window.permissionReady = loadCurrentPermissions();

const showLoginMessage = (message) => {
  if (!loginMessage) return;
  loginMessage.textContent = message;
  loginMessage.hidden = !message;
};

const showSetupMessage = (message, type = '') => {
  if (!setupMessage) return;
  setupMessage.textContent = message;
  setupMessage.hidden = !message;
  setupMessage.dataset.type = type;
};

const sanitizeEnglishAlphanumericInput = (input) => {
  if (input.dataset.composing === 'true') return;
  const sanitizedValue = input.value.replace(/[^A-Za-z0-9]/g, '');
  if (input.value === sanitizedValue) return;

  const cursorPosition = input.selectionStart || sanitizedValue.length;
  const removedBeforeCursor = input.value.slice(0, cursorPosition).length - input.value.slice(0, cursorPosition).replace(/[^A-Za-z0-9]/g, '').length;
  input.value = sanitizedValue;
  input.setSelectionRange?.(Math.max(cursorPosition - removedBeforeCursor, 0), Math.max(cursorPosition - removedBeforeCursor, 0));
};

englishAlphanumericInputs.forEach((input) => {
  input.addEventListener('compositionstart', () => { input.dataset.composing = 'true'; });
  input.addEventListener('compositionend', () => { input.dataset.composing = 'false'; sanitizeEnglishAlphanumericInput(input); });
  input.addEventListener('input', () => sanitizeEnglishAlphanumericInput(input));
  input.addEventListener('paste', () => requestAnimationFrame(() => sanitizeEnglishAlphanumericInput(input)));
});

const setInitialSetupVisibility = (showSetup) => {
  if (!isIndexPage || isLoggedIn()) return;
  loginForm?.classList.toggle('is-hidden', showSetup);
  setupForm?.classList.toggle('is-hidden', !showSetup);
};

const checkInitialSetupRequired = async () => {
  if (!isIndexPage || isLoggedIn() || !setupForm) return;

  const staffCollection = window.omniplayDb?.collection('staff');
  if (!staffCollection) {
    setInitialSetupVisibility(false);
    showLoginMessage('Firebase 尚未完成初始化，請稍後再試');
    return;
  }

  try {
    const snapshot = await staffCollection.limit(1).get();
    setInitialSetupVisibility(snapshot.empty);
    if (snapshot.empty) {
      showSetupMessage('偵測到尚未建立任何人員資料，請先建立管理員帳號。', 'info');
    }
  } catch (error) {
    console.error('首次設定檢查失敗：', error);
    setInitialSetupVisibility(false);
    showLoginMessage('無法檢查首次設定狀態，請稍後再試');
  }
};

const setAppVisibility = () => {
  const loggedIn = isLoggedIn();
  if (isIndexPage) {
    loginView?.classList.toggle('is-hidden', loggedIn);
    appShell?.classList.toggle('is-hidden', !loggedIn);
  } else if (!loggedIn) {
    window.location.href = loginPath;
  }
};


const makeThemeToggleButton = () => {
  const button = document.createElement('button');
  button.dataset.themeToggle = 'true';
  button.className = 'theme-toggle';
  button.type = 'button';
  button.addEventListener('click', toggleTheme);
  return button;
};

const renderThemeToggle = () => {
  const loginCard = document.querySelector('.login-card');
  if (loginCard && !loginCard.querySelector('[data-theme-toggle]')) loginCard.appendChild(makeThemeToggleButton());
  applyTheme(getStoredTheme());
};

const renderSidebarUser = () => {
  if (!sidebar || !isLoggedIn()) return;
  const currentStaff = getCurrentStaff();
  let footer = sidebar.querySelector('#sidebarUserFooter');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'sidebarUserFooter';
    footer.className = 'sidebar-footer';
    footer.innerHTML = `
      <div class="theme-switch-row"><span>☀️淺色</span><button class="theme-toggle" data-theme-toggle="true" type="button"></button><span>🌙深色</span></div>
        <div class="sidebar-user-row">
        <div class="sidebar-user-info"><span class="sidebar-user-label label">登入者</span><strong class="sidebar-user-name label"></strong></div>
        <button class="logout-button" id="logoutButton" type="button"><span class="icon">⎋</span><span class="label">登出</span></button>
      </div>
    `;
    sidebar.appendChild(footer);
  }
  const sidebarThemeToggle = footer.querySelector('[data-theme-toggle]');
  if (sidebarThemeToggle) sidebarThemeToggle.onclick = toggleTheme;
  const nameElement = footer.querySelector('.sidebar-user-name');
  if (nameElement) nameElement.textContent = currentStaff.name;
  enhanceSidebarNavigation();
};

const logout = () => {
  clearTimeout(idleTimer);
  Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
  window.location.href = loginPath;
};

enhanceSidebarNavigation();

sidebarToggle?.addEventListener('click', toggleSidebar);
sidebarOverlay?.addEventListener('click', closeMobileSidebar);
window.addEventListener('resize', () => applySidebarState(getStoredSidebarCollapsed()));
sidebar?.querySelectorAll('.home-link, .sidebar-sub-item').forEach((link) => {
  link.addEventListener('click', () => {
    if (isMobileViewport()) closeMobileSidebar();
  });
});

sidebarCollapsedToggle.addEventListener('click', toggleSidebar);
  
setupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  showSetupMessage('');

  const code = document.querySelector('#setupCode')?.value.trim();
  const name = document.querySelector('#setupName')?.value.trim();
  const account = document.querySelector('#setupAccount')?.value.trim();
  const password = document.querySelector('#setupPassword')?.value.trim();
  const staffCollection = window.omniplayDb?.collection('staff');

  if (!code || !name || !account || !password) return showSetupMessage('請完整填寫所有欄位');
  if (!staffCollection) return showSetupMessage('Firebase 尚未完成初始化，請稍後再試');

  const submitButton = setupForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = '建立中...';

  try {
    const existingStaff = await staffCollection.limit(1).get();
    if (!existingStaff.empty) {
      showSetupMessage('已存在人員資料，請使用正常登入。');
      setInitialSetupVisibility(false);
      return;
    }

    const docRef = await staffCollection.add({
      code,
      name,
      account,
      password,
      status: '啟用',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    sessionStorage.setItem(SESSION_KEYS.id, docRef.id);
    sessionStorage.setItem(SESSION_KEYS.code, code);
    sessionStorage.setItem(SESSION_KEYS.name, name);
    sessionStorage.setItem(SESSION_KEYS.account, account);
    setupForm.reset();
    setInitialSetupVisibility(false);
    setAppVisibility();
    loadCurrentPermissions();
    renderSidebarUser();
    resetIdleTimer();
  } catch (error) {
    console.error('建立管理員帳號失敗：', error);
    showSetupMessage('建立失敗，請稍後再試');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = '建立第一個帳號';
  }
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  showLoginMessage('');

  const account = document.querySelector('#account')?.value.trim();
  const password = document.querySelector('#loginPassword')?.value.trim();
  const staffCollection = window.omniplayDb?.collection('staff');

  if (!account || !password) return showLoginMessage('請輸入帳號與密碼');
  if (!staffCollection) return showLoginMessage('Firebase 尚未完成初始化，請稍後再試');

  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = '登入中...';

  try {
    const snapshot = await staffCollection.where('account', '==', account).limit(1).get();
    if (snapshot.empty) {
      showLoginMessage('帳號或密碼錯誤');
      return;
    }

    const doc = snapshot.docs[0];
    const staff = doc.data();
    if (staff.password !== password) {
      showLoginMessage('帳號或密碼錯誤');
      return;
    }
    if (staff.status === '停用') {
      showLoginMessage('帳號已停用，請聯繫管理員');
      return;
    }

    sessionStorage.setItem(SESSION_KEYS.id, doc.id);
    sessionStorage.setItem(SESSION_KEYS.code, staff.code || '');
    sessionStorage.setItem(SESSION_KEYS.name, staff.name || '');
    sessionStorage.setItem(SESSION_KEYS.account, staff.account || '');
    await loadCurrentPermissions();
    setAppVisibility();
    renderSidebarUser();
    resetIdleTimer();
  } catch (error) {
    console.error('登入失敗：', error);
    showLoginMessage('帳號或密碼錯誤');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = '登入';
  }
});

document.addEventListener('click', (event) => {
  if (event.target.closest('#logoutButton')) logout();
});

renderThemeToggle();
setAppVisibility();
window.permissionReady?.then(() => {
  renderSidebarUser();
  if (isLoggedIn()) {
    resetIdleTimer();
  }
});
checkInitialSetupRequired();
