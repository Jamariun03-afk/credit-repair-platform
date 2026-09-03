# Credit Repair Client Management & Automation Platform
## Technical Architecture

Status: Foundation design — Phase 1 scaffold follows this document.

---

## A. System Overview

A multi-tenant-ready (single-tenant for v1) SaaS platform combining CRM, document
management, dispute workflow automation, and compliance tracking for a credit
repair business. Core discipline: **the system stores facts and evidence; it never
invents them.** Every dispute, letter, and AI suggestion traces back to
client-supplied or specialist-verified source data.

**Stack**
- Frontend: Next.js 14 (App Router), TypeScript, React, Tailwind CSS
- Backend: Next.js Route Handlers (API), server actions for internal mutations
- Database: PostgreSQL
- ORM: Prisma
- Auth: Auth.js (NextAuth) with credentials + optional SSO, session-based RBAC
- File storage: S3-compatible object storage, private buckets, signed URLs
- PDF generation: server-side (e.g. `@react-pdf/renderer` or Puppeteer)
- Email: Resend/SendGrid/Postmark behind a `NotificationProvider` interface
- Background jobs: BullMQ + Redis (deadline checks, automation triggers, digest emails)
- AI: server-side calls to an LLM provider behind an `AiAuditService` interface —
  never called directly from the client, always logged, always human-reviewable

---

## C. Folder Structure (Phase 1)

```
/app
  /(auth)/login
  /(auth)/register
  /(dashboard)
    /clients/[clientId]
      /overview /reports /negative-items /disputes /documents /scores /tasks /messages /timeline
    /disputes
    /tasks
    /documents
    /communications
    /analytics
    /templates
    /automations
    /compliance
    /settings
  /api
    /clients/[...]
    /disputes/[...]
    /documents/[...]
    /automations/[...]
    /webhooks/[...]
  /portal (client-facing, separate layout + auth guard)
    /progress /documents /disputed-accounts /results /messages
/lib
  /auth        (session, RBAC guards)
  /db          (Prisma client singleton)
  /storage     (S3 client, signed URL helpers)
  /pdf         (letter + package generation)
  /automation  (trigger/action engine)
  /ai          (AiAuditService interface + provider adapter)
  /compliance  (guardrail checks, disclaimers, review gates)
/prisma
  schema.prisma
  /migrations
/components
  /ui (design system primitives)
  /clients /disputes /documents /dashboard /portal
/jobs
  deadline-check.ts
  automation-worker.ts
  digest-email.ts
```

---

## D. Authentication & Permissions

- Session-based auth (Auth.js), MFA required for `SUPER_ADMIN` and `COMPLIANCE_ADMIN` roles.
- Roles: `SUPER_ADMIN`, `CREDIT_SPECIALIST`, `COMPLIANCE_ADMIN`, `CLIENT`.
- RBAC enforced at three layers, not just the UI:
  1. **Route middleware** — blocks page access by role.
  2. **Server action / API guard** — every mutation re-checks role + record ownership (a specialist can only act on assigned clients unless `SUPER_ADMIN`).
  3. **Row-level scoping in queries** — client-portal queries are always scoped to `session.clientId`, never trust a client-supplied ID alone.
- Every permission check that fails is written to `audit_logs` with `action: "ACCESS_DENIED"`.

---

## E. Client CRM Architecture

- `clients` is the anchor entity; every other domain table (documents, disputes, tasks, messages) foreign-keys to it.
- `client_status` is a controlled enum driving both the UI Kanban view and automation triggers (status transitions are themselves loggable events, not silent field updates).
- `activity_logs` gives the permanent chronological timeline (§5 in your spec) — every status change, upload, dispute action, and message writes one row here automatically; nothing is timeline-visible unless it went through a logged action.

---

## F. Credit Report / Tradeline Architecture

- One `credit_reports` row per bureau per upload (not per client) — this is what makes bureau-vs-bureau comparison and re-audit diffing possible.
- `tradelines` belong to a specific `credit_reports` row, so history is never overwritten — re-audit compares the newest `credit_reports` snapshot per bureau against the prior one for that same client+bureau.
- `negative_items` is a separate table from `tradelines`: a tradeline is raw bureau data; a negative item is a **case record** the specialist opens against one or more tradelines (supports the "mixed file" / "duplicate account" scenario where one case spans multiple raw tradeline rows).

---

## G. Dispute Workflow State Machine

```
IDENTIFIED → RESEARCHING → ELIGIBLE_FOR_DISPUTE → DOCUMENTATION_NEEDED
    → READY → SENT → PENDING → (VERIFIED | UPDATED | DELETED | CORRECTED)
    → ESCALATED → CLOSED
```
- Transitions are a whitelist table (`from_status`, `to_status`, `allowed_roles`), not free-form — this is what lets `automations` safely react to "entered PENDING" without a specialist fat-fingering a shortcut around required steps.
- A `dispute_rounds` row groups the `dispute_items` sent together in one package to one bureau; `dispute_letters` and `dispute_packages` hang off the round, not the client, so historical rounds are immutable once sent (edits after `SENT` create a new version, never mutate the sent record).

---

## H. Automation Engine Design

- `automation_rules`: `trigger_event` (enum) + `conditions` (JSON) + `actions` (ordered JSON list) + `enabled` + `requires_approval`.
- `automation_events`: append-only log of every trigger firing, whether it executed or was held for review, and the resulting action IDs — this is the audit trail for "why did the system do that."
- Hard rule enforced in code, not just policy: any automation action classified `LEGALLY_CONSEQUENTIAL` (sending a dispute, generating an identity-theft block request) defaults to `requires_approval: true` and cannot be flipped by a `CREDIT_SPECIALIST` role — only `SUPER_ADMIN`, and that change itself is audit-logged.

---

## I. Document Storage Architecture

- Private S3 bucket, objects addressed by `client_documents.storage_key` (never a guessable path).
- All reads/writes go through signed URLs with short expiry, minted server-side after an RBAC check — the client never gets a durable direct link.
- Encryption at rest (bucket-level) + in transit (TLS). SSNs and full identity documents are stored, but the `clients.ssn` field is application-encrypted (separate key from disk-level encryption) and only ever decrypted server-side for the specific authorized action, never sent to the client bundle or logged.

---

## J. AI Architecture

`AiAuditService` interface — every method takes structured source data (report JSON, prior dispute history) and returns a structured recommendation, never free text alone:

```ts
interface AiSuggestion {
  sourceData: object;        // exact records the suggestion is based on
  flaggedReason: string;
  suggestedAction: string;
  confidence: "low" | "medium" | "high";
  reviewRequired: true;      // always true; not a field a caller can disable
}
```
- The AI service never writes directly to `disputes` or `dispute_letters` — it writes to a `ai_suggestions` staging table (add to schema alongside compliance_records) that a specialist must explicitly promote into a real dispute/letter.
- Identity-theft workflows are never AI-initiated — `identity_theft_cases` can only be created from a form action gated on the client's own statement + uploaded documentation.

---

## K. Compliance Safeguards

- `compliance_records` logs every review checkpoint (who approved a package, when, against which round).
- Hard-coded UI copy guardrails: no results view, client message template, or dashboard metric is allowed to render the words "guaranteed" + a deletion/score claim in the same string — enforce via a lint rule on template files, not just a style guide.
- §605B workflow requires the documentation checklist to be fully satisfied (server-side check against `identity_theft_cases.documents`) before the block-request letter template becomes selectable — the UI won't just warn, it will disable the action.
- All jurisdiction-specific rules (state credit-services laws, CROA disclosures) live in a `compliance_rules` config table rather than hardcoded strings, since requirements vary by state and change over time.

---

## L. Development Roadmap

Phases as you specified (Foundation → Credit Engine → Dispute Engine → Automation →
Client Portal → AI → Integrations → Scale/Security). Phase 1 scaffold begins below.

## M. MVP Acceptance Criteria

The 18-step flow in your spec (§38) is the MVP definition of done. Recommended build
order within Phase 1+2+3 to hit that MVP fastest:
1. Auth + roles + client CRUD + client timeline (this doc's Phase 1)
2. Document upload to S3 + document vault UI
3. Credit report upload (manual entry first — provider integration is Phase 7) + tradeline storage
4. Negative item tracker + audit view
5. Dispute round creation + letter template + PDF generation
6. Package builder + mailed/deadline tracking
7. Bureau response upload + re-audit diff + next round

This order gets you a working single-client walkthrough of the full MVP loop before
investing in automation, the client portal, or AI — those all consume the same
underlying data model built here.
