import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Phrase, ProgressMap, Settings } from '../types'
import { judge, wordDiff } from '../utils/compare'
import {
  isSpeechRecognitionSupported,
  speak,
  startRecognition,
  type RecognitionHandle,
} from '../utils/speech'
import { progressKey, recordAttempt } from '../utils/storage'

type Props = {
  category: Category
  settings: Settings
  progress: ProgressMap
  onUpdateProgress: (p: ProgressMap) => void
  onBack: () => void
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function TextMode({
  category,
  settings,
  progress,
  onUpdateProgress,
  onBack,
}: Props) {
  const order = useMemo<Phrase[]>(
    () => (settings.shuffle ? shuffled(category.phrases) : category.phrases),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category.id, settings.shuffle]
  )

  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [result, setResult] = useState<ReturnType<typeof judge> | null>(null)
  const [listening, setListening] = useState(false)
  const recRef = useRef<RecognitionHandle | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const phrase = order[idx]
  const sttSupported = isSpeechRecognitionSupported()

  useEffect(() => {
    setInput('')
    setRevealed(false)
    setResult(null)
    inputRef.current?.focus()
  }, [idx, category.id])

  useEffect(() => {
    return () => {
      recRef.current?.stop()
    }
  }, [])

  const onCheck = () => {
    if (!input.trim()) return
    const r = judge(input, phrase.en, settings.strictMatch)
    setResult(r)
    setRevealed(true)
    onUpdateProgress(
      recordAttempt(progress, progressKey(category.id, phrase.id), r.correct)
    )
    speak(phrase.en, { rate: settings.speechRate, lang: 'en-US' }).catch(
      () => {}
    )
  }

  const onReveal = () => {
    setRevealed(true)
    setResult(null)
    speak(phrase.en, { rate: settings.speechRate, lang: 'en-US' }).catch(
      () => {}
    )
  }

  const onNext = () => {
    if (idx < order.length - 1) setIdx(idx + 1)
  }
  const onPrev = () => {
    if (idx > 0) setIdx(idx - 1)
  }

  const onMic = () => {
    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }
    setListening(true)
    recRef.current = startRecognition(
      (text, isFinal) => {
        setInput(text)
        if (isFinal) setListening(false)
      },
      () => setListening(false),
      () => setListening(false),
      'en-US'
    )
    if (!recRef.current) setListening(false)
  }

  const diff = revealed && input.trim() ? wordDiff(input, phrase.en) : null

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (revealed) onNext()
      else onCheck()
    }
  }

  return (
    <div>
      <button onClick={onBack} className="btn-ghost text-sm mb-4">
        ← モード選択
      </button>

      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-slate-500">
          {idx + 1} / {order.length}
        </div>
        <div className="text-xs text-slate-400">テキストモード</div>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-5">
        <div
          className="h-full bg-brand-500 transition-all"
          style={{ width: `${((idx + 1) / order.length) * 100}%` }}
        />
      </div>

      <div className="card p-5 mb-4">
        <div className="text-xs text-slate-400 mb-1">
          フレーズ #{phrase.id}
        </div>
        <p className="text-lg sm:text-xl font-semibold leading-relaxed">
          {phrase.ja}
        </p>
      </div>

      <div className="card p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-700">
            英訳を入力
          </label>
          <button
            type="button"
            onClick={onMic}
            disabled={!sttSupported}
            className={
              listening
                ? 'btn bg-red-500 text-white text-xs px-3 py-1.5'
                : 'btn-secondary text-xs px-3 py-1.5'
            }
            title={sttSupported ? '音声入力' : 'このブラウザでは音声入力非対応'}
          >
            {listening ? '🛑 停止' : '🎤 音声入力'}
          </button>
        </div>
        <textarea
          ref={inputRef}
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type the English translation..."
          className="w-full resize-none border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="text-[11px] text-slate-400 mt-1">
          ⌘/Ctrl + Enter で {revealed ? '次へ' : '答え合わせ'}
        </div>
      </div>

      {!revealed ? (
        <div className="flex gap-2 mb-6">
          <button onClick={onCheck} className="btn-primary flex-1">
            答え合わせ
          </button>
          <button onClick={onReveal} className="btn-secondary">
            答えを見る
          </button>
        </div>
      ) : (
        <div className="card p-4 mb-4 border-l-4 border-brand-500">
          {result && (
            <div className="mb-3">
              {result.correct ? (
                <div className="text-green-600 font-semibold">
                  ✓ 正解です！
                </div>
              ) : (
                <div className="text-amber-600 font-semibold">
                  △ 惜しい！類似度 {Math.round(result.similarity * 100)}%
                </div>
              )}
            </div>
          )}
          <div className="text-xs text-slate-400 mb-1">正解</div>
          <p className="text-lg font-medium leading-relaxed">
            {diff ? (
              diff.map((d, i) => (
                <span key={i} className={d.hit ? '' : 'text-red-500 underline decoration-dotted'}>
                  {d.word}
                  {i < diff.length - 1 ? ' ' : ''}
                </span>
              ))
            ) : (
              phrase.en
            )}
          </p>
          <button
            type="button"
            className="btn-ghost text-xs mt-2"
            onClick={() =>
              speak(phrase.en, { rate: settings.speechRate, lang: 'en-US' })
            }
          >
            🔊 もう一度聞く
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onPrev}
          disabled={idx === 0}
          className="btn-secondary"
        >
          ← 前へ
        </button>
        <button
          onClick={onNext}
          disabled={idx === order.length - 1}
          className="btn-primary"
        >
          次へ →
        </button>
      </div>
    </div>
  )
}
