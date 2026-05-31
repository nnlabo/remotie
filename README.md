# Remotie

## 日本語

Remotie は、iPhone を「必要な瞬間だけ、すぐに置ける見守り・確認用カメラ」として使うための Next.js PWA です。

目的は、監視カメラや専用ハードウェアを増やすことではありません。会社支給の iPhone や手元のスマートフォンを使って、離席前、現場確認、受付まわり、作業場所の一時確認など、「今だけ見たい・聞きたい」場面を最短の手数でつなぐことを目指しています。

開発で大事にしていることは、技術的に派手なことよりも、**必要な時に迷わず使えること**です。Remotie は録画や公開配信を前提にせず、送信側が明示的に Start を押した時だけライブ状態になります。

### 主なユースケース

- 離席中に、受付や部屋の様子を別端末から確認する
- 会議室や作業場所の音声・映像を一時的に確認する
- 現場に iPhone を置き、遠隔のPCやスマートフォンから状況を見る
- 高価な専用カメラを設置する前に、運用が成立するか検証する
- 必要な時だけ文字起こしや要約を使い、状況把握を短く済ませる

### 現在できること

- iPhone-first PWA
- `/go` 送信側ページ
- `/watch` 視聴側ページ
- `/go` でカメラ/マイク権限を取得
- カメラプレビュー
- マイクレベルメーター
- Start / Stop
- LiveKit による音声・映像送受信
- `/watch` の Waiting / Live 表示
- 画質切り替え High / Mid / Low
- 視聴側のピンチズームとドラッグ
- 視聴側のフルスクリーン表示
- 送信側の Screen Hide 時計画面
- 60分自動停止
- DynamoDB によるライブ状態共有
- Basic Auth による簡易アクセスゲート
- 必要時だけの Transcript / Summary UI
- Bedrock Converse API による要約
- `/go` と `/watch` の個別ホーム画面アイコン

### やらないこと

- 録画
- YouTube Live 連携
- Google Meet 自動化
- 公開共有リンクの発行
- 秘密情報のハードコード

### ローカル開発

```bash
npm install
npm run dev
```

ポート `3000` が使われている場合:

```bash
npm run dev -- -p 3001
```

開くURL:

- 送信側: `http://localhost:3000/go`
- 視聴側: `http://localhost:3000/watch`

検証:

```bash
npm run lint
npm run typecheck
npm run build
```

### 環境変数

`.env.example` を参考に `.env.local` を作成してください。実値の入った `.env*` は Git 管理しないでください。

```bash
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
REMOTIE_BASIC_USER=
REMOTIE_BASIC_PASSWORD=
REMOTIE_STREAM_TABLE=
REMOTIE_AWS_REGION=ap-northeast-1
REMOTIE_TRANSCRIPT_PROVIDER=placeholder
REMOTIE_TRANSCRIBE_REGION=ap-northeast-1
REMOTIE_TRANSCRIBE_LANGUAGE_CODE=ja-JP
REMOTIE_SUMMARY_MODEL_ID=apac.amazon.nova-lite-v1:0
```

### AWS Amplify Hosting

このリポジトリには `amplify.yml` が含まれています。

推奨設定:

- Repository: your fork / repository
- Branch: `main`
- Framework preset: Next.js
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `.next`

Amplify 側に設定する主な環境変数:

- `NEXT_PUBLIC_APP_BASE_URL`
- `NEXT_PUBLIC_LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `REMOTIE_BASIC_USER`
- `REMOTIE_BASIC_PASSWORD`
- `REMOTIE_STREAM_TABLE`
- `REMOTIE_AWS_REGION`
- `REMOTIE_SUMMARY_MODEL_ID`

### DynamoDB 状態ストア

本番に近い環境では、メモリではなく DynamoDB を使って `/go` と `/watch` の状態を共有します。

```bash
aws cloudformation deploy \
  --stack-name remotie-state \
  --template-file infra/remotie-state.yaml \
  --parameter-overrides TableName=remotie-stream-state
```

Amplify compute role には、少なくとも対象テーブルへの `dynamodb:GetItem` と `dynamodb:PutItem` を付与してください。

### Transcript / Summary

文字起こしと要約は、常時処理ではなく opt-in です。

- `/watch` の `Transcript` で開始要求
- `/go` が対応ブラウザなら音声認識を開始
- 最終テキストだけを `/api/transcript/append` に送信
- `/watch` の `Show Text` に表示
- `/watch` の `Summary` で Bedrock に要約依頼

現在のブラウザ音声認識ブリッジは暫定実装です。録音ファイルは保存しません。将来的には AWS Transcribe Streaming worker に置き換える想定です。

### iPhone ホーム画面アイコン

`/go` と `/watch` は別々の manifest と Apple touch icon を持っています。

- `/go`: `Remotie Go`、赤い送信アイコン
- `/watch`: `Remotie Watch`、緑の視聴アイコン

iPhone では Safari でそれぞれのURLを直接開き、共有メニューから「ホーム画面に追加」してください。iOS では通常の favicon だけでなく、`apple-touch-icon` と manifest metadata が使われます。

### iOS / PWA の制約

- カメラ/マイク開始にはユーザー操作が必要な場合があります。
- 画面ロック中やバックグラウンドでの配信継続は保証されません。
- ホーム画面PWAとSafariタブで挙動が異なる場合があります。
- iOS の自動再生・音声出力ポリシーは厳しめです。
- ブラウザ音声認識は iOS / Safari / PWA 状態によって利用可否が変わります。

### Public リポジトリ化のセキュリティメモ

- 実値入りの `.env*` は `.gitignore` で除外しています。
- `.env.example` にはプレースホルダーのみを置いています。
- API key、secret、Basic Auth password は Amplify / AWS 側の環境変数で管理します。
- `/api/system/status` は設定有無だけを返し、secret 値は返しません。
- Public化前に GitHub secret scanning を有効にすることを推奨します。
- すでにどこかへ表示・共有した可能性がある credential は、念のためローテーションしてください。

## English

Remotie is a Next.js PWA that turns an iPhone into a quick, temporary live presence device.

The goal is not to add another permanent security camera or dedicated hardware box. The goal is to let a user place a company iPhone or nearby smartphone, tap Start, and quickly check the room, front desk, work area, or temporary situation from another device.

The core product principle is simple: **when you need to step away, starting the stream should take seconds**. Remotie does not assume recording or public broadcasting. The sender must explicitly tap Start before a live session begins.

### Use Cases

- Check a front desk or room while stepping away
- Temporarily observe a meeting room or work area
- Place an iPhone on site and watch from a PC or another phone
- Validate an operational workflow before installing dedicated camera hardware
- Use transcript and summary only when needed for faster situational understanding

### Current Features

- iPhone-first PWA
- `/go` sender page
- `/watch` viewer page
- Camera and microphone permission flow
- Camera preview
- Microphone level meter
- Start / Stop controls
- LiveKit audio/video publishing and viewing
- Waiting / Live viewer states
- Viewer quality controls: High / Mid / Low
- Viewer pinch zoom and drag
- Viewer fullscreen
- Sender Screen Hide clock view
- 60-minute auto-stop
- DynamoDB-backed shared stream state
- Basic Auth access gate
- Opt-in Transcript / Summary UI
- Bedrock Converse API summary support
- Separate Home Screen icons for `/go` and `/watch`

### Out of Scope

- Recording
- YouTube Live integration
- Google Meet automation
- Public share links
- Hardcoded secrets

### Local Development

```bash
npm install
npm run dev
```

If port `3000` is already in use:

```bash
npm run dev -- -p 3001
```

Open:

- Sender: `http://localhost:3000/go`
- Viewer: `http://localhost:3000/watch`

Checks:

```bash
npm run lint
npm run typecheck
npm run build
```

### Environment Variables

Use `.env.example` as a template for `.env.local`. Do not commit real `.env*` files.

```bash
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
REMOTIE_BASIC_USER=
REMOTIE_BASIC_PASSWORD=
REMOTIE_STREAM_TABLE=
REMOTIE_AWS_REGION=ap-northeast-1
REMOTIE_TRANSCRIPT_PROVIDER=placeholder
REMOTIE_TRANSCRIBE_REGION=ap-northeast-1
REMOTIE_TRANSCRIBE_LANGUAGE_CODE=ja-JP
REMOTIE_SUMMARY_MODEL_ID=apac.amazon.nova-lite-v1:0
```

### AWS Amplify Hosting

This repository includes `amplify.yml`.

Recommended settings:

- Repository: your fork / repository
- Branch: `main`
- Framework preset: Next.js
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: `.next`

Set runtime secrets in Amplify environment variables, not in the repository.

### DynamoDB State Store

For production-like hosting, use DynamoDB rather than in-memory state so `/go` and `/watch` share the same live status.

```bash
aws cloudformation deploy \
  --stack-name remotie-state \
  --template-file infra/remotie-state.yaml \
  --parameter-overrides TableName=remotie-stream-state
```

Grant the Amplify compute role `dynamodb:GetItem` and `dynamodb:PutItem` on the table.

### Transcript / Summary

Transcript and summary are opt-in:

- `/watch` requests transcription with `Transcript`
- `/go` starts browser speech recognition when supported
- Final text snippets are sent to `/api/transcript/append`
- `/watch` displays text through `Show Text`
- `Summary` sends the text to Bedrock for summarization

The current browser speech bridge is a temporary no-recording bridge. It does not persist audio files. A future AWS Transcribe Streaming worker can replace it while keeping the same API boundary.

### iPhone Home Screen Icons

`/go` and `/watch` have separate manifests and Apple touch icons:

- `/go`: `Remotie Go`, red sender icon
- `/watch`: `Remotie Watch`, green viewer icon

On iPhone, open each route directly in Safari and use Share -> Add to Home Screen. iOS uses `apple-touch-icon` and manifest metadata for this flow; it is not just the browser favicon.

### iOS / PWA Limitations

- Camera and microphone access may require a user gesture.
- Background streaming and screen-lock streaming are not guaranteed.
- Home Screen PWA behavior can differ from Safari tabs.
- iOS autoplay and audio playback policies are strict.
- Browser speech recognition support varies by iOS / Safari / PWA context.

### Security Notes for Public Repositories

- Real `.env*` files are ignored by Git.
- `.env.example` contains placeholders only.
- API keys, secrets, and Basic Auth passwords belong in Amplify / AWS environment variables.
- `/api/system/status` reports configuration booleans only, never secret values.
- Enable GitHub secret scanning before making the repository public.
- Rotate any credential that may have been displayed, shared, or copied outside the intended secret store.
