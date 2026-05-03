/**
 * お役立ちフレーズ — Google Apps Script
 *
 * 役割:
 *  1. アプリからの POST を受け取り、「ログ」シートに 1 行追記（マスター）
 *  2. 生徒ごとに専用シートを自動作成し、生ログを追記
 *  3. メニュー「📊 学習レポート → サマリーを再集計」で:
 *     - 各生徒シートの上部に集計セクション（プロフィール / 全体スコア /
 *       カテゴリ別正答率 / つまずきフレーズ）を作成
 *     - 全生徒を横断で見る「サマリー」シートを更新
 *
 * 生徒の同一性は **email** で判定します（氏名が変わってもメアドが同じなら同一生徒）。
 * 生徒シート名は氏名を採用し、同名は (2), (3) … で衝突回避します。
 *
 * デプロイ手順は SPREADSHEET_SETUP.md を参照。
 */

const LOG_SHEET = 'ログ'
const SUMMARY_SHEET = 'サマリー'
const STUDENTS_INDEX_SHEET = '_students'  // メアド → シート名 のマッピング（隠しシート扱い）

const LOG_HEADERS = [
  'timestamp', 'sessionId', 'email', 'student',
  'mode', 'action',
  'categoryId', 'categoryTitle',
  'phraseId', 'ja', 'en',
  'userInput', 'correct', 'similarity',
  'receivedAt',
]
// Per-student log section starts at this row (above this is the summary section)
const STUDENT_LOG_START_ROW = 30

/* ----------------------------------------------------------------------
 * Web App entry points
 * --------------------------------------------------------------------*/

function doPost(e) {
  const lock = LockService.getDocumentLock()
  try {
    lock.waitLock(10 * 1000)
    const body = JSON.parse(e.postData.contents)
    appendMasterLog_(body)
    if (body.email && body.email !== '') {
      appendStudentLog_(body)
    }
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON)
  } finally {
    try { lock.releaseLock() } catch (_) {}
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'phrases-app' }))
    .setMimeType(ContentService.MimeType.JSON)
}

/* ----------------------------------------------------------------------
 * Master log
 * --------------------------------------------------------------------*/

function appendMasterLog_(b) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ensureLogSheet_(ss)
  const row = [
    b.timestamp || new Date().toISOString(),
    b.sessionId || '',
    (b.email || '').toLowerCase(),
    b.student || '',
    b.mode || '',
    b.action || '',
    b.categoryId,
    b.categoryTitle || '',
    b.phraseId,
    b.ja || '',
    b.en || '',
    b.userInput || '',
    b.correct === true ? true : b.correct === false ? false : '',
    typeof b.similarity === 'number' ? b.similarity : '',
    new Date().toISOString(),
  ]
  sheet.appendRow(row)
}

function ensureLogSheet_(ss) {
  let sheet = ss.getSheetByName(LOG_SHEET)
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET)
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
    sheet.setFrozenRows(1)
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold').setBackground('#e2e8f0')
    applyLogColumnWidths_(sheet)
  }
  return sheet
}

// 列幅プリセット（ログシート用）。LOG_HEADERS の順に対応。
const LOG_COL_WIDTHS = [180, 130, 220, 110, 60, 110, 80, 280, 70, 320, 320, 280, 70, 80, 180]
const LOG_WRAP_COLS = [8, 10, 11, 12]   // categoryTitle, ja, en, userInput

function applyLogColumnWidths_(sheet) {
  for (let i = 0; i < LOG_COL_WIDTHS.length; i++) {
    sheet.setColumnWidth(i + 1, LOG_COL_WIDTHS[i])
  }
  for (const col of LOG_WRAP_COLS) {
    sheet.getRange(1, col, sheet.getMaxRows(), 1).setWrap(true)
  }
}

// 列幅プリセット（生徒シート用）。学習ログ部分のヘッダーに合わせる。
// ヘッダー: timestamp, sessionId, mode, action, categoryId, categoryTitle, phraseId, ja, en, userInput, correct, similarity
const STUDENT_COL_WIDTHS = [180, 130, 70, 110, 80, 280, 70, 320, 320, 280, 70, 80]
const STUDENT_WRAP_COLS = [6, 8, 9, 10]  // categoryTitle, ja, en, userInput

function applyStudentColumnWidths_(sheet) {
  for (let i = 0; i < STUDENT_COL_WIDTHS.length; i++) {
    sheet.setColumnWidth(i + 1, STUDENT_COL_WIDTHS[i])
  }
  for (const col of STUDENT_WRAP_COLS) {
    sheet.getRange(1, col, sheet.getMaxRows(), 1).setWrap(true)
  }
}

/* ----------------------------------------------------------------------
 * Per-student sheet
 * --------------------------------------------------------------------*/

function appendStudentLog_(b) {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ensureStudentSheet_(ss, b.email, b.student)

  // Update header values (in case name changed)
  sheet.getRange('A1').setValue(`👤 ${b.student || '(無名)'}`).setFontWeight('bold').setFontSize(14)
  sheet.getRange('A2').setValue(`📧 ${(b.email || '').toLowerCase()}`).setFontFamily('Roboto Mono').setFontColor('#475569')

  const row = [
    b.timestamp || new Date().toISOString(),
    b.sessionId || '',
    b.mode || '',
    b.action || '',
    b.categoryId,
    b.categoryTitle || '',
    b.phraseId,
    b.ja || '',
    b.en || '',
    b.userInput || '',
    b.correct === true ? true : b.correct === false ? false : '',
    typeof b.similarity === 'number' ? b.similarity : '',
  ]
  sheet.appendRow(row)
}

function ensureStudentSheet_(ss, email, name) {
  const idx = ensureStudentIndex_(ss)
  const emailLc = (email || '').toLowerCase()
  const map = readStudentIndex_(idx) // { email: { sheetName, name } }

  if (map[emailLc] && ss.getSheetByName(map[emailLc].sheetName)) {
    return ss.getSheetByName(map[emailLc].sheetName)
  }

  // Create a new sheet, with a unique name based on student name
  const baseName = sanitizeSheetName_(name || emailLc.split('@')[0] || '生徒')
  let sheetName = baseName
  let i = 2
  while (ss.getSheetByName(sheetName)) {
    sheetName = `${baseName} (${i++})`
  }
  const sheet = ss.insertSheet(sheetName)

  // Write index entry
  idx.appendRow([emailLc, sheetName, name || '', new Date().toISOString()])

  // Set up headers
  sheet.getRange('A1').setValue(`👤 ${name || ''}`).setFontWeight('bold').setFontSize(14)
  sheet.getRange('A2').setValue(`📧 ${emailLc}`).setFontFamily('Roboto Mono').setFontColor('#475569')
  sheet.getRange('A3').setValue('上部の集計は「📊 学習レポート → サマリーを再集計」で更新されます').setFontColor('#94a3b8').setFontStyle('italic')

  const logHeader = ['timestamp', 'sessionId', 'mode', 'action', 'categoryId', 'categoryTitle', 'phraseId', 'ja', 'en', 'userInput', 'correct', 'similarity']
  sheet.getRange(STUDENT_LOG_START_ROW, 1).setValue('--- 学習ログ ---').setFontWeight('bold').setFontColor('#1d4ed8')
  sheet.getRange(STUDENT_LOG_START_ROW + 1, 1, 1, logHeader.length).setValues([logHeader]).setFontWeight('bold').setBackground('#e2e8f0')
  sheet.setFrozenRows(STUDENT_LOG_START_ROW + 1)
  applyStudentColumnWidths_(sheet)

  return sheet
}

function ensureStudentIndex_(ss) {
  let s = ss.getSheetByName(STUDENTS_INDEX_SHEET)
  if (!s) {
    s = ss.insertSheet(STUDENTS_INDEX_SHEET)
    s.hideSheet()
    s.getRange(1, 1, 1, 4).setValues([['email', 'sheetName', 'name', 'createdAt']]).setFontWeight('bold')
    s.setFrozenRows(1)
  }
  return s
}

function readStudentIndex_(idx) {
  const last = idx.getLastRow()
  if (last < 2) return {}
  const data = idx.getRange(2, 1, last - 1, 4).getValues()
  const out = {}
  for (const row of data) {
    const email = String(row[0] || '').toLowerCase()
    if (!email) continue
    out[email] = { sheetName: row[1], name: row[2], createdAt: row[3] }
  }
  return out
}

function sanitizeSheetName_(name) {
  // Sheet names cannot contain : / \ ? * [ ]
  let s = String(name).replace(/[:\\\/\?\*\[\]]/g, '_').trim()
  if (!s) s = '生徒'
  // Max 100 chars in Google Sheets
  if (s.length > 90) s = s.slice(0, 90)
  return s
}

/* ----------------------------------------------------------------------
 * Summaries (manual run from menu)
 * --------------------------------------------------------------------*/

function rebuildSummaries() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  ensureLogSheet_(ss)
  const idx = ensureStudentIndex_(ss)
  const studentsMap = readStudentIndex_(idx)

  // Re-read all logs once
  const log = ss.getSheetByName(LOG_SHEET)
  const data = log.getLastRow() > 1
    ? log.getRange(2, 1, log.getLastRow() - 1, LOG_HEADERS.length).getValues()
    : []

  // Re-apply log sheet widths in case Sheets shifted them
  applyLogColumnWidths_(log)

  // Group by email
  const byStudent = {}
  for (const r of data) {
    const email = String(r[2] || '').toLowerCase()
    if (!email) continue
    if (!byStudent[email]) byStudent[email] = []
    byStudent[email].push(r)
  }

  // Update each student sheet's summary section
  for (const email of Object.keys(byStudent)) {
    const ent = studentsMap[email]
    if (!ent) continue
    const sheet = ss.getSheetByName(ent.sheetName)
    if (!sheet) continue
    writeStudentSummary_(sheet, byStudent[email])
  }

  buildOverallSummary_(ss, data, studentsMap)
}

function writeStudentSummary_(sheet, rows) {
  // rows are master-log rows: [timestamp, sessionId, email, student, mode, action,
  //   categoryId, categoryTitle, phraseId, ja, en, userInput, correct, similarity, receivedAt]
  const checks = rows.filter(r => r[4] === 'text' && (r[5] === 'check' || r[5] === 'reveal'))
  const checksOnly = rows.filter(r => r[4] === 'text' && r[5] === 'check')
  const plays = rows.filter(r => r[4] === 'voice' && r[5] === 'play')
  const sessions = rows.filter(r => r[5] === 'session_start')

  const totalAttempts = checksOnly.length
  const totalCorrect = checksOnly.filter(r => r[12] === true).length
  const accuracy = totalAttempts ? totalCorrect / totalAttempts : ''
  const lastAt = maxStr_(rows.map(r => String(r[0] || '')))
  const firstAt = minStr_(rows.map(r => String(r[0] || '')).filter(Boolean))

  // Block 1: profile
  sheet.getRange('A4').setValue('--- 学習サマリー ---').setFontWeight('bold').setFontColor('#1d4ed8')
  sheet.getRange('A5:B5').setValues([['初回学習', firstAt]])
  sheet.getRange('A6:B6').setValues([['最終学習', lastAt]])
  sheet.getRange('A7:B7').setValues([['学習セッション数', sessions.length]])
  sheet.getRange('A8:B8').setValues([['テキスト挑戦回数（check）', totalAttempts]])
  sheet.getRange('A9:B9').setValues([['正解回数', totalCorrect]])
  sheet.getRange('A10:B10').setValues([['総合正答率', accuracy]])
  sheet.getRange('B10').setNumberFormat('0.0%')
  sheet.getRange('A11:B11').setValues([['音声モード再生フレーズ数', plays.length]])
  sheet.getRange('A5:A11').setFontWeight('bold').setBackground('#f1f5f9')

  // Block 2: per-category accuracy
  sheet.getRange('D4').setValue('--- カテゴリ別正答率 ---').setFontWeight('bold').setFontColor('#1d4ed8')
  const catIds = uniq_(checks.map(r => `${r[6]}\t${r[7]}`)).map(s => s.split('\t')).sort((a, b) => Number(a[0]) - Number(b[0]))
  const catHeader = ['カテゴリ', '挑戦', '正解', '正答率']
  sheet.getRange(5, 4, 1, catHeader.length).setValues([catHeader]).setFontWeight('bold').setBackground('#f1f5f9')
  if (catIds.length) {
    const values = catIds.map(([id, title]) => {
      const r = checksOnly.filter(x => String(x[6]) === String(id))
      const att = r.length
      const ok = r.filter(x => x[12] === true).length
      return [`#${pad2_(id)} ${title}`, att, ok, att ? ok / att : '']
    })
    sheet.getRange(6, 4, values.length, catHeader.length).setValues(values)
    sheet.getRange(6, 7, values.length, 1).setNumberFormat('0.0%')
  } else {
    sheet.getRange(6, 4).setValue('（テキストモード未実施）').setFontColor('#94a3b8')
  }

  // Block 3: stuck phrases (worst accuracy or most attempts without correct)
  sheet.getRange(15, 4).setValue('--- つまずきフレーズ Top 10 ---').setFontWeight('bold').setFontColor('#1d4ed8')
  const stuckHeader = ['カテゴリ', 'フレーズ', '日本語', '英訳', '挑戦', '正解']
  sheet.getRange(16, 4, 1, stuckHeader.length).setValues([stuckHeader]).setFontWeight('bold').setBackground('#f1f5f9')

  const groups = {}
  for (const r of checksOnly) {
    const key = `${r[6]}/${r[8]}`
    if (!groups[key]) groups[key] = { catId: r[6], catTitle: r[7], phraseId: r[8], ja: r[9], en: r[10], att: 0, ok: 0 }
    groups[key].att += 1
    if (r[12] === true) groups[key].ok += 1
  }
  const list = Object.values(groups)
    .map(g => ({ ...g, miss: g.att - g.ok }))
    .sort((a, b) => b.miss - a.miss || b.att - a.att)
    .slice(0, 10)

  if (list.length) {
    const values = list.map(g => [`#${pad2_(g.catId)} ${g.catTitle}`, `#${g.phraseId}`, g.ja, g.en, g.att, g.ok])
    sheet.getRange(17, 4, values.length, stuckHeader.length).setValues(values)
  } else {
    sheet.getRange(17, 4).setValue('（データがまだありません）').setFontColor('#94a3b8')
  }

  // Apply preset widths and wrap-friendly formatting
  applyStudentColumnWidths_(sheet)
  // Summary block (cols D..I rows 4..30): allow wrap for long category names / phrases
  sheet.getRange(4, 4, 30, 6).setWrap(true)
  sheet.getRange(4, 1, 12, 2).setWrap(true)
}

function buildOverallSummary_(ss, allRows, studentsMap) {
  let sheet = ss.getSheetByName(SUMMARY_SHEET)
  if (!sheet) sheet = ss.insertSheet(SUMMARY_SHEET)
  sheet.clearContents()

  const checksOnly = allRows.filter(r => r[4] === 'text' && r[5] === 'check')
  const sessions = allRows.filter(r => r[5] === 'session_start')

  // Identify students from index (preserves all even with no data) + new ones from logs
  const emails = uniq_(allRows.map(r => String(r[2] || '').toLowerCase()).filter(Boolean))
    .concat(Object.keys(studentsMap)).filter((v, i, a) => a.indexOf(v) === i).sort()

  const cats = uniq_(checksOnly.map(r => `${r[6]}\t${r[7]}`))
    .map(s => s.split('\t')).sort((a, b) => Number(a[0]) - Number(b[0]))

  if (!emails.length) { sheet.getRange(1, 1).setValue('まだデータがありません'); return }

  const header = ['氏名', 'メールアドレス', 'シート', '総挑戦', '総正解', '総合正答率', '学習セッション数', '最終学習日時']
    .concat(cats.map(([id, title]) => `#${pad2_(id)} ${title}\n正答率`))
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#e2e8f0').setWrap(true)
  sheet.setFrozenRows(1)

  const rows = emails.map(email => {
    const ent = studentsMap[email] || {}
    const sChecks = checksOnly.filter(r => String(r[2] || '').toLowerCase() === email)
    const att = sChecks.length
    const ok = sChecks.filter(r => r[12] === true).length
    const acc = att ? ok / att : ''
    const sSessions = sessions.filter(r => String(r[2] || '').toLowerCase() === email).length
    const last = maxStr_(allRows.filter(r => String(r[2] || '').toLowerCase() === email).map(r => String(r[0] || '')))
    const ratePerCat = cats.map(([id]) => {
      const r = sChecks.filter(x => String(x[6]) === String(id))
      if (!r.length) return ''
      return r.filter(x => x[12] === true).length / r.length
    })
    const sheetLink = ent.sheetName
      ? `=HYPERLINK("#gid=" & MATCH("${ent.sheetName.replace(/"/g, '""')}", _student_sheet_names, 0), "📄 開く")`
      : ''
    return [
      ent.name || (sChecks[0]?.[3] || ''),
      email,
      ent.sheetName || '',
      att, ok, acc, sSessions, last,
      ...ratePerCat,
    ]
  })
  sheet.getRange(2, 1, rows.length, header.length).setValues(rows)
  sheet.getRange(2, 6, rows.length, 1).setNumberFormat('0.0%') // 総合正答率
  if (cats.length) {
    sheet.getRange(2, 9, rows.length, cats.length).setNumberFormat('0.0%') // カテゴリ別
  }
  applyOverallSummaryWidths_(sheet, cats.length)
}

// 横断「サマリー」シートの列幅プリセット
function applyOverallSummaryWidths_(sheet, catsCount) {
  const fixed = [160, 220, 180, 80, 80, 100, 110, 180]  // 氏名〜最終学習日時
  for (let i = 0; i < fixed.length; i++) {
    sheet.setColumnWidth(i + 1, fixed[i])
  }
  for (let i = 0; i < catsCount; i++) {
    sheet.setColumnWidth(fixed.length + 1 + i, 130)
  }
  sheet.getRange(1, 1, 1, fixed.length + catsCount).setWrap(true)
}

/* ----------------------------------------------------------------------
 * Menu
 * --------------------------------------------------------------------*/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 学習レポート')
    .addItem('サマリーを再集計', 'rebuildSummaries')
    .addToUi()
}

/* ----------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------*/

function uniq_(arr) {
  const set = new Set()
  for (const v of arr) if (v !== '' && v != null) set.add(v)
  return [...set]
}
function pad2_(n) { return String(n).padStart(2, '0') }
function maxStr_(arr) { let m = ''; for (const s of arr) if (s > m) m = s; return m }
function minStr_(arr) { if (!arr.length) return ''; let m = arr[0]; for (const s of arr) if (s < m) m = s; return m }
