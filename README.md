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

## Environment Variables

Copy `.env.example` to `.env.local` when needed.

```bash
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

LiveKit variables are placeholders for a later WebRTC integration. Do not commit real secrets.

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
