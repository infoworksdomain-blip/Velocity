# C4 — Container Diagram

```mermaid
C4Container
title VELOCITY — Containers

Person(user, "User", "Individual / Business / Agency")

System_Boundary(velocity, "VELOCITY") {
  Container(web, "apps/web", "Next.js 15, App Router", "Dashboard, Velocity, Calendar, Content Studio; tRPC internally, REST /v1 publicly")
  Container(worker, "apps/worker", "Node, BullMQ + Temporal client", "Short jobs (BullMQ) and long-running render/publish workflow orchestration (Temporal workers)")
  Container(render, "apps/render", "Node, Remotion on Lambda", "Deterministic video/image composition; text layer separate from video track")
  ContainerDb(pg, "Postgres 16", "+ pgvector, RLS", "Transactional state; every tenant table scoped by workspace_id")
  ContainerDb(redis, "Redis", "BullMQ backing store")
  Container(temporalSrv, "Temporal server", "Workflow engine", "Durable execution for render/publish pipelines; survives worker restarts")
  ContainerDb(r2, "Cloudflare R2 + CDN", "Object storage", "Signed URLs only")
}

System_Ext(providers, "Model providers", "Anthropic, OpenAI, Kling, Veo, Seedance, MiniMax, Seedream")
System_Ext(platforms, "Publishing platforms", "TikTok, Instagram, YouTube — official APIs")
System_Ext(stripe, "Stripe")

Rel(user, web, "HTTPS")
Rel(web, pg, "tRPC procedures, RLS-scoped queries", "Drizzle")
Rel(web, redis, "Enqueue short jobs")
Rel(web, temporalSrv, "Start/query render & publish workflows")
Rel(worker, redis, "Consume short jobs")
Rel(worker, temporalSrv, "Register activities, execute workflow steps")
Rel(worker, providers, "Provider-router calls, metered into usage_events")
Rel(worker, platforms, "Publish via official OAuth")
Rel(render, r2, "Read source assets, write composed output")
Rel(worker, render, "Invoke composition for a Render job")
Rel(web, r2, "Signed upload/download URLs")
Rel(web, stripe, "Checkout, webhooks, usage reporting")
```

**Boundary rule (see ADR 0001):** a job goes to BullMQ if it is short, stateless, and safe to lose on a crash (notifications, quick sync). It goes to Temporal if it is multi-minute, multi-vendor, must survive a worker restart without duplicating spend, or has compensating/retry semantics tied to money (render, publish).
