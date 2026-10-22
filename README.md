# Campus API — Autonomous Academic Engine & Institutional Core

<div align="center">

[![NestJS](https://img.shields.io/badge/NestJS-12.0-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-6.4-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Neon PostgreSQL](https://img.shields.io/badge/Neon-PostgreSQL_16-00E599?logo=postgresql&logoColor=black)](https://neon.tech/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-black?logo=socket.io&logoColor=white)](https://socket.io/)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC_SFU-002B49?logo=webrtc&logoColor=white)](https://livekit.io/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-Multimodal_AI-4285F4?logo=google-gemini&logoColor=white)](https://ai.google.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-E2E_Testing-729B1B?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Render](https://img.shields.io/badge/Render-Cloud_Host-46E3B7?logo=render&logoColor=black)](https://render.com/)

**The multi-tenant, event-driven academic operating system engineered for higher education.**

*Powers institutional workspace provisioning, master timetables, continuous 75% attendance analytics, laboratory practicals, examination schedules, student freelance escrow, WebRTC SFU signaling, and a zero-knowledge multimodal AI copilot.*

[The Story](#-the-genesis-why-we-built-campus-api) • [Core Pillars](#-architectural-pillars) • [Case Studies](#-engineering-case-studies) • [API Specification](#-rest--real-time-api-specification) • [Local Setup](#-local-setup--development) • [Testing](#-testing-strategy)

</div>

---

## 📖 The Genesis: Why We Built Campus API

Every college student and faculty member encounters the same structural frustration: **university software is fragmented, outdated, and disconnected from daily academic life.**

### The Problem
* **Intranet Silos:** Traditional campus portals look like legacy databases from the early 2000s. They crash during course registration, fail on mobile viewports, and force users to manage separate logins for academic records, fee receipts, and LMS assignments.
* **The WhatsApp Scramble:** Because official portals are painful to navigate, vital university communication collapses into informal WhatsApp and Telegram groups. Critical circulars, lecture room reallocations, and exam datesheets get buried beneath hundreds of unrelated messages.
* **The 75% Attendance Trap:** In technical institutions worldwide, maintaining a statutory 75% attendance threshold is mandatory to remain eligible for semester examinations. Students track attendances in physical notebooks, discovering discrepancies only after debarment notices are issued.
* **Context-Blind AI:** Generic AI tools know nothing about an enrolled student's campus reality. They cannot answer whether tomorrow's lab moved to Room 138, who the instructor is, or what specific topics were designated for next week's practical viva.

### The Universal Campus Vision
**Campus API** was built from day one not as a single-school prototype, but as an **institutional operating platform for any university**. 

Any accredited higher education institution with an official domain (`.edu.in`, `.ac.in`, `.edu`, `.org`) can onboard its campus, verify administrative authority through automated DNS/domain challenges, and provide its faculty and students with an enterprise-grade academic engine.

---

## 🏗️ Architectural Pillars

```mermaid
graph TD
    subgraph ClientLayer ["Client Layer"]
        Web[Next.js 15 Web Workspace]
        Mobile[Mobile & Native Shells]
    end

    subgraph GatewayLayer ["NestJS API & Gateway Layer"]
        MainRouter[API Gateway: /api]
        AuthModule[IAM & Security Module]
        UniModule[University Academics Module]
        ChatGateway[Socket.IO Real-Time Gateway]
        ChatCtrl[Chat & LiveKit Controller]
        FreelanceModule[Freelance & Escrow Module]
        AIModule[AI Multimodal Copilot Proxy]
    end

    subgraph PersistenceLayer ["Persistence & Cloud Infrastructure"]
        Prisma[Prisma ORM 6]
        DB[(Neon PostgreSQL Serverless)]
        Redis[(Upstash Redis Cache & OTP)]
        Gemini[Google Gemini API]
        LiveKit[LiveKit WebRTC Cloud]
        Resend[Resend Email Delivery]
    end

    Web -->|HTTP / REST| MainRouter
    Web -->|WebSockets| ChatGateway
    Mobile -->|HTTP / REST| MainRouter

    MainRouter --> AuthModule
    MainRouter --> UniModule
    MainRouter --> ChatCtrl
    MainRouter --> FreelanceModule
    MainRouter --> AIModule

    AuthModule --> Prisma
    AuthModule --> Redis
    AuthModule --> Resend
    UniModule --> Prisma
    UniModule --> Gemini
    ChatCtrl --> Prisma
    ChatCtrl --> LiveKit
    ChatGateway --> Prisma
    FreelanceModule --> Prisma
    AIModule --> Gemini

    Prisma -->|Multi-Schema Routing| DB