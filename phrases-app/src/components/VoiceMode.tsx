import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Phrase, Settings } from '../types'
import { cancelSpeech, sleep, speak } from '../utils/speech'

type Props = {
  category: Category
  settings: Settings
  onBack: () => void
}

type Stage = 'idle' | 'ja' | 'pause' | 'en'

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function VoiceMode({ category, settings, onBack }: Props) {
  const order = useMemo<Phrase[]>(
    () => (settings.shuffle ? shuffled(category.phrases) : category.phrases),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category.id, settings.shuffle]
  )

  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [pauseRemain, setPauseRemain] = useState<number>(settings.pauseSeconds)
  const [showJa, setShowJa] = useState(true)
  const [showEn, setShowEn] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const idxRef = useRef(idx)
  idxRef.current = idx

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      cancelSpeech()
    }
  }, [])

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    cancelSpeech()
    setPlaying(false)
    setStage('idle')
  }

  const playLoop = async (startAt: number) => {
    const ctrl = new AbortController()
    abortRef.current?.abort()
    abortRef.current = ctrl
    setPlaying(true)
    try {
      for (let i = startAt; i < order.length; i++) {
        if (ctrl.signal.aborted) return
        setIdx(i)
        const p = order[i]

        // Japanese
        setStage('ja')
        setShowEn(false)
        await speak(p.ja, {
          rate: settings.speechRate,
          lang: 'ja-JP',
          signal: ctrl.signal,
        })
        if (ctrl.signal.aborted) return

        // Pause (silent reflection)
        setStage('pause')
        const totalMs = Math.max(0, settings.pauseSeconds) * 1000
        const start = Date.now()
        while (Date.now() - start < totalMs) {
          if (ctrl.signal.aborted) return
          const remain = Math.max(0, totalMs - (Date.now() - start))
          setPauseRemain(Math.ceil(remain / 1000))
          await sleep(200, ctrl.signal)
        }
        setPauseRemain(0)
        if (ctrl.signal.aborted) return

        // English
        setStage('en')
        setShowEn(true)
        await speak(p.en, {
          rate: settings.speechRate,
          lang: 'en-US',
          signal: ctrl.signal,
        })
        if (ctrl.signal.aborted) return

        await sleep(600, ctrl.signal)
      }
    } finally {
      if (abortRef.current === ctrl) {
        setPlaying(false)
        setStage('idle')
      }
    }
  }

  const onStart = () => playLoop(idx)
  const onPause = () => stop()
  const onPrev = () => {
    stop()
    setIdx((i) => Math.max(0, i - 1))
  }
  const onNext = () => {
    stop()
    setIdx((i) => Math.min(order.length - 1, i + 1))
  }

  const phrase = order[idx]

  return (
    <div>
      <button onClick={onBack} className="btn-ghost text-sm mb-4">
        ← モード選択
      </button>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">
          {idx + 1} / {order.length}
        </div>
        <div className="text-xs text-slate-400">音声モード</div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-brand-500 transition-all"
          style={{ width: `${((idx + 1) / order.length) * 100}%` }}
        />
      </div>

      <div className="card p-6 mb-4 min-h-[180px]">
        <div className="text-xs text-slate-400 mb-2">フレーズ #{phrase.id}</div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">日本語</span>
            <button
              onClick={() => setShowJa((v) => !v)}
              className="btn-ghost text-[11px] px-2 py-0.5"
            >
              {showJa ? '隠す' : '表示'}
            </button>
          </div>
          <p className="text-lg font-semibold leading-relaxed">
            {showJa ? phrase.ja : '••••••'}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">英訳</span>
            <button
              onClick={() => setShowEn((v) => !v)}
              className="btn-ghost text-[11px] px-2 py-0.5"
            >
              {showEn ? '隠す' : '表示'}
            </button>
          </div>
          <p className="text-lg leading-relaxed text-slate-700">
            {showEn ? phrase.en : '••••••'}
          </p>
        </div>

        <div className="mt-4 text-center">
          {stage === 'ja' && (
            <span className="inline-block px-3 py-1 rounded-full text-xs bg-blue-50 text-blue-700">
              🔊 日本語再生中...
            </span>
          )}
          {stage === 'pause' && (
            <span className="inline-block px-3 py-1 rounded-full text-xs bg-amber-50 text-amber-700">
              💭 心の中で英訳... ({pauseRemain}s)
            </span>
          )}
          {stage === 'en' && (
            <span className="inline-block px-3 py-1 rounded-full text-xs bg-green-50 text-green-700">
              🔊 英訳再生中...
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={onPrev} className="btn-secondary">
          ←
        </button>
        {playing ? (
          <button onClick={onPause} className="btn-primary flex-1">
            ⏸ 一時停止
          </button>
        ) : (
          <button onClick={onStart} className="btn-primary flex-1">
            ▶ 自動再生
          </button>
        )}
        <button onClick={onNext} className="btn-secondary">
          →
        </button>
      </div>

      <p className="mt-3 text-[11px] text-slate-400 text-center">
        黙考タイム: {settings.pauseSeconds}秒 / 速度: {settings.speechRate}x
        （設定から調整できます）
      </p>
    </div>
  )
}
