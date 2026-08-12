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
