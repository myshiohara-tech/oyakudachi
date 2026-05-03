import type { ProgressEntry, ProgressMap, Settings } from '../types'

const SETTINGS_KEY = 'phrases-app:settings:v1'
const PROGRESS_KEY = 'phrases-app:progress:v1'

export const defaultSettings: Settings = {
  pauseSeconds: 4,
  speechRate: 1,
  shuffle: false,
  strictMatch: false,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings
    return { ...defaultSettings, ...JSON.parse(raw) }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export function loadProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ProgressMap
  } catch {
    return {}
  }
}

export function saveProgress(p: ProgressMap) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
}

export function progressKey(categoryId: number, phraseId: number) {
  return `${categoryId}:${phraseId}`
}

export function recordAttempt(p: ProgressMap, key: string, correct: boolean): ProgressMap {
  const cur: ProgressEntry = p[key] ?? { attempts: 0, correct: 0, lastAttemptAt: 0 }
  const next: ProgressEntry = {
    attempts: cur.attempts + 1,
    correct: cur.correct + (correct ? 1 : 0),
    lastAttemptAt: Date.now(),
  }
  return { ...p, [key]: next }
}
