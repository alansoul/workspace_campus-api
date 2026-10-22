# Comprehensive Testing Strategy & E2E Test Suite Guide

This guide documents the automated testing philosophy, harness configuration, controller integration patterns, and autonomous test generation workflows in **Campus API**.

---

## 🎯 Testing Philosophy & Architecture

Campus API employs a two-tier testing model powered by **Vitest**:
1. **Unit Tests (`*.spec.ts`):** Isolated tests for services, utility functions, and cryptographic hashing routines (e.g., `password.service.spec.ts`) without requiring live database connections.
2. **End-to-End Integration Tests (`*.e2e-spec.ts`):** Full-context tests running against NestJS `TestingModule` fixtures, verifying real controller routes, input validation pipes, and database queries using Supertest.

```mermaid
graph TD
    subgraph TestExecution ["Vitest Test Harness"]
        Runner[Vitest Test Runner]
        ConfigUnit[vitest.config.ts]
        ConfigE2E[vitest.config.e2e.ts]
    end

    subgraph TestTypes ["Test Layers"]
        Unit["Unit Tests (*.spec.ts)"]
        E2E["Integration Tests (*.e2e-spec.ts)"]
    end

    subgraph Fixture ["NestJS Test Bed"]
        AppModule[AppModule Compilation]
        GuardOverride[Override JwtAuthGuard]
        Supertest[Supertest HTTP Agent]
        NeonDB[(Neon PostgreSQL Serverless)]
    end

    Runner --> ConfigUnit
    Runner --> ConfigE2E
    ConfigUnit --> Unit
    ConfigE2E --> E2E

    E2E --> AppModule
    AppModule --> GuardOverride
    GuardOverride --> Supertest
    Supertest --> NeonDB