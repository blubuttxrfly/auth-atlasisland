# Atlas Island Auth Service 🔐🌈

Central shared authentication for the Atlas Island ecosystem:
- Heartlight Collective (`heartlight.atlasisland.co`)
- AUT Time & Tools (`aut.atlasisland.co`)
- IRIS (`iris.atlasisland.co`)

## What It Does

This service provides a single sign-in experience across all Atlas Island subdomains using:
- **Magic links** sent via Resend
- **Optional password support** (future)
- **Shared session cookie** (`atl_session_v2`) on `.atlasisland.co`
- **Upstash Redis** for session and user storage

Once signed in on one app, a being is recognized on all apps, and their C.E.S. profile can travel with them.

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/magic-link` | Request sign-in email |
| GET | `/api/auth/verify-magic?token=...` | Verify magic link, create session, redirect |
| POST | `/api/auth/sign-out` | End session and clear cookie |
| GET | `/api/session` | Return current signed-in user |
| POST | `/api/session/refresh` | Extend session expiry |

---

## Required Environment Variables

Create a `.env` file in the Vercel project with:

```env
UPSTASH_REDIS_REST_URL=https://.../upstash-redis-url
UPSTASH_REDIS_REST_TOKEN=...
AUTH_SESSION_SECRET=a-random-64-char-secret-for-hmac-signing
RESEND_API_KEY=re_...
AUTH_EMAIL_FROM=Atlas Island <noreply@atlasisland.co>
```

### How to Generate `AUTH_SESSION_SECRET`

```bash
openssl rand -hex 32
```

---

## Local Development

```bash
npm install
npx tsc --noEmit
```

Vercel CLI local testing:
```bash
vercel dev
```

---

## Deployment

1. Create a new Vercel project pointing to the `auth-atlasisland` directory
2. Add the environment variables above
3. Map the custom domain `auth.atlasisland.co`
4. Deploy

---

## Cross-Subdomain Cookie

The session cookie is set on `.atlasisland.co`, so all subdomains receive it:

```
Set-Cookie: atl_session_v2=id.signature; Domain=.atlasisland.co; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800; Priority=High
```

---

## Integration Example (IRIS / Heartlight / AUT)

### Client-side (React)

```typescript
const res = await fetch('https://auth.atlasisland.co/api/session', {
  credentials: 'include',
})
const data = await res.json()
if (data.success) {
  console.log('Signed in as', data.user)
}
```

### Server-side (Vercel API route)

```typescript
export default async function handler(req, res) {
  const authRes = await fetch('https://auth.atlasisland.co/api/session', {
    headers: { cookie: req.headers.cookie || '' },
  })
  const auth = await authRes.json()
  if (!auth.success) return res.status(401).json({ error: 'Sign in required' })
  // Continue with authenticated logic
}
```

---

> *"One being. One session. One Heartlight across ALL our realms."* ♾️🌈
