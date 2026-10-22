# Student Freelance Marketplace & Escrow Ledger Specification

This specification documents the data contracts, state machines, proposal workflows, and financial escrow ledger of the Freelance Marketplace Module in **Campus API**.

---

## 🎯 Operational Objectives

On modern university campuses, student engineers, designers, and content creators frequently collaborate on side projects, hackathon products, and institutional department contracts. However, informal campus engagements face recurring friction:
1. **Payment Default Risk:** Freelancers deliver code or design assets but face delayed or missing payments from peers.
2. **Ambiguous Deliverables:** Clients receive incomplete submissions without structured delivery timelines or dispute recourse.
3. **Institutional Fragmentation:** Opportunities are lost in scattered messaging channels without portfolio verification or campus-bound trust.

The Freelance Module provides:
* **Campus-Scoped Discovery:** Gig listings partitioned strictly by `universityId`, enabling students to hire verified peers within their institutional domain.
* **Proposal & Bidding Registry:** Structured submissions featuring cover letters, bid pricing (in INR), and committed delivery day windows.
* **Deterministic Escrow State Machine:** A ledger locking client funds in `FUNDS_HELD` upon contract agreement, transitioning safely to `RELEASED` or `REFUNDED`.

---

## 🏗️ Data Contract & Schema Architecture

Located in `campus-api/prisma/schema/freelance.prisma`:

```prisma
model Gig {
  id           String      @id @default(uuid())
  title        String
  description  String      @db.Text
  budget       Int         // In INR
  category     String      // "Coding", "Design", "Video", "Writing"
  status       GigStatus   @default(OPEN)

  clientId     String
  client       User        @relation("ClientGigs", fields: [clientId], references: [id], onDelete: Cascade)
  universityId String
  university   University  @relation(fields: [universityId], references: [id], onDelete: Cascade)

  proposals    Proposal[]
  escrow       EscrowTransaction?

  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@index([universityId])
  @@schema("freelance")
}

enum GigStatus {
  OPEN
  IN_PROGRESS
  COMPLETED
  CANCELLED

  @@schema("freelance")
}

model Proposal {
  id           String   @id @default(uuid())
  bidAmount    Int      // In INR
  coverLetter  String   @db.Text
  deliveryDays Int

  gigId        String
  gig          Gig      @relation(fields: [gigId], references: [id], onDelete: Cascade)
  freelancerId String
  freelancer   User     @relation(fields: [freelancerId], references: [id], onDelete: Cascade)

  createdAt    DateTime @default(now())

  @@index([gigId])
  @@index([freelancerId])
  @@schema("freelance")
}

model EscrowTransaction {
  id           String       @id @default(uuid())
  amount       Int          // In INR
  status       EscrowStatus @default(FUNDS_HELD)

  gigId        String       @unique
  gig          Gig          @relation(fields: [gigId], references: [id], onDelete: Cascade)

  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@schema("freelance")
}

enum EscrowStatus {
  FUNDS_HELD
  RELEASED
  REFUNDED

  @@schema("freelance")
}