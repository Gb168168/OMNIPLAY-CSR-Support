if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/OMNIPLAY-CSR-Support/sw.js');
}

const sidebar = document.querySelector('#sidebar');
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

const isIndexPage = /(^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname.endsWith('/');
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
  return { ...EMPTY_PERMISSION, ...(pages[page] || {}) };
};
const canUse = (pageOrAction, maybeAction) => {
  const page = maybeAction ? pageOrAction : currentPageKey();
  const action = maybeAction || pageOrAction;
  return getPagePermission(page)[action] === true;
};


const notificationState = {
  allEvents: [],
  todayEvents: [],
  unsubscribeSchedule: null,
  intervalId: null,
  notifiedKeys: new Set()
};

const NOTIFICATION_ICON_PATH = isIndexPage ? 'assets/icon-192.png' : '../assets/icon-192.png';
const padNotificationPart = (value) => String(value).padStart(2, '0');
const notificationDateKey = (date = new Date()) => `${date.getFullYear()}-${padNotificationPart(date.getMonth() + 1)}-${padNotificationPart(date.getDate())}`;
const notificationValueDate = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(String(value).replace(/\//g, '-').replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const notificationDateFromParts = (dateValue, timeValue = '00:00') => {
  const match = String(dateValue || '').trim().replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const [hourText = '0', minuteText = '0'] = String(timeValue || '00:00').split(':');
  const parsed = new Date(Number(yearText), Number(monthText) - 1, Number(dayText), Number(hourText) || 0, Number(minuteText) || 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const notificationScheduleOriginalDate = (event = {}) => notificationValueDate(event.reminderAt) || notificationValueDate(event.datetime) || notificationValueDate(event.startAt) || notificationDateFromParts(event.date, event.time || event.startTime);
const notificationRepeatStepDays = (event = {}) => {
  if (event.repeat === 'daily') return 1;
  if (event.repeat === 'weekly') return 7;
  if (event.repeat === 'custom') return Math.max(1, Number(event.repeatInterval) || 1);
  return 0;
};
const notificationDaysBetween = (start, end) => Math.floor((new Date(end.getFullYear(), end.getMonth(), end.getDate()) - new Date(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
const notificationAddMonthsClamped = (date, count) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
};
const notificationOccurrenceForToday = (event = {}, date = new Date()) => {
  if (event.deleted === true) return null;
  const original = notificationScheduleOriginalDate(event);
  if (!(original instanceof Date) || Number.isNaN(original.getTime())) return null;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  if (original >= start && original <= end) return original;
  if (original > end) return null;
  if ((event.repeat || 'none') === 'monthly') {
    for (let i = 1, occurrence = notificationAddMonthsClamped(original, i); occurrence <= end; i += 1, occurrence = notificationAddMonthsClamped(original, i)) {
      if (occurrence >= start) return occurrence;
    }
    return null;
  }
  const step = notificationRepeatStepDays(event);
  if (!step) return null;
  const offset = notificationDaysBetween(original, start);
  if (offset > 0 && offset % step === 0) {
    const occurrence = new Date(original);
    occurrence.setFullYear(start.getFullYear(), start.getMonth(), start.getDate());
    return occurrence;
  }
  return null;
};

async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    console.log('通知權限:', permission);
  }
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: NOTIFICATION_ICON_PATH,
      badge: NOTIFICATION_ICON_PATH
    });
  }
}

function refreshTodayNotificationEvents(events = notificationState.allEvents) {
  notificationState.allEvents = events;
  notificationState.todayEvents = events.map((event) => {
    const occurrenceAt = notificationOccurrenceForToday(event);
    if (!occurrenceAt) return null;
    return {
      ...event,
      occurrenceAt,
      time: `${padNotificationPart(occurrenceAt.getHours())}:${padNotificationPart(occurrenceAt.getMinutes())}`,
      notified: notificationState.notifiedKeys.has(`${event.id || event.title}-${notificationDateKey(occurrenceAt)}-${occurrenceAt.getTime()}`)
    };
  }).filter(Boolean);
  window.todayEvents = notificationState.todayEvents;
}

function startScheduleNotifications() {
  if (notificationState.intervalId) return;
  const scheduleCollection = window.omniplayDb?.collection('schedule');
  if (scheduleCollection && !notificationState.unsubscribeSchedule) {
    notificationState.unsubscribeSchedule = scheduleCollection.onSnapshot((snapshot) => {
      refreshTodayNotificationEvents(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error('讀取通知排程失敗：', error));
  }
  notificationState.intervalId = setInterval(() => {
    const now = new Date();
    if (notificationState.todayEvents.some((event) => notificationDateKey(event.occurrenceAt) !== notificationDateKey(now))) {
      refreshTodayNotificationEvents(notificationState.allEvents);
    }
    const currentTime = `${padNotificationPart(now.getHours())}:${padNotificationPart(now.getMinutes())}`;
    notificationState.todayEvents.forEach((event) => {
      const key = `${event.id || event.title}-${notificationDateKey(event.occurrenceAt)}-${event.occurrenceAt.getTime()}`;
      if (event.time === currentTime && !event.notified && !notificationState.notifiedKeys.has(key)) {
        sendNotification('📅 排程提醒', event.title || '未命名事項');
        event.notified = true;
        notificationState.notifiedKeys.add(key);
      }
    });
  }, 60000);
}

window.requestNotificationPermission = requestNotificationPermission;
window.sendNotification = sendNotification;
window.startScheduleNotifications = startScheduleNotifications;

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
    footer.querySelector('[data-theme-toggle]')?.addEventListener('click', toggleTheme);
    sidebar.appendChild(footer);
  }
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
    requestNotificationPermission();
    resetIdleTimer();
    startScheduleNotifications();
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
    requestNotificationPermission();
    resetIdleTimer();
    startScheduleNotifications();
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
    startScheduleNotifications();
  }
});
checkInitialSetupRequired();
