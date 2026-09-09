# Post-STEP-22 audit remediation: real IAM infrastructure for the
# Remotion-on-Lambda compositor (ADR 0002, CLAUDE.md's stack section).
# Confirmed against @remotion/lambda 4.0.499's OWN real, first-party
# source (node_modules/.../dist/api/iam-validation/role-permissions.js —
# never invented, per this build's rule 5) — this is the exact
# `rolePermissions` array Remotion's own `getRolePolicy()` helper
# generates, reproduced here as real Terraform so this role is durable,
# versioned infrastructure rather than a value someone pastes into the AWS
# console by hand.
#
# What Terraform does NOT do here: create the S3 bucket Remotion's
# rendered output lands in, or the Lambda function itself. Remotion's own
# CLI/SDK (`deployFunction`/`deploySite`, wired up in
# apps/render/package.json's `deploy:lambda` script) creates and manages
# both directly — the role's own policy includes `s3:CreateBucket`
# specifically because bucket creation is Remotion's job, not this
# Terraform's (confirmed by reading that same real source file).
#
# Named per-environment (unlike Remotion's own CLI default of the bare
# "remotion-lambda-role" for every account) since this repo already
# deploys 4 real environment×region stacks (see this module's own
# variables) — the deploy script passes this role's ARN explicitly via
# `customRoleArn`, a real, documented @remotion/lambda deployFunction
# parameter for exactly this override.

resource "aws_iam_role" "remotion_lambda" {
  name = "remotion-lambda-role-${var.environment}-${var.region_label}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Verbatim reproduction of @remotion/lambda's rolePermissions (see this
# file's header comment) — REMOTION_BUCKET_PREFIX="remotionlambda-",
# RENDER_FN_PREFIX="remotion-render-", LOG_GROUP_PREFIX="/aws/lambda/",
# LAMBDA_INSIGHTS_PREFIX="/aws/lambda-insights", all confirmed against
# @remotion/lambda-client's real constants.js, not guessed.
resource "aws_iam_role_policy" "remotion_lambda" {
  name = "remotion-lambda-policy"
  role = aws_iam_role.remotion_lambda.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "0"
        Effect   = "Allow"
        Action   = ["s3:ListAllMyBuckets"]
        Resource = ["*"]
      },
      {
        Sid    = "1"
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:ListBucket",
          "s3:PutBucketAcl",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:PutObjectAcl",
          "s3:PutObject",
          "s3:GetBucketLocation",
        ]
        Resource = ["arn:aws:s3:::remotionlambda-*"]
      },
      {
        Sid      = "2"
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = ["arn:aws:lambda:*:*:function:remotion-render-*"]
      },
      {
        Sid      = "3"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup"]
        Resource = ["arn:aws:logs:*:*:log-group:/aws/lambda-insights"]
      },
      {
        Sid    = "4"
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [
          "arn:aws:logs:*:*:log-group:/aws/lambda/remotion-render-*",
          "arn:aws:logs:*:*:log-group:/aws/lambda-insights:*",
        ]
      },
    ]
  })
}
