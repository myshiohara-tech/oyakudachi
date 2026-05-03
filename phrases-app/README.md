# お役立ちフレーズ 学習アプリ

英会話スクール「お役立ちフレーズ」の暗記・定着用Webアプリです。

## 機能

- **テキストモード**：日本語表示 → キーボード or 音声で英訳入力 → 差分判定
- **音声モード**：日本語音声 → 黙考タイム → 英訳音声を自動連続再生
- 進捗管理（localStorage）
- シャッフル出題、再生速度・黙考秒数の調整
- 厳密一致 / 表記揺れ許容（I'm/I am, wanna/want to など）

## セットアップ

```bash
cd phrases-app
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開いてください。

### 推奨ブラウザ

- 音声入力（SpeechRecognition）：Google Chrome / Microsoft Edge
- 音声再生（SpeechSynthesis）：Safari / Chrome / Edge

## ビルド

```bash
npm run build
```

`dist/` に静的ファイルが出力されます。

## Netlify デプロイ

リポジトリをNetlifyに接続するだけでOKです（`netlify.toml` を同梱済み）。

- ビルドコマンド: `npm run build`
- 公開ディレクトリ: `dist`

または、`dist/` をドラッグ＆ドロップでもデプロイできます。

## データ追加・編集

`public/data/phrases.json` を編集してください。
カテゴリ単位で `{ id, title, subtitle, phrases: [{ id, ja, en }] }` 形式です。
