export type Phrase = {
  id: number
  ja: string
  en: string
}

export type Category = {
  id: number
  title: string
  subtitle: string
  phrases: Phrase[]
}

export type Mode = 'text' | 'voice'

export type Settings = {
  pauseSeconds: number
  speechRate: number
  shuffle: boolean
  strictMatch: boolean
}

export type ProgressEntry = {
  attempts: number
  correct: number
  lastAttemptAt: number
}

export type ProgressMap = Record<string, ProgressEntry>
