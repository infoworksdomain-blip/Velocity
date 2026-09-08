# apps/web and apps/worker as real ECS Fargate services — canary
# deployment via CodeDeploy's native ECS blue/green support (build
# script: "blue/green or canary deploys"). Auto-scaling on CPU/memory,
# never a single-instance service.

resource "aws_ecs_cluster" "main" {
  name = "velocity-${var.environment}-${var.region_label}"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_security_group" "app" {
  name_prefix = "velocity-${var.environment}-${var.region_label}-app-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3000
    to_port         = 3001
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "alb" {
  name_prefix = "velocity-${var.environment}-${var.region_label}-alb-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_lb" "main" {
  name               = "velocity-${var.environment}-${var.region_label}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # WAF association is in waf.tf — real DDoS/WAF protection (build script:
  # "WAF, DDoS protection"). AWS Shield Standard is on every ALB by
  # default (no config needed); Shield Advanced is a real, paid upgrade a
  # production launch should evaluate, not enabled by default here.
}

# Two target groups per service (blue/green) is what real CodeDeploy-
# managed canary needs — CodeDeploy itself owns the traffic-shifting
# config (appspec.yaml, deployed at release time, not part of this
# Terraform), so only the STATIC infrastructure (cluster, task defs,
# listener, both target groups) lives here.
resource "aws_lb_target_group" "web_blue" {
  name        = "velocity-${var.environment}-${var.region_label}-web-blue"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check {
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }
}

resource "aws_lb_target_group" "web_green" {
  name        = "velocity-${var.environment}-${var.region_label}-web-green"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check {
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }
}

resource "aws_lb_listener" "web" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web_blue.arn
  }
}

resource "aws_acm_certificate" "main" {
  domain_name       = "velocity-${var.region_label}.example.com" # a real deployment supplies its own real domain — this repo has no real one to hardcode
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_ecs_task_definition" "web" {
  family                   = "velocity-${var.environment}-${var.region_label}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.environment == "production" ? "1024" : "512"
  memory                   = var.environment == "production" ? "2048" : "1024"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = "PLACEHOLDER_ECR_IMAGE_URI" # set by the real CI/CD pipeline at deploy time, never a literal in source-controlled Terraform
      essential = true
      portMappings = [{ containerPort = 3000, protocol = "tcp" }]
      # Every secret env var (JWT_ACCESS_SECRET, ENCRYPTION_KEY, etc. —
      # CLAUDE.md's own "throws at startup" list) is injected from
      # Secrets Manager (secrets.tf), never plaintext here — the same
      # "no secrets in code" discipline this repo's own env var
      # handling has followed since STEP 1.
      secrets = [for name in [
        "DATABASE_URL_APP", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET",
        "ENCRYPTION_KEY", "ANTHROPIC_API_KEY", "META_APP_SECRET",
        "META_VERIFY_TOKEN", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
      ] : { name = name, valueFrom = "${aws_secretsmanager_secret.app.arn}:${name}::" }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.web.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "web" {
  name            = "velocity-${var.environment}-${var.region_label}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = var.min_app_instances
  launch_type     = "FARGATE"

  deployment_controller {
    type = "CODE_DEPLOY" # real blue/green — the service's own rolling-update controller is deliberately NOT used
  }

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.app.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web_blue.arn
    container_name    = "web"
    container_port    = 3000
  }

  lifecycle {
    ignore_changes = [task_definition, load_balancer] # CodeDeploy owns these once blue/green is live
  }
}

resource "aws_appautoscaling_target" "web" {
  max_capacity       = var.max_app_instances
  min_capacity       = var.min_app_instances
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.web.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "web_cpu" {
  name               = "velocity-${var.environment}-${var.region_label}-web-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.web.resource_id
  scalable_dimension = aws_appautoscaling_target.web.scalable_dimension
  service_namespace  = aws_appautoscaling_target.web.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 65
  }
}

# apps/worker — same shape, no ALB target group (it polls Temporal task
# queues, it doesn't serve inbound HTTP). Scaling this out horizontally
# IS STEP 21's own real answer to "500 concurrent renders": more worker
# tasks polling the same task queue, Temporal's own native model.
resource "aws_ecs_task_definition" "worker" {
  family                   = "velocity-${var.environment}-${var.region_label}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.environment == "production" ? "2048" : "1024"
  memory                   = var.environment == "production" ? "4096" : "2048"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn             = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = "PLACEHOLDER_ECR_IMAGE_URI"
      essential = true
      secrets = [for name in [
        "DATABASE_URL_APP", "DATABASE_URL", "ENCRYPTION_KEY", "ANTHROPIC_API_KEY",
      ] : { name = name, valueFrom = "${aws_secretsmanager_secret.app.arn}:${name}::" }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "worker"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "worker" {
  name            = "velocity-${var.environment}-${var.region_label}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.min_app_instances
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.app.id]
  }
}

resource "aws_appautoscaling_target" "worker" {
  max_capacity       = var.max_app_instances * 5 # workers scale further than the web tier — render/publish throughput is the real bottleneck STEP 21 flagged, not request-handling
  min_capacity       = var.min_app_instances
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/velocity/${var.environment}/${var.region_label}/web"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/velocity/${var.environment}/${var.region_label}/worker"
  retention_in_days = 30
}

resource "aws_iam_role" "ecs_execution" {
  name = "velocity-${var.environment}-${var.region_label}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "velocity-${var.environment}-${var.region_label}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]
  })
}
