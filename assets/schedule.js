const scheduleDb = window.omniplayDb;
const scheduleCollection = scheduleDb?.collection('schedule');
const scheduleLabelCollection = scheduleDb?.collection('scheduleLabels');
const scheduleStaffCollection = scheduleDb?.collection('staff');
const scheduleLeaveCollection = scheduleDb?.collection('leave');
const scheduleGameChangeCollection = scheduleDb?.collection('scheduleGameChanges');

const calendarEl = document.querySelector('#scheduleCalendar');
const periodLabel = document.querySelector('#schedulePeriodLabel');
const statusEl = document.querySelector('#scheduleStatus');
const selectedDateEl = document.querySelector('#selectedScheduleDate');
const modalEl = document.querySelector('#scheduleModal');
const scheduleHelpModalEl = document.querySelector('#scheduleHelpModal');
const dayAgendaModalEl = document.querySelector('#dayAgendaModal');
const dayAgendaTitleEl = document.querySelector('#dayAgendaTitle');
const dayAgendaListEl = document.querySelector('#dayAgendaList');
const addDayScheduleButton = document.querySelector('#addDayScheduleButton');
const modalTitleEl = document.querySelector('#scheduleModalTitle');
const formEl = document.querySelector('#scheduleForm');
const messageEl = document.querySelector('#scheduleFormMessage');
const deleteButton = document.querySelector('#deleteScheduleButton');
const colorInput = document.querySelector('#scheduleLabelColor');
const labelNameInput = document.querySelector('#scheduleLabelName');
const labelCategorySelect = document.querySelector('#scheduleLabelCategory');
const deleteScheduleLabelButton = document.querySelector('#deleteScheduleLabelButton');
const historyListEl = document.querySelector('#scheduleHistoryList');
const tooltipEl = document.querySelector('#scheduleSpecialTooltip');
const repeatSelect = document.querySelector('#scheduleRepeat');
const repeatIntervalInput = document.querySelector('#scheduleRepeatInterval');
const repeatIntervalLabel = document.querySelector('#scheduleRepeatIntervalLabel');
const periodPicker = document.querySelector('#schedulePeriodPicker');
const yearSelect = document.querySelector('#scheduleYearSelect');
const monthPicker = document.querySelector('#scheduleMonthPicker');
const labelFilterSelect = document.querySelector('#scheduleLabelFilter');
const syncGameScheduleButton = document.querySelector('#syncGameScheduleButton');
const scheduleSyncControls = document.querySelector('#scheduleSyncControls');
const scheduleSyncCountdown = document.querySelector('#scheduleSyncCountdown');
const gameChangeLogButton = document.querySelector('#gameChangeLogButton');
const gameChangeLogModalEl = document.querySelector('#gameChangeLogModal');
const gameChangeLogListEl = document.querySelector('#gameChangeLogList');
const scheduleMoreMenu = document.querySelector('.schedule-more-menu');
const gamePmConfirmedLabel = document.querySelector('#gamePmConfirmedLabel');
const gamePmConfirmedInput = document.querySelector('#gamePmConfirmed');
const firstLaunchOtherPlatform = document.querySelector('#firstLaunchOtherPlatform');
const firstLaunchOtherPlatformEnabled = document.querySelector('#firstLaunchOtherPlatformEnabled');
const firstLaunchOtherPlatformDates = document.querySelector('#firstLaunchOtherPlatformDates');
const firstLaunchOtherPlatformUatDate = document.querySelector('#firstLaunchOtherPlatformUatDate');
const firstLaunchOtherPlatformProdDate = document.querySelector('#firstLaunchOtherPlatformProdDate');

const GAME_SCHEDULE_FEED_URL = 'https://script.google.com/macros/s/AKfycbyaTbkqtkBfAzbPNqCw8VEnh43VrNLpfYK3WR3TUNtIZF8_QCh6AOncZ6jG_LbxVyni9g/exec';
const GAME_SCHEDULE_LABEL = { id: 'google-game-sheet', name: '遊戲上線', color: '#2563eb' };
const GAME_SCHEDULE_COLORS = {
  pm: '#f59e0b',
  marketing: '#14b8a6',
  uat: '#8b5cf6',
  prod: '#2563eb',
  firstLaunch: '#ec4899',
  exclusive: '#ca8a04'
};
const GAME_SCHEDULE_START_DATE = new Date(2026, 0, 1, 0, 0, 0, 0);
const GAME_WORKFLOW_START_DATE = new Date(2026, 6, 1, 0, 0, 0, 0);
const GAME_FIRST_LAUNCH_START_DATE = new Date(2026, 7, 1, 0, 0, 0, 0);
const GAME_ONLINE_META = { labelId: 'google-game-prod', labelName: 'PROD', color: GAME_SCHEDULE_COLORS.prod };
const GAME_FIRST_LAUNCH_UAT_META = { labelId: 'google-game-first-launch-uat', labelName: '⭐ 首發平台測試上線', color: GAME_SCHEDULE_COLORS.uat };
const GAME_FIRST_LAUNCH_META = { labelId: 'google-game-first-launch', labelName: '⭐ 首發平台正式上線', color: GAME_SCHEDULE_COLORS.firstLaunch };
const GAME_EXCLUSIVE_META = { labelId: 'google-game-exclusive', labelName: '🔒 獨家平台', color: GAME_SCHEDULE_COLORS.exclusive };
const GAME_EVENT_META = {
  'pm-confirmation': { labelId: 'google-game-pm', labelName: '向 AM 確認', color: GAME_SCHEDULE_COLORS.pm },
  'marketing-material': { labelId: 'google-game-marketing', labelName: '行銷素材待辦', color: GAME_SCHEDULE_COLORS.marketing },
  'uat-announcement': { labelId: 'google-game-uat', labelName: 'UAT', color: GAME_SCHEDULE_COLORS.uat },
  'uat-material': { labelId: 'google-game-uat', labelName: 'UAT', color: GAME_SCHEDULE_COLORS.uat },
  'prod-launch': { labelId: 'google-game-prod', labelName: 'PROD', color: GAME_SCHEDULE_COLORS.prod },
  'other-platform-uat': { labelId: 'google-game-other-platform-uat', labelName: '其他平台 UAT上線', color: GAME_SCHEDULE_COLORS.uat },
  'other-platform-prod': { labelId: 'google-game-other-platform-prod', labelName: '其他平台 PROD上線', color: GAME_SCHEDULE_COLORS.prod },
  'first-launch': GAME_FIRST_LAUNCH_META,
  'exclusive-launch': GAME_EXCLUSIVE_META
};
const GAME_TITLE_PREFIX_PATTERN = /^(?:⭐ 首發／🔒 獨家平台|⭐ 首發平台測試上線|⭐ 首發平台正式上線|⭐ 首發平台上線|🔒 獨家平台|其他平台 UAT上線|其他平台 PROD上線|其他平台 UAT|其他平台 PROD|其他平台 PORD|PROD|PORD|遊戲上線|向 AM 確認|PROD 上架公告|預計 PROD 上線|向行銷索取 UAT 公告資料|UAT 資料待辦|UAT 上架公告|UAT／測試環境|發送 UAT 環境上架公告|行銷素材待辦|向行銷索取遊戲素材)\s*[｜|]\s*/;

const LABEL_CATEGORY_ORDER = [
  '向 AM 確認',
  '行銷素材待辦',
  'UAT',
  '⭐ 首發平台測試上線',
  '⭐ 首發平台正式上線',
  '其他平台 UAT上線',
  '🔒 獨家平台',
  '其他平台 PROD上線',
  'PROD',
  '問題/需求-代辦提醒'
];

const canonicalScheduleLabelName = (name = '') => {
  const normalized = String(name).trim().replace(/\s+/g, ' ');
  if (normalized === '向 PM 確認') return '向 AM 確認';
  if (normalized === '預計 PROD 上線') return 'PROD 上架公告';
  if (normalized === 'UAT／測試環境') return 'UAT';
  if (normalized === '遊戲上線' || normalized === 'PORD') return 'PROD';
  if (normalized === '其他平台 UAT') return '其他平台 UAT上線';
  if (normalized === '其他平台 PROD' || normalized === '其他平台 PORD') return '其他平台 PROD上線';
  if (normalized === '⭐ 首發／🔒 獨家平台' || normalized === '⭐ 首發平台上線') return '⭐ 首發平台正式上線';
  if (normalized === '代辦事項') return '問題/需求-代辦提醒';
  return normalized;
};

const getScheduleEventMeta = (item = {}) => GAME_EVENT_META[item.eventType] || null;
const getScheduleDisplayColor = (item = {}) => item.labelColor || getScheduleEventMeta(item)?.color || '#3b82f6';
const scheduleHasFirstLaunchGame = (item = {}) => {
  const games = Array.isArray(item.games) ? item.games : [];
  return games.some((game) => /首發/.test(String(game?.note1 || '')));
};
const getScheduleDisplayLabel = (item = {}) => {
  if (scheduleHasFirstLaunchGame(item)) {
    if (item.eventType === 'uat-announcement' || item.eventType === 'uat-material') return GAME_FIRST_LAUNCH_UAT_META.labelName;
    if (item.eventType === 'prod-launch') return GAME_FIRST_LAUNCH_META.labelName;
  }
  return canonicalScheduleLabelName(item.labelName) || getScheduleEventMeta(item)?.labelName || '';
};
const isFirstLaunchSchedule = (item = {}) => {
  if (item.eventType === 'first-launch') return true;
  const labels = [item.labelName, item.category, item.labelCategory]
    .map((value) => canonicalScheduleLabelName(value))
    .filter(Boolean);
  if (labels.includes('⭐ 首發平台正式上線')) return true;
  return /^\s*⭐\s*首發平台(?:正式)?上線(?:\s*[｜|]|\s*$)/.test(String(item.title || ''));
};
const getScheduleGames = (item = {}) => {
  if (Array.isArray(item.games) && item.games.length) return item.games;
  if (item.gameId) return [{
    gameId: String(item.gameId),
    gameNameZh: item.gameNameZh || '',
    gameNameEn: item.gameNameEn || ''
  }];
  return [];
};

const getGameTitle = (games = []) => games
  .map((game) => {
    const gameId = String(game.gameId || '').trim();
    const gameName = String(game.gameNameZh || game.gameNameEn || '').trim();
    return gameName ? `${gameId} (${gameName})`.trim() : gameId;
  })
  .filter(Boolean)
  .join('、');

const getGameSpecialLabel = (games = []) => {
  const notes = games.map((game) => String(game?.note1 || '').trim());
  if (notes.some((note) => /首發/.test(note))) return GAME_FIRST_LAUNCH_META.labelName;
  if (notes.some((note) => /獨家/.test(note))) return GAME_EXCLUSIVE_META.labelName;
  return '';
};

const getScheduleDisplayTitle = (item = {}) => {
  const meta = getScheduleEventMeta(item);
  if (!meta) return item.title || '';
  const displayLabel = getScheduleDisplayLabel(item) || meta.labelName;
  const gameTitle = getGameTitle(getScheduleGames(item));
  const specialLabel = item.eventType === 'pm-confirmation'
    ? getGameSpecialLabel(getScheduleGames(item))
    : '';
  if (gameTitle) return [displayLabel, specialLabel, gameTitle].filter(Boolean).join('｜');
  const titleBody = String(item.title || '').replace(GAME_TITLE_PREFIX_PATTERN, '').trim();
  const fallbackTitle = titleBody && !/^\d+\s*款遊戲$/.test(titleBody) ? titleBody : '未命名遊戲';
  return `${displayLabel}｜${fallbackTitle}`;
};

const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const SCHEDULE_SESSION_KEYS = { id: 'omniplayStaffId', code: 'omniplayStaffCode', name: 'omniplayStaffName' };
const pad = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toMonthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const parseDateValue = (value) => value?.toDate?.() || (typeof value === 'string' ? new Date(value) : value instanceof Date ? value : null);
const toDatetimeLocal = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const daysBetween = (start, end) => Math.floor((new Date(end.getFullYear(), end.getMonth(), end.getDate()) - new Date(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
const addMonthsClamped = (date, count) => {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
};
const isSameDay = (a, b) => toDateKey(a) === toDateKey(b);
const activeStaff = (staff) => (staff.status || '啟用') === '啟用';
const currentUser = () => ({
  id: sessionStorage.getItem(SCHEDULE_SESSION_KEYS.id) || '',
  code: sessionStorage.getItem(SCHEDULE_SESSION_KEYS.code) || '',
  name: sessionStorage.getItem(SCHEDULE_SESSION_KEYS.name) || '未登入人員'
});

let currentDate = new Date();
let selectedDate = new Date();
let viewMode = 'month';
let staffList = [];
let scheduleList = [];
let labelList = [];
let leaveData = { records: {} };
let editingId = null;
let unsubscribeStaff = null;
let unsubscribeSchedules = null;
let unsubscribeLabels = null;
let unsubscribeLeave = null;
let activeLabelFilter = '';
let scheduleDataLoaded = false;
let gameScheduleSyncing = false;
let gameScheduleAutoTimer = null;
let gameScheduleCountdownTimer = null;
let gameScheduleNextSyncAt = null;
let gameScheduleLastFailed = false;
let scheduleFormInitialSnapshot = '';
let selectedScheduleLabelId = '';
const GAME_SCHEDULE_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const resolveSavedScheduleMeta = (meta) => {
  const saved = labelList.find((label) => label.id === meta.labelId);
  return saved ? {
    ...meta,
    labelName: canonicalScheduleLabelName(saved.name) || meta.labelName,
    color: saved.color || meta.color
  } : meta;
};

const storedSchedulePermission = () => window.getPagePermission?.('schedule') || { view: false, edit: false, delete: false, design: false };
let canEditSchedule = Boolean(window.isOmniplayAdmin?.());
let canDeleteSchedule = Boolean(window.isOmniplayAdmin?.());

const syncSchedulePermission = async () => {
  if (window.permissionReady) await window.permissionReady;
  const permission = storedSchedulePermission();
  canEditSchedule = Boolean(window.isOmniplayAdmin?.() || permission.edit === true);
  canDeleteSchedule = Boolean(window.isOmniplayAdmin?.() || permission.delete === true);
  document.querySelector('#saveScheduleButton')?.toggleAttribute('hidden', !canEditSchedule);
  document.querySelector('#saveScheduleButton')?.toggleAttribute('disabled', !canEditSchedule);
  syncGameScheduleButton?.toggleAttribute('hidden', !canEditSchedule);
  scheduleSyncControls?.toggleAttribute('hidden', !canEditSchedule);
  if (deleteButton) deleteButton.hidden = !canDeleteSchedule || !editingId;
  formEl?.querySelectorAll('input, textarea, select').forEach((control) => { control.disabled = !canEditSchedule; });
  startAutomaticGameScheduleSync();
};


const loadGameScheduleFeedJsonp = () => new Promise((resolve, reject) => {
  const callbackName = `__omniplayScheduleSync_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const script = document.createElement('script');
  const cleanup = () => {
    window.clearTimeout(timer);
    script.remove();
    delete window[callbackName];
  };
  const timer = window.setTimeout(() => {
    cleanup();
    reject(new Error('同步服務 JSONP 逾時'));
  }, 20000);
  window[callbackName] = (payload) => {
    cleanup();
    resolve(payload);
  };
  script.onerror = () => {
    cleanup();
    reject(new Error('同步服務 JSONP 無法載入'));
  };
  script.src = `${GAME_SCHEDULE_FEED_URL}?callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
  document.head.appendChild(script);
});

const validateGameSchedulePayload = (payload) => {
  if (!payload?.success || !Array.isArray(payload.games)) {
    throw new Error(payload?.error || '回傳格式錯誤');
  }
  return payload;
};

const loadGameScheduleFeed = async () => {
  try {
    const response = await fetch(`${GAME_SCHEDULE_FEED_URL}?_=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`同步服務回應 ${response.status}`);
    return validateGameSchedulePayload(await response.json());
  } catch (fetchError) {
    console.warn('Apps Script fetch 失敗，改用 JSONP：', fetchError);
    return validateGameSchedulePayload(await loadGameScheduleFeedJsonp());
  }
};

const parseGameScheduleDate = (value) => {
  const parts = String(value || '').trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!parts) return null;
  const date = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 9, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const subtractCalendarDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() - Math.max(0, Number(days) || 0));
  result.setHours(9, 0, 0, 0);
  return result;
};

const gameLine = (game) =>
  `${game.gameId} ${game.gameNameZh || game.gameNameEn || ''}｜預計 PROD：${game.expectedOnlineDate}`.trim();

const groupGamesByCalendarDay = (games, days) => games.reduce((result, game) => {
  const launchAt = parseGameScheduleDate(game.expectedOnlineDate);
  if (!launchAt) return result;
  const reminderAt = subtractCalendarDays(launchAt, days);
  const dateKey = toDateKey(reminderAt);
  (result[dateKey] ||= { reminderAt, games: [] }).games.push(game);
  return result;
}, {});

const mergeScheduleGames = (existingGames = [], incomingGames = []) => {
  const merged = new Map();
  [...existingGames, ...incomingGames].forEach((game) => {
    const gameId = String(game?.gameId || '').trim();
    if (!gameId) return;
    const key = `${gameId}|${game?.expectedOnlineDate || ''}`;
    merged.set(key, { ...merged.get(key), ...game, gameId });
  });
  return [...merged.values()];
};

const gameScheduleDocSuffix = (game = {}) => String(game.gameId || '')
  .trim()
  .replace(/[^a-zA-Z0-9_-]+/g, '_');

const syncFirstLaunchOtherPlatformSchedules = async (item, actor, enabled, uatDate, prodDate) => {
  const games = getScheduleGames(item);
  if (!games.length) throw new Error('此首發排程缺少遊戲資料。');
  const updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  const targets = [
    { eventType: 'other-platform-uat', date: uatDate, meta: GAME_EVENT_META['other-platform-uat'], content: '其他平台測試環境開放' },
    { eventType: 'other-platform-prod', date: prodDate, meta: GAME_EVENT_META['other-platform-prod'], content: '其他平台正式環境開放' }
  ];
  const batch = scheduleDb.batch();

  targets.forEach((target) => {
    const displayMeta = resolveSavedScheduleMeta(target.meta);
    batch.set(scheduleLabelCollection.doc(displayMeta.labelId), {
      name: displayMeta.labelName,
      color: displayMeta.color,
      updatedAt,
      source: 'google-game-sheet'
    }, { merge: true });

    games.forEach((game) => {
      const suffix = gameScheduleDocSuffix(game);
      if (!suffix) return;
      const ref = scheduleCollection.doc(`game_${target.eventType.replace(/-/g, '_')}_${suffix}`);
      if (!enabled) {
        batch.set(ref, { deleted: true, updatedAt, updatedBy: actor }, { merge: true });
        return;
      }
      const reminderAt = new Date(`${target.date}T09:00:00`);
      batch.set(ref, {
        eventType: target.eventType,
        date: target.date,
        title: `${displayMeta.labelName}｜${getGameTitle([game])}`,
        content: target.content,
        reminderAt: firebase.firestore.Timestamp.fromDate(reminderAt),
        labelId: displayMeta.labelId,
        labelName: displayMeta.labelName,
        labelColor: displayMeta.color,
        repeat: 'none',
        staffIds: [],
        staffNames: [],
        deleted: false,
        source: 'first-launch-other-platform',
        parentScheduleId: item.id,
        games: [game],
        updatedAt,
        updatedBy: actor
      }, { merge: true });
    });
  });
  await batch.commit();
};

const createUatSchedules = async (item, actor) => {
  const games = Array.isArray(item?.games) && item.games.length
    ? item.games
    : item?.gameId && item?.expectedOnlineDate
      ? [{
        gameId: String(item.gameId),
        gameNameZh: item.gameNameZh || '',
        gameNameEn: item.gameNameEn || '',
        status: item.gameStatus || item.status || '',
        expectedOnlineDate: item.expectedOnlineDate
      }]
      : [];
  if (!games.length) throw new Error('此排程缺少遊戲或預計上線日期，無法建立流程待辦。');

  const marketingGroups = groupGamesByCalendarDay(games, 8);
  const uatGroups = groupGamesByCalendarDay(games, 7);
  const prodGroups = groupGamesByCalendarDay(games, 0);
  const updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  const marketingMeta = GAME_EVENT_META['marketing-material'];
  const uatMeta = GAME_EVENT_META['uat-announcement'];
  const prodMeta = GAME_EVENT_META['prod-launch'];
  const groups = [
    ...Object.entries(marketingGroups).map(([dateKey, group]) => ({
      legacyId: `game_marketing_${dateKey}`, idPrefix: `game_marketing_${dateKey}`,
      dateKey, group, meta: marketingMeta, eventType: 'marketing-material',
      contentPrefix: '請行銷於今日提供下列遊戲素材：'
    })),
    ...Object.entries(uatGroups).map(([dateKey, group]) => ({
      legacyId: `game_uat_${dateKey}`, idPrefix: `game_uat_${dateKey}`,
      dateKey, group, meta: uatMeta, eventType: 'uat-announcement',
      contentPrefix: '請於今日發送下列遊戲的 UAT 環境上架公告：'
    })),
    ...Object.entries(prodGroups).map(([dateKey, group]) => ({
      legacyId: `game_prod_${dateKey}`, idPrefix: `game_prod_${dateKey}`,
      dateKey, group, meta: prodMeta, eventType: 'prod-launch',
      contentPrefix: '請於今日發送下列遊戲的 PROD 上架公告：'
    }))
  ];
  const workflowEventTypes = new Set(['marketing-material', 'uat-announcement', 'uat-material', 'prod-launch']);
  const targetGameIds = new Set(games.map((game) => String(game.gameId)));
  const desiredWorkflowIds = new Set(groups.flatMap((target) =>
    target.group.games.map((game) => `${target.idPrefix}_${gameScheduleDocSuffix(game)}`)
  ));
  const staleWorkflowIds = scheduleList
    .filter((entry) =>
      entry.source === 'google-game-sheet' &&
      workflowEventTypes.has(entry.eventType) &&
      !desiredWorkflowIds.has(entry.id) &&
      getScheduleGames(entry).some((game) => targetGameIds.has(String(game.gameId)))
    )
    .map((entry) => entry.id);

  await scheduleDb.runTransaction(async (transaction) => {
    const legacyRefs = groups.map((target) => scheduleCollection.doc(target.legacyId));
    const legacySnapshots = await Promise.all(legacyRefs.map((ref) => transaction.get(ref)));
    staleWorkflowIds.forEach((id) => transaction.delete(scheduleCollection.doc(id)));

    [marketingMeta, uatMeta, prodMeta]
      .filter((meta) => !labelList.some((label) => label.id === meta.labelId))
      .forEach((meta) => {
        transaction.set(scheduleLabelCollection.doc(meta.labelId), {
          name: meta.labelName,
          color: meta.color,
          updatedAt,
          source: 'google-game-sheet'
        }, { merge: true });
      });

    groups.forEach((target, index) => {
      const displayMeta = resolveSavedScheduleMeta(target.meta);
      const legacyGames = legacySnapshots[index].exists ? legacySnapshots[index].data()?.games : [];
      const rowGames = mergeScheduleGames(legacyGames, target.group.games);
      rowGames.forEach((game) => {
        const suffix = gameScheduleDocSuffix(game);
        if (!suffix) return;
        const rowRef = scheduleCollection.doc(`${target.idPrefix}_${suffix}`);
        transaction.set(rowRef, {
          eventType: target.eventType,
          date: target.dateKey,
          title: `${displayMeta.labelName}｜${getGameTitle([game])}`,
          content: `${target.contentPrefix}\n${gameLine(game)}`,
          reminderAt: firebase.firestore.Timestamp.fromDate(target.group.reminderAt),
          labelId: displayMeta.labelId,
          labelName: displayMeta.labelName,
          labelColor: displayMeta.color,
          repeat: 'none',
          staffIds: [],
          staffNames: [],
          deleted: false,
          source: 'google-game-sheet',
          games: [game],
          updatedAt,
          updatedBy: actor
        }, { merge: true });
      });
      if (legacySnapshots[index].exists) transaction.delete(legacyRefs[index]);
    });

    transaction.update(scheduleCollection.doc(item.id), {
      pmConfirmedAt: updatedAt,
      pmConfirmedBy: actor,
      updatedAt,
      updatedBy: actor
    });
  });
  return groups.reduce((count, target) => count + target.group.games.length, 0);
};

const GAME_CHANGE_FIELDS = [
  ['gameNameZh', '遊戲名稱（中文）'],
  ['gameNameEn', '遊戲名稱（英文）'],
  ['status', '狀態'],
  ['note1', '備註 1'],
  ['expectedOnlineDate', '預計上線日期']
];

const getFeedGameNote1 = (game = {}) => String(
  game.note1 ?? game.remark1 ?? game.notes1 ?? game.note_1 ?? game.remark_1 ??
  game['備註 1'] ?? game['備註1'] ?? ''
).trim();

const normalizeFeedGame = (game = {}) => ({
  gameId: String(game.gameId || '').trim(),
  gameNameZh: String(game.gameNameZh || '').trim(),
  gameNameEn: String(game.gameNameEn || '').trim(),
  status: String(game.status || '').trim(),
  note1: getFeedGameNote1(game),
  expectedOnlineDate: String(game.expectedOnlineDate || '').trim()
});

const isGameIdLookupFailure = (value) => /查無\s*此?\s*game\s*id|game\s*id\s*(?:not\s*found|不存在)/i.test(String(value || '').trim());
const isFirstLaunchGame = (game = {}, launchAt = null) => {
  if (!(launchAt instanceof Date) || launchAt < GAME_FIRST_LAUNCH_START_DATE) return false;
  const note = String(game.note1 || '').trim();
  return /首發/.test(note);
};
const isExclusiveGame = (game = {}, launchAt = null) => {
  if (!(launchAt instanceof Date) || launchAt < GAME_FIRST_LAUNCH_START_DATE) return false;
  const note = String(game.note1 || '').trim();
  return /獨家/.test(note);
};
const isGameWorkflowConfirmed = (game = {}) => scheduleList.some((item) =>
  item.source === 'google-game-sheet' &&
  item.eventType === 'pm-confirmation' &&
  item.pmConfirmedAt &&
  getScheduleGames(item).some((scheduledGame) =>
    String(scheduledGame.gameId || '') === String(game.gameId || '') &&
    String(scheduledGame.expectedOnlineDate || '') === String(game.expectedOnlineDate || '')
  )
);
const getPreviousScheduleGameMap = () => {
  const games = new Map();
  scheduleList
    .filter((item) => item.source === 'google-game-sheet')
    .forEach((item) => getScheduleGames(item).forEach((game) => {
      const normalized = normalizeFeedGame(game);
      if (normalized.gameId) games.set(normalized.gameId, normalized);
    }));
  return games;
};
const preserveNameOnLookupFailure = (game, previousGames) => {
  const previous = previousGames.get(game.gameId);
  return {
    ...game,
    gameNameZh: isGameIdLookupFailure(game.gameNameZh) ? previous?.gameNameZh || '' : game.gameNameZh,
    gameNameEn: isGameIdLookupFailure(game.gameNameEn) ? previous?.gameNameEn || '' : game.gameNameEn
  };
};

const collectGameScheduleChanges = (feedGames = []) => {
  const previousGames = new Map();
  scheduleList
    .filter((item) => item.source === 'google-game-sheet')
    .forEach((item) => getScheduleGames(item).forEach((game) => {
      const normalized = normalizeFeedGame(game);
      if (normalized.gameId) previousGames.set(normalized.gameId, normalized);
    }));

  const nextGames = new Map(feedGames.map((game) => {
    const normalized = normalizeFeedGame(game);
    return [normalized.gameId, normalized];
  }).filter(([gameId]) => gameId));
  const changes = [];

  nextGames.forEach((game, gameId) => {
    const previous = previousGames.get(gameId);
    if (!previous) return;
    GAME_CHANGE_FIELDS.forEach(([field, fieldLabel]) => {
      if (previous[field] === game[field]) return;
      changes.push({
        gameId,
        gameName: game.gameNameZh || game.gameNameEn || previous.gameNameZh || previous.gameNameEn || '',
        field,
        fieldLabel,
        oldValue: previous[field] || '（空白）',
        newValue: game[field] || '（空白）'
      });
    });
  });

  previousGames.forEach((game, gameId) => {
    if (nextGames.has(gameId)) return;
    changes.push({
      gameId,
      gameName: game.gameNameZh || game.gameNameEn || '',
      field: 'removed',
      fieldLabel: '試算表資料',
      oldValue: '存在',
      newValue: '已移除'
    });
  });
  return changes.slice(0, 200);
};

const formatGameScheduleCountdown = (milliseconds) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

const renderGameScheduleCountdown = () => {
  if (!scheduleSyncCountdown || !canEditSchedule) return;
  scheduleSyncCountdown.classList.toggle('is-syncing', gameScheduleSyncing);
  scheduleSyncCountdown.classList.toggle('is-error', gameScheduleLastFailed);
  if (gameScheduleSyncing) {
    scheduleSyncCountdown.textContent = 'Google Sheets 同步中…';
    return;
  }
  const remaining = Math.max(0, (gameScheduleNextSyncAt || Date.now() + GAME_SCHEDULE_SYNC_INTERVAL_MS) - Date.now());
  scheduleSyncCountdown.textContent = gameScheduleLastFailed
    ? `同步失敗｜5 分鐘後自動重試 ${formatGameScheduleCountdown(remaining)}`
    : `每 5 分鐘自動更新｜下次更新 ${formatGameScheduleCountdown(remaining)}`;
};

const startGameScheduleCountdown = (delay = GAME_SCHEDULE_SYNC_INTERVAL_MS) => {
  gameScheduleNextSyncAt = Date.now() + delay;
  window.clearInterval(gameScheduleCountdownTimer);
  renderGameScheduleCountdown();
  gameScheduleCountdownTimer = window.setInterval(renderGameScheduleCountdown, 1000);
};

const syncGameSchedules = async () => {
  if (!canEditSchedule || !scheduleCollection || !scheduleLabelCollection || gameScheduleSyncing) return;
  gameScheduleSyncing = true;
  renderGameScheduleCountdown();
  syncGameScheduleButton?.setAttribute('disabled', '');
  if (syncGameScheduleButton) syncGameScheduleButton.textContent = '同步中…';
  setStatus('正在同步 Google 遊戲排程…', 'info');

  try {
    const payload = await loadGameScheduleFeed();
    const previousScheduleGames = getPreviousScheduleGameMap();
    const normalizedFeedGames = payload.games
      .map(normalizeFeedGame)
      .filter((game) => game.gameId)
      .map((game) => preserveNameOnLookupFailure(game, previousScheduleGames));
    const games = normalizedFeedGames.filter((game) => {
      const launchAt = parseGameScheduleDate(game.expectedOnlineDate);
      return launchAt && launchAt >= GAME_SCHEDULE_START_DATE;
    });
    const hasWorkflowGames = games.some((game) =>
      parseGameScheduleDate(game.expectedOnlineDate) >= GAME_WORKFLOW_START_DATE);
    const hasExistingWorkflowRows = scheduleList.some((item) =>
      item.source === 'google-game-sheet' && item.eventType !== 'prod-launch');
    const isWorkflowBackfill = hasWorkflowGames && !hasExistingWorkflowRows;
    const changes = isWorkflowBackfill ? [] : collectGameScheduleChanges(games);
    const rows = games.flatMap((game) => {
      const launchAt = parseGameScheduleDate(game.expectedOnlineDate);
      const normalizedGame = {
        gameId: String(game.gameId),
        gameNameZh: game.gameNameZh || '',
        gameNameEn: game.gameNameEn || '',
        status: game.status || '',
        note1: game.note1 || '',
        expectedOnlineDate: game.expectedOnlineDate
      };
      const firstLaunch = isFirstLaunchGame(normalizedGame, launchAt);
      const exclusive = isExclusiveGame(normalizedGame, launchAt);
      const specialLabel = firstLaunch
        ? GAME_FIRST_LAUNCH_META.labelName
        : exclusive ? GAME_EXCLUSIVE_META.labelName : '';
      let definitions;
      if (launchAt >= GAME_WORKFLOW_START_DATE) {
        definitions = [{
          idPrefix: 'game_pm', eventType: 'pm-confirmation', at: subtractCalendarDays(launchAt, 14),
          meta: GAME_EVENT_META['pm-confirmation'],
          titlePrefix: [GAME_EVENT_META['pm-confirmation'].labelName, specialLabel].filter(Boolean).join('｜'),
          contentPrefix: '請向 AM 確認下列遊戲上線資訊：'
        }];
        if (isGameWorkflowConfirmed(normalizedGame)) {
          definitions.push(
            { idPrefix: 'game_marketing', eventType: 'marketing-material', at: subtractCalendarDays(launchAt, 8), meta: GAME_EVENT_META['marketing-material'], contentPrefix: '請行銷提供下列遊戲素材：' },
            { idPrefix: 'game_uat', eventType: 'uat-announcement', at: subtractCalendarDays(launchAt, 7), meta: firstLaunch ? GAME_FIRST_LAUNCH_UAT_META : GAME_EVENT_META['uat-announcement'], forceLabelMeta: firstLaunch, contentPrefix: '請處理下列遊戲 UAT／測試環境排程：' },
            { idPrefix: 'game_prod', eventType: 'prod-launch', at: launchAt, meta: firstLaunch ? GAME_FIRST_LAUNCH_META : GAME_ONLINE_META, forceLabelMeta: firstLaunch, contentPrefix: '遊戲於今日上線：' }
          );
        }
      } else {
        definitions = [{
          idPrefix: 'game_prod', eventType: 'prod-launch', at: launchAt,
          meta: GAME_ONLINE_META, contentPrefix: '遊戲於今日上線：'
        }];
      }
      return definitions.map((definition) => {
        const dateKey = toDateKey(definition.at);
        return {
          ...definition,
          id: `${definition.idPrefix}_${dateKey}_${gameScheduleDocSuffix(normalizedGame)}`,
          dateKey,
          game: normalizedGame
        };
      });
    });

    const batch = scheduleDb.batch();
    const syncedAt = firebase.firestore.FieldValue.serverTimestamp();
    const actor = { id: 'google-game-sheet', code: 'SYNC', name: 'Google 遊戲上線表' };
    const desiredScheduleIds = new Set(rows.map((row) => row.id));

    changes.forEach((change) => {
      const changeRef = scheduleGameChangeCollection.doc();
      batch.set(changeRef, {
        ...change,
        changedAt: syncedAt,
        source: 'google-game-sheet'
      });
    });

    scheduleList
      .filter((item) => item.source === 'google-game-sheet'
        && !desiredScheduleIds.has(item.id))
      .forEach((item) => batch.delete(scheduleCollection.doc(item.id)));

    [GAME_EVENT_META['pm-confirmation'], GAME_EVENT_META['marketing-material'], GAME_EVENT_META['uat-announcement'], GAME_ONLINE_META, GAME_FIRST_LAUNCH_UAT_META, GAME_FIRST_LAUNCH_META, GAME_EXCLUSIVE_META]
      .filter((meta) => !labelList.some((label) => label.id === meta.labelId))
      .forEach((meta) => batch.set(scheduleLabelCollection.doc(meta.labelId), {
        name: meta.labelName,
        color: meta.color,
        updatedAt: syncedAt,
        source: 'google-game-sheet'
      }, { merge: true }));
    [GAME_EVENT_META['uat-announcement'], GAME_ONLINE_META].forEach((meta) => {
      batch.set(scheduleLabelCollection.doc(meta.labelId), {
        name: meta.labelName,
        updatedAt: syncedAt
      }, { merge: true });
    });
    batch.delete(scheduleLabelCollection.doc('google-game-first-exclusive'));

    rows.forEach((row) => {
      const displayMeta = resolveSavedScheduleMeta(row.meta);
      const existingItem = scheduleList.find((item) => item.id === row.id);
      const payload = {
        eventType: row.eventType,
        date: row.dateKey,
        title: row.titlePrefix
          ? `${row.titlePrefix}｜${getGameTitle([row.game])}`
          : row.forceLabelMeta ? `${displayMeta.labelName}｜${getGameTitle([row.game])}` : existingItem?.title || `${displayMeta.labelName}｜${getGameTitle([row.game])}`,
        content: row.game.note1
          ? `備註 1：${row.game.note1}\n\n${row.contentPrefix}\n${gameLine(row.game)}`
          : `${row.contentPrefix}\n${gameLine(row.game)}`,
        reminderAt: firebase.firestore.Timestamp.fromDate(row.at),
        labelId: row.forceLabelMeta ? displayMeta.labelId : existingItem?.labelId || displayMeta.labelId,
        labelName: row.forceLabelMeta ? displayMeta.labelName : canonicalScheduleLabelName(existingItem?.labelName) || displayMeta.labelName,
        labelColor: existingItem?.labelColor || displayMeta.color,
        repeat: existingItem?.repeat || 'none',
        staffIds: [],
        staffNames: [],
        deleted: false,
        source: 'google-game-sheet',
        games: [row.game],
        updatedAt: syncedAt,
        updatedBy: actor
      };
      if (row.endAt) payload.endAt = firebase.firestore.Timestamp.fromDate(row.endAt);
      batch.set(scheduleCollection.doc(row.id), payload, { merge: true });
    });

    await batch.commit();
    gameScheduleLastFailed = false;
    setStatus(`遊戲排程同步完成：已更新 ${rows.length} 筆，記錄 ${changes.length} 項後續變更。`, 'success');
  } catch (error) {
    gameScheduleLastFailed = true;
    console.error('同步遊戲排程失敗：', error);
    setStatus(`同步遊戲排程失敗：${error.message || error}`, 'error');
  } finally {
    gameScheduleSyncing = false;
    syncGameScheduleButton?.removeAttribute('disabled');
    if (syncGameScheduleButton) syncGameScheduleButton.textContent = '🔄 同步遊戲排程';
    startGameScheduleCountdown();
  }
};

const startAutomaticGameScheduleSync = () => {
  if (!scheduleDataLoaded || !canEditSchedule || gameScheduleAutoTimer) return;
  startGameScheduleCountdown(800);
  window.setTimeout(() => syncGameSchedules(), 800);
  gameScheduleAutoTimer = window.setInterval(() => syncGameSchedules(), GAME_SCHEDULE_SYNC_INTERVAL_MS);
};

const formatGameChangeTime = (value) => {
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return '剛剛';
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
};

const closeGameChangeLog = () => {
  gameChangeLogModalEl?.classList.remove('is-open');
  gameChangeLogModalEl?.setAttribute('aria-hidden', 'true');
};

const openGameChangeLog = async () => {
  gameChangeLogModalEl?.classList.add('is-open');
  gameChangeLogModalEl?.setAttribute('aria-hidden', 'false');
  if (!gameChangeLogListEl || !scheduleGameChangeCollection) return;
  gameChangeLogListEl.innerHTML = '<p class="history-empty">載入中...</p>';
  try {
    const snapshot = await scheduleGameChangeCollection.orderBy('changedAt', 'desc').limit(100).get();
    if (snapshot.empty) {
      gameChangeLogListEl.innerHTML = '<p class="history-empty">目前沒有偵測到試算表變更。</p>';
      return;
    }
    const visibleChanges = snapshot.docs
      .map((doc) => doc.data())
      .filter((change) => !isGameIdLookupFailure(change.newValue));
    if (!visibleChanges.length) {
      gameChangeLogListEl.innerHTML = '<p class="history-empty">目前沒有有效的試算表變更。</p>';
      return;
    }
    gameChangeLogListEl.innerHTML = visibleChanges.map((change) => {
      const gameTitle = `${change.gameId || '—'}${change.gameName ? `（${change.gameName}）` : ''}`;
      return `<article class="game-change-log-item">
        <div class="game-change-log-heading"><strong>${escapeHtml(gameTitle)}</strong><time>${escapeHtml(formatGameChangeTime(change.changedAt))}</time></div>
        <p><b>${escapeHtml(change.fieldLabel || '資料')}</b></p>
        <div class="game-change-values"><span><small>更改前</small>${escapeHtml(change.oldValue || '（空白）')}</span><i>→</i><strong><small>更改後</small>${escapeHtml(change.newValue || '（空白）')}</strong></div>
      </article>`;
    }).join('');
  } catch (error) {
    console.error('讀取試算表變更紀錄失敗：', error);
    gameChangeLogListEl.innerHTML = '<p class="history-empty">變更紀錄載入失敗，請稍後再試。</p>';
  }
};

const setStatus = (message, type = 'info') => {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.type = type;
  statusEl.hidden = type !== 'error';
};

const setMessage = (message, type = 'error') => {
  if (!messageEl) return;
  messageEl.textContent = message;
  messageEl.dataset.type = type;
  messageEl.hidden = !message;
};

const getVisibleRange = () => {
  if (viewMode === 'year') {
    const start = new Date(currentDate.getFullYear(), 0, 1);
    const end = new Date(currentDate.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { start, end };
  }
  if (viewMode === 'week') {
    const start = new Date(currentDate);
    start.setDate(currentDate.getDate() - currentDate.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  end.setDate(end.getDate() + (6 - end.getDay()));
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getRepeatStepDays = (item) => {
  if (item.repeat === 'daily') return 1;
  if (item.repeat === 'weekly') return 7;
  if (item.repeat === 'custom') return Math.max(1, Number(item.repeatInterval) || 1);
  return 0;
};

const getScheduleOccurrencesByDay = (start, end) => scheduleList.filter((item) => !item.deleted && scheduleMatchesActiveLabel(item)).reduce((groups, item) => {
  const original = parseDateValue(item.reminderAt) || new Date(`${item.date}T00:00:00`);
  if (!(original instanceof Date) || Number.isNaN(original.getTime())) return groups;
  const legacyEndDate = String(item.endDate || '').trim();
  const parsedEnd = parseDateValue(item.endAt) ||
    (/^\d{4}-\d{2}-\d{2}$/.test(legacyEndDate) ? new Date(`${legacyEndDate}T23:59:59`) : original);
  const rangeDays = Math.max(0, Math.min(366, daysBetween(original, parsedEnd)));
  const addOccurrence = (date, isRepeat) => {
    for (let offset = 0; offset <= rangeDays; offset += 1) {
      const rangeDate = new Date(date);
      rangeDate.setDate(date.getDate() + offset);
      if (rangeDate < start || rangeDate > end) continue;
      const key = toDateKey(rangeDate);
      groups[key] ||= [];
      groups[key].push({
        ...item,
        occurrenceDate: key,
        isRepeatOccurrence: isRepeat,
        hasOccurred: rangeDate.getTime() <= Date.now(),
        rangeOffset: offset,
        rangeDays,
        rangeWeekStart: rangeDate.getDay() === 0,
        rangeWeekEnd: rangeDate.getDay() === 6
      });
    }
  };
  const originalRangeEnd = new Date(original);
  originalRangeEnd.setDate(original.getDate() + rangeDays);
  if (original <= end && originalRangeEnd >= start) addOccurrence(original, false);
  const repeat = item.repeat || 'none';
  if (repeat === 'monthly') {
    for (let i = 1, occurrence = addMonthsClamped(original, i); occurrence <= end; i += 1, occurrence = addMonthsClamped(original, i)) {
      if (occurrence >= start) addOccurrence(occurrence, true);
    }
    return groups;
  }
  const step = getRepeatStepDays(item);
  if (!step) return groups;
  const firstOffset = Math.max(step, Math.ceil(Math.max(1, daysBetween(original, start)) / step) * step);
  for (let offset = firstOffset; ; offset += step) {
    const occurrence = new Date(original);
    occurrence.setDate(original.getDate() + offset);
    if (occurrence > end) break;
    if (occurrence >= start) addOccurrence(occurrence, true);
  }
  return groups;
}, {});

const normalizeLabelName = (name = '') => canonicalScheduleLabelName(name);

const getUniqueLabels = () => {
  const seen = new Set();
  return labelList
    .map((label) => ({ ...label, name: normalizeLabelName(label.name) }))
    .filter((label) => {
      if (!label.name || seen.has(label.name)) return false;
      seen.add(label.name);
      return true;
    })
    .sort((a, b) => {
      const aIndex = LABEL_CATEGORY_ORDER.indexOf(a.name);
      const bIndex = LABEL_CATEGORY_ORDER.indexOf(b.name);
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
      }
      return a.name.localeCompare(b.name, 'zh-Hant');
    });
};

const renderSavedLabels = () => {
  if (!labelCategorySelect) return;
  const previousValue = labelCategorySelect.value;
  const options = getUniqueLabels()
    .map((label) => `<option value="${escapeHtml(label.id || label.name)}" data-color="${escapeHtml(label.color || '#3b82f6')}" data-name="${escapeHtml(label.name)}">${escapeHtml(label.name)}</option>`)
    .join('');
  labelCategorySelect.innerHTML = `<option value="">自訂／新增標籤</option>${options}`;
  if ([...labelCategorySelect.options].some((option) => option.value === previousValue)) {
    labelCategorySelect.value = previousValue;
  }
  updateDeleteLabelButton();
};

function updateDeleteLabelButton() {
  if (!deleteScheduleLabelButton) return;
  const selectedLabel = labelList.find((label) => label.id === labelCategorySelect?.value);
  deleteScheduleLabelButton.hidden = !canEditSchedule || !selectedLabel;
  deleteScheduleLabelButton.dataset.labelId = selectedLabel?.id || '';
  deleteScheduleLabelButton.setAttribute('aria-label', selectedLabel ? `刪除類別「${normalizeLabelName(selectedLabel.name)}」` : '刪除選取的類別');
}

const renderLabelFilter = () => {
  if (!labelFilterSelect) return;
  const previousValue = activeLabelFilter;
  const options = getUniqueLabels()
    .map((label) => {
      const value = label.id || label.name;
      const selected = value === previousValue ? 'selected' : '';
      const color = escapeHtml(label.color || '#3b82f6');
      return `<option value="${escapeHtml(value)}" data-name="${escapeHtml(label.name)}" data-color="${color}" style="color:${color}" ${selected}>● ${escapeHtml(label.name)}</option>`;
    }).join('');
  labelFilterSelect.innerHTML = `<option value="">全部標籤</option>${options}`;
  const stillExists = !previousValue || [...labelFilterSelect.options].some((option) => option.value === previousValue);
  activeLabelFilter = stillExists ? previousValue : '';
  labelFilterSelect.value = activeLabelFilter;
  if (!stillExists) renderCalendar();
};

const scheduleMatchesActiveLabel = (item) => {
  if (!activeLabelFilter) return true;
  const selectedOption = labelFilterSelect?.selectedOptions?.[0];
  const selectedName = selectedOption?.dataset?.name || '';
  return item.labelId === activeLabelFilter || item.labelName === selectedName || item.labelName === activeLabelFilter;
};

const scheduleHistoryFields = [
  ['title', '標題'],
  ['content', '內容'],
  ['reminderAt', '提醒時間'],
  ['endAt', '結束時間'],
  ['labelName', '標籤名稱'],
  ['labelColor', '標籤顏色'],
  ['repeat', '重複提醒'],
  ['repeatInterval', '自訂間隔天數']
];
const historyValue = (key, value) => {
  if (value == null || value === '') return '（空白）';
  if (typeof value === 'object' && typeof value.toDate !== 'function' && !(value instanceof Date)) return '（空白）';
  if (key === 'reminderAt') {
    const date = parseDateValue(value);
    return date ? date.toLocaleString('zh-TW', { hour12: false }) : String(value);
  }
  if (key === 'endAt') {
    const date = parseDateValue(value);
    return date ? date.toLocaleString('zh-TW', { hour12: false }) : String(value);
  }
  const repeatLabels = { none: '不重複', daily: '每天', weekly: '每週', monthly: '每月', custom: '自訂' };
  if (key === 'repeat') return repeatLabels[value] || String(value);
  return String(value);
};
const buildScheduleChanges = (before, after) => scheduleHistoryFields.flatMap(([key, label]) => {
  const oldValue = historyValue(key, before?.[key]);
  const newValue = historyValue(key, after?.[key]);
  return oldValue === newValue ? [] : [{ field: label, oldValue, newValue }];
});
const renderHistory = (history = []) => {
  if (!historyListEl) return;
  historyListEl.innerHTML = history.length
    ? history.slice().reverse().map((entry) => {
      const time = parseDateValue(entry.at);
      const changes = Array.isArray(entry.changes) && entry.changes.length
        ? `<div class="schedule-history-changes">${entry.changes.map((change) => `<p><b>${escapeHtml(change.field || '欄位')}</b><span>${escapeHtml(change.oldValue || '（空白）')}</span><i>→</i><strong>${escapeHtml(change.newValue || '（空白）')}</strong></p>`).join('')}</div>`
        : '<small>舊紀錄未保存修改內容</small>';
      return `<div class="history-item"><span>${escapeHtml(time ? time.toLocaleString('zh-TW', { hour12: false }) : '—')}</span><strong>${escapeHtml(entry.userName || '未記錄')}</strong><em>${escapeHtml(entry.action || '編輯')}</em>${changes}</div>`;
    }).join('')
    : '<p class="history-empty">尚無歷程</p>';
};

const getDayCountBackground = (items = []) => {
  const colors = [...new Set(items
    .map((item) => String(item.labelColor || '').trim())
    .filter((color) => /^#[0-9a-f]{6}$/i.test(color)))];
  if (!colors.length) return '#3b82f6';
  if (colors.length === 1) return colors[0];
  const segment = 100 / colors.length;
  const stops = colors.map((color, index) =>
    `${color} ${index * segment}% ${(index + 1) * segment}%`);
  return `conic-gradient(${stops.join(', ')})`;
};

const calendarEventClass = (item = {}) => {
  const classes = ['calendar-event'];
  if (!item.hasOccurred) classes.push('is-repeat');
  if (item.rangeDays > 0) {
    classes.push('is-range');
    if (item.rangeOffset === 0) classes.push('is-range-start');
    else if (item.rangeOffset === item.rangeDays) classes.push('is-range-end');
    else classes.push('is-range-middle');
    if (item.rangeWeekStart) classes.push('is-range-week-start');
    if (item.rangeWeekEnd) classes.push('is-range-week-end');
  }
  return classes.join(' ');
};

const calendarEventHtml = (item = {}) => `<span class="${calendarEventClass(item)}" data-id="${escapeHtml(item.id)}" style="--event-color:${escapeHtml(item.labelColor)}"><i></i><span>${escapeHtml(item.title)}</span></span>`;

const sortCalendarItems = (a, b) =>
  Number(b.rangeDays > 0) - Number(a.rangeDays > 0) ||
  String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant');

const renderCalendar = () => {
  if (!calendarEl) return;
  const today = new Date();
  const mobileMonthAgenda = viewMode === 'month' && window.matchMedia('(max-width: 560px)').matches;
  calendarEl.classList.toggle('is-year-view', viewMode === 'year');
  calendarEl.classList.toggle('is-month-view', viewMode === 'month');
  calendarEl.classList.toggle('is-week-view', viewMode === 'week');
  calendarEl.classList.toggle('is-mobile-month-agenda', mobileMonthAgenda);
  const { start, end } = getVisibleRange();
  const schedulesByDay = getScheduleOccurrencesByDay(start, end);
  const days = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) days.push(new Date(cursor));

  if (periodLabel) {
    periodLabel.textContent = viewMode === 'week'
      ? `${toDateKey(start)} ~ ${toDateKey(end)}`
      : viewMode === 'year'
        ? `${currentDate.getFullYear()} 年`
        : `${currentDate.getFullYear()}年${pad(currentDate.getMonth() + 1)}月`;
  }
  renderPeriodPicker();
  if (selectedDateEl) selectedDateEl.textContent = toDateKey(selectedDate);

  if (viewMode === 'year') {
    calendarEl.innerHTML = Array.from({ length: 12 }, (_, index) => {
      const monthItems = days.filter((day) => day.getMonth() === index).flatMap((day) => schedulesByDay[toDateKey(day)] || []);
      return `<button class="calendar-month-card ${index === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear() ? 'is-current' : ''}" type="button" data-month="${index}"><strong>${index + 1}月</strong><span>${monthItems.length} 筆排程</span></button>`;
    }).join('');
    return;
  }

  if (mobileMonthAgenda) {
    calendarEl.innerHTML = days
      .filter((day) => day.getMonth() === currentDate.getMonth())
      .map((day) => {
        const key = toDateKey(day);
        const items = (schedulesByDay[key] || []).sort(sortCalendarItems);
        const count = items.length > 2 ? `<span class="mobile-agenda-more">＋${items.length - 2}</span>` : '';
        const events = items.slice(0, 2).map(calendarEventHtml).join('');
        return `<button class="calendar-day mobile-agenda-day weekday-${day.getDay()} ${isSameDay(day, today) ? 'is-today' : ''} ${isSameDay(day, selectedDate) ? 'is-selected' : ''}" type="button" data-date="${key}" data-item-count="${items.length}">
          <span class="mobile-agenda-date"><strong>${day.getDate()}</strong><small>週${weekdays[day.getDay()]}</small></span>
          <span class="day-events">${events || '<span class="mobile-agenda-empty">沒有排程</span>'}</span>${count}
        </button>`;
      }).join('');
    return;
  }
  
  const header = weekdays.map((day, index) => `<div class="calendar-weekday weekday-${index}">${day}</div>`).join('');
  const cells = days.map((day) => {
    const key = toDateKey(day);
    const items = (schedulesByDay[key] || []).sort(sortCalendarItems);
    const otherMonth = day.getMonth() !== currentDate.getMonth() && viewMode === 'month';
    const countBadgeBackground = getDayCountBackground(items);
    const countBadge = items.length > 2
      ? `<span class="day-count" style="--day-count-bg:${escapeHtml(countBadgeBackground)}" title="點擊查看本日全部 ${items.length} 則事項">${items.length}</span>`
      : '';
    const visibleItems = items.slice(0, 2);
    return `<button class="calendar-day weekday-${day.getDay()} ${otherMonth ? 'is-muted' : ''} ${isSameDay(day, today) ? 'is-today' : ''} ${isSameDay(day, selectedDate) ? 'is-selected' : ''}" type="button" data-date="${key}" data-item-count="${items.length}">
      <span class="day-heading"><span class="day-number">${day.getDate()}</span>${countBadge}</span>
      <span class="day-events" aria-label="本日 ${items.length} 則事項">${visibleItems.map(calendarEventHtml).join('')}</span>
    </button>`;
  }).join('');
  calendarEl.innerHTML = header + cells;
};

let scheduleResizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(scheduleResizeFrame);
  scheduleResizeFrame = requestAnimationFrame(renderCalendar);
});

const subscribeLeave = () => {
  unsubscribeLeave?.();
  if (!scheduleLeaveCollection) return;
  unsubscribeLeave = scheduleLeaveCollection.doc(toMonthKey(selectedDate)).onSnapshot((doc) => { leaveData = doc.exists ? { records: {}, ...doc.data() } : { records: {} }; });
};


const getDayScheduleItems = (dateKey) => {
  const start = new Date(`${dateKey}T00:00:00`);
  const end = new Date(`${dateKey}T23:59:59.999`);
  return (getScheduleOccurrencesByDay(start, end)[dateKey] || [])
    .sort((a, b) => {
      const aTime = parseDateValue(a.reminderAt)?.getTime() || 0;
      const bTime = parseDateValue(b.reminderAt)?.getTime() || 0;
      return aTime - bTime || String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant');
    });
};

const openDayAgenda = (dateKey) => {
  if (!dayAgendaModalEl || !dayAgendaListEl) return;
  const items = getDayScheduleItems(dateKey);
  if (dayAgendaTitleEl) dayAgendaTitleEl.textContent = `${dateKey}｜共 ${items.length} 則排程`;
  dayAgendaModalEl.dataset.date = dateKey;
  if (addDayScheduleButton) addDayScheduleButton.hidden = !canEditSchedule;
  dayAgendaListEl.innerHTML = items.length
    ? items.map((item) => {
      const at = parseDateValue(item.reminderAt);
      const time = at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '—';
      return `<button class="day-agenda-item" type="button" data-id="${escapeHtml(item.id)}" style="--event-color:${escapeHtml(item.labelColor || '#3b82f6')}">
        <i></i><time>${time}</time><span><strong>${escapeHtml(item.title || '未命名排程')}</strong><small>${escapeHtml(item.content || '')}</small></span>
      </button>`;
    }).join('')
    : '<p class="history-empty">本日沒有排程</p>';
  dayAgendaModalEl.classList.add('is-open');
  dayAgendaModalEl.setAttribute('aria-hidden', 'false');
};

const closeDayAgenda = () => {
  dayAgendaModalEl?.classList.remove('is-open');
  dayAgendaModalEl?.setAttribute('aria-hidden', 'true');
};
addDayScheduleButton?.addEventListener('click', () => {
  const dateKey = dayAgendaModalEl?.dataset.date;
  if (!dateKey || !canEditSchedule) return;
  closeDayAgenda();
  openModal(dateKey);
});

const openScheduleFromQuery = () => {
  const id = new URLSearchParams(window.location.search).get('id');
  if (!id || editingId === id || modalEl?.classList.contains('is-open')) return;
  const item = scheduleList.find((entry) => entry.id === id && !entry.deleted);
  if (!item) return;
  const at = parseDateValue(item.reminderAt) || new Date(`${item.date}T09:00`);
  currentDate = new Date(at);
  selectedDate = new Date(at);
  openModal(toDateKey(at), id);
};

const subscribeSchedules = () => {
  unsubscribeSchedules?.();
  if (!scheduleCollection) return;
  setStatus('載入資料中...', 'info');
  unsubscribeSchedules = scheduleCollection.onSnapshot((snapshot) => {
    scheduleList = snapshot.docs.map((doc) => {
      const data = doc.data();
      const reminder = parseDateValue(data.reminderAt);
      return { id: doc.id, ...data, date: data.date || (reminder ? toDateKey(reminder) : doc.id.slice(0, 10)), labelName: getScheduleDisplayLabel(data), labelColor: getScheduleDisplayColor(data), title: getScheduleDisplayTitle(data), history: data.history || [] };
    });
    scheduleDataLoaded = true;
    startAutomaticGameScheduleSync();
    renderCalendar();
    openScheduleFromQuery();
    setStatus('資料已載入。', 'success');
  }, (error) => { console.error('讀取排程失敗：', error); setStatus('讀取資料失敗。', 'error'); });
};

const subscribeLabels = () => {
  unsubscribeLabels?.();
  if (!scheduleLabelCollection) return;
  unsubscribeLabels = scheduleLabelCollection.orderBy('updatedAt', 'desc').onSnapshot((snapshot) => {
    labelList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderSavedLabels();
    renderLabelFilter();
  }, (error) => console.error('讀取標籤失敗：', error));
};

const openModal = (dateKey, scheduleId = null) => {
  editingId = scheduleId;
  const item = scheduleList.find((entry) => entry.id === scheduleId);
  formEl.reset();
  setMessage('');
  modalTitleEl.textContent = item ? '編輯排程' : '新增排程';
  deleteButton.hidden = !item || !canDeleteSchedule;
  colorInput.value = item?.labelColor || '#3b82f6';
  labelNameInput.value = item?.labelName || '';
  if (labelCategorySelect) {
    const matchedLabel = labelList.find((label) =>
      label.name === (item?.labelName || '') && label.color === (item?.labelColor || '#3b82f6'));
    labelCategorySelect.value = matchedLabel?.id || '';
    selectedScheduleLabelId = matchedLabel?.id || '';
  }
  document.querySelector('#scheduleTitle').value = item?.title || '';
  document.querySelector('#scheduleContent').value = item?.content || '';
  document.querySelector('#scheduleReminderAt').value = toDatetimeLocal(item?.reminderAt ? parseDateValue(item.reminderAt) : new Date(`${dateKey}T09:00`));
  const legacyEndAt = item?.endDate
    ? new Date(`${item.endDate}T${pad((parseDateValue(item?.reminderAt) || new Date()).getHours())}:${pad((parseDateValue(item?.reminderAt) || new Date()).getMinutes())}`)
    : null;
  const scheduleEndAt = parseDateValue(item?.endAt) || legacyEndAt;
  document.querySelector('#scheduleEndAt').value = scheduleEndAt ? toDatetimeLocal(scheduleEndAt) : '';
  repeatSelect.value = item?.repeat || 'none';
  repeatIntervalInput.value = item?.repeatInterval || 1;
  toggleRepeatInterval();
  renderHistory(item?.history || []);
  const isPmConfirmation = item?.source === 'google-game-sheet' && item?.eventType === 'pm-confirmation';
  const isFirstLaunch = isFirstLaunchSchedule(item);
  if (gamePmConfirmedLabel) gamePmConfirmedLabel.hidden = !isPmConfirmation;
  if (firstLaunchOtherPlatform) firstLaunchOtherPlatform.hidden = !isFirstLaunch;
  if (firstLaunchOtherPlatformEnabled) firstLaunchOtherPlatformEnabled.checked = Boolean(item?.otherPlatformEnabled);
  if (firstLaunchOtherPlatformUatDate) firstLaunchOtherPlatformUatDate.value = item?.otherPlatformUatDate || '';
  if (firstLaunchOtherPlatformProdDate) firstLaunchOtherPlatformProdDate.value = item?.otherPlatformProdDate || '';
  if (firstLaunchOtherPlatformDates) firstLaunchOtherPlatformDates.hidden = !firstLaunchOtherPlatformEnabled?.checked;
  if (firstLaunchOtherPlatformUatDate) firstLaunchOtherPlatformUatDate.required = isFirstLaunch && Boolean(firstLaunchOtherPlatformEnabled?.checked);
  if (firstLaunchOtherPlatformProdDate) firstLaunchOtherPlatformProdDate.required = isFirstLaunch && Boolean(firstLaunchOtherPlatformEnabled?.checked);
  if (gamePmConfirmedInput) {
    gamePmConfirmedInput.checked = Boolean(item?.pmConfirmedAt);
    gamePmConfirmedInput.disabled = !canEditSchedule;
  }
  formEl?.querySelectorAll('input, textarea, select').forEach((control) => { control.disabled = !canEditSchedule; });
  document.querySelector('#saveScheduleButton')?.toggleAttribute('hidden', !canEditSchedule);
  document.querySelector('#saveScheduleButton')?.toggleAttribute('disabled', !canEditSchedule);
  scheduleFormInitialSnapshot = serializeScheduleForm();
  modalEl.classList.add('is-open');
  modalEl.setAttribute('aria-hidden', 'false');
};

const serializeScheduleForm = () => JSON.stringify(
  [...formEl.querySelectorAll('input, textarea, select')].map((control) => ({
    key: control.name || control.id,
    type: control.type || control.tagName,
    value: control.type === 'checkbox' || control.type === 'radio' ? control.checked : control.value
  }))
);

const hasUnsavedScheduleChanges = () =>
  modalEl?.classList.contains('is-open') &&
  scheduleFormInitialSnapshot !== serializeScheduleForm();

const closeModal = (force = false) => {
  if (!force && hasUnsavedScheduleChanges() && !window.confirm('尚有未儲存的排程內容，確定要放棄嗎？')) return false;
  modalEl.classList.remove('is-open');
  modalEl.setAttribute('aria-hidden', 'true');
  editingId = null;
  scheduleFormInitialSnapshot = '';
  return true;
};

const showSpecials = (type, anchor) => {
  if (!tooltipEl) return;
  const names = Object.entries(leaveData.records || {}).filter(([, record]) => (record.specials || []).includes(type)).map(([key]) => {
    const [staffId, day] = key.split('_');
    if (Number(day) !== selectedDate.getDate()) return '';
    return staffList.find((staff) => staff.id === staffId)?.name;
  }).filter(Boolean);
  tooltipEl.innerHTML = `<strong>${type === 'phone' ? '📱 值公務機' : '🎰 公司活動'}｜${escapeHtml(toDateKey(selectedDate))}</strong><p>${names.length ? names.map(escapeHtml).join('、') : '當天沒有名單'}</p>`;
  const rect = anchor.getBoundingClientRect();
  tooltipEl.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
  tooltipEl.style.top = `${rect.bottom + 8}px`;
  tooltipEl.hidden = false;
};

const saveLabelIfNeeded = async (name, color, selectedLabelId = '') => {
  const normalizedName = normalizeLabelName(name);
  if (!scheduleLabelCollection || !normalizedName) return;
  const selectedLabel = labelList.find((label) => label.id === selectedLabelId);
  if (selectedLabel) {
    if (selectedLabel.color === color && selectedLabel.name === normalizedName) return;
    await scheduleLabelCollection.doc(selectedLabel.id).set({
      name: normalizedName,
      color,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return;
  }
  const existing = labelList.find((label) => normalizeLabelName(label.name) === normalizedName);
  if (existing) {
    if (existing.color === color && existing.name === normalizedName) return;
    await scheduleLabelCollection.doc(existing.id).set({
      name: normalizedName,
      color,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return;
  }
  await scheduleLabelCollection.add({
    name: normalizedName,
    color,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
};


const toggleRepeatInterval = () => {
  if (!repeatIntervalLabel || !repeatSelect) return;
  repeatIntervalLabel.hidden = repeatSelect.value !== 'custom';
  repeatIntervalInput.required = repeatSelect.value === 'custom';
};

const renderPeriodPicker = () => {
  if (!yearSelect || !monthPicker) return;
  const year = currentDate.getFullYear();
  yearSelect.innerHTML = Array.from({ length: 21 }, (_, index) => year - 10 + index)
    .map((optionYear) => `<option value="${optionYear}" ${optionYear === year ? 'selected' : ''}>${optionYear}年</option>`).join('');
  monthPicker.innerHTML = Array.from({ length: 12 }, (_, index) => `<button class="month-picker-button ${index === currentDate.getMonth() ? 'is-active' : ''}" type="button" data-month="${index}">${index + 1}月</button>`).join('');
};

const closePeriodPicker = () => {
  if (!periodPicker) return;
  periodPicker.hidden = true;
  periodLabel?.setAttribute('aria-expanded', 'false');
};

const toggleFirstLaunchOtherPlatformDates = () => {
  const enabled = Boolean(firstLaunchOtherPlatformEnabled?.checked);
  if (firstLaunchOtherPlatformDates) firstLaunchOtherPlatformDates.hidden = !enabled;
  if (firstLaunchOtherPlatformUatDate) firstLaunchOtherPlatformUatDate.required = enabled;
  if (firstLaunchOtherPlatformProdDate) firstLaunchOtherPlatformProdDate.required = enabled;
};
firstLaunchOtherPlatformEnabled?.addEventListener('change', toggleFirstLaunchOtherPlatformDates);
repeatSelect?.addEventListener('change', toggleRepeatInterval);
periodLabel?.addEventListener('click', (event) => {
  event.stopPropagation();
  renderPeriodPicker();
  periodPicker.hidden = !periodPicker.hidden;
  periodLabel.setAttribute('aria-expanded', String(!periodPicker.hidden));
});
yearSelect?.addEventListener('change', () => { currentDate.setFullYear(Number(yearSelect.value)); selectedDate = new Date(currentDate); renderCalendar(); });
document.querySelector('#prevPickerYear')?.addEventListener('click', () => { currentDate.setFullYear(currentDate.getFullYear() - 1); selectedDate = new Date(currentDate); renderCalendar(); });
document.querySelector('#nextPickerYear')?.addEventListener('click', () => { currentDate.setFullYear(currentDate.getFullYear() + 1); selectedDate = new Date(currentDate); renderCalendar(); });
monthPicker?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-month]');
  if (!button) return;
  currentDate = new Date(currentDate.getFullYear(), Number(button.dataset.month), 1);
  selectedDate = new Date(currentDate);
  viewMode = viewMode === 'year' ? 'month' : viewMode;
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.view === viewMode));
  subscribeLeave();
  renderCalendar();
  closePeriodPicker();
});
document.addEventListener('click', (event) => { if (!event.target.closest('.schedule-period-picker-wrap')) closePeriodPicker(); });
calendarEl?.addEventListener('click', (event) => {
  const monthCard = event.target.closest('.calendar-month-card');
  if (!monthCard) return;
  currentDate = new Date(currentDate.getFullYear(), Number(monthCard.dataset.month), 1);
  selectedDate = new Date(currentDate);
  viewMode = 'month';
  document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item.dataset.view === 'month'));
  subscribeLeave();
  renderCalendar();
});

calendarEl?.addEventListener('click', (event) => {
  const eventEl = event.target.closest('.calendar-event');
  const dayEl = event.target.closest('.calendar-day');
  if (!dayEl) return;
  const dateKey = dayEl.dataset.date;
  const itemCount = Number(dayEl.dataset.itemCount || 0);
  selectedDate = new Date(`${dateKey}T00:00:00`);
  currentDate = viewMode === 'week' ? new Date(selectedDate) : currentDate;
  subscribeLeave();
  renderCalendar();
  if (eventEl && canEditSchedule) return openModal(dateKey, eventEl.dataset.id);
  if (itemCount > 2) return openDayAgenda(dateKey);
  if (canEditSchedule) openModal(dateKey);
});

labelCategorySelect?.addEventListener('change', () => {
  const option = labelCategorySelect.selectedOptions[0];
  selectedScheduleLabelId = option?.value || '';
  updateDeleteLabelButton();
  if (!option?.value) return;
  colorInput.value = option.dataset.color || '#3b82f6';
  labelNameInput.value = option.dataset.name || option.textContent || '';
});

deleteScheduleLabelButton?.addEventListener('click', async () => {
  const labelId = deleteScheduleLabelButton.dataset.labelId;
  const selectedLabel = labelList.find((label) => label.id === labelId);
  if (!canEditSchedule || !scheduleLabelCollection || !selectedLabel) return;
  const labelName = normalizeLabelName(selectedLabel.name);
  if (!window.confirm(`確定要刪除類別「${labelName}」嗎？\n\n只會刪除類別設定，既有排程不會被刪除。`)) return;
  deleteScheduleLabelButton.disabled = true;
  try {
    await scheduleLabelCollection.doc(labelId).delete();
    labelCategorySelect.value = '';
    selectedScheduleLabelId = '';
    if (normalizeLabelName(labelNameInput.value) === labelName) labelNameInput.value = '';
    updateDeleteLabelButton();
    setMessage(`已刪除類別「${labelName}」。`, 'success');
  } catch (error) {
    console.error('刪除排程類別失敗：', error);
    setMessage('刪除類別失敗，請稍後再試。', 'error');
  } finally {
    deleteScheduleLabelButton.disabled = false;
  }
});

const syncLabelCategorySelection = () => {
  if (!labelCategorySelect) return;
  if (labelList.some((label) => label.id === selectedScheduleLabelId)) return;
  const matchedLabel = labelList.find((label) =>
    label.name === labelNameInput.value.trim() && label.color === colorInput.value);
  labelCategorySelect.value = matchedLabel?.id || '';
  selectedScheduleLabelId = matchedLabel?.id || '';
};

colorInput?.addEventListener('input', syncLabelCategorySelection);
labelNameInput?.addEventListener('input', syncLabelCategorySelection);

labelFilterSelect?.addEventListener('change', () => { activeLabelFilter = labelFilterSelect.value; renderCalendar(); });

document.querySelector('#prevSchedulePeriod')?.addEventListener('click', () => { if (viewMode === 'year') currentDate.setFullYear(currentDate.getFullYear() - 1); else if (viewMode === 'month') currentDate.setMonth(currentDate.getMonth() - 1); else currentDate.setDate(currentDate.getDate() - 7); selectedDate = new Date(currentDate); subscribeLeave(); renderCalendar(); });
document.querySelector('#nextSchedulePeriod')?.addEventListener('click', () => { if (viewMode === 'year') currentDate.setFullYear(currentDate.getFullYear() + 1); else if (viewMode === 'month') currentDate.setMonth(currentDate.getMonth() + 1); else currentDate.setDate(currentDate.getDate() + 7); selectedDate = new Date(currentDate); subscribeLeave(); renderCalendar(); });
document.querySelector('#todaySchedulePeriod')?.addEventListener('click', () => { currentDate = new Date(); selectedDate = new Date(); subscribeLeave(); renderCalendar(); });
document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { viewMode = button.dataset.view; document.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('is-active', item === button)); currentDate = new Date(selectedDate); renderCalendar(); }));
document.querySelector('#phoneDutyButton')?.addEventListener('click', (event) => showSpecials('phone', event.currentTarget));
document.querySelector('#companyEventButton')?.addEventListener('click', (event) => showSpecials('event', event.currentTarget));
syncGameScheduleButton?.addEventListener('click', () => {
  scheduleMoreMenu?.removeAttribute('open');
  syncGameSchedules();
});
gameChangeLogButton?.addEventListener('click', () => {
  scheduleMoreMenu?.removeAttribute('open');
  openGameChangeLog();
});
document.querySelector('#closeGameChangeLog')?.addEventListener('click', closeGameChangeLog);
gameChangeLogModalEl?.addEventListener('click', (event) => {
  if (event.target === gameChangeLogModalEl) closeGameChangeLog();
});
document.querySelector('#closeScheduleModal')?.addEventListener('click', () => closeModal());
document.querySelector('#cancelScheduleButton')?.addEventListener('click', () => closeModal());
// 點擊視窗外部不關閉，避免新增／編輯中的內容意外消失。
modalEl?.addEventListener('click', (event) => {
  if (event.target === modalEl) event.preventDefault();
});
document.addEventListener('click', (event) => { if (tooltipEl && !tooltipEl.contains(event.target) && !event.target.closest('.schedule-special-trigger')) tooltipEl.hidden = true; });

const openScheduleHelp = () => {
  scheduleMoreMenu?.removeAttribute('open');
  scheduleHelpModalEl?.classList.add('is-open');
  scheduleHelpModalEl?.setAttribute('aria-hidden', 'false');
};

document.addEventListener('click', (event) => {
  if (scheduleMoreMenu?.hasAttribute('open') && !scheduleMoreMenu.contains(event.target)) {
    scheduleMoreMenu.removeAttribute('open');
  }
});

const closeScheduleHelp = () => {
  scheduleHelpModalEl?.classList.remove('is-open');
  scheduleHelpModalEl?.setAttribute('aria-hidden', 'true');
};

document.querySelector('#openScheduleHelp')?.addEventListener('click', openScheduleHelp);
document.querySelector('#closeScheduleHelp')?.addEventListener('click', closeScheduleHelp);
scheduleHelpModalEl?.addEventListener('click', (event) => {
  if (event.target === scheduleHelpModalEl) closeScheduleHelp();
});

window.addEventListener('beforeunload', () => {
  if (gameScheduleAutoTimer) window.clearInterval(gameScheduleAutoTimer);
  if (gameScheduleCountdownTimer) window.clearInterval(gameScheduleCountdownTimer);
});

document.querySelector('#closeDayAgendaModal')?.addEventListener('click', closeDayAgenda);
dayAgendaModalEl?.addEventListener('click', (event) => {
  if (event.target === dayAgendaModalEl) closeDayAgenda();
});
dayAgendaListEl?.addEventListener('click', (event) => {
  const item = event.target.closest('.day-agenda-item');
  if (!item || !canEditSchedule) return;
  closeDayAgenda();
  openModal(toDateKey(selectedDate), item.dataset.id);
});

formEl?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canEditSchedule) return setMessage('您沒有編輯權限。');
  if (!scheduleCollection) return setMessage('Firebase 尚未完成初始化，無法儲存排程。');
  const reminderAt = new Date(document.querySelector('#scheduleReminderAt').value);
  const endAtValue = document.querySelector('#scheduleEndAt').value;
  const endAt = endAtValue ? new Date(endAtValue) : null;
  const user = currentUser();
  const action = editingId ? '編輯' : '新增';
  const labelName = labelNameInput.value.trim();
  const labelColor = colorInput.value;
  const repeat = repeatSelect?.value || 'none';
  const repeatInterval = Math.max(1, Number(repeatIntervalInput?.value) || 1);
  const payload = {
    date: toDateKey(reminderAt), labelColor, labelName, repeat,
    title: document.querySelector('#scheduleTitle').value.trim(),
    content: document.querySelector('#scheduleContent').value.trim(),
    reminderAt: firebase.firestore.Timestamp.fromDate(reminderAt),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: user, deleted: false
  };
  if (endAt && endAt <= reminderAt) return setMessage('結束時間必須晚於提醒開始時間。');
  if (endAt) payload.endAt = firebase.firestore.Timestamp.fromDate(endAt);
  else if (editingId) payload.endAt = firebase.firestore.FieldValue.delete();
  if (editingId) payload.endDate = firebase.firestore.FieldValue.delete();
  if (repeat === 'custom') payload.repeatInterval = repeatInterval;
  else if (editingId) payload.repeatInterval = firebase.firestore.FieldValue.delete();
  if (!payload.title) return setMessage('請輸入標題。');
  const editingItem = scheduleList.find((entry) => entry.id === editingId);
  const isEditingFirstLaunch = isFirstLaunchSchedule(editingItem);
  const otherPlatformEnabled = isEditingFirstLaunch && Boolean(firstLaunchOtherPlatformEnabled?.checked);
  const otherPlatformUatDate = firstLaunchOtherPlatformUatDate?.value || '';
  const otherPlatformProdDate = firstLaunchOtherPlatformProdDate?.value || '';
  if (otherPlatformEnabled && (!otherPlatformUatDate || !otherPlatformProdDate)) {
    return setMessage('請完整填寫其他平台 UAT上線與 PROD上線日期。');
  }
  if (otherPlatformEnabled && otherPlatformProdDate < otherPlatformUatDate) {
    return setMessage('其他平台 PROD上線日期不能早於 UAT上線日期。');
  }
  if (isEditingFirstLaunch) {
    payload.otherPlatformEnabled = otherPlatformEnabled;
    payload.otherPlatformUatDate = otherPlatformEnabled ? otherPlatformUatDate : firebase.firestore.FieldValue.delete();
    payload.otherPlatformProdDate = otherPlatformEnabled ? otherPlatformProdDate : firebase.firestore.FieldValue.delete();
  }
  const changes = editingItem ? buildScheduleChanges(editingItem, { ...payload, reminderAt, endAt }) : [];
  payload.history = firebase.firestore.FieldValue.arrayUnion({
    action,
    userId: user.id,
    userName: user.name,
    at: firebase.firestore.Timestamp.fromDate(new Date()),
    changes
  });
  try {
    await saveLabelIfNeeded(labelName, labelColor, selectedScheduleLabelId);
    if (editingId) await scheduleCollection.doc(editingId).update(payload);
    else await scheduleCollection.add({ ...payload, createdBy: user, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    if (isEditingFirstLaunch) {
      await syncFirstLaunchOtherPlatformSchedules(
        editingItem,
        user,
        otherPlatformEnabled,
        otherPlatformUatDate,
        otherPlatformProdDate
      );
      if (otherPlatformEnabled) {
        setStatus('已建立／更新其他平台 UAT上線與 PROD上線排程。', 'success');
      }
    }
        if (editingItem?.source === 'google-game-sheet' && editingItem?.eventType === 'pm-confirmation' && gamePmConfirmedInput?.checked) {
      const createdCount = await createUatSchedules(editingItem, user);
      if (!createdCount) throw new Error('沒有可建立的 UAT 資料待辦。');
      const successMessage = `AM 已確認，已建立／更新 ${createdCount} 筆流程待辦（行銷素材＋UAT 上架公告＋PROD 上架公告）。`;
      setStatus(successMessage, 'success');
      window.alert(successMessage);
    }
    closeModal(true);
  } catch (error) { console.error('儲存排程失敗：', error); setMessage('儲存排程失敗，請稍後再試。'); }
});

deleteButton?.addEventListener('click', async () => {
  if (!canDeleteSchedule) return setMessage('您沒有刪除權限。');
  if (!editingId || !scheduleCollection || !confirm('確定要刪除此排程嗎？')) return;
  const user = currentUser();
  await scheduleCollection.doc(editingId).update({ deleted: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: user, history: firebase.firestore.FieldValue.arrayUnion({ action: '刪除', userId: user.id, userName: user.name, at: firebase.firestore.Timestamp.fromDate(new Date()) }) });
  closeModal(true);
});

if (!scheduleDb) setStatus('Firebase 尚未完成初始化，請確認 firebase-init.js 是否已載入。', 'error');
else {
  unsubscribeStaff = scheduleStaffCollection.orderBy('createdAt', 'desc').onSnapshot((snapshot) => { staffList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter(activeStaff); }, (error) => console.error('讀取人員資料失敗：', error));
  subscribeSchedules();
  subscribeLabels();
  subscribeLeave();
}

syncSchedulePermission();
renderCalendar();
window.addEventListener('beforeunload', () => { unsubscribeStaff?.(); unsubscribeSchedules?.(); unsubscribeLabels?.(); unsubscribeLeave?.(); });
