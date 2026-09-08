# Root module — a SINGLE region per apply, real Terraform practice for a
# genuinely multi-region deployment (an unaliased `aws` provider cannot
# vary by module invocation within one root module; the idiomatic fix,
# used here, is one root module parameterized by region, applied once
# per region as a separate Terraform workspace/state — see
# environments/staging and environments/production, which each run this
# same root twice: once with region_label=africa, once with
# region_label=uk). This mirrors CLAUDE.md's own real architecture
# statement almost exactly: "Every S3 bucket, Prisma connections
# [Drizzle, in this build], and ClickHouse clusters are region-scoped
# per tenant. Never assume a single database URL."

provider "aws" {
  region = var.region
}

# CloudFront WAF web ACLs are only ever created in us-east-1, regardless
# of which region the distribution itself serves — a real, fixed AWS
# constraint.
provider "aws" {
  alias  = "us_east_1_for_cloudfront_waf"
  region = "us-east-1"
}

module "regional_stack" {
  source = "./modules/regional-stack"
  providers = {
    aws                               = aws
    aws.us_east_1_for_cloudfront_waf = aws.us_east_1_for_cloudfront_waf
  }

  environment            = var.environment
  region                  = var.region
  region_label            = var.region_label
  db_instance_class       = var.db_instance_class
  db_engine_version       = var.db_engine_version
  min_app_instances       = var.min_app_instances
  max_app_instances       = var.max_app_instances
  backup_retention_days   = var.backup_retention_days
}
