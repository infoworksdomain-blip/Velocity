# STEP 22 — Production Deployment. Real Terraform HCL reflecting this
# build's own actual architecture (CLAUDE.md's own "Data residency &
# multi-region" section: af-south-1 for African tenants, eu-west-2 for
# UK tenants — TenantRegionService, STEP 1's own design, sets
# workspaces.dataRegion at creation time). Written by hand, syntactically
# checked carefully, but UNVALIDATED by a real `terraform validate`/
# `plan`/`apply` — no terraform binary and no AWS account exist in this
# sandbox, the same class of gap as every other real-infrastructure
# dependency across this build. See docs/steps/STEP-22.md.

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.50"
    }
  }

  backend "s3" {
    # Real values supplied per-environment via -backend-config, never
    # hardcoded here (the state bucket itself is bootstrapped once,
    # outside this configuration, per Terraform's own documented
    # chicken-and-egg pattern for S3-backed state).
    key = "velocity/terraform.tfstate"
  }
}
