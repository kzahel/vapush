# vapush

Minimal self-hosted VAPID web push notifications.

## Quick Start

```bash
npx vapush
```

This starts the server on port 3000 and prints:
- A subscribe URL (open on your phone)
- A curl command to send a test push

## Setup

1. **Run the server** (on your home server, behind a reverse proxy like Caddy)
   ```bash
   npx vapush --port=3000
   ```

2. **Subscribe** - Visit the URL on your phone, tap "Enable Notifications"

3. **Send pushes** from scripts, cron jobs, etc:
   ```bash
   curl -X POST https://your-domain.com/api/push/YOUR_SECRET \
     -H "Content-Type: application/json" \
     -d '{"title":"Alert","body":"Server rebooted"}'
   ```

## API

All endpoints except `/api/public-key` require the secret.

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/public-key` | GET | None | Get VAPID public key |
| `/api/subscribe` | POST | Body: `secret` | Register push subscription |
| `/api/unsubscribe` | POST | Body: `secret` | Remove subscription |
| `/api/subscriptions/SECRET` | GET | URL | List all subscriptions |
| `/api/push/SECRET` | POST | URL | Send push to all subscribers |

### Push payload

```json
{
  "title": "Alert title",
  "body": "Alert message",
  "url": "https://optional-click-url.com"
}
```

## Options

```bash
npx vapush --port=3000 --host=0.0.0.0 --data-dir=/path/to/.vapush
```

- `--port` - Server port (default: 3000)
- `--host` - Bind address (default: 0.0.0.0)
- `--data-dir` - Data directory for keys and subscriptions (default: ./.vapush)

## Data Storage

All data is stored in the data directory (default `.vapush/`):

```
.vapush/
├── secret           # Auth token (auto-generated on first run)
├── vapid.json       # VAPID keys for push signing
└── subscriptions.json  # Registered browser subscriptions
```

### Secret Management

The secret is auto-generated on first run. To regenerate:

```bash
rm .vapush/secret
# Restart the server - a new secret will be created
```

After regenerating, you'll need to re-subscribe on all devices with the new URL.

To set a custom secret:

```bash
echo 'my-custom-secret' > .vapush/secret
```

## Design

vapush is intentionally minimal:

- **Single channel** - all subscribers receive all pushes
- **Single secret** - one token for subscribe and send
- **No accounts** - whoever has the secret can use it
- **No topics** - if you need multiple channels, run multiple instances

## Reverse Proxy (Caddy)

```
vapush.example.com {
    reverse_proxy localhost:3000
}
```

## Programmatic Usage

```typescript
import { Vapush } from "vapush";

const vapush = new Vapush({ dataDir: "/path/to/.vapush" });
await vapush.init();

// Send to all subscribers
await vapush.push("Title", "Body", "https://optional-url.com");
```

## License

MIT
