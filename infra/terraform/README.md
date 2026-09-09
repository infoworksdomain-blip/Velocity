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
- Build/push the container images the ECS task definitions reference (`PLACEHOLDER_ECR_IMAGE_URI`) — that's the CI/CD pipeline's job, not this Terraform's (see "Building the container images" below for the real Dockerfiles this repo now has).
- Configure the actual CodeDeploy blue/green traffic-shifting rules (`appspec.yaml`) — deployment-time config, not infrastructure.
- Run a real `terraform plan`/`apply` — no AWS account, no Terraform binary, in this sandbox.

## Building the container images (post-STEP-22 audit remediation)

`apps/web/Dockerfile` and `apps/worker/Dockerfile` are real, multi-stage,
pnpm-workspace-aware Dockerfiles — built **from the monorepo root**, not
from inside `apps/web`/`apps/worker`, since a pnpm workspace install needs
every package's manifest:

```bash
# From the repo root:
docker build -f apps/web/Dockerfile    -t velocity-web:latest    .
docker build -f apps/worker/Dockerfile -t velocity-worker:latest .
```

Pushing to the real ECR repositories these task definitions expect (once
the AWS account and `aws_ecr_repository` resources exist — not yet
provisioned by this Terraform):

```bash
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com

docker tag velocity-web:latest    <account-id>.dkr.ecr.<region>.amazonaws.com/velocity-web:latest
docker tag velocity-worker:latest <account-id>.dkr.ecr.<region>.amazonaws.com/velocity-worker:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/velocity-web:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/velocity-worker:latest
```

`ecs.tf`'s `PLACEHOLDER_ECR_IMAGE_URI` would then be replaced with one of
the pushed tags above — a real CI/CD pipeline does this substitution at
deploy time (e.g. via `terraform apply -var="web_image=..."` once that
variable exists, or a separate `aws ecs update-service --force-new-deployment`
after pushing a new tag the task definition already references), neither
of which this Terraform currently wires up.

**Honestly unvalidated:** no Docker daemon exists in this sandbox
(`docker: command not found`), so neither image has actually been built
here. Both Dockerfiles were checked with `dockerfile-utils lint` (clean,
no findings) and their `apps/web`/`apps/worker` build commands were
verified for real via `turbo run build --filter=... --dry-run` to confirm
each Dockerfile's `RUN` step builds exactly the workspace packages that
app actually depends on — real verification of everything checkable
without Docker itself, the same honest split as the rest of this file.
