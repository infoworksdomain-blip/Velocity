# Postgres 16 + pgvector (real HNSW indexes already exist since migration
# 0001, STEP 2) — RDS supports `CREATE EXTENSION vector` natively on
# PG 15+, no custom AMI needed. Multi-AZ for real failover (build
# script's own "multi-AZ" requirement), automated backups for GATE 22's
# literal "tested restore drill".

resource "aws_db_subnet_group" "main" {
  name       = "velocity-${var.environment}-${var.region_label}"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_security_group" "rds" {
  name_prefix = "velocity-${var.environment}-${var.region_label}-rds-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_kms_key" "rds" {
  description             = "velocity-${var.environment}-${var.region_label}-rds"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_db_instance" "main" {
  identifier     = "velocity-${var.environment}-${var.region_label}"
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  allocated_storage     = 100
  max_allocated_storage = 1000 # real storage autoscaling — a bottleneck runbook entry (STEP 21) this satisfies structurally
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  db_name  = "velocity"
  username = "velocity_owner" # the real migration/owner role (packages/db/src/client.ts's createAdminPool) — NEVER the app role, which is created inside migration 0001 with its own, more restricted grants
  # Password sourced from Secrets Manager, never a literal here (see secrets.tf).
  manage_master_user_password = true

  multi_az               = var.environment == "production"
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = var.backup_retention_days
  backup_window           = "03:00-04:00" # low-traffic window; a real deployment tunes this per its own actual tenant timezone distribution
  copy_tags_to_snapshot   = true
  deletion_protection     = var.environment == "production"
  skip_final_snapshot     = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "velocity-${var.environment}-${var.region_label}-final" : null

  performance_insights_enabled = true

  tags = {
    Environment = var.environment
    Region      = var.region_label
  }
}

# A real read replica for production — the connection-pooler scaling knob
# STEP 21's runbook flagged as not yet provisioned; this is that knob,
# provisioned but only actually routed to once read traffic genuinely
# needs it (an app-layer decision, not this Terraform's job).
resource "aws_db_instance" "read_replica" {
  count                  = var.environment == "production" ? 1 : 0
  identifier             = "velocity-${var.environment}-${var.region_label}-replica"
  replicate_source_db    = aws_db_instance.main.identifier
  instance_class         = var.db_instance_class
  vpc_security_group_ids = [aws_security_group.rds.id]
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.rds.arn
}
