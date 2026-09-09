output "db_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value     = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive = true
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.media.domain_name
}

output "media_bucket_name" {
  value = aws_s3_bucket.media.id
}

output "secrets_arn" {
  value = aws_secretsmanager_secret.app.arn
}

output "remotion_lambda_role_arn" {
  value       = aws_iam_role.remotion_lambda.arn
  description = "Pass to `remotion lambda functions deploy --custom-role-arn=<this>` (or DeployFunctionInput.customRoleArn) so the deployed function assumes this Terraform-managed role instead of Remotion's own account-wide default."
}
