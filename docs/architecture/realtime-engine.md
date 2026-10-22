# Real-Time Engine, Socket.IO & WebRTC Signaling Architecture

This document details the real-time communication infrastructure of **Campus API**. It covers the bidirectional WebSocket event pipeline, user presence synchronization, channel messaging, cross-module broadcast bus events, WebRTC signaling, and LiveKit SFU video/voice token generation.

---

## 🏗️ Architectural Topology

The real-time layer operates on a dual-protocol architecture:
1. **Socket.IO Gateway (`/`):** Manages connection state, user room multiplexing, chat messaging, administrative moderation broadcasts, and peer-to-peer WebRTC signaling.
2. **LiveKit SFU (Selective Forwarding Unit):** Manages multi-party audio, video, and screen-sharing media tracks over WebRTC.

```mermaid
graph TD
    Client[Next.js Client / Mobile]
    Gateway[ChatGateway: Socket.IO]
    LiveKitSDK[LiveKit Server SDK]
    LiveKitCloud[(LiveKit SFU Server)]
    Prisma[(Neon PostgreSQL: chat schema)]
    UniController[University Controller]

    Client -->|WebSocket Handshake with JWT| Gateway
    Client -->|REST: GET /api/chat/livekit/token| LiveKitSDK
    LiveKitSDK -->|Returns Signed JWT| Client
    Client -->|WebRTC Media Tracks| LiveKitCloud

    Gateway -->|Verify Token & Register User| Gateway
    Gateway -->|Persist Message / Delete| Prisma
    Gateway -->|Broadcast 'newMessage' / 'presence:sync'| Client
    UniController -->|Push 'timetable:updated'| Gateway
    Gateway -->|Broadcast to all connected clients| Client