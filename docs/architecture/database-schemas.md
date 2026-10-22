# Neon PostgreSQL Multi-Schema Database Architecture

This document details the relational data architecture of **Campus API**. It outlines the physical schema separation on **Neon Serverless PostgreSQL**, entity relationships, cascade policies, index optimizations, and multi-schema routing configuration.

---

## 🏗️ Multi-Schema Topology

Rather than maintaining a flat single-schema namespace with hundreds of colliding tables, Campus API partitions data into four distinct relational schemas managed via Prisma ORM 6:

```mermaid
graph TD
    Datasource[(Neon PostgreSQL 16)]
    
    subgraph Schemas ["PostgreSQL Schemas"]
        IAM["iam (Identity & Access)"]
        UNI["university (Academic Core)"]
        CHAT["chat (Messaging & Channels)"]
        FREE["freelance (Gig Marketplace)"]
    end

    Datasource --> IAM
    Datasource --> UNI
    Datasource --> CHAT
    Datasource --> FREE

    IAM -->|Provides Tenant ID & Auth| UNI
    IAM -->|Provides User Identity| CHAT
    IAM -->|Client / Freelancer Profiles| FREE
    UNI -->|Scopes Academic Life| FREE