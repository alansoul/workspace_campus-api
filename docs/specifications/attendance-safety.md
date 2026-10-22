# Attendance Analytics & Statutory Safety Engine Specification

This specification documents the mathematical formulation, persistence logic, warning state machine, and cascade deletion integrity of the Attendance Tracking Engine in **Campus API**.

---

## 🎯 Operational Objectives

In technical universities and higher education institutions, maintaining a **minimum 75% lecture attendance threshold** is mandatory to remain eligible for end-semester examinations[cite: 14].

The Attendance Engine addresses three critical operational failure modes:
1. **Attendance Calculation Discrepancies:** Eliminates manual record inaccuracies by providing atomic logging and percentage recalculation.
2. **Delayed Risk Awareness:** Flags subjects dynamically with early-warning markers (`isWarning = true`) the moment a student drops below 75%.
3. **Ghost Record Resurrection:** Resolves client-server sync race conditions when elective courses are dropped or deleted from student workspaces.

---

## 🏗️ Data Contract & Entity Schema

Located in `campus-api/prisma/schema/university.prisma`:

```prisma
model AttendanceRecord {
  id            String     @id @default(uuid())
  studentId     String
  subject       String
  totalClasses  Int        @default(0)
  attended      Int        @default(0)
  missed        Int        @default(0)
  attendancePct Int        @default(100)
  statusText    String?
  isWarning     Boolean    @default(false)

  universityId  String

  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  @@unique([studentId, subject, universityId])
  @@index([universityId])
  @@schema("university")
}