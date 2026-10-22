# Local Development & Cloud Infrastructure Setup Guide

This guide walks through configuring, installing, and running the **Campus API** development environment locally, connecting to serverless PostgreSQL on **Neon**, caching OTPs via **Upstash Redis**, configuring **Resend** transactional mail, and seeding initial records.

---

## 📋 System Prerequisites

Ensure the following runtimes and tools are installed:
* **Node.js:** `>= 20.0.0` (LTS recommended)
* **Package Manager:** `pnpm` (`npm install -g pnpm`)
* **Database Client / ORM CLI:** `prisma` (managed via `pnpm dlx prisma` or local scripts)
* **Cloud Accounts:**
  * [Neon PostgreSQL](https://neon.tech/) (Serverless PostgreSQL 16)
  * [Google AI Studio](https://aistudio.google.com/) (Gemini API Key)
  * [Upstash](https://upstash.com/) (Serverless Redis for OTP storage)
  * [Resend](https://resend.com/) (Transactional email delivery)
  * [LiveKit Cloud](https://livekit.io/) (WebRTC video & voice SFU)

---

## ⚙️ Step 1: Clone Repository & Install Dependencies

Open your terminal in your workspace root:

```powershell
cd "C:\dev\first step\Our-workspace\campus-api"

# Install all runtime and developer dependencies
pnpm install