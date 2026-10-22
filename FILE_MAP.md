# Campus API — Complete File Catalog & Purpose Map

This document serves as an exhaustive directory map for **Campus API**. Every single file, script, schema, controller, service, guard, and configuration file in this repository is cataloged below with its plain-English purpose, technical role, and system connections.

---

## 🧭 Quick Navigation

- [1. Root Configuration & Tooling](#1-root-configuration--tooling)
- [2. Multi-Schema Database Engine (`prisma/`)](#2-multi-schema-database-engine-prisma)
- [3. Application Core & Singletons (`src/`)](#3-application-core--singletons-src)
- [4. Identity & Access Management (`src/modules/iam/`)](#4-identity--access-management-srcmodulesiam)
- [5. University & Academics (`src/modules/university/`)](#5-university--academics-srcmodulesuniversity)
- [6. Real-Time Chat & Calls (`src/modules/chat/`)](#6-real-time-chat--calls-srcmoduleschat)
- [7. Freelance & Escrow (`src/modules/freelance/`)](#7-freelance--escrow-srcmodulesfreelance)
- [8. Multimodal AI Copilot (`src/modules/ai/`)](#8-multimodal-ai-copilot-srcmodulesai)
- [9. Testing Harness (`test/`)](#9-testing-harness-test)
- [10. GitHub Automation & CI/CD (`.github/`)](#10-github-automation--cicd-github)

---

## 1. Root Configuration & Tooling

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`package.json`** | NPM Manifest | Defines project metadata, dependencies (NestJS, Prisma, Argon2, Socket.IO), and scripts (`start:dev`, `build`, `db:sync`, `test`). | The application cannot install dependencies or run any scripts. |
| **`pnpm-workspace.yaml`** | PNPM Config | Configures package boundaries and whitelists native compilation for `@prisma/client`, `argon2`, and `esbuild`. | Native binary libraries may fail to compile during `pnpm install`. |
| **`tsconfig.json`** | TypeScript Config | Sets compiler rules: `nodenext` module resolution, strict null checks, decorator reflection, and source maps. | TypeScript compilation fails; decorators like `@Injectable()` and `@Controller()` will not work. |
| **`tsconfig.build.json`** | Build Exclusions | Extends `tsconfig.json` while excluding `test/` and `*.spec.ts` files from production builds in `dist/`. | Development test files will leak into production build bundles. |
| **`nest-cli.json`** | NestJS CLI Config | Directs NestJS CLI build processes, pointing to `src/` and managing compiler schemes. | `nest build` or `nest start` commands will fail. |
| **`Dockerfile`** | Container Build | Multi-stage Docker container recipe using Node.js 20 on port `4000`. | Containerized cloud deployments (Docker, Render, AWS ECS) cannot build. |
| **`docker-compose.yml`** | Container Orchestration | Local orchestration file mapping port `4000:4000` and binding environment files. | Local multi-container development workflows cannot spin up automatically. |
| **`vitest.config.ts`** | Unit Test Config | Configures Vitest for native ESM unit test execution (`*.spec.ts`) with path aliasing. | Running `pnpm run test` fails to locate and run unit tests. |
| **`vitest.config.e2e.ts`** | Integration Test Config | Configures Vitest for end-to-end integration tests (`*.e2e-spec.ts`). | Running `pnpm run test:e2e` fails. |
| **`.oxlintrc.json`** | High-Speed Linter | Configures Oxlint to enforce rules like `typescript/no-floating-promises` to catch unhandled async errors. | Lint checks will not catch dangling unhandled promises. |
| **`.gmail_session.json`** | Local OAuth Token Cache | Stores temporary Google OAuth tokens for local development testing of the Gmail sync tool. | Local offline tests of Google Gmail integration will require re-authentication. |

---

## 2. Multi-Schema Database Engine (`prisma/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`prisma/schema/base.prisma`** | Datasource Hub | Configures connection strings (`DATABASE_URL` via PgBouncer and `DIRECT_URL`) and registers multi-schema names: `iam`, `university`, `chat`, `freelance`. | Prisma cannot connect to Neon PostgreSQL or recognize split schemas. |
| **`prisma/schema/iam.prisma`** | Identity Schema | Data models for institutions and users: `University`, `UniversityDomain`, `User`, `PasswordCredential`, and `Session`. | User accounts, domain verifications, and login credentials cannot be stored. |
| **`prisma/schema/university.prisma`** | Academic Schema | Academic models: `Timetable`, `AttendanceRecord`, `Practical`, `Exam`, `Notice`, `CampusEvent`, `Assignment`, and `UniversityIntegration`. | Attendance tracking, timetables, notices, and exam management fail. |
| **`prisma/schema/chat.prisma`** | Real-Time Schema | Communication models: `Channel`, `ChannelMember`, and `ChatMessage`. | Chat channels and persistent message history cannot be saved. |
| **`prisma/schema/freelance.prisma`** | Marketplace Schema | Economic models: `Gig`, `Proposal`, and `EscrowTransaction` (`FUNDS_HELD` state machine). | The campus freelance marketplace and payment escrow fail. |
| **`prisma/seed.ts`** | Seeding Script | Populates initial development data: seeds `IIIT Naya Raipur` institution and an admin user (`admin@iiitnr.edu.in`) with Argon2id hash. | `pnpm run seed` fails; fresh environments will have no default admin. |

---

## 3. Application Core & Singletons (`src/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`src/main.ts`** | Application Entrypoint | Initializes Express 5, sets 100MB body limits for PDFs/images, mounts Helmet, CORS, cookie parser, and starts port `4000`. | The backend server cannot start. |
| **`src/app.module.ts`** | Root Composition Module | Imports all 5 feature modules (`Iam`, `University`, `Chat`, `Freelance`, `Ai`) and applies global `ThrottlerGuard` (50 req/min). | NestJS has no root dependency graph; routes stop functioning. |
| **`src/prisma.service.ts`** | Database Singleton | Wraps PrismaClient with a 5-attempt retry loop with backoff delays to survive Neon serverless cold-wakes. | Database connections crash immediately on serverless sleep/wake cycles. |
| **`src/app.controller.ts`** | Health Controller | Provides a basic root endpoint (`GET /api`) returning `Hello World!`. | Root health-checks will return 404. |
| **`src/app.service.ts`** | Health Service | Provides the string response logic for `AppController`. | `AppController` fails dependency injection. |
| **`src/app.controller.spec.ts`** | Unit Test | Verifies that `AppController` boots and returns health status. | Test suite loses root smoke coverage. |
| **`src/common/filters/http-exception.filter.ts`** | Global Error Normalizer | Catches all thrown HTTP exceptions and formats them into standard `{ statusCode, message, timestamp, path }`. | Errors return unstructured internal HTML or inconsistent raw JSON. |

---

## 4. Identity & Access Management (`src/modules/iam/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`iam.module.ts`** | Domain Module Bundle | Exports authentication services, guards, and registers `PassportModule` and `JwtModule`. | Authentication stops functioning across the entire application. |
| **`controllers/auth.controller.ts`** | Auth REST Controller | Endpoints for domain resolution (`/resolve-domain`), OTP request/verify, login, password setting, Google OAuth, and campus linking. | Users cannot register, request OTPs, log in, or link campus accounts. |
| **`services/auth.service.ts`** | Core Auth Service | Business logic for domain matching, Argon2 password checks, JWT generation, and student/admin role assignments. | Authentication logic ceases to work. |
| **`services/otp.service.ts`** | Verification Code Engine | Generates 6-digit OTPs with 10-minute expirations backed by Upstash Redis with a 5-attempt lockout and in-memory fallback. | Email verifications and password resets stop functioning. |
| **`services/password.service.ts`** | Cryptography Service | Hashes and verifies passwords using memory-hard Argon2id ($m=64\text{MB}, t=3, p=1$). | Secure password operations fail. |
| **`services/password.service.spec.ts`** | Unit Test | Validates that Argon2id hashing produces valid hashes and verifies correct passwords. | Loss of test verification for password hashing. |
| **`services/mail.service.ts`** | Transactional Mail Service | Sends branded HTML emails via the Resend API with sandbox email override support. | Verification emails are never sent. |
| **`guards/jwt-auth.guard.ts`** | Security Gate | Validates JWT tokens from cookies or Bearer headers and checks active status against Neon DB. | Protected endpoints become accessible to unauthenticated callers. |
| **`guards/roles.guard.ts`** | Permission Gate | Enforces role-based access control based on `@Roles()` metadata (`ADMIN`, `STUDENT`, etc.). | Any logged-in student could call administrative endpoints. |
| **`decorators/current-user.decorator.ts`** | Param Decorator | Injects the authenticated `req.user` payload into controller methods. | Controllers cannot identify which student or admin is making the request. |
| **`decorators/roles.decorator.ts`** | Metadata Decorator | Sets role requirements on routes: `@Roles('ADMIN', 'SUPER_ADMIN')`. | `RolesGuard` has no metadata to inspect. |
| **`dto/auth.dto.ts`** | Validation DTOs | Enforces string validation, email formats, and OTP lengths on auth payloads. | Malformed requests reach the database without validation. |
| **`strategies/google.strategy.ts`** | Passport Strategy | Handles Google OAuth2 redirect flow, extracting verified emails and profile photos. | "Sign in with Google" fails. |
| **`strategies/github.strategy.ts`** | Passport Strategy | Extension point for developer GitHub OAuth authentication. | Secondary GitHub login cannot be activated. |

---

## 5. University & Academics (`src/modules/university/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`university.module.ts`** | Domain Module Bundle | Configures academic controllers and services; connects with `IamModule` for authentication. | The academic features of the API fail to load. |
| **`controllers/university.controller.ts`** | Academic Controller | Endpoints for timetables, attendance, practicals, exams, notices, campus events, and document OCR. | Students cannot access schedules, attendance, assignments, or notices. |
| **`controllers/admin.controller.ts`** | Admin Console Controller | Provides institutional statistics (student counts, activity counts) and user rosters restricted to admins. | Campus administrators cannot manage users or view institutional metrics. |
| **`services/university.service.ts`** | Core Academic Service | Implements attendance tracking, 75% statutory warning logic, timetable upserts, and student email blocks (`isStudentEmail`). | Academic data operations fail to process or calculate. |
| **`services/campus-email-sync.service.ts`** | Email Parser Service | Uses Google Gemini to parse incoming university circular emails into structured notices or tasks. | Automatic conversion of campus emails into notices stops working. |
| **`services/google-gmail.service.ts`** | Gmail Integration Service | Interacts with Google's REST API using student OAuth tokens, parsing MIME emails and attachments. | Gmail inbox integration cannot sync academic circulars. |
| **`dto/university.dto.ts`** | Academic Validation DTOs | Enforces payload rules for creating notices, claiming universities, and logging attendance. | Corrupted academic payloads could reach the database. |

---

## 6. Real-Time Chat & Calls (`src/modules/chat/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`chat.module.ts`** | Domain Module Bundle | Connects chat controllers, services, and the Socket.IO gateway with Prisma and JWT services. | Chat endpoints and WebSocket connections cannot initialize. |
| **`chat.gateway.ts`** | Socket.IO Server Gateway | Handles WebSocket connections, channel subscriptions, real-time message broadcasts, presence sync, and WebRTC call signaling. | Real-time messaging, online indicators, and incoming call alerts stop working. |
| **`chat.controller.ts`** | Chat REST Controller | Provides channel listings, direct chat creation, 100MB file uploads, and LiveKit video room token generation. | Students cannot upload files, list channels, or join LiveKit video rooms. |
| **`chat.service.ts`** | Chat Storage Service | Manages message persistence, channel memberships, and soft/hard message deletions. | Messages cannot be saved or retrieved from the database. |

---

## 7. Freelance & Escrow (`src/modules/freelance/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`freelance.module.ts`** | Domain Module Bundle | Encapsulates freelance controllers, services, and authorization guards. | Freelance routes fail to load. |
| **`controllers/freelance.controller.ts`** | Freelance REST Controller | Exposes `GET /api/freelance/gigs` (scoped to the user's university) and `POST /api/freelance/gigs`. | Students cannot browse or post campus gigs. |
| **`services/freelance.service.ts`** | Freelance Business Service | Manages gig creation, proposal bidding, client assignments, and escrow transitions. | Freelance database transactions cease to function. |
| **`dto/freelance.dto.ts`** | Freelance Validation DTOs | Enforces a minimum budget (>= 50 INR), title lengths, and category rules for gigs. | Invalid or empty gig listings can enter the database. |

---

## 8. Multimodal AI Copilot (`src/modules/ai/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`ai.module.ts`** | Domain Module Bundle | Bundles AI controllers and services with Prisma and IAM authentication guards. | AI endpoints fail to initialize. |
| **`controllers/ai.controller.ts`** | AI REST Controller | Endpoints: `POST /api/ai/chat` (copilot assistant) and `POST /api/ai/validate-key` (API key validator). | The Campus AI drawer cannot communicate with the backend. |
| **`services/ai.service.ts`** | Gemini Proxy Engine | Manages model fallback chains (`3.5-flash-lite`, `3.8-flash`, `4-argon`), thinking depth directives, and PII email regex scrubbers. | The AI assistant stops responding; privacy filters would not execute. |
| **`services/prompt.service.ts`** | System Prompt Templates | Provides structured prompt templates for schedule queries, coursework help, and code explanations. | The AI model loses standard instructional context. |
| **`services/embeddings.service.ts`** | Vector Embedding Helper | Helper functions for document embeddings and semantic search across lecture notes. | Vector search across campus documents cannot execute. |
| **`dto/ai.dto.ts`** | AI Data Transfer Objects | Validates chat query inputs, screen context strings, and image payloads. | Invalid payloads could be sent to Google's API. |

---

## 9. Testing Harness (`test/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`test/app.e2e-spec.ts`** | Smoke Integration Test | Boots the full NestJS application fixture and verifies that root `GET /api` returns HTTP 200. | CI pipeline loses basic bootstrap verification. |
| **`test/modules/university/controllers/university.controller.e2e-spec.ts`** | Comprehensive E2E Suite | 17-point integration test suite testing timetables, notices, events, assignments, attendance, notes, and Gmail OAuth by mocking `JwtAuthGuard`. | Regression bugs in academic business logic can slip into production unspotted. |

---

## 10. GitHub Automation & CI/CD (`.github/`)

| File Path | What It Is | Purpose & Why It Exists | What Breaks If Removed |
| :--- | :--- | :--- | :--- |
| **`.github/workflows/ci.yml`** | Automated CI Pipeline | Runs on every push/PR: installs dependencies, generates Prisma client, runs Oxlint, executes unit and E2E tests, and compiles the build. | Pull requests can merge broken code without automated verification. |
| **`.github/workflows/label-pr.yml`** | Pull Request Automation | Automatically applies domain labels (`domain:backend`, etc.) based on modified paths. | PRs will lack categorization tags. |
| **`.github/workflows/stale.yml`** | Maintenance Workflow | Flags and closes inactive issues or pull requests after 30 days of inactivity. | Old issues will accumulate indefinitely. |
| **`.github/actions/setup-workspace/action.yml`** | Composite Action | Sets up Node 20, PNPM 9, and caches `pnpm-store` across workflow jobs. | CI runs take significantly longer due to redundant dependency downloads. |
| **`.github/dependabot.yml`** | Security Bot Config | Automatically opens weekly PRs for npm dependency security patches and monthly PRs for GitHub Actions. | Vulnerable dependencies may remain unpatched. |
| **`.github/labeler.yml`** | Path Mapping Config | Defines glob rules for labels (e.g., changes in `prisma/**` get `domain:database`). | `label-pr.yml` has no rules for mapping file paths to labels. |
| **`.github/ISSUE_TEMPLATE/bug.yml`** | Issue Form | Standardized GitHub issue form for reporting backend bugs with required fields. | Users submit vague, unstructured bug reports. |
| **`.github/pull_request_template.md`** | PR Checklist | Standard checklist verifying database migrations, test coverage, and documentation for new PRs. | Developers might submit PRs without verifying tests or updating schemas. |

---

<div align="center">
  <sub>Campus API File Directory Map • Northstar Academic Architecture</sub>
</div>