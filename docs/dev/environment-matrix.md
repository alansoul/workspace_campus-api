# Environment Variable Matrix & Security Audit Reference

This document provides a comprehensive audit of all configuration flags, credentials, service secrets, and operational environment variables utilized across **Campus API**[cite: 13].

---

## 🔒 Security Classification Standards

Environment variables are classified according to their risk profile:

| Classification | Definition | Exposure Policy |
| :--- | :--- | :--- |
| **CRITICAL SECRET** | Encryption keys, database passwords, private OAuth secrets. | Never commit to Git[cite: 13]. Inject exclusively via cloud secret managers (Render, AWS, Doppler)[cite: 13]. |
| **INTEGRATION KEY** | External service API keys (Google AI, Resend, LiveKit)[cite: 13]. | Rotate quarterly; isolate usage through domain/IP whitelisting where applicable. |
| **RUNTIME CONFIG** | Port bindings, URLs, operational mode flags[cite: 13]. | Safe for internal team reference; varies between local and production tiers[cite: 13]. |

---

## 📊 Comprehensive Environment Variable Audit

### 1. Core Server Runtime
| Variable Name | Classification | Default Value | Required | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | RUNTIME CONFIG | `4000` | Optional | Port on which the NestJS HTTP listener and WebSocket gateway bind (`main.ts`)[cite: 12, 13]. |
| `NODE_ENV` | RUNTIME CONFIG | `development` | Optional | Controls production optimizations, cookie security (`secure: true`), and detailed error stacks[cite: 12, 13]. |
| `FRONTEND_URL` | RUNTIME CONFIG | `http://localhost:3000` | Recommended | Primary frontend origin allowed in CORS policies, cookie domain origins, and OAuth redirects[cite: 12, 13]. |
| `BACKEND_URL` | RUNTIME CONFIG | `http://localhost:4000` | Recommended | Canonical base URL used when constructing public URLs for uploaded media files (`chat.controller.ts`)[cite: 12, 13]. |

---

### 2. Database & Persistence Layer (Neon Serverless PostgreSQL)
| Variable Name | Classification | Default Value | Required | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | CRITICAL SECRET | — | **Mandatory** | Neon pooled connection string (PgBouncer) for multi-schema runtime operations (`base.prisma`)[cite: 12, 13]. |
| `DIRECT_URL` | CRITICAL SECRET | — | **Mandatory** | Direct, unpooled PostgreSQL endpoint required by Prisma CLI for `db push` and migrations[cite: 12, 13]. |

---

### 3. Identity, Sessions & Cryptography (IAM)
| Variable Name | Classification | Default Value | Required | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `JWT_SECRET` | CRITICAL SECRET | `dev-only-secret...` | **Mandatory in Prod** | Symmetric secret for signing 7-day authentication tokens (`iam.module.ts`)[cite: 12, 13]. App throws fatal crash if missing in prod. |
| `JWT_EXPIRES_IN` | RUNTIME CONFIG | `7d` | Optional | Lifetime expiration duration for issued student and administrative bearer tokens[cite: 12]. |
| `ADMIN_EMAIL` | RUNTIME CONFIG | — | Optional | Hardcoded fallback email recognized by chat moderation checks to allow administrative message deletion[cite: 12, 13]. |

---

### 4. Generative AI & Schedule OCR (Google Gemini)
| Variable Name | Classification | Default Value | Required | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | INTEGRATION KEY | — | **Mandatory for AI** | Google AI Studio developer key powering the AI Copilot fallback chain and timetable OCR parsing (`ai.service.ts`)[cite: 12, 13]. |

---

### 5. Google OAuth & Academic Gmail Synchronization
| Variable Name | Classification | Default Value | Required | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `GOOGLE_CLIENT_ID` | RUNTIME CONFIG | — | Optional | Google Cloud OAuth2 client ID used for SSO authentication (`google.strategy.ts`)[cite: 12, 13]. |
| `GOOGLE_CLIENT_SECRET` | CRITICAL SECRET | — | Optional | Client secret paired with `GOOGLE_CLIENT_ID` for token exchange[cite: 12, 13]. |
| `GOOGLE_CALLBACK_URL` | RUNTIME CONFIG | `.../api/auth/google/callback` | Optional | Authorized OAuth redirect URI registered in Google Cloud Console[cite: 12, 13]. |
| `GOOGLE_GMAIL_CLIENT_ID` | RUNTIME CONFIG | Falls back to `GOOGLE_CLIENT_ID` | Optional | Dedicated OAuth client identifier for reading user campus Gmail inboxes (`google-gmail.service.ts`)[cite: 12, 13]. |
| `GOOGLE_GMAIL_CLIENT_SECRET`| CRITICAL SECRET | Falls back to `GOOGLE_CLIENT_SECRET`| Optional | Secret for exchanging Gmail access/refresh tokens[cite: 12, 13]. |
| `GOOGLE_GMAIL_REDIRECT_URI` | RUNTIME CONFIG | `.../api/universities/auth/google-gmail/callback` | Optional | Redirect callback URI for Gmail `readonly` consent[cite: 12, 13]. |

---

### 6. Transactional Mail Service (Resend)
| Variable Name | Classification | Default Value | Required | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `RESEND_API_KEY` | INTEGRATION KEY | — | Optional | API token from Resend (`mail.service.ts`)[cite: 12, 13]. If unset, OTPs are piped exclusively to backend stdout logs[cite: 12]. |
| `EMAIL_FROM` | RUNTIME CONFIG | `Northstar <onboarding@resend.dev>` | Optional | Verified sender address header for outgoing verification messages[cite: 12, 13]. |
| `DEV_OVERRIDE_EMAIL` | RUNTIME CONFIG | `alansoul796@gmail.com` | Optional | Development override routing sandbox emails to account owner to avoid Resend 403 errors[cite: 12, 13]. |

---

### 7. Ephemeral OTP Storage (Upstash Redis)
| Variable Name | Classification | Default Value | Required | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `UPSTASH_REDIS_REST_URL` | INTEGRATION KEY | — | Optional | REST endpoint URL for serverless Redis (`otp.service.ts`)[cite: 12, 13]. |
| `UPSTASH_REDIS_REST_TOKEN` | CRITICAL SECRET | — | Optional | Bearer access token for Upstash Redis[cite: 12, 13]. If missing, an in-memory `Map` is used as fallback[cite: 12, 13]. |
| `EXPOSE_DEV_OTP` | RUNTIME CONFIG | `false` | Optional | When set to `true` in non-prod environments, returns generated OTP directly in API responses for testing[cite: 12, 13]. |

---

### 8. WebRTC Audio/Video SFU (LiveKit)
| Variable Name | Classification | Default Value | Required | Purpose & Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `LIVEKIT_API_KEY` | INTEGRATION KEY | — | Optional | Project access key from LiveKit Cloud console (`chat.controller.ts`)[cite: 12, 13]. |
| `LIVEKIT_API_SECRET` | CRITICAL SECRET | — | Optional | Cryptographic secret used to mint and sign WebRTC room access tokens (`AccessToken.toJwt()`)[cite: 12, 13]. |

---

## 🛡️ Production Security Checklist

Before deploying `campus-api` to cloud infrastructure (such as Render or AWS):

1. **Purge Committed Credentials:** Confirm that `.gmail_session.json` is added to `.gitignore` and any existing refresh tokens are revoked[cite: 12, 13].
2. **Rotate Database Passwords:** If default database strings or passwords from `prisma/seed.ts` (`Admin@123456`) were deployed to public instances, update credentials immediately[cite: 12, 13].
3. **Verify Neon SSL Parameters:** Ensure all PostgreSQL connection strings contain `?sslmode=require` to enforce TLS in transit[cite: 12].
4. **Disable Debug Flags:** Set `NODE_ENV=production` and ensure `EXPOSE_DEV_OTP=false` (or unset)[cite: 12, 13].
5. **CORS Allowlist Audit:** Restrict `FRONTEND_URL` strictly to your official production domain (e.g., `https://workspace-campus-web.vercel.app`) to block unauthorized cross-origin requests[cite: 12, 13].