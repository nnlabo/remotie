# Remotie

Remotie is a small PWA for turning an iPhone into a quick, temporary live presence device.

iPhone を置いて、Start を押す。別の端末で `/watch` を開く。

それだけで、その場の映像と音声を確認できるようにするためのプロジェクトです。

## Why

There are plenty of ways to stream video. Most of them ask for too much ceremony when all you need is a quick check.

Remotie is for moments like:

- leaving a front desk for a few minutes
- checking a meeting room from another device
- placing a phone at a work site during a short task
- testing whether a simple remote-presence workflow is useful before buying hardware

これは監視カメラを増やすためのものではありません。

「今だけ見たい」「今だけ聞きたい」を、会社支給の iPhone や手元のスマートフォンで済ませるための道具です。

The product bias is deliberately plain:

> Open. Tap Start. Keep it running only while it is useful. Stop.

No recording. No public share links. No YouTube or Google Meet automation.

## Current State

This is still an MVP, but the main loop is working:

- `/go` starts the sender experience
- `/watch` opens the viewer experience
- LiveKit carries the audio/video stream
- DynamoDB can hold shared stream state for hosted deployments
- Basic Auth can protect the app while it is still private/internal
- The sender has camera/mic controls, camera switching, and a screen-hide clock view
- The viewer has quality selection, fullscreen, pinch zoom, and pan
- Transcript and Summary are opt-in; summary can use Amazon Bedrock
- `/go` and `/watch` have separate iPhone Home Screen icons

まだMVPなので、細かい粗はあります。特に iOS PWA まわりは実機で見ながら育てています。

## Pages

- `/go` - sender page for the iPhone
- `/watch` - viewer page for another phone or PC

On iPhone, open each route in Safari and use Share -> Add to Home Screen.

`/go` and `/watch` use different manifests and Apple touch icons, so they can appear as separate apps.

## Local Setup

```bash
npm install
npm run dev
```

If port `3000` is busy:

```bash
npm run dev -- -p 3001
```

Then open:

- Sender: `http://localhost:3000/go`
- Viewer: `http://localhost:3000/watch`

Useful checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Environment

Copy `.env.example` to `.env.local` for local development.

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

Real secrets should live in your hosting provider or AWS environment, not in Git.

実値の入った `.env*` はコミットしないでください。`.env.example` はプレースホルダーだけです。

## Hosting

This repo includes `amplify.yml` for AWS Amplify Hosting.

For a hosted setup, the usual pieces are:

- AWS Amplify Hosting for the Next.js app
- LiveKit Cloud for WebRTC
- DynamoDB for shared stream/transcript state
- Amazon Bedrock for optional summaries

The DynamoDB table can be created with:

```bash
aws cloudformation deploy \
  --stack-name remotie-state \
  --template-file infra/remotie-state.yaml \
  --parameter-overrides TableName=remotie-stream-state
```

The Amplify compute role needs `dynamodb:GetItem` and `dynamodb:PutItem` on that table.

If summaries are enabled, it also needs permission to call Bedrock, for example `bedrock:InvokeModel` for the model/profile you choose.

## Transcript and Summary

Transcript is intentionally opt-in.

The current flow is:

1. The viewer presses `Transcript`.
2. The sender attempts browser speech recognition when supported.
3. Final text snippets are sent to `/api/transcript/append`.
4. The viewer can press `Summary`.
5. The server asks Bedrock to summarize the collected text.

This bridge is temporary. It does not save audio files. A production version should replace the browser speech bridge with an AWS Transcribe Streaming worker or another no-recording speech pipeline.

文字起こしは、常時ONではなく「必要な時だけ」にしています。

Remotie の用途では、全部を記録するより、必要な場面だけ状況を短く掴めるほうが大事だと考えています。

## iOS Notes

iOS is the most important target, and also the place where the most browser rules show up:

- camera and microphone access may require a direct user gesture
- streaming should not be expected to continue after screen lock
- Home Screen PWA behavior may differ from Safari tab behavior
- autoplay/audio rules can block playback until the user taps
- browser speech recognition support varies by iOS version and PWA context

In practice: test on the actual iPhone you plan to use.

## Security Notes

Before making a fork or deployment public:

- keep real `.env*` files out of Git
- enable GitHub secret scanning and push protection
- keep LiveKit secrets, Basic Auth passwords, and AWS credentials in environment variables
- rotate anything that may have been pasted into chat, logs, screenshots, or a browser console

`/api/system/status` only reports whether features are configured. It does not return secret values.

## Not In Scope

For now, Remotie does not do:

- recording
- public broadcast links
- YouTube Live integration
- Google Meet automation
- admin dashboards
- payment or multi-tenant account management

Those may be useful someday, but they are not the point of this first version.

## License

No license has been selected yet.
