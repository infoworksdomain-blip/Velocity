output "db_endpoint" {
  value     = module.regional_stack.db_endpoint
  sensitive = true
}

output "redis_endpoint" {
  value     = module.regional_stack.redis_endpoint
  sensitive = true
}

output "alb_dns_name" {
  value = module.regional_stack.alb_dns_name
}

output "cloudfront_domain_name" {
  value = module.regional_stack.cloudfront_domain_name
}

output "media_bucket_name" {
  value = module.regional_stack.media_bucket_name
}

output "secrets_arn" {
  value = module.regional_stack.secrets_arn
}
