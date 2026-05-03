import type { Category, ProgressMap } from '../types'
import { progressKey } from '../utils/storage'

type Props = {
  categories: Category[]
  progress: ProgressMap
  onPick: (id: number) => void
}

export default function CategoryList({ categories, progress, onPick }: Props) {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">学習カテゴリ</h1>
      <p className="text-sm text-slate-500 mb-6">
        練習したいカテゴリを選んでください
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {categories.map((c) => {
          const total = c.phrases.length
          let attempted = 0
          let correct = 0
          for (const p of c.phrases) {
            const e = progress[progressKey(c.id, p.id)]
            if (e) {
              attempted++
              if (e.correct > 0) correct++
            }
          }
          const pct = total ? Math.round((correct / total) * 100) : 0
          return (
            <li key={c.id}>
              <button
                onClick={() => onPick(c.id)}
                className="card w-full text-left p-4 hover:border-brand-500 hover:shadow-md transition"
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xs font-mono text-brand-600">
                    #{String(c.id).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-slate-400">
                    {total} フレーズ
                  </span>
                </div>
                <h2 className="font-semibold mb-1 leading-snug">{c.title}</h2>
                <p className="text-xs text-slate-500 line-clamp-2">
                  {c.subtitle}
                </p>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>進捗</span>
                    <span>
                      {correct} / {total} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {attempted > 0 && (
                    <div className="mt-1 text-[10px] text-slate-400">
                      挑戦済み: {attempted}
                    </div>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
