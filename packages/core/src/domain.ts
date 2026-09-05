/**
 * Domain model types — the fixed vocabulary from /docs/architecture/domain-model.md.
 * These are structural placeholders (STEP 1). Full field sets and DB-backed
 * shapes land with the STEP 2 schema; this file exists so the vocabulary is
 * type-checkable from day one and every later package imports the same names.
 */

export type WorkspaceType = "individual" | "business";

interface TenantScoped {
  id: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organisation {
  id: string;
  name: string;
  createdAt: string;
}

export interface Workspace extends Omit<TenantScoped, "workspaceId"> {
  organisationId: string;
  name: string;
  workspaceType: WorkspaceType;
  timezone: string;
}

export interface BrandProfile extends TenantScoped {
  version: number;
  product: string;
  category: string;
}

export interface Angle extends TenantScoped {
  brandProfileId: string;
  kind: string;
}

export interface TrendBlueprint extends TenantScoped {
  hookPattern: string;
  velocityScore: number;
}

export interface Persona extends TenantScoped {
  name: string;
  consentArtefactId: string | null;
}

export type ContentFormat = "ai_ugc" | "slideshow" | "hook_demo" | "meme";

export interface ContentConcept extends TenantScoped {
  angleId: string;
  format: ContentFormat;
  personaId: string | null;
  blueprintId: string | null;
  textPlanId: string | null;
  aiGenerated: true;
}

export interface TextPlan extends TenantScoped {
  contentItemId: string;
  version: string;
}

export type ContentItemStatus =
  | "concept"
  | "queued"
  | "rendering"
  | "ready"
  | "scheduled"
  | "published"
  | "rejected"
  | "failed";

export interface ContentItem extends TenantScoped {
  conceptId: string;
  textPlanId: string;
  status: ContentItemStatus;
  aiGenerated: boolean;
}

export interface Render extends TenantScoped {
  contentItemId: string;
  providerId: string;
  costUsd: number;
  aiGenerated: true;
}

export interface MediaAsset extends TenantScoped {
  storageKey: string;
  contentType: string;
}

export interface CalendarSlot extends TenantScoped {
  platform: "tiktok" | "instagram" | "youtube";
  scheduledAt: string;
  contentItemId: string | null;
}

export interface Publication extends TenantScoped {
  contentItemId: string;
  socialAccountId: string;
  idempotencyKey: string;
}

export interface SocialAccount extends TenantScoped {
  platform: "tiktok" | "instagram" | "youtube";
  externalAccountId: string;
}

export interface MetricSnapshot extends TenantScoped {
  publicationId: string;
  capturedAt: string;
}
