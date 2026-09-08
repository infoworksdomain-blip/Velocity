variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "region_label" {
  description = "africa | uk — matches AWS_S3_BUCKET_AFRICA/AWS_S3_BUCKET_UK env var naming already established in CLAUDE.md's own env var list."
  type        = string
}

variable "db_instance_class" {
  type = string
}

variable "db_engine_version" {
  type = string
}

variable "min_app_instances" {
  type = number
}

variable "max_app_instances" {
  type = number
}

variable "backup_retention_days" {
  type = number
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}
