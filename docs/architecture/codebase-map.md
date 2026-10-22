# Campus API — Codebase Map & Directory Guide

This document provides a comprehensive structural guide to **Campus API**. It details the role, responsibility, and architectural interactions of every file, module, schema, and utility in the backend repository.

---

## 🗺️ Architectural Map & Module Overview

```mermaid
graph TD
    Client[Next.js Client / Mobile]
    
    subgraph CoreEngine ["NestJS Core & Bootstrap"]
        Main[main.ts: Bootstrap & CORS]
        AppMod[app.module.ts: Root Composition]
        Filter[common/filters/http-exception.filter.ts]
        PrismaService[prisma.service.ts: Neon Client Singleton]
    end

    subgraph DomainModules ["Feature Domains (src/modules/)"]
        IAM[iam/: Identity, Auth, OTP, Passwords]
        UNI[university/: Academics, Attendance, Timetable, OCR]
        CHAT[chat/: Socket.IO, LiveKit WebRTC, 100MB Files]
        FREE[freelance/: Marketplace & Escrow Ledger]
        AI[ai/: Gemini Multimodal Proxy & PII Scrubber]
    end

    subgraph DataLayer ["Persistence (prisma/schema/)"]
        BaseSchema[base.prisma: Multi-Schema Connection]
        IAMSchema[iam.prisma: Users & Domains]
        UNISchema[university.prisma: Academic Records]
        CHATSchema[chat.prisma: Messages & Channels]
        FREESchema[freelance.prisma: Gigs & Escrow]
    end

    Client --> Main
    Main --> AppMod
    AppMod --> Filter
    AppMod --> IAM
    AppMod --> UNI
    AppMod --> CHAT
    AppMod --> FREE
    AppMod --> AI

    IAM --> PrismaService
    UNI --> PrismaService
    CHAT --> PrismaService
    FREE --> PrismaService
    
    PrismaService --> BaseSchema
    BaseSchema --> IAMSchema
    BaseSchema --> UNISchema
    BaseSchema --> CHATSchema
    BaseSchema --> FREESchema