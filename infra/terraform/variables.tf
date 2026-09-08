variable "environment" {
  description = "staging | production"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "region" {
  description = "CLAUDE.md's own real data-residency split: African tenants in af-south-1, UK tenants in eu-west-2 (TenantRegionService, STEP 1, sets workspaces.data_region at creation time). One region per apply — see main.tf's own comment on why."
  type        = string
  validation {
    condition     = contains(["af-south-1", "eu-west-2"], var.region)
    error_message = "region must be af-south-1 (Africa) or eu-west-2 (UK) — this build's own two real supported regions."
  }
}

variable "region_label" {
  description = "africa | uk — matches AWS_S3_BUCKET_AFRICA/AWS_S3_BUCKET_UK env var naming CLAUDE.md already established."
  type        = string
  validation {
    condition     = contains(["africa", "uk"], var.region_label)
    error_message = "region_label must be africa or uk."
  }
}

variable "db_instance_class" {
  description = "RDS Postgres instance class. Small by default — this is a template for a real deployment's actual capacity planning, not a fixed prescription (see docs/steps/STEP-22.md's honest note that no real load-test data exists yet to size this against, STEP 21's own DEFERRED items)."
  type        = string
  default     = "db.r6g.large"
}

variable "db_engine_version" {
  description = "Postgres 16, matching this build's own pinned local dev version (docker-compose.yml) and the pgvector HNSW indexes migration 0001 already created (pgvector ships with RDS Postgres 15+)."
  type        = string
  default     = "16.4"
}

variable "min_app_instances" {
  type    = number
  default = 2 # never 1 — a single-instance app tier has no real availability story
}

variable "max_app_instances" {
  type    = number
  default = 10
}

variable "backup_retention_days" {
  description = "RDS automated backup retention. GATE 22's own literal 'tested restore drill' depends on there being a real backup to restore FROM — this is the mechanism that produces one."
  type        = number
  default     = 14
}
