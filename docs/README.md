# Campus API Documentation Hub

Welcome to the official technical documentation directory for **Campus API**[cite: 27]. This documentation suite contains architectural blueprints, database schema specifications, engineering algorithms, and developer testing guides for the platform's multi-tenant academic backend[cite: 27].

---

## 🗺️ Documentation Index

### 1. 🏗️ Architecture & Core Infrastructure
* **[Multi-Tenancy & Institutional Resolution](architecture/multi-tenancy.md):** Domain-level accreditation validation, student email privilege separation (`isStudentEmail`), and administrative workspace provisioning.
* **[Database Multi-Schema Isolation](architecture/database-schemas.md):** Deep-dive into Neon PostgreSQL schema routing across `iam`, `university`, `chat`, and `freelance`[cite: 29].
* **[Real-Time Engine & WebRTC Signaling](architecture/realtime-engine.md):** Socket.IO bidirectional event pipeline (`presence:sync`, `timetable:updated`) and LiveKit SFU access token minting[cite: 29].
* **[Zero-Knowledge Multimodal AI Proxy](architecture/zero-knowledge-ai.md):** Google Gemini model cascading, prompt injection mechanisms, and regex PII data scrubbers (`[PROTECTED_EMAIL]`)[cite: 29].

---

### 2. 🔬 Engineering Specifications & Logic
* **[Attendance Analytics & Safety Engine](specifications/attendance-safety.md):** Mathematical formulas for statutory 75% examination eligibility, warning state latches, and cascade deletion integrity[cite: 29].
* **[Master Timetable Matrix & OCR Ingestion](specifications/master-timetable.md):** Branch-and-semester matrix structure, period scheduling rules, and automated Gemini-based PDF/image timetable extraction[cite: 29].
* **[Freelance Marketplace & Escrow Ledger](specifications/freelance-escrow.md):** Peer-to-peer student project workflows, proposal bidding rules, and `FUNDS_HELD` transaction state machines[cite: 29].

---

### 3. 🛠️ Developer & Testing Guides
* **[Local Development & Cloud Service Setup](dev/local-setup.md):** Step-by-step instructions for configuring Neon PostgreSQL connection pooling, Upstash Redis, Resend mail delivery, and local seeds[cite: 29].
* **[Environment Variable Matrix](dev/environment-matrix.md):** Exhaustive audit of all production, development, and optional configuration keys.
* **[Testing Strategy & E2E Test Suite](dev/testing-guide.md):** Vitest test harness conventions, `JwtAuthGuard` bypass mocking in NestJS `TestingModule`, and autonomous cloud test generation[cite: 29].

---

## 📊 Module & Schema Cross-Reference

| NestJS Module | Prisma Schema Namespace | Primary Data Models | Core Responsibilities |
| :--- | :--- | :--- | :--- |
| **`IamModule`**[cite: 29] | `@@schema("iam")`[cite: 29] | `University`, `UniversityDomain`, `User`, `PasswordCredential`, `Session`[cite: 29] | Identity, domain verification, OTP delivery, Argon2id passwords, and JWT session lifecycle[cite: 29]. |
| **`UniversityModule`**[cite: 29] | `@@schema("university")`[cite: 29] | `Timetable`, `AttendanceRecord`, `Practical`, `Exam`, `Notice`, `CampusEvent`, `EventInterest`[cite: 29] | Academic schedule matrices, attendance tracking, exams, circulars, and departmental events[cite: 29]. |
| **`ChatModule`**[cite: 29] | `@@schema("chat")`[cite: 29] | `Channel`, `ChannelMember`, `ChatMessage`[cite: 29] | Socket.IO messaging, presence sync, file uploads up to 100MB, and LiveKit video call token generation[cite: 29]. |
| **`FreelanceModule`**[cite: 29] | `@@schema("freelance")`[cite: 29] | `Gig`, `Proposal`, `EscrowTransaction`[cite: 29] | Campus peer services, project listings, bids, and financial escrow hold/release operations[cite: 29]. |
| **`AiModule`**[cite: 29] | *Stateless Proxy*[cite: 29] | — | Zero-knowledge AI copilot routing, prompt sanitization, model fallback chains, and timetable OCR parsing[cite: 29]. |

---

## 🔒 Security & Privacy Posture

Campus API enforces strict zero-trust boundary standards across all institutional interfaces:
1. **Zero Data Harvesting:** No student learning patterns or profile details are stored in third-party model training datasets.
2. **PII Firewalls:** All live screen context passed to AI assistants is stripped of personal identifiers before network transmission[cite: 29].
3. **Role Enforcement:** All mutating endpoints require cryptographic JWT claims verified against active database records via `JwtAuthGuard` and `RolesGuard`[cite: 29].

---

<div align="center">
  <sub>Campus API Documentation Hub • Multi-Tenant Higher Education Architecture</sub>
</div>