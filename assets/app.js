const sidebar = document.querySelector('#sidebar');
const sidebarToggle = document.querySelector('#sidebarToggle');
const appShell = document.querySelector('.app-shell');
const loginView = document.querySelector('#loginView');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');

const SESSION_KEYS = {
  id: 'omniplayStaffId',
  code: 'omniplayStaffCode',
  name: 'omniplayStaffName'
};

const isIndexPage = /(^|\/)index\.html$/.test(window.location.pathname) || window.location.pathname.endsWith('/');
const loginPath = isIndexPage ? 'index.html' : '../index.html';

const getCurrentStaff = () => ({
  id: sessionStorage.getItem(SESSION_KEYS.id),
  code: sessionStorage.getItem(SESSION_KEYS.code),
  name: sessionStorage.getItem(SESSION_KEYS.name)
});

const isLoggedIn = () => Boolean(getCurrentStaff().code && getCurrentStaff().name);

const showLoginMessage = (message) => {
  if (!loginMessage) return;
  loginMessage.textContent = message;
  loginMessage.hidden = !message;
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
};

const logout = () => {
  Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
  window.location.href = loginPath;
};

sidebarToggle?.addEventListener('click', () => {
  sidebar?.classList.toggle('is-collapsed');
});

document.querySelectorAll('.section-button').forEach((button) => {
  const list = button.nextElementSibling;
  button.addEventListener('click', () => {
    button.classList.toggle('is-open');
    list?.classList.toggle('is-open');
  });
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

setAppVisibility();
renderSidebarUser();
