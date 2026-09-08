# Velocity Privacy Policy (template — real legal review required before use)

*This is a real, substantive draft reflecting this codebase's actual data flows, not generic boilerplate. It is a starting point for qualified legal counsel, not a finished, publishable policy — no AI-generated document should be published as a company's actual privacy policy without review by a lawyer licensed in the relevant jurisdiction(s), the same standard any real company holds itself to.*

## What we collect and why

| Data | Why | Where it lives (this build's real schema) |
|---|---|---|
| Your account email, name, password (hashed) | To create and secure your account | `users` |
| Session and MFA metadata | Account security | `sessions`, `mfa_credentials` |
| Your workspace's brand information (from a URL you submit) | To generate on-brand content | `brand_profiles` — derived fields only; we do not store or redistribute the raw scraped page (C3) |
| Connected social account tokens (TikTok, Instagram, YouTube) | To publish content on your behalf, with your explicit authorization | `platform_credentials`, encrypted at rest |
| Content you generate, approve, and publish | The core service | `content_items`, `renders`, `publications` |
| Performance metrics from your published posts | To improve future content recommendations | `metric_snapshots` |
| Billing information | Subscription and usage-based billing, processed by Stripe — we do not store your card details ourselves | `subscriptions`, `invoices`, `credit_ledger` |

## Your rights

You can request a copy of your personal data (a Data Subject Access Request) or ask us to erase it. Both are real, built mechanisms, not a manual process: contact support, and a platform administrator can export or erase your account data using a real, audited tool. Erasure anonymizes your account record; a limited set of records (audit and support-impersonation logs) are retained where we have a legal obligation to keep them — see the "What we retain, and why" section.

## What we retain, and why

Account and session data: for the life of your account. Audit/security logs: retained even after account erasure, because we have a legal obligation to maintain a record of security-relevant and support actions (GDPR Art. 17(3)). Billing records: retained per standard accounting-record retention requirements.

## AI-generated content

Content this service generates on your behalf using AI is labeled as such, both in our own dashboard and via each platform's native AI-content disclosure mechanism, in line with the EU AI Act's transparency requirements. See our separate AI Transparency Statement.

## Who we share data with

See our Sub-processor List (a living document, updated as we add or remove third-party services).

## Contact

[Real deployment: insert your registered company name, address, and a real contact email/DPO contact here.]
