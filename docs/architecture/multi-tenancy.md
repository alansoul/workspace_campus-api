# Multi-Tenancy & Institutional Domain Architecture

This document describes the multi-tenant architecture of **Campus API**, explaining how institutions are accredited, how student and administrative accounts are partitioned, and how data isolation is enforced at the database layer.

---

## 🎯 Architecture Overview

Unlike monolithic single-college portals, Campus API is engineered to host multiple universities concurrently while maintaining strict data and administrative boundaries.

```mermaid
graph TD
    Client[Incoming Request]
    DomainResolver[AuthService.resolveDomain]
    DB[(Neon PostgreSQL)]

    Client --> DomainResolver
    DomainResolver -->|Checks Domain| DB

    subgraph TenantRouting ["Multi-Tenant Routing"]
        Gmail[domain === 'gmail.com']
        Campus[domain === registered_domain]
        Unregistered[domain === unknown]
    end

    DomainResolver --> Gmail
    DomainResolver --> Campus
    DomainResolver --> Unregistered

    Gmail -->|accountType: INDIVIDUAL| NoUni[universityId: null]
    Campus -->|accountType: INSTITUTIONAL| UniBound[universityId: uni_uuid]
    Unregistered -->|Reject Request| Err[DOMAIN_UNREGISTERED 400]