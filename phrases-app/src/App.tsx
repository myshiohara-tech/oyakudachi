import { useEffect, useMemo, useState } from 'react'
import type { Category, Mode, ProgressMap, Settings } from './types'
import {
  defaultSettings,
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
} from './utils/storage'
import CategoryList from './components/CategoryList'
import ModeSelect from './components/ModeSelect'
import TextMode from './components/TextMode'
import VoiceMode from './components/VoiceMode'
import SettingsPanel from './components/SettingsPanel'

type View =
  | { name: 'home' }
  | { name: 'mode'; categoryId: number }
  | { name: Mode; categoryId: number }
  | { name: 'settings' }

export default function App() {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>({ name: 'home' })
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [progress, setProgress] = useState<ProgressMap>({})

  useEffect(() => {
    setSettings(loadSettings())
    setProgress(loadProgress())
  }, [])

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/phrases.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: Category[]) => setCategories(data))
      .catch((e) => setError(String(e)))
  }, [])

  const updateSettings = (s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }
  const updateProgress = (p: ProgressMap) => {
    setProgress(p)
    saveProgress(p)
  }

  const currentCategory = useMemo(() => {
    if (view.name === 'home' || view.name === 'settings') return null
    return categories?.find((c) => c.id === view.categoryId) ?? null
  }, [categories, view])

  if (error) {
    return (
      <div className="min-h-full grid place-items-center p-6">
        <div className="card p-6 max-w-md">
          <h2 className="text-lg font-bold mb-2">読み込みエラー</h2>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!categories) {
    return (
      <div className="min-h-full grid place-items-center p-6 text-slate-500">
        読み込み中...
      </div>
    )
  }

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setView({ name: 'home' })}
            className="text-left"
            aria-label="ホームへ"
          >
            <div className="font-bold text-brand-700">お役立ちフレーズ</div>
            <div className="text-xs text-slate-500">英会話 練習アプリ</div>
          </button>
          <button
            className="btn-ghost text-sm"
            onClick={() => setView({ name: 'settings' })}
          >
            ⚙ 設定
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {view.name === 'home' && (
          <CategoryList
            categories={categories}
            progress={progress}
            onPick={(id) => setView({ name: 'mode', categoryId: id })}
          />
        )}

        {view.name === 'mode' && currentCategory && (
          <ModeSelect
            category={currentCategory}
            onBack={() => setView({ name: 'home' })}
            onPick={(mode: Mode) =>
              setView({ name: mode, categoryId: currentCategory.id })
            }
          />
        )}

        {view.name === 'text' && currentCategory && (
          <TextMode
            category={currentCategory}
            settings={settings}
            progress={progress}
            onUpdateProgress={updateProgress}
            onBack={() =>
              setView({ name: 'mode', categoryId: currentCategory.id })
            }
          />
        )}

        {view.name === 'voice' && currentCategory && (
          <VoiceMode
            category={currentCategory}
            settings={settings}
            onBack={() =>
              setView({ name: 'mode', categoryId: currentCategory.id })
            }
          />
        )}

        {view.name === 'settings' && (
          <SettingsPanel
            settings={settings}
            onChange={updateSettings}
            onResetProgress={() => updateProgress({})}
            onBack={() => setView({ name: 'home' })}
          />
        )}
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-8 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} お役立ちフレーズ
      </footer>
    </div>
  )
}
