# Zero-Knowledge Multimodal AI Proxy Architecture

This document details the architectural design, security protocols, and operational workflows of the AI Copilot engine in **Campus API**. It outlines the integration with **Google Gemini**, the multimodal document extraction pipeline, model fallback mechanics, reasoning depth control, and the two-stage Zero-Knowledge Privacy Guardrail that shields student Personally Identifiable Information (PII).

---

## 🏗️ Architectural Topology

The AI module acts as an intelligent, stateless middleware layer between student client sessions and Google's Generative AI infrastructure.

```mermaid
graph TD
    Client[Next.js Client / CampusAiDrawer]
    AICtrl[AiController: /api/ai/chat]
    AISvc[AiService Pipeline]
    Scrubber[PII Ingestion Sanitizer]
    Fallback[Model Fallback Controller]
    GeminiAPI[(Google Gemini Generative AI)]

    Client -->|1. Prompt + Screen Context + Optional Base64 Image| AICtrl
    AICtrl -->|2. Validates JWT & Routes Payload| AISvc
    AISvc -->|3. Injects System Directive & Thinking Directive| AISvc
    AISvc -->|4. Regex Scrubber: Strips Emails to [PROTECTED_EMAIL]| Scrubber
    Scrubber -->|5. Structured Payload Dispatch| Fallback

    subgraph FallbackChain ["Cascading Fallback Ring"]
        M1["1. Requested Model (e.g., gemini-3.5-flash-lite)"]
        M2["2. gemini-3.5-flash-lite (Stable)"]
        M3["3. gemini-3.8-flash"]
        M4["4. gemini-4-argon"]
    end

    Fallback --> M1
    M1 -->|On 429/500/404| M2
    M2 -->|On Failure| M3
    M3 -->|On Failure| M4

    FallbackChain -->|HTTPS Request with x-goog-api-key| GeminiAPI
    GeminiAPI -->|Raw Model Completion Output| AISvc
    AISvc -->|6. Outgoing Regex Scrub & Privacy Audit| AISvc
    AISvc -->|7. Sanitized JSON Response| Client