import type { Settings } from '../types'

type Props = {
  settings: Settings
  onChange: (s: Settings) => void
  onResetProgress: () => void
  onBack: () => void
}

export default function SettingsPanel({
  settings,
  onChange,
  onResetProgress,
  onBack,
}: Props) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    onChange({ ...settings, [k]: v })

  return (
    <div>
      <button onClick={onBack} className="btn-ghost text-sm mb-4">
        ← 戻る
      </button>
      <h1 className="text-2xl font-bold mb-6">設定</h1>

      <div className="card p-5 mb-4">
        <label className="block">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">黙考タイム（音声モード）</span>
            <span className="font-mono text-sm text-slate-500">
              {settings.pauseSeconds}s
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={1}
            value={settings.pauseSeconds}
            onChange={(e) => set('pauseSeconds', Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-slate-500 mt-1">
            日本語と英訳の間に置くポーズ秒数
          </p>
        </label>
      </div>

      <div className="card p-5 mb-4">
        <label className="block">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">音声再生スピード</span>
            <span className="font-mono text-sm text-slate-500">
              {settings.speechRate}x
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={settings.speechRate}
            onChange={(e) => set('speechRate', Number(e.target.value))}
            className="w-full"
          />
        </label>
      </div>

      <div className="card p-5 mb-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.shuffle}
            onChange={(e) => set('shuffle', e.target.checked)}
            className="mt-1"
          />
          <div>
            <div className="font-medium">シャッフル出題</div>
            <p className="text-xs text-slate-500">
              フレーズの順序をランダムにします
            </p>
          </div>
        </label>
      </div>

      <div className="card p-5 mb-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.strictMatch}
            onChange={(e) => set('strictMatch', e.target.checked)}
            className="mt-1"
          />
          <div>
            <div className="font-medium">厳密一致モード</div>
            <p className="text-xs text-slate-500">
              OFF時は表記揺れ（I'm/I am、wanna/want toなど）を許容します
            </p>
          </div>
        </label>
      </div>

      <div className="card p-5 border-red-200">
        <h2 className="font-semibold mb-2">進捗をリセット</h2>
        <p className="text-xs text-slate-500 mb-3">
          全カテゴリの正答記録を消去します（元に戻せません）
        </p>
        <button
          onClick={() => {
            if (confirm('進捗をすべて消去します。よろしいですか？')) {
              onResetProgress()
            }
          }}
          className="btn bg-red-500 text-white hover:bg-red-600"
        >
          進捗をリセット
        </button>
      </div>
    </div>
  )
}
