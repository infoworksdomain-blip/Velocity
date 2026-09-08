# Velocity infrastructure (STEP 22)

Real Terraform HCL for this build's own actual architecture — hand-written, syntactically checked carefully, but **unvalidated by a real `terraform validate`/`plan`/`apply`**: no Terraform binary and no AWS account exist in this sandbox. See `docs/steps/STEP-22.md` for the full honesty matrix.

## Structure

- `modules/regional-stack/` — everything one region needs: VPC (multi-AZ), RDS Postgres (multi-AZ in production, automated backups, a real read replica), ECS Fargate for `apps/web`/`apps/worker` (blue/green via CodeDeploy, autoscaling), ElastiCache Redis, S3 + CloudFront (media CDN), WAFv2 (managed rule groups + a rate-based rule), Secrets Manager, IAM.
- `main.tf` / `variables.tf` / `outputs.tf` — the root module, parameterized by **one region per apply** (an unaliased `aws` provider can't vary by module call within a single root module — the idiomatic Terraform fix, used here, is one root applied once per region as a separate workspace/state).
- `environments/{staging,production}/{africa,uk}.tfvars` — the four real apply targets (2 environments × 2 regions, matching CLAUDE.md's own real data-residency split).

## Bootstrapping (one-time, per AWS account)

1. Create the S3 bucket + DynamoDB lock table the `backend "s3"` block in `versions.tf` needs (outside Terraform, Terraform's own documented chicken-and-egg pattern).
2. `terraform init -backend-config="bucket=<state-bucket>" -backend-config="region=<state-bucket-region>" -backend-config="dynamodb_table=<lock-table>"`

## Applying

```bash
terraform workspace new staging-africa   # one workspace per (environment, region) pair
terraform apply -var-file=environments/staging/africa.tfvars

terraform workspace new staging-uk
terraform apply -var-file=environments/staging/uk.tfvars

# production-africa / production-uk follow the same pattern, after staging is verified.
```

## What this does NOT do

- Provision a real domain/DNS (the ACM certificate's `domain_name` is a placeholder — a real deployment supplies its own).
- Build/push the container images the ECS task definitions reference (`PLACEHOLDER_ECR_IMAGE_URI`) — that's the CI/CD pipeline's job, not this Terraform's.
- Configure the actual CodeDeploy blue/green traffic-shifting rules (`appspec.yaml`) — deployment-time config, not infrastructure.
- Run a real `terraform plan`/`apply` — no AWS account, no Terraform binary, in this sandbox.
