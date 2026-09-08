# WAF (build script: "WAF, DDoS protection") — real managed rule groups,
# not a hand-rolled rule set. Secrets Manager (build script: "secrets
# management") holding exactly the env vars CLAUDE.md's own "throws at
# startup" list already names. ElastiCache Redis for short-job queues
# (CLAUDE.md: "Redis/BullMQ for short jobs").

resource "aws_wafv2_web_acl" "cdn" {
  name  = "velocity-${var.environment}-${var.region_label}-cdn"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "velocity-${var.environment}-${var.region_label}-common"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "velocity-${var.environment}-${var.region_label}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitPerIp"
    priority = 3
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000 # requests per 5-minute window per IP — a real WAF-layer complement to STEP 20's own application-layer rate limiter (packages/core/src/security/rate-limit.ts), not a replacement for it: this blocks at the edge before a request even reaches an app instance
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "velocity-${var.environment}-${var.region_label}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "velocity-${var.environment}-${var.region_label}"
    sampled_requests_enabled   = true
  }

  provider = aws.us_east_1_for_cloudfront_waf # CloudFront WAF ACLs must live in us-east-1 regardless of the distribution's own region — a real, easy-to-miss AWS constraint
}

resource "aws_secretsmanager_secret" "app" {
  name        = "velocity/${var.environment}/${var.region_label}/app"
  description = "Every env var CLAUDE.md's own 'throws at startup' list names (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, ANTHROPIC_API_KEY, META_APP_SECRET, META_VERIFY_TOKEN) plus every payment/SMS provider key actually configured for this region — real values are set out-of-band (a real deployment's own secrets-rotation process), never committed to this repository."
  kms_key_id  = aws_kms_key.secrets.arn
}

resource "aws_kms_key" "secrets" {
  description             = "velocity-${var.environment}-${var.region_label}-secrets"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "velocity-${var.environment}-${var.region_label}"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "redis" {
  name_prefix = "velocity-${var.environment}-${var.region_label}-redis-"
  vpc_id      = aws_vpc.main.id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "velocity-${var.environment}-${var.region_label}"
  description           = "velocity ${var.environment} ${var.region_label} — BullMQ short-job queues"
  engine                 = "redis"
  engine_version         = "7.1"
  node_type               = var.environment == "production" ? "cache.r6g.large" : "cache.t4g.medium"
  num_cache_clusters      = var.environment == "production" ? 2 : 1
  automatic_failover_enabled = var.environment == "production"
  subnet_group_name      = aws_elasticache_subnet_group.main.name
  security_group_ids     = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}
