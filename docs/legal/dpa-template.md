# Velocity Data Processing Agreement — Template (real legal review required before use)

*A structural DPA template covering this build's own actual processing activities and sub-processors. A real DPA is a bilateral contract between the company and each individual customer — this is the reusable template a real legal team fills in per customer, not a self-executing document.*

## 1. Subject matter and duration

Processing of personal data as necessary to provide the Velocity service (brand-intelligence generation, AI content generation, scheduling, publishing, and analytics) for the duration of the customer's subscription plus any legally-mandated retention period thereafter (see the Privacy Policy's "What we retain, and why").

## 2. Nature and purpose of processing

- Storage and processing of the customer's own workspace data (brand profile, generated content, connected-account tokens) to operate the service.
- Processing of the customer's end-users' personal data ONLY to the extent the customer's own use of the platform involves it (e.g., attribution-funnel data the customer's own website sends us) — this build's real architecture makes clear this data belongs to and is scoped to the customer's own workspace (RLS-enforced tenant isolation, C4), never commingled across customers.

## 3. Categories of data subjects

The customer's own personnel (workspace members), and — where the customer's own integration sends it — the customer's end-customers (attribution/conversion events).

## 4. Sub-processors

See the Sub-processor List (docs/steps/STEP-20.md's GDPR data map) — Stripe, Anthropic/OpenAI, the KMS provider, and the connected social platforms (each acting under the customer's own OAuth grant, not as our sub-processor for THAT specific data flow — the customer authorizes the platform directly).

## 5. Security measures

Encryption at rest for OAuth tokens and MFA secrets (real KMS-backed encryption, `packages/db/src/kms.ts`); tenant isolation enforced at the database layer via Postgres Row-Level Security on every workspace-scoped table (C4, mechanically verified by this codebase's own test suite); append-only audit logging of security-relevant and administrative actions.

## 6. Data subject rights assistance

We provide real, working tooling (DSAR export, erasure — STEP 20) the customer can use to fulfil their own obligations to their end-users where applicable, and will assist with requests directed to us regarding the customer's own workspace members.

## 7. International transfers

Data is stored in the region matching the workspace's own configured data residency (af-south-1 for African tenants, eu-west-2 for UK tenants) — see the Data Map. [Real deployment: a real DPA needs the actual, current Standard Contractual Clauses or equivalent transfer mechanism appropriate to the specific customer/data-subject jurisdictions involved — a matter for qualified counsel, not this template.]
