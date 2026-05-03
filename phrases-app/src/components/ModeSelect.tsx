import type { Category, Mode } from '../types'

type Props = {
  category: Category
  onBack: () => void
  onPick: (m: Mode) => void
}

export default function ModeSelect({ category, onBack, onPick }: Props) {
  return (
    <div>
      <button onClick={onBack} className="btn-ghost text-sm mb-4">
        ← カテゴリ一覧
      </button>
      <div className="card p-5 mb-6">
        <div className="text-xs font-mono text-brand-600 mb-1">
          #{String(category.id).padStart(2, '0')}
        </div>
        <h1 className="text-xl font-bold mb-1">{category.title}</h1>
        <p className="text-sm text-slate-500">{category.subtitle}</p>
        <p className="text-xs text-slate-400 mt-2">
          全 {category.phrases.length} フレーズ
        </p>
      </div>

      <h2 className="font-semibold mb-3">学習モードを選んで下さい</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => onPick('text')}
          className="card p-5 text-left hover:border-brand-500 hover:shadow-md transition"
        >
          <div className="text-3xl mb-2">⌨️</div>
          <div className="font-semibold mb-1">テキストモード</div>
          <p className="text-xs text-slate-500">
            日本語を見て、キーボードか音声で英訳を入力。差分でフィードバック。
          </p>
        </button>
        <button
          onClick={() => onPick('voice')}
          className="card p-5 text-left hover:border-brand-500 hover:shadow-md transition"
        >
          <div className="text-3xl mb-2">🎧</div>
          <div className="font-semibold mb-1">音声モード</div>
          <p className="text-xs text-slate-500">
            日本語音声 → 黙考タイム → 英訳音声。連続再生で耳で覚える。
          </p>
        </button>
      </div>
    </div>
  )
}
