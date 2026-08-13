/**
 * Game List_Online → 藏經閣 JSON Feed
 *
 * 部署方式：
 * 1. 用有權限讀取 Game List_Online 的 Google 帳號建立 Apps Script 專案。
 * 2. 貼上此檔，部署為 Web App。
 * 3. 執行身分：我；存取權：任何人。
 * 4. 將部署後的 /exec URL 填入藏經閣的同步服務設定。
 */
const GAME_LIST_SPREADSHEET_ID = '1PzOvGUv5PWpx-1uLwg9gLOnMWPqH9ThuepaBv7Pu9lI';
const GAME_LIST_SHEET_NAME = 'GameList';
const GAME_LIST_START_ROW = 3;
const GAME_LIST_COLUMN_COUNT = 20;

function doGet(e) {
  if (String(e && e.parameter && e.parameter.feed || '') === 'leave') return leaveFeed_(e);
  try {
    const spreadsheet = SpreadsheetApp.openById(GAME_LIST_SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(GAME_LIST_SHEET_NAME);
    if (!sheet) throw new Error('找不到工作表：' + GAME_LIST_SHEET_NAME);

    const lastRow = sheet.getLastRow();
    const rows = lastRow < GAME_LIST_START_ROW
      ? []
      : sheet
          .getRange(
            GAME_LIST_START_ROW,
            1,
            lastRow - GAME_LIST_START_ROW + 1,
            GAME_LIST_COLUMN_COUNT
          )
          .getDisplayValues()
          .filter(function (row) {
            return String(row[1] || '').trim() !== '';
          });

    return jsonOutput_({
      success: true,
      spreadsheetId: GAME_LIST_SPREADSHEET_ID,
      sheetName: GAME_LIST_SHEET_NAME,
      syncedAt: new Date().toISOString(),
      rowCount: rows.length,
      rows: rows
    }, e);
  } catch (error) {
    return jsonOutput_({
      success: false,
      error: String(error && error.message ? error.message : error),
      syncedAt: new Date().toISOString()
    }, e);
  }
}

const LEAVE_ORIGIN = 'http://61.216.37.15:8080';
const LEAVE_STAFF = ['余中魁', '宋佳臻', '鄭晴心', '郭澄希', '熊茗雅'];
const LEAVE_ALIASES = {
  '余中魁':'余中魁','中魁':'余中魁',
  '宋佳臻':'宋佳臻','佳臻':'宋佳臻',
  '鄭晴心':'鄭晴心','晴心':'鄭晴心',
  '郭澄希':'郭澄希','澄希':'郭澄希',
  '熊茗雅':'熊茗雅','茗雅':'熊茗雅'
};

function fetchLeaveJson_(path) {
  const response = UrlFetchApp.fetch(LEAVE_ORIGIN + path, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(path + ' 回應 HTTP ' + response.getResponseCode());
  }
  return JSON.parse(response.getContentText('UTF-8'));
}

function firstNumber_(values) {
  for (var i = 0; i < values.length; i += 1) {
    var value = Number(values[i]);
    if (isFinite(value) && value >= 0) return value;
  }
  return null;
}

function leaveFeed_(e) {
  try {
    const month = String(e && e.parameter && e.parameter.month || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月份格式錯誤');
    const employeePayload = fetchLeaveJson_('/api/employees?month=' + encodeURIComponent(month));
    const leavePayload = fetchLeaveJson_('/api/leave/' + encodeURIComponent(month));
    const employees = Array.isArray(employeePayload) ? employeePayload : (employeePayload.data || employeePayload.employees || []);
    const leaveRoot = leavePayload.data || leavePayload.leaves || leavePayload.records || {};
    const people = {};

    employees.forEach(function (employee) {
      const rawName = String(employee.name || employee.fullName || employee.displayName || '').trim();
      const name = LEAVE_ALIASES[rawName];
      if (!name || LEAVE_STAFF.indexOf(name) < 0) return;
      const identifiers = [employee.id, employee._id, employee.employeeId, employee.employee_id, rawName, name]
        .filter(function (value) { return value !== undefined && value !== null && String(value) !== ''; });
      var sourceDays = {};
      for (var i = 0; i < identifiers.length; i += 1) {
        const candidate = leaveRoot[identifiers[i]] || leaveRoot[String(identifiers[i])];
        if (candidate && typeof candidate === 'object') { sourceDays = candidate.days || candidate; break; }
      }
      const days = {};
      Object.keys(sourceDays || {}).forEach(function (day) {
        if (!/^\d{1,2}$/.test(day)) return;
        const value = sourceDays[day] || {};
        const leaveValues = Array.isArray(value.leave) ? value.leave.filter(Boolean) : [];
        const text = [value.label, value.mark, value.symbol, value.note].concat(leaveValues).filter(Boolean).join(' ');
        const specials = [];
        if (/★|☆|公司活動|company.?activity|event/i.test(text)) specials.push('event');
        const record = { specials: specials };
        if (value.shift === 'red' || value.type === 'required') record.type = 'required';
        else if (value.shift === 'black' || value.type === 'leave' || leaveValues.length) record.type = 'leave';
        if (value.label && !/[★☆]/.test(String(value.label))) record.label = String(value.label);
        if (record.type || record.label || record.specials.length) days[String(Number(day))] = record;
      });
      people[name] = {
        fullName: name,
        shift: /晚/.test(String(employee.shift || employee.shiftName || '')) ? '晚' : '早',
        days: days
      };
    });

    LEAVE_STAFF.forEach(function (name) {
      if (!people[name]) people[name] = { fullName: name, shift: '早', days: {} };
    });
    const settings = leavePayload.settings || leavePayload.config || employeePayload.settings || employeePayload.config || {};
    const maxDays = firstNumber_([
      leavePayload.maxDays, leavePayload.max_days, leavePayload.quota, leavePayload.leaveQuota,
      leavePayload.availableDays, settings.maxDays, settings.max_days, settings.quota,
      employeePayload.maxDays, employeePayload.quota
    ]);
    return jsonOutput_({
      success: true,
      month: month,
      people: people,
      maxDays: maxDays,
      syncedAt: new Date().toISOString()
    }, e);
  } catch (error) {
    return jsonOutput_({
      success: false,
      error: String(error && error.message ? error.message : error),
      syncedAt: new Date().toISOString()
    }, e);
  }
}

function jsonOutput_(payload, event) {
  const callback = String(event && event.parameter && event.parameter.callback || '').trim();
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
