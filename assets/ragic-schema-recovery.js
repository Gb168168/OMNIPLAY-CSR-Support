(() => {
  'use strict';

  const TARGET_PATHS = new Set([
    '/work/log.html',
    '/work/log-new.html',
    '/work/handover.html',
    '/work/report.html'
  ]);
  const normalizedPath = window.location.pathname.replace(/^\/OMNIPLAY-CSR-Support/, '');
  if (!TARGET_PATHS.has(normalizedPath)) return;

  const button = () => document.querySelector('#newRecordButton');
  const schemaIsReady = () => button()?.dataset.schemaReady === 'true';

  const recoverWithConfiguredFields = () => {
    if (schemaIsReady()) return true;
    if (typeof RAGIC_STATE === 'undefined' || !RAGIC_STATE.config || typeof makeDefaultSchema !== 'function') return false;

    try {
      const fallback = makeDefaultSchema(RAGIC_STATE.config);
      RAGIC_STATE.schema = typeof normalizeSchema === 'function' ? normalizeSchema(fallback) : fallback;

      if (typeof renderHeader === 'function') renderHeader();
      if (typeof applyFilters === 'function') applyFilters();

      const newRecordButton = button();
      if (newRecordButton) {
        newRecordButton.dataset.schemaReady = 'true';
        newRecordButton.textContent = '+ 新增';
      }
      if (typeof applyRagicPermissionUi === 'function') applyRagicPermissionUi();

      console.warn('[ragic-schema-recovery] schema 載入逾時，已先使用頁面內建欄位設定。');
      if (typeof showRagicNotice === 'function') {
        showRagicNotice('欄位設定載入較久，已先使用頁面預設欄位', { tone: 'warning', duration: 5000 });
      }
      return true;
    } catch (error) {
      console.error('[ragic-schema-recovery] 欄位復原失敗：', error);
      return false;
    }
  };

  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (schemaIsReady()) {
      window.clearInterval(timer);
      return;
    }

    // 給正常 schema snapshot 足夠時間；超過 5 秒就不能讓整頁永遠卡在「載入欄位中…」。
    if (Date.now() - startedAt < 5000) return;
    if (recoverWithConfiguredFields() || Date.now() - startedAt > 15000) window.clearInterval(timer);
  }, 250);
})();
