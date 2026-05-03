// ===== お役立ちフレーズ — Vanilla JS / ES Module 版 =====

// ---------- Utilities: comparison ----------
const CONTRACTIONS = {
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is',
  "what's": 'what is', "let's": 'let us', "don't": 'do not', "doesn't": 'does not',
  "didn't": 'did not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not',
  "weren't": 'were not', "won't": 'will not', "can't": 'cannot', "couldn't": 'could not',
  "shouldn't": 'should not', "wouldn't": 'would not', "i've": 'i have', "you've": 'you have',
  "we've": 'we have', "they've": 'they have', "i'll": 'i will', "you'll": 'you will',
  "we'll": 'we will', "they'll": 'they will', "i'd": 'i would', "you'd": 'you would',
  wanna: 'want to', gonna: 'going to', gotta: 'got to',
}
function normalize(text) {
  let s = (text || '').toLowerCase().trim()
  s = s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"')
  s = s.replace(/[\.,!?;:"“”\(\)\[\]{}\-—–_]/g, ' ').replace(/\s+/g, ' ').trim()
  return s.split(' ').map(w => CONTRACTIONS[w] ?? w).join(' ').replace(/\s+/g, ' ').trim()
}
function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const v0 = new Array(b.length + 1), v1 = new Array(b.length + 1)
  for (let i = 0; i <= b.length; i++) v0[i] = i
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j]
  }
  return v1[b.length]
}
function judge(userInput, answer, strict) {
  const a = normalize(userInput), b = normalize(answer)
  if (!a) return { correct: false, similarity: 0 }
  if (a === b) return { correct: true, similarity: 1 }
  if (strict) return { correct: false, similarity: 0 }
  const dist = levenshtein(a, b)
  const sim = 1 - dist / Math.max(a.length, b.length)
  return { correct: sim >= 0.9, similarity: sim }
}
function wordDiff(userInput, answer) {
  const userWords = new Set(normalize(userInput).split(' ').filter(Boolean))
  return answer.split(/\s+/).map(w => ({ word: w, hit: userWords.has(normalize(w)) }))
}

// ---------- Speech (TTS / STT) ----------
let voicesCache = null
function loadVoices() {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis
    if (!synth) return resolve([])
    const existing = synth.getVoices()
    if (existing.length > 0) { voicesCache = existing; return resolve(existing) }
    const handler = () => {
      const v = synth.getVoices()
      voicesCache = v
      synth.removeEventListener('voiceschanged', handler)
      resolve(v)
    }
    synth.addEventListener('voiceschanged', handler)
    setTimeout(() => {
      const v = synth.getVoices()
      if (v.length > 0) { voicesCache = v; resolve(v) }
    }, 500)
  })
}
async function pickVoice(lang) {
  const voices = voicesCache ?? (await loadVoices())
  if (!voices.length) return null
  const exact = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase())
  if (exact) return exact
  const prefix = lang.split('-')[0].toLowerCase()
  return voices.find(v => v.lang.toLowerCase().startsWith(prefix)) ?? null
}
function speak(text, opts = {}) {
  const synth = window.speechSynthesis
  if (!synth) return Promise.reject(new Error('no-tts'))
  return new Promise(async (resolve, reject) => {
    try {
      synth.cancel()
      const utter = new SpeechSynthesisUtterance(text)
      utter.lang = opts.lang ?? 'en-US'
      utter.rate = opts.rate ?? 1
      const voice = await pickVoice(utter.lang)
      if (voice) utter.voice = voice
      utter.onend = () => resolve()
      utter.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') resolve()
        else reject(new Error(e.error || 'tts-error'))
      }
      if (opts.signal) {
        if (opts.signal.aborted) { synth.cancel(); return resolve() }
        opts.signal.addEventListener('abort', () => { synth.cancel(); resolve() })
      }
      synth.speak(utter)
    } catch (e) { reject(e) }
  })
}
function cancelSpeech() { try { window.speechSynthesis.cancel() } catch {} }
function sleep(ms, signal) {
  return new Promise(resolve => {
    if (signal?.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve() })
  })
}
function isSTTSupported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition) }
function startRecognition(onResult, onError, onEnd, lang = 'en-US') {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) { onError?.('not-supported'); return null }
  const rec = new Ctor()
  rec.lang = lang
  rec.interimResults = true
  rec.continuous = false
  rec.onresult = (e) => {
    let interim = '', final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) final += r[0].transcript
      else interim += r[0].transcript
    }
    if (final) onResult(final.trim(), true)
    else if (interim) onResult(interim.trim(), false)
  }
  rec.onerror = (e) => onError?.(e.error || 'unknown')
  rec.onend = () => onEnd?.()
  try { rec.start() } catch (e) { onError?.(e?.message || 'start-failed'); return null }
  return { stop: () => rec.stop() }
}

// ---------- Storage ----------
const SETTINGS_KEY = 'phrases-app:settings:v1'
const PROGRESS_KEY = 'phrases-app:progress:v1'
const USER_KEY = 'phrases-app:user:v1'
const defaultSettings = {
  pauseSeconds: 6,
  speechRate: 1,
  shuffle: false,
  strictMatch: false,
  sheetEndpoint: '',
  voiceAutoGrade: true,
}
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
    // strip removed legacy field
    delete raw.studentName
    return { ...defaultSettings, ...raw }
  } catch { return { ...defaultSettings } }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) }
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}') } catch { return {} }
}
function saveProgress(p) { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)) }
function progressKey(catId, pId) { return `${catId}:${pId}` }
function recordAttempt(p, key, correct) {
  const cur = p[key] ?? { attempts: 0, correct: 0, lastAttemptAt: 0 }
  return { ...p, [key]: { attempts: cur.attempts + 1, correct: cur.correct + (correct ? 1 : 0), lastAttemptAt: Date.now() } }
}

// ---------- Auth (login) ----------
function loadUser() {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    if (u && u.email && u.name) return u
    return null
  } catch { return null }
}
function saveUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)) }
function clearUser() { localStorage.removeItem(USER_KEY) }
function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) }

// ---------- Sheet logging ----------
// Per-session id to group rows in the spreadsheet.
const SESSION_ID = (() => {
  const t = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const r = Math.random().toString(36).slice(2, 8)
  return `s_${t}_${r}`
})()

// Fire-and-forget log post.
// Uses no-cors mode so we don't need CORS configuration on Apps Script;
// trade-off: response is opaque, so we don't read errors here.
function sendLog(payload) {
  const url = state.settings.sheetEndpoint?.trim()
  if (!url) return
  const u = state.user
  if (!u) return
  const body = JSON.stringify({
    timestamp: new Date().toISOString(),
    sessionId: SESSION_ID,
    student: u.name,
    email: u.email,
    ...payload,
  })
  try {
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // ignore network errors
  }
}

// ---------- Helpers ----------
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v
    else if (k === 'html') e.innerHTML = v
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v)
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children) {
    if (c == null || c === false) continue
    if (Array.isArray(c)) c.forEach(cc => e.append(cc instanceof Node ? cc : document.createTextNode(String(cc))))
    else e.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return e
}
function shuffled(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
function pad2(n) { return String(n).padStart(2, '0') }

// ---------- App state ----------
const state = {
  categories: null,
  view: { name: 'home' },
  settings: loadSettings(),
  progress: loadProgress(),
  user: loadUser(),
}
const root = document.getElementById('app')

// ---------- Navigation ----------
function navigate(view) {
  state.view = view
  render()
  window.scrollTo({ top: 0, behavior: 'instant' })
}
document.getElementById('brand').addEventListener('click', () => navigate({ name: 'home' }))
document.getElementById('open-settings').addEventListener('click', () => navigate({ name: 'settings' }))
document.getElementById('year').textContent = new Date().getFullYear()

// ---------- Renderers ----------
function updateStudentBadge() {
  const badge = document.getElementById('student-badge')
  const settingsBtn = document.getElementById('open-settings')
  if (!badge) return
  const u = state.user
  if (u && u.name) {
    badge.textContent = `👤 ${u.name}`
    badge.hidden = false
    if (settingsBtn) settingsBtn.hidden = false
  } else {
    badge.hidden = true
    if (settingsBtn) settingsBtn.hidden = true
  }
}

function render() {
  updateStudentBadge()
  if (!state.user) {
    return renderLogin()
  }
  if (!state.categories) {
    root.replaceChildren(el('div', { class: 'loading' }, '読み込み中...'))
    return
  }
  const v = state.view
  if (v.name === 'home') return renderHome()
  if (v.name === 'mode') return renderModeSelect(v.categoryId)
  if (v.name === 'text') return renderTextMode(v.categoryId)
  if (v.name === 'voice') return renderVoiceMode(v.categoryId)
  if (v.name === 'settings') return renderSettings()
}

function renderLogin() {
  const emailInput = el('input', {
    type: 'email', placeholder: 'you@example.com', autocomplete: 'email',
    class: 'login-input', required: true,
  })
  const nameInput = el('input', {
    type: 'text', placeholder: '山田 太郎', autocomplete: 'name',
    class: 'login-input', required: true,
  })
  const errBox = el('div', { class: 'login-error', hidden: true })

  function submit(e) {
    e?.preventDefault()
    const email = emailInput.value.trim().toLowerCase()
    const name = nameInput.value.trim()
    if (!isValidEmail(email)) {
      errBox.textContent = '正しいメールアドレスを入力してください'
      errBox.hidden = false
      emailInput.focus()
      return
    }
    if (!name) {
      errBox.textContent = '氏名を入力してください'
      errBox.hidden = false
      nameInput.focus()
      return
    }
    const u = { email, name, loggedInAt: new Date().toISOString() }
    saveUser(u)
    state.user = u
    sendLog({
      mode: 'system', action: 'login',
      categoryId: '', categoryTitle: '', phraseId: '',
      ja: '', en: '', userInput: '', correct: '', similarity: '',
    })
    render()
  }

  const form = el('form', { class: 'login-form', onsubmit: submit },
    el('div', { class: 'login-logo' }, '英'),
    el('h1', { class: 'login-title' }, 'お役立ちフレーズ'),
    el('p', { class: 'login-sub' }, '英会話 練習アプリ'),
    el('label', { class: 'login-label' }, 'メールアドレス'),
    emailInput,
    el('label', { class: 'login-label' }, '氏名'),
    nameInput,
    errBox,
    el('button', { type: 'submit', class: 'btn-primary login-submit' }, 'ログインして始める'),
    el('p', { class: 'login-note' }, '※ 学習記録を講師と共有するために使います')
  )

  root.replaceChildren(el('div', { class: 'login-wrap' }, form))
  setTimeout(() => emailInput.focus(), 50)
}

function renderHome() {
  const list = el('ul', { class: 'cat-grid', style: 'list-style:none;padding:0;margin:0' })
  for (const c of state.categories) {
    const total = c.phrases.length
    let attempted = 0, correct = 0
    for (const p of c.phrases) {
      const e = state.progress[progressKey(c.id, p.id)]
      if (e) { attempted++; if (e.correct > 0) correct++ }
    }
    const pct = total ? Math.round((correct / total) * 100) : 0
    const card = el('button', {
      class: 'card card-button',
      onclick: () => navigate({ name: 'mode', categoryId: c.id }),
    },
      el('div', { class: 'cat-meta' },
        el('span', { class: 'cat-no' }, `#${pad2(c.id)}`),
        el('span', { class: 'cat-count' }, `${total} フレーズ`),
      ),
      el('h2', { class: 'cat-title' }, c.title),
      el('p', { class: 'cat-sub' }, c.subtitle),
      el('div', { class: 'progress-row' },
        el('div', { class: 'progress-label' },
          el('span', {}, '進捗'),
          el('span', {}, `${correct} / ${total} (${pct}%)`),
        ),
        el('div', { class: 'progress-bar' },
          el('div', { class: 'progress-fill', style: `width:${pct}%` })
        ),
        attempted > 0 ? el('div', { class: 'progress-attempts' }, `挑戦済み: ${attempted}`) : null
      )
    )
    list.append(el('li', {}, card))
  }
  root.replaceChildren(
    el('h1', { class: 'page-title' }, '学習カテゴリ'),
    el('p', { class: 'page-subtitle' }, '練習したいカテゴリを選んでください'),
    list
  )
}

function renderModeSelect(catId) {
  const c = state.categories.find(x => x.id === catId)
  if (!c) return navigate({ name: 'home' })
  root.replaceChildren(
    el('button', { class: 'btn-ghost btn-sm back-link', onclick: () => navigate({ name: 'home' }) }, '← カテゴリ一覧'),
    el('div', { class: 'card', style: 'margin-bottom:24px' },
      el('div', { class: 'cat-no', style: 'margin-bottom:4px' }, `#${pad2(c.id)}`),
      el('h1', { class: 'page-title', style: 'font-size:18px' }, c.title),
      el('p', { class: 'page-subtitle', style: 'margin:0' }, c.subtitle),
      el('p', { class: 'muted', style: 'margin-top:8px' }, `全 ${c.phrases.length} フレーズ`),
    ),
    el('h2', { class: 'section-title' }, '学習モードを選んで下さい'),
    el('div', { class: 'mode-grid' },
      el('button', {
        class: 'card card-button',
        onclick: () => navigate({ name: 'text', categoryId: c.id }),
      },
        el('div', { class: 'mode-emoji' }, '⌨️'),
        el('div', { class: 'mode-title' }, 'テキストモード'),
        el('p', { class: 'mode-desc' }, '日本語を見て、キーボードか音声で英訳を入力。差分でフィードバック。'),
      ),
      el('button', {
        class: 'card card-button',
        onclick: () => navigate({ name: 'voice', categoryId: c.id }),
      },
        el('div', { class: 'mode-emoji' }, '🎧'),
        el('div', { class: 'mode-title' }, '音声モード'),
        el('p', { class: 'mode-desc' }, '日本語音声 → 黙考タイム → 英訳音声。連続再生で耳で覚える。'),
      ),
    )
  )
}

// ---------- Text mode ----------
function renderTextMode(catId) {
  const c = state.categories.find(x => x.id === catId)
  if (!c) return navigate({ name: 'home' })

  sendLog({
    mode: 'text', action: 'session_start',
    categoryId: c.id, categoryTitle: c.title,
    phraseId: '', ja: '', en: '', userInput: '', correct: '', similarity: '',
  })

  const local = {
    order: state.settings.shuffle ? shuffled(c.phrases) : c.phrases,
    idx: 0,
    input: '',
    revealed: false,
    result: null,
    listening: false,
    rec: null,
  }

  const container = el('div')
  root.replaceChildren(container)

  function update() {
    const p = local.order[local.idx]
    const sttOK = isSTTSupported()
    const total = local.order.length

    const diff = local.revealed && local.input.trim() ? wordDiff(local.input, p.en) : null

    const back = el('button', { class: 'btn-ghost btn-sm back-link', onclick: () => navigate({ name: 'mode', categoryId: c.id }) }, '← モード選択')
    const head = el('div', { class: 'head-row' },
      el('div', {}, `${local.idx + 1} / ${total}`),
      el('div', { class: 'right' }, 'テキストモード')
    )
    const bar = el('div', { class: 'thin-progress' },
      el('div', { class: 'fill', style: `width:${((local.idx + 1) / total) * 100}%` })
    )
    const card = el('div', { class: 'card', style: 'margin-bottom:16px' },
      el('div', { class: 'phrase-no' }, `フレーズ #${p.id}`),
      el('p', { class: 'phrase-ja' }, p.ja),
    )
    const ta = el('textarea', {
      class: 'answer',
      rows: 3,
      placeholder: 'Type the English translation...',
      oninput: (e) => { local.input = e.target.value },
      onkeydown: (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault()
          if (local.revealed) onNext(); else onCheck()
        }
      },
    })
    ta.value = local.input
    const micBtn = el('button', {
      class: local.listening ? 'btn btn-listening btn-sm' : 'btn-secondary btn-sm',
      type: 'button',
      onclick: onMic,
      disabled: !sttOK,
      title: sttOK ? '音声入力（Chrome / Edge推奨）' : 'このブラウザでは音声入力非対応',
    }, local.listening ? '🛑 停止' : '🎤 音声入力')
    const inputCard = el('div', { class: 'card input-card' },
      el('div', { class: 'input-row' },
        el('label', {}, '英訳を入力'),
        micBtn,
      ),
      ta,
      el('div', { class: 'hint' }, `⌘/Ctrl + Enter で ${local.revealed ? '次へ' : '答え合わせ'}`)
    )

    let actionsOrResult
    if (!local.revealed) {
      actionsOrResult = el('div', { class: 'actions' },
        el('button', { class: 'btn-primary', onclick: onCheck }, '答え合わせ'),
        el('button', { class: 'btn-secondary', onclick: onReveal }, '答えを見る')
      )
    } else {
      const msg = local.result
        ? (local.result.correct
            ? el('div', { class: 'result-msg ok' }, '✓ 正解です！')
            : el('div', { class: 'result-msg warn' }, `△ 惜しい！類似度 ${Math.round(local.result.similarity * 100)}%`))
        : null
      const enLine = diff
        ? el('p', { class: 'phrase-en' }, ...diff.map((d, i) => {
            const span = el('span', { class: d.hit ? '' : 'miss' }, d.word + (i < diff.length - 1 ? ' ' : ''))
            return span
          }))
        : el('p', { class: 'phrase-en' }, p.en)
      actionsOrResult = el('div', { class: 'card result-card' },
        msg,
        el('div', { class: 'phrase-no' }, '正解'),
        enLine,
        el('button', {
          class: 'btn-ghost btn-sm', style: 'margin-top:8px',
          onclick: () => speak(p.en, { rate: state.settings.speechRate, lang: 'en-US' }).catch(() => {}),
        }, '🔊 もう一度聞く')
      )
    }

    const nav = el('div', { class: 'nav-row', style: 'margin-top:16px' },
      el('button', { class: 'btn-secondary', onclick: onPrev, disabled: local.idx === 0 }, '← 前へ'),
      el('button', { class: 'btn-primary', onclick: onNext, disabled: local.idx === local.order.length - 1 }, '次へ →')
    )

    container.replaceChildren(back, head, bar, card, inputCard, actionsOrResult, nav)
    if (!local.revealed) ta.focus()
  }

  function onCheck() {
    if (!local.input.trim()) return
    const p = local.order[local.idx]
    const r = judge(local.input, p.en, state.settings.strictMatch)
    local.result = r
    local.revealed = true
    state.progress = recordAttempt(state.progress, progressKey(c.id, p.id), r.correct)
    saveProgress(state.progress)
    sendLog({
      mode: 'text',
      action: 'check',
      categoryId: c.id,
      categoryTitle: c.title,
      phraseId: p.id,
      ja: p.ja,
      en: p.en,
      userInput: local.input,
      correct: r.correct,
      similarity: Number(r.similarity.toFixed(3)),
    })
    speak(p.en, { rate: state.settings.speechRate, lang: 'en-US' }).catch(() => {})
    update()
  }
  function onReveal() {
    const p = local.order[local.idx]
    local.revealed = true
    local.result = null
    sendLog({
      mode: 'text',
      action: 'reveal',
      categoryId: c.id,
      categoryTitle: c.title,
      phraseId: p.id,
      ja: p.ja,
      en: p.en,
      userInput: local.input,
      correct: false,
      similarity: 0,
    })
    speak(p.en, { rate: state.settings.speechRate, lang: 'en-US' }).catch(() => {})
    update()
  }
  function onNext() {
    if (local.idx < local.order.length - 1) {
      local.idx++; local.input = ''; local.revealed = false; local.result = null; update()
    }
  }
  function onPrev() {
    if (local.idx > 0) {
      local.idx--; local.input = ''; local.revealed = false; local.result = null; update()
    }
  }
  function onMic() {
    if (local.listening) {
      local.rec?.stop(); local.listening = false; update(); return
    }
    local.listening = true
    local.rec = startRecognition(
      (text, isFinal) => { local.input = text; if (isFinal) local.listening = false; update() },
      () => { local.listening = false; update() },
      () => { local.listening = false; update() },
      'en-US'
    )
    if (!local.rec) local.listening = false
    update()
  }

  update()
}

// ---------- Voice mode ----------
function renderVoiceMode(catId) {
  const c = state.categories.find(x => x.id === catId)
  if (!c) return navigate({ name: 'home' })

  sendLog({
    mode: 'voice', action: 'session_start',
    categoryId: c.id, categoryTitle: c.title,
    phraseId: '', ja: '', en: '', userInput: '', correct: '', similarity: '',
  })

  const local = {
    order: state.settings.shuffle ? shuffled(c.phrases) : c.phrases,
    idx: 0,
    playing: false,
    stage: 'idle',          // 'idle' | 'ja' | 'speaking' | 'en' | 'judging'
    speakingRemain: state.settings.pauseSeconds,
    showJa: true,
    showEn: false,
    abort: null,
    lastResult: null,       // 'correct' | 'incorrect' | null
    resolveJudgment: null,
    rec: null,              // active SpeechRecognition handle
    recognized: '',         // ユーザーが発話した認識結果（最新）
    judgeResult: null,      // judgeResult { correct, similarity } | null
  }

  const container = el('div')
  root.replaceChildren(container)

  const cleanup = () => { local.abort?.abort(); cancelSpeech(); try { local.rec?.stop() } catch {} }

  function update() {
    const p = local.order[local.idx]
    const total = local.order.length
    const sttOK = isSTTSupported() && state.settings.voiceAutoGrade
    const stageBadge =
      local.stage === 'ja' ? el('span', { class: 'stage-badge stage-ja' }, '🔊 日本語再生中...')
      : local.stage === 'speaking' ? el('span', { class: 'stage-badge stage-speak' },
          sttOK
            ? `🎤 英訳を声に出して話してください... (${local.speakingRemain}s)`
            : `💭 心の中で英訳... (${local.speakingRemain}s)`
        )
      : local.stage === 'en' ? el('span', { class: 'stage-badge stage-en' }, '🔊 英訳再生中...')
      : local.stage === 'judging' ? el('span', { class: 'stage-badge stage-judge' },
          local.judgeResult ? '✍️ 結果を確認して次へ' : '✍️ 自己採点してください'
        )
      : null

    const back = el('button', {
      class: 'btn-ghost btn-sm back-link',
      onclick: () => { cleanup(); navigate({ name: 'mode', categoryId: c.id }) }
    }, '← モード選択')
    const head = el('div', { class: 'head-row' },
      el('div', {}, `${local.idx + 1} / ${total}`),
      el('div', { class: 'right' }, '音声モード')
    )
    const bar = el('div', { class: 'thin-progress' },
      el('div', { class: 'fill', style: `width:${((local.idx + 1) / total) * 100}%` })
    )

    const lastResultBanner = local.lastResult
      ? el('div', {
          class: local.lastResult === 'correct' ? 'last-result ok' : 'last-result ng',
        },
          local.lastResult === 'correct' ? '✓ 前のフレーズ：正解' : '✗ 前のフレーズ：不正解'
        )
      : null

    // 認識中のリアルタイム表示
    const speakingPanel = (local.stage === 'speaking' && sttOK)
      ? el('div', { class: 'card mic-panel' },
          el('div', { class: 'row-between' },
            el('span', { class: 'label-mini' }, '🎤 認識中'),
            el('span', { class: 'muted' }, `${local.speakingRemain}s`),
          ),
          el('p', { class: 'phrase-en mic-text' },
            local.recognized || el('span', { class: 'muted' }, '（マイクに向かって英訳を話してください）')
          ),
          el('div', { style: 'margin-top:8px' },
            el('button', {
              class: 'btn-secondary btn-sm',
              onclick: () => skipSpeakingPhase(),
            }, '→ もう発話完了')
          )
        )
      : null

    // 採点結果（自動判定）
    const judgeResultPanel = (local.stage === 'judging' && local.judgeResult)
      ? buildJudgeResultPanel(p, local.judgeResult, local.recognized)
      : null

    const card = el('div', { class: 'card', style: 'margin-bottom:16px;min-height:180px' },
      el('div', { class: 'phrase-no' }, `フレーズ #${p.id}`),
      el('div', { style: 'margin:8px 0 16px' },
        el('div', { class: 'row-between' },
          el('span', { class: 'label-mini' }, '日本語'),
          el('button', { class: 'btn-ghost btn-sm', onclick: () => { local.showJa = !local.showJa; update() } },
            local.showJa ? '隠す' : '表示'
          )
        ),
        el('p', { class: 'phrase-ja' }, local.showJa ? p.ja : '••••••')
      ),
      el('div', {},
        el('div', { class: 'row-between' },
          el('span', { class: 'label-mini' }, '英訳'),
          el('button', { class: 'btn-ghost btn-sm', onclick: () => { local.showEn = !local.showEn; update() } },
            local.showEn ? '隠す' : '表示'
          )
        ),
        el('p', { class: 'phrase-en' }, local.showEn ? p.en : '••••••')
      ),
      stageBadge ? el('div', { class: 'center gap-mini' }, stageBadge) : null
    )

    // judging 段階のボタン群
    let judgeRow = null
    if (local.stage === 'judging') {
      if (local.judgeResult) {
        // 自動採点済み：「次へ」ボタンと「採点をひっくり返す」リンク
        judgeRow = el('div', { class: 'judge-row' },
          el('button', {
            class: 'btn-primary judge-btn',
            onclick: () => onJudge(local.judgeResult.correct, true),
          }, '次へ進む →'),
          el('button', {
            class: 'btn-ghost btn-sm',
            onclick: () => onJudge(!local.judgeResult.correct, true),
            title: '採点を訂正する',
          }, local.judgeResult.correct ? '訂正：✗ 不正解' : '訂正：✓ 正解'),
          el('button', {
            class: 'btn-ghost btn-sm',
            onclick: () => speak(p.en, { rate: state.settings.speechRate, lang: 'en-US' }).catch(() => {})
          }, '🔊 もう一度'),
        )
      } else {
        // フォールバック：自己採点
        judgeRow = el('div', { class: 'judge-row' },
          el('button', { class: 'btn judge-btn judge-correct', onclick: () => onJudge(true) }, '✓ 正解'),
          el('button', { class: 'btn judge-btn judge-wrong', onclick: () => onJudge(false) }, '✗ 不正解'),
          el('button', {
            class: 'btn-ghost btn-sm',
            onclick: () => speak(p.en, { rate: state.settings.speechRate, lang: 'en-US' }).catch(() => {})
          }, '🔊 もう一度'),
        )
      }
    }

    const controls = el('div', { class: 'nav-row', style: 'gap:8px' },
      el('button', {
        class: 'btn-secondary',
        onclick: () => { stop(); local.idx = Math.max(0, local.idx - 1); local.lastResult = null; update() },
        disabled: local.stage === 'judging',
      }, '←'),
      local.playing
        ? el('button', { class: 'btn-primary', style: 'flex:1', onclick: stop, disabled: local.stage === 'judging' }, '⏸ 一時停止')
        : el('button', { class: 'btn-primary', style: 'flex:1', onclick: start }, '▶ 自動再生'),
      el('button', {
        class: 'btn-secondary',
        onclick: () => { stop(); local.idx = Math.min(total - 1, local.idx + 1); local.lastResult = null; update() },
        disabled: local.stage === 'judging',
      }, '→'),
    )

    const note = el('p', { class: 'muted center', style: 'margin-top:12px' },
      sttOK
        ? `発話タイム: ${state.settings.pauseSeconds}秒 / 速度: ${state.settings.speechRate}x ／ 自動採点 ON`
        : `黙考タイム: ${state.settings.pauseSeconds}秒 / 速度: ${state.settings.speechRate}x ／ 自動採点 OFF（自己採点）`
    )

    const children = [back, head, bar]
    if (lastResultBanner) children.push(lastResultBanner)
    children.push(card)
    if (speakingPanel) children.push(speakingPanel)
    if (judgeResultPanel) children.push(judgeResultPanel)
    if (judgeRow) children.push(judgeRow)
    children.push(controls, note)
    container.replaceChildren(...children)
  }

  function buildJudgeResultPanel(p, jr, recognized) {
    const diff = recognized ? wordDiff(recognized, p.en) : null
    return el('div', { class: jr.correct ? 'card result-card result-ok' : 'card result-card result-ng' },
      el('div', { class: 'result-msg ' + (jr.correct ? 'ok' : 'warn') },
        jr.correct
          ? '✓ 正解！類似度 ' + Math.round(jr.similarity * 100) + '%'
          : '✗ 不正解。類似度 ' + Math.round(jr.similarity * 100) + '%'
      ),
      el('div', { class: 'phrase-no', style: 'margin-top:8px' }, 'あなたの発話'),
      el('p', { class: 'phrase-en', style: 'color:#475569' },
        recognized || el('span', { class: 'muted' }, '(認識できませんでした)')
      ),
      el('div', { class: 'phrase-no', style: 'margin-top:8px' }, '正解'),
      diff
        ? el('p', { class: 'phrase-en' }, ...diff.map((d, i) =>
            el('span', { class: d.hit ? '' : 'miss' }, d.word + (i < diff.length - 1 ? ' ' : ''))
          ))
        : el('p', { class: 'phrase-en' }, p.en)
    )
  }

  function stop() {
    local.abort?.abort()
    local.abort = null
    cancelSpeech()
    try { local.rec?.stop() } catch {}
    local.rec = null
    local.playing = false
    local.stage = 'idle'
    update()
  }

  function skipSpeakingPhase() {
    // 発話フェーズの待機を即座に終了する（録音済みの認識結果で採点へ）
    if (local.resolveSpeaking) {
      const r = local.resolveSpeaking
      local.resolveSpeaking = null
      r('skipped')
    }
  }

  function onJudge(correct, fromAuto) {
    const p = local.order[local.idx]
    state.progress = recordAttempt(state.progress, progressKey(c.id, p.id), correct)
    saveProgress(state.progress)
    sendLog({
      mode: 'voice',
      action: fromAuto && local.judgeResult ? 'auto_check' : 'self_check',
      categoryId: c.id,
      categoryTitle: c.title,
      phraseId: p.id,
      ja: p.ja,
      en: p.en,
      userInput: local.recognized || '',
      correct: !!correct,
      similarity: local.judgeResult ? Number(local.judgeResult.similarity.toFixed(3)) : '',
    })
    local.lastResult = correct ? 'correct' : 'incorrect'
    if (local.resolveJudgment) {
      const r = local.resolveJudgment
      local.resolveJudgment = null
      r('judged')
    }
  }

  function waitForJudgment(signal) {
    return new Promise((resolve) => {
      local.resolveJudgment = resolve
      const onAbort = () => {
        local.resolveJudgment = null
        resolve('aborted')
      }
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  // マイク発話フェーズ：時間制限内でユーザーの発話を録音し、最終認識テキストを返す
  function recordSpeakingPhase(signal) {
    return new Promise((resolve) => {
      local.recognized = ''
      let finalText = ''
      let interim = ''

      const finish = (reason) => {
        try { local.rec?.stop() } catch {}
        local.rec = null
        local.resolveSpeaking = null
        resolve({ text: (finalText + ' ' + interim).trim(), reason })
      }

      // 認識オープン
      local.rec = startRecognition(
        (text, isFinal) => {
          if (isFinal) {
            finalText = (finalText + ' ' + text).trim()
            interim = ''
          } else {
            interim = text
          }
          local.recognized = (finalText + ' ' + interim).trim()
          update()
        },
        (err) => {
          // permission denied など — フォールバックへ
          local.rec = null
          finish('error:' + err)
        },
        () => {
          // recognition の終端：そのまま閉じる（タイマー側で finish される）
          local.rec = null
        },
        'en-US'
      )

      // タイムアウト
      const totalMs = Math.max(1, state.settings.pauseSeconds) * 1000
      const t0 = Date.now()
      const tick = setInterval(() => {
        if (signal.aborted) {
          clearInterval(tick)
          finish('aborted')
          return
        }
        const remain = Math.max(0, totalMs - (Date.now() - t0))
        local.speakingRemain = Math.ceil(remain / 1000)
        update()
        if (remain <= 0) {
          clearInterval(tick)
          finish('timeout')
        }
      }, 200)

      // skip ボタンで早期終了
      local.resolveSpeaking = () => { clearInterval(tick); finish('skipped') }

      signal.addEventListener('abort', () => { clearInterval(tick); finish('aborted') }, { once: true })
    })
  }

  async function start() {
    const ctrl = new AbortController()
    local.abort?.abort()
    local.abort = ctrl
    local.playing = true
    update()
    try {
      const useMic = isSTTSupported() && state.settings.voiceAutoGrade
      for (let i = local.idx; i < local.order.length; i++) {
        if (ctrl.signal.aborted) return
        local.idx = i
        const p = local.order[i]
        local.lastResult = null
        local.recognized = ''
        local.judgeResult = null

        // 1) 日本語再生
        local.stage = 'ja'; local.showEn = false; update()
        await speak(p.ja, { rate: state.settings.speechRate, lang: 'ja-JP', signal: ctrl.signal })
        if (ctrl.signal.aborted) return

        // 2) 発話 / 黙考フェーズ
        local.stage = 'speaking'; local.speakingRemain = state.settings.pauseSeconds; update()
        if (useMic) {
          await recordSpeakingPhase(ctrl.signal)
        } else {
          // 通常の黙考タイム
          const totalMs = Math.max(0, state.settings.pauseSeconds) * 1000
          const t0 = Date.now()
          while (Date.now() - t0 < totalMs) {
            if (ctrl.signal.aborted) return
            local.speakingRemain = Math.ceil(Math.max(0, totalMs - (Date.now() - t0)) / 1000)
            update()
            await sleep(200, ctrl.signal)
          }
        }
        if (ctrl.signal.aborted) return

        // 3) 英訳再生
        local.stage = 'en'; local.showEn = true; update()
        await speak(p.en, { rate: state.settings.speechRate, lang: 'en-US', signal: ctrl.signal })
        if (ctrl.signal.aborted) return
        sendLog({
          mode: 'voice', action: 'play',
          categoryId: c.id, categoryTitle: c.title,
          phraseId: p.id, ja: p.ja, en: p.en,
          userInput: '', correct: '', similarity: '',
        })

        // 4) 自動採点（マイクが使えた場合）
        if (useMic && local.recognized) {
          local.judgeResult = judge(local.recognized, p.en, state.settings.strictMatch)
        } else {
          local.judgeResult = null
        }

        // 5) 結果表示 → 次へ待機
        local.stage = 'judging'; update()
        const r = await waitForJudgment(ctrl.signal)
        if (r === 'aborted') return

        await sleep(400, ctrl.signal)
      }
    } finally {
      if (local.abort === ctrl) {
        local.playing = false
        local.stage = 'idle'
        update()
      }
    }
  }

  update()
}

// ---------- Settings ----------
function renderSettings() {
  const s = state.settings
  function set(k, v) {
    state.settings = { ...state.settings, [k]: v }
    saveSettings(state.settings)
    renderSettings()
  }
  function setQuiet(k, v) {
    state.settings = { ...state.settings, [k]: v }
    saveSettings(state.settings)
  }
  const endpointInput = el('input', {
    type: 'text', placeholder: 'https://script.google.com/macros/s/.../exec',
    style: 'width:100%;padding:10px;border:1px solid var(--slate-200);border-radius:10px;font-size:13px;font-family:ui-monospace,monospace',
    value: s.sheetEndpoint || '',
  })
  endpointInput.addEventListener('input', (e) => setQuiet('sheetEndpoint', e.target.value.trim()))

  const u = state.user

  root.replaceChildren(
    el('button', { class: 'btn-ghost btn-sm back-link', onclick: () => navigate({ name: 'home' }) }, '← 戻る'),
    el('h1', { class: 'page-title' }, '設定'),

    // --- Account section ---
    el('h2', { class: 'section-title', style: 'margin-top:8px' }, 'アカウント'),
    el('div', { class: 'card', style: 'margin-bottom:16px' },
      el('div', { class: 'account-row' },
        el('div', {},
          el('div', { class: 'setting-title' }, u?.name || '(未ログイン)'),
          el('div', { class: 'setting-desc', style: 'font-family:ui-monospace,monospace;margin-top:2px' }, u?.email || ''),
        ),
        el('button', {
          class: 'btn-secondary btn-sm',
          onclick: () => {
            if (!confirm('ログアウトしますか？\nこのデバイスのログイン情報・進捗が消去されます。')) return
            clearUser()
            state.user = null
            state.progress = {}
            saveProgress(state.progress)
            navigate({ name: 'home' })
          }
        }, 'ログアウト')
      )
    ),

    // --- Spreadsheet section ---
    el('h2', { class: 'section-title', style: 'margin-top:8px' }, '記録先（管理者向け）'),
    el('div', { class: 'card', style: 'margin-bottom:16px' },
      el('div', { class: 'setting-title', style: 'margin-bottom:6px' }, 'Google スプレッドシート 送信先 URL'),
      endpointInput,
      el('p', { class: 'setting-desc' }, 'Google Apps Script で発行した Web App の URL（…/exec）を貼り付けてください。空欄だと送信は無効になります。'),
      el('div', { style: 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap' },
        el('button', {
          class: 'btn-secondary btn-sm',
          onclick: () => {
            if (!state.settings.sheetEndpoint?.trim()) { alert('URLを入力してください'); return }
            sendLog({
              mode: 'system', action: 'connection_test',
              categoryId: '', categoryTitle: '',
              phraseId: '', ja: '', en: '', userInput: 'connection test',
              correct: '', similarity: '',
            })
            alert('テスト送信しました。スプレッドシートをご確認ください。')
          }
        }, '🔌 テスト送信'),
      )
    ),

    // --- Practice section ---
    el('h2', { class: 'section-title', style: 'margin-top:24px' }, '学習'),
    el('div', { class: 'card', style: 'margin-bottom:16px' },
      el('div', { class: 'setting-head' },
        el('span', { class: 'setting-title' }, '黙考タイム（音声モード）'),
        el('span', { class: 'setting-value' }, `${s.pauseSeconds}s`)
      ),
      el('input', {
        type: 'range', min: 1, max: 15, step: 1, value: s.pauseSeconds,
        oninput: (e) => set('pauseSeconds', Number(e.target.value)),
      }),
      el('p', { class: 'setting-desc' }, '日本語と英訳の間に置くポーズ秒数')
    ),
    el('div', { class: 'card', style: 'margin-bottom:16px' },
      el('div', { class: 'setting-head' },
        el('span', { class: 'setting-title' }, '音声再生スピード'),
        el('span', { class: 'setting-value' }, `${s.speechRate.toFixed(2)}x`)
      ),
      el('input', {
        type: 'range', min: 0.5, max: 1.5, step: 0.05, value: s.speechRate,
        oninput: (e) => set('speechRate', Number(e.target.value)),
      })
    ),
    el('label', { class: 'card checkbox-row', style: 'margin-bottom:16px' },
      el('input', { type: 'checkbox', checked: s.voiceAutoGrade, onchange: (e) => set('voiceAutoGrade', e.target.checked) }),
      el('div', {},
        el('div', { class: 'setting-title' }, '音声モードで自動採点する'),
        el('p', { class: 'setting-desc' }, 'マイクで発話を認識し、正解との類似度で自動採点します。OFFにすると自己採点モード（旧仕様）に戻ります。Chrome / Edge推奨。')
      )
    ),
    el('label', { class: 'card checkbox-row', style: 'margin-bottom:16px' },
      el('input', { type: 'checkbox', checked: s.shuffle, onchange: (e) => set('shuffle', e.target.checked) }),
      el('div', {},
        el('div', { class: 'setting-title' }, 'シャッフル出題'),
        el('p', { class: 'setting-desc' }, 'フレーズの順序をランダムにします')
      )
    ),
    el('label', { class: 'card checkbox-row', style: 'margin-bottom:24px' },
      el('input', { type: 'checkbox', checked: s.strictMatch, onchange: (e) => set('strictMatch', e.target.checked) }),
      el('div', {},
        el('div', { class: 'setting-title' }, '厳密一致モード'),
        el('p', { class: 'setting-desc' }, "OFF時は表記揺れ（I'm/I am、wanna/want toなど）を許容します")
      )
    ),
    el('div', { class: 'card danger-card' },
      el('h2', { class: 'section-title' }, '進捗をリセット'),
      el('p', { class: 'setting-desc', style: 'margin-bottom:12px' }, '全カテゴリの正答記録を消去します（元に戻せません）'),
      el('button', {
        class: 'btn-danger',
        onclick: () => {
          if (confirm('進捗をすべて消去します。よろしいですか？')) {
            state.progress = {}
            saveProgress(state.progress)
            alert('進捗をリセットしました')
          }
        }
      }, '進捗をリセット')
    )
  )
}

// ---------- Bootstrap ----------
fetch('./data/phrases.json')
  .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
  .then(data => { state.categories = data; render() })
  .catch(err => {
    root.replaceChildren(el('div', { class: 'error' },
      el('h2', { style: 'margin-top:0' }, '読み込みエラー'),
      el('p', {}, String(err))
    ))
  })

// Pre-load voices for snappier first speak
loadVoices()
