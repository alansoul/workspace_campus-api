# Master Timetable Matrix & OCR Ingestion Specification

This specification documents the timetable data structure, persistence mechanisms, real-time WebSocket update propagation, and Google Gemini multimodal OCR parsing pipeline in **Campus API**.

---

## 🎯 Operational Objectives

University class schedules are subject to frequent adjustments, including room reallocations, faculty substitutions, and elective slot reshuffling[cite: 14]. Traditional portals publish static PDF sheets that fail to notify students dynamically[cite: 14].

The Master Timetable Engine provides:
1. **Normalized Matrix Persistence:** A JSON-backed schema capturing multi-period daily schedules per branch, semester, and classroom.
2. **Real-Time Workspace Synchronization:** Instantaneous WebSocket broadcasts (`timetable:updated`) when administrators push new schedules.
3. **Automated Document OCR Ingestion:** Multimodal extraction using Gemini to parse scanned PDF/image timetables directly into structured database rows, resolving slot codes against faculty legends automatically.

---

## 🏗️ Data Contract & Schema Architecture

Located in `campus-api/prisma/schema/university.prisma`:

```prisma
model Timetable {
  id            String   @id @default(uuid())
  universityId  String   @default("iiitnr")
  branch        String   // e.g. "CSE", "ECE", "DSAI"
  semester      Int      // e.g. 1, 2, 3
  roomNo        String?  // e.g. "Room 138"
  effectiveDate String?  // e.g. "24/08/2026"
  schedule      Json     // Array of daily objects and lecture slot items
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([universityId, branch, semester])
  @@index([universityId])
  @@schema("university")
}