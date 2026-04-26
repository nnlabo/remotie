# Remotie

Remotie is the initial MVP codebase for **Instant Listen**, an iPhone-first Next.js PWA. The goal is simple: open `/go`, grant camera and microphone access, press one large Start button, and let another device open `/watch` to see whether the local mock stream is live.

This first implementation intentionally does **not** include WebRTC, recording, YouTube, Google Meet, or hardcoded secrets.

## Current MVP Scope

- Next.js App Router with TypeScript
- Tailwind CSS mobile-first UI
- PWA manifest and service worker shell
- `/go` sender page
- `/watch` viewer page
- Camera preview via `navigator.mediaDevices.getUserMedia()`
- Microphone level meter via `AudioContext`
- Local/mock stream state machine
- API routes:
  - `POST /api/stream/start`
  - `POST /api/stream/stop`
  - `GET /api/stream/status`
- Auto-stop after 60 minutes
- No recording
- No public share flow

## Local Setup

```bash
npm install
npm run dev
```

If port 3000 is already in use, choose another port:

```bash
npm run dev -- -p 3001
```

Open:

- Sender: `http://localhost:3000/go` or your chosen port
- Viewer: `http://localhost:3000/watch` or your chosen port

For type checking:

```bash
npm run typecheck
```

For production build:

```bash
npm run build
```

## Internet Testing

For iPhone testing, deploy to an HTTPS URL. Camera and microphone permissions are much easier to validate on a real public HTTPS origin than on a local network address.

### AWS Amplify Hosting

This repository includes `amplify.yml` for Amplify Hosting.

Recommended Amplify settings:

- Repository: `nnlabo/remotie`
- Branch: `main`
- Framework preset: Next.js
- Build command: `npm run build`
- Install command: `npm ci`
- Output/artifact directory: `.next`
- Environment variable: `NEXT_PUBLIC_APP_BASE_URL=https://<your-amplify-domain>`
- Optional access gate:
  - `REMOTIE_BASIC_USER=<your-user>`
  - `REMOTIE_BASIC_PASSWORD=<your-password>`
- Optional AWS-backed state:
  - `REMOTIE_STREAM_TABLE=<dynamodb-table-name>`
  - `REMOTIE_AWS_REGION=ap-northeast-1`

After deployment, test:

- Sender: `https://<your-amplify-domain>/go`
- Viewer: `https://<your-amplify-domain>/watch`

Important: the current MVP stores stream state in memory. On serverless or multi-instance hosting, `/go` and `/watch` may not always share the same process. If status switching is inconsistent after deployment, replace `lib/stream-store.ts` with a durable shared store before deeper testing.

For AWS-backed state, create a DynamoDB table with:

- Table name: any name, for example `remotie-stream-state`
- Partition key: `pk` (String)

Then set `REMOTIE_STREAM_TABLE` to that table name and make sure the Amplify compute role can call `dynamodb:GetItem` and `dynamodb:PutItem` on the table.

You can create the table from the included CloudFormation template:

```bash
aws cloudformation deploy \
  --stack-name remotie-state \
  --template-file infra/remotie-state.yaml \
  --parameter-overrides TableName=remotie-stream-state
```

After the stack is created, set `REMOTIE_STREAM_TABLE=remotie-stream-state` in Amplify and attach this IAM policy to the Amplify compute role, replacing the table ARN:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem"],
      "Resource": "<StreamStateTableArn>"
    }
  ]
}
```

### Fastest Next.js Smoke Test

Vercel is also a good quick smoke-test target for a Next.js app because it auto-detects the framework from GitHub. The same in-memory state caveat applies there too.

## Environment Variables

Copy `.env.example` to `.env.local` when needed.

```bash
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
REMOTIE_BASIC_USER=
REMOTIE_BASIC_PASSWORD=
REMOTIE_STREAM_TABLE=
REMOTIE_AWS_REGION=ap-northeast-1
```

LiveKit variables are placeholders for a later WebRTC integration. Do not commit real secrets.

`REMOTIE_BASIC_USER` and `REMOTIE_BASIC_PASSWORD` enable a simple HTTP Basic Auth gate when both are set. Leave them empty for local development.

`GET /api/system/status` reports whether Basic Auth and the stream store are configured without exposing secret values. If Basic Auth is active, this endpoint should also require authentication.

## Testing on iPhone

1. Run the app on a machine reachable from the iPhone.
2. Open the local network URL in Safari.
3. Go to `/go`.
4. Grant camera and microphone access.
5. Confirm the preview appears and the mic meter reacts.
6. Add to Home Screen from Safari if you want to test standalone PWA behavior.
7. Keep the PWA in the foreground while testing.

Camera and microphone access require HTTPS in most deployed environments. `localhost` is treated specially by browsers, but a phone testing against another machine usually needs HTTPS or a trusted tunnel.

## iOS Limitations

- iOS may require a user gesture before camera or microphone starts.
- Background streaming should not be assumed to work.
- Streaming may stop or become unreliable when the screen locks.
- Home-screen PWA behavior can differ from Safari tabs.
- Device camera labels may not be available until permission is granted.
- Audio output and autoplay policies are stricter on iOS than desktop browsers.

## Mock Stream State

The stream state is held in memory inside the Next.js server process. This is enough for local development, but it is not durable and may reset in serverless or multi-instance hosting.

For Amplify or another production-style deployment, replace `lib/stream-store.ts` with a shared store such as DynamoDB, Supabase, Firebase, or Redis.

## Future Roadmap

- Real authentication and same-user access gate
- Durable stream state storage
- LiveKit sender/viewer token API routes
- Real WebRTC publishing and viewing
- Device pairing and QR code
- Audio-only mode
- Camera switch
- Viewer count and connection quality
- Dark screen mode while streaming
