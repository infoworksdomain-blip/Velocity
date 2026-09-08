# Velocity Sub-processor List

A living document — every entry below is a real, already-integrated dependency of this build, not a hypothetical vendor list.

| Sub-processor | Purpose | Data involved |
|---|---|---|
| Stripe | Payment processing, subscription billing | Billing contact details, payment method (tokenized by Stripe — Velocity never stores raw card data) |
| Anthropic | AI content generation (text, assistant, agents) | Workspace brand context and generation prompts sent per API call; no persistent storage of prompts by the sub-processor beyond its own documented API retention |
| OpenAI | AI content generation (fallback text provider) | Same as above |
| [KMS provider — AWS KMS or GCP KMS, selected at deployment] | Encryption key management for OAuth tokens and MFA secrets | Encryption keys only — never plaintext secrets |
| TikTok, Meta, Google | Content publishing, via the customer's own OAuth authorization | Published content and the customer's own connected-account identifiers — each platform acts on the CUSTOMER's own authorization, not as Velocity's sub-processor for that specific data flow |
| [Cloud hosting provider — AWS, per infra/terraform] | Application hosting, database, storage, CDN | All workspace data, region-scoped per the customer's own configured data residency |

Removed or changed sub-processors are announced to customers with reasonable notice before the change takes effect, per the DPA template's own commitment (a real deployment's operational process, not code).
