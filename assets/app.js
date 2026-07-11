const sidebar = document.querySelector('#sidebar');
const sidebarToggle = document.querySelector('#sidebarToggle');
const appShell = document.querySelector('.app-shell');
const loginView = document.querySelector('#loginView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const setupForm = document.querySelector('#setupForm');
const setupMessage = document.querySelector('#setupMessage');
const englishAlphanumericInputs = document.querySelectorAll('#loginAccount, #loginPassword, #setupCode, #setupAccount, #setupPassword');


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
    button.textContent = theme === 'light' ? '🌙' : '☀️';
    button.setAttribute('aria-label', theme === 'light' ? '切換為深色模式' : '切換為淺色模式');
    button.title = theme === 'light' ? '切換為深色模式' : '切換為淺色模式';
  });
};
const toggleTheme = () => {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  applyTheme(nextTheme);
};
applyTheme(getStoredTheme());

const getStoredSidebarCollapsed = () => localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
const applySidebarState = (collapsed) => {
  if (!sidebar) return;
  sidebar.classList.toggle('is-collapsed', collapsed);
  sidebarToggle?.setAttribute('aria-label', collapsed ? '展開左側功能表' : '收合左側功能表');
  sidebarToggle?.setAttribute('aria-expanded', String(!collapsed));
};
const toggleSidebar = () => {
  const collapsed = !sidebar?.classList.contains('is-collapsed');
  localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  applySidebarState(collapsed);
};

const enhanceSidebarNavigation = () => {
  if (!sidebar) return;
  sidebar.querySelectorAll('.home-link, .section-button, .submenu a, .logout-button').forEach((item) => {
    const label = item.querySelector('.label') || item.querySelector('.sidebar-text');
    const tooltipText = (label?.textContent || item.textContent || '').trim();
    if (tooltipText) {
      item.dataset.tooltip = tooltipText;
      item.setAttribute('title', tooltipText);
    }
  });

  sidebar.querySelectorAll('.submenu a').forEach((link) => {
    const text = link.textContent.trim();
    if (!link.querySelector('.icon')) {
      link.textContent = '';
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = MENU_ICON_MAP[text] || '•';
      const label = document.createElement('span');
      label.className = 'label sidebar-text';
      label.textContent = text;
      link.append(icon, label);
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

const isIndexPage = /(^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname.endsWith('/');
const loginPath = isIndexPage ? 'index.html' : '../index.html';

const getCurrentStaff = () => ({
  id: sessionStorage.getItem(SESSION_KEYS.id),
  code: sessionStorage.getItem(SESSION_KEYS.code),
  name: sessionStorage.getItem(SESSION_KEYS.name),
  account: sessionStorage.getItem(SESSION_KEYS.account)
});

const isLoggedIn = () => Boolean(getCurrentStaff().code && getCurrentStaff().name);
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
    if (page && restrict && !permissions.pages?.[page]?.view) link.closest('li')?.remove();
  });
  document.querySelectorAll('.submenu').forEach((list) => {
    if (!list.querySelector('li')) list.closest('.menu-section')?.remove();
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
  const sanitizedValue = input.value.replace(/[^A-Za-z0-9]/g, '');
  if (input.value === sanitizedValue) return;

  const cursorPosition = input.selectionStart || sanitizedValue.length;
  const removedBeforeCursor = input.value.slice(0, cursorPosition).length - input.value.slice(0, cursorPosition).replace(/[^A-Za-z0-9]/g, '').length;
  input.value = sanitizedValue;
  input.setSelectionRange?.(Math.max(cursorPosition - removedBeforeCursor, 0), Math.max(cursorPosition - removedBeforeCursor, 0));
};

englishAlphanumericInputs.forEach((input) => {
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


const renderThemeToggle = () => {
  const targets = [sidebar?.querySelector('.sidebar-header'), document.querySelector('.login-card')].filter(Boolean);
  targets.forEach((target) => {
    if (target.querySelector('[data-theme-toggle]')) return;
    const button = document.createElement('button');
    button.dataset.themeToggle = 'true';
    button.className = 'theme-toggle';
    button.type = 'button';
    button.addEventListener('click', toggleTheme);
    target.appendChild(button);
  });
  applyTheme(getStoredTheme());
  
};

const renderSidebarUser = () => {
  if (!sidebar || !isLoggedIn()) return;
  const currentStaff = getCurrentStaff();
  let footer = sidebar.querySelector('#sidebarUserFooter');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'sidebarUserFooter';
    footer.className = 'sidebar-user';
    footer.innerHTML = `
      <div class="sidebar-user-info">
        <span class="sidebar-user-label label">登入者</span>
        <strong class="sidebar-user-name label"></strong>
      </div>
      <button class="logout-button" id="logoutButton" type="button"><span class="icon">⎋</span><span class="label">登出</span></button>
    `;
    sidebar.appendChild(footer);
  }
  const nameElement = footer.querySelector('.sidebar-user-name');
  if (nameElement) nameElement.textContent = currentStaff.name;
  enhanceSidebarNavigation();
};

const logout = () => {
  Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
  window.location.href = loginPath;
};

enhanceSidebarNavigation();

sidebarToggle?.addEventListener('click', toggleSidebar);

document.querySelectorAll('.section-button').forEach((button) => {
  const list = button.nextElementSibling;
  button.addEventListener('click', () => {
    button.classList.toggle('is-open');
    list?.classList.toggle('is-open');
  });
});


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

  const account = document.querySelector('#loginAccount')?.value.trim();
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
window.permissionReady?.then(() => renderSidebarUser());
checkInitialSetupRequired();
