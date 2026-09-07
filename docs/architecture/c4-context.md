# C4 — System Context

```mermaid
C4Context
title VELOCITY — System Context

Person(individual, "Individual user", "Founder, creator, influencer, freelancer")
Person(business, "Business user", "SaaS/e-commerce/agency operator, multi-seat")
Person(agencyOp, "Agency operator", "Manages N client workspaces")
Person(clientViewer, "Client-portal viewer", "Read-only or approval-only branded surface")

System(velocity, "VELOCITY", "URL-in, published-post-out short-form content engine: brand ingest, concept generation, Velocity swipe review, scheduling, publishing, attribution")

System_Ext(tiktok, "TikTok Content Posting API", "Official publishing: Upload (draft) and Direct Post")
System_Ext(instagram, "Instagram Content Publishing API", "Official publishing to Reels, Business/Creator accounts only")
System_Ext(youtube, "YouTube Data API", "videos.insert resumable upload")
System_Ext(anthropic, "Anthropic Messages API", "Hook/text generation, forced tool-use structured output")
System_Ext(openai, "OpenAI Responses API", "Hook/text generation fallback, strict JSON schema")
System_Ext(videoModels, "Video/image model vendors", "Kling, Veo, Seedance, MiniMax, Seedream — behind the provider router")
System_Ext(stripe, "Stripe", "Subscriptions + metered credits")
System_Ext(r2, "Cloudflare R2 + CDN", "Signed-URL media storage")

Rel(individual, velocity, "Onboards with a URL, swipes Velocity, reviews calendar")
Rel(business, velocity, "Same, plus team roles and approval workflows")
Rel(agencyOp, velocity, "Operates client workspaces, white-label console")
Rel(clientViewer, velocity, "Views/approves via branded client portal")

Rel(velocity, tiktok, "Publishes via official OAuth, user-scoped tokens")
Rel(velocity, instagram, "Publishes via official OAuth, user-scoped tokens")
Rel(velocity, youtube, "Publishes via official OAuth, user-scoped tokens")
Rel(velocity, anthropic, "Structured TextPlan generation (forced tool-use)")
Rel(velocity, openai, "Structured TextPlan generation (fallback, strict schema)")
Rel(velocity, videoModels, "Video/image generation via provider-abstraction router")
Rel(velocity, stripe, "Subscription + usage-based billing")
Rel(velocity, r2, "Stores and serves generated/licensed media")
```

**Note on scope:** no system in this diagram is ever asked to create, warm, or trade social accounts on VELOCITY's behalf (Appendix B). All three publishing integrations are official, user-authorised OAuth only (C1).
