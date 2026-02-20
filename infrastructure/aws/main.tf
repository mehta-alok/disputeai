/**
 * AccuDefend - AWS Cloud Infrastructure
 * Terraform Configuration for Multi-Region Deployment
 */

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "accudefend-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "accudefend-terraform-locks"
  }
}

# =============================================================================
# PROVIDER CONFIGURATION - Multi-Region
# =============================================================================

provider "aws" {
  region = var.primary_region

  default_tags {
    tags = {
      Project     = "AccuDefend"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

provider "aws" {
  alias  = "secondary"
  region = var.secondary_region

  default_tags {
    tags = {
      Project     = "AccuDefend"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

provider "aws" {
  alias  = "eu"
  region = var.eu_region

  default_tags {
    tags = {
      Project     = "AccuDefend"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# =============================================================================
# VARIABLES
# =============================================================================

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "primary_region" {
  description = "Primary AWS region"
  type        = string
  default     = "us-east-1"
}

variable "secondary_region" {
  description = "Secondary AWS region for DR"
  type        = string
  default     = "us-west-2"
}

variable "eu_region" {
  description = "EU region for GDPR compliance"
  type        = string
  default     = "eu-west-1"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.r6g.large"
}

# =============================================================================
# VPC - Primary Region
# =============================================================================

module "vpc_primary" {
  source = "terraform-aws-modules/vpc/aws"

  name = "accudefend-vpc-primary"
  cidr = "10.0.0.0/16"

  azs             = ["${var.primary_region}a", "${var.primary_region}b", "${var.primary_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = false
  one_nat_gateway_per_az = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "accudefend-vpc-primary"
  }
}

# =============================================================================
# VPC - Secondary Region (DR)
# =============================================================================

module "vpc_secondary" {
  source = "terraform-aws-modules/vpc/aws"
  providers = {
    aws = aws.secondary
  }

  name = "accudefend-vpc-secondary"
  cidr = "10.1.0.0/16"

  azs             = ["${var.secondary_region}a", "${var.secondary_region}b"]
  private_subnets = ["10.1.1.0/24", "10.1.2.0/24"]
  public_subnets  = ["10.1.101.0/24", "10.1.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "accudefend-vpc-secondary"
  }
}

# =============================================================================
# RDS - PostgreSQL Primary (Multi-AZ)
# =============================================================================

resource "aws_db_subnet_group" "primary" {
  name       = "accudefend-db-subnet-primary"
  subnet_ids = module.vpc_primary.private_subnets

  tags = {
    Name = "AccuDefend DB Subnet Group"
  }
}

resource "aws_security_group" "rds" {
  name        = "accudefend-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = module.vpc_primary.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "accudefend-rds-sg"
  }
}

resource "aws_rds_cluster" "primary" {
  cluster_identifier     = "accudefend-db-primary"
  engine                 = "aurora-postgresql"
  engine_version         = "15.4"
  database_name          = "accudefend"
  master_username        = "accudefend_admin"
  master_password        = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.primary.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period   = 35
  preferred_backup_window   = "03:00-04:00"
  skip_final_snapshot       = false
  final_snapshot_identifier = "accudefend-final-snapshot"

  storage_encrypted = true
  kms_key_id        = aws_kms_key.database.arn

  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = {
    Name = "accudefend-db-primary"
  }
}

resource "aws_rds_cluster_instance" "primary" {
  count                = 3
  identifier           = "accudefend-db-${count.index}"
  cluster_identifier   = aws_rds_cluster.primary.id
  instance_class       = var.db_instance_class
  engine               = aws_rds_cluster.primary.engine
  engine_version       = aws_rds_cluster.primary.engine_version
  publicly_accessible  = false

  performance_insights_enabled = true
  monitoring_interval          = 60
  monitoring_role_arn          = aws_iam_role.rds_monitoring.arn

  tags = {
    Name = "accudefend-db-instance-${count.index}"
  }
}

# =============================================================================
# RDS - Read Replica in Secondary Region
# =============================================================================

resource "aws_rds_cluster" "secondary" {
  provider = aws.secondary

  cluster_identifier        = "accudefend-db-secondary"
  engine                    = "aurora-postgresql"
  engine_version            = "15.4"
  replication_source_identifier = aws_rds_cluster.primary.arn

  db_subnet_group_name   = aws_db_subnet_group.secondary.name
  vpc_security_group_ids = [aws_security_group.rds_secondary.id]

  storage_encrypted = true
  kms_key_id        = aws_kms_key.database_secondary.arn

  tags = {
    Name = "accudefend-db-secondary"
  }

  depends_on = [aws_rds_cluster.primary]
}

# =============================================================================
# ELASTICACHE - Redis Cluster
# =============================================================================

resource "aws_elasticache_subnet_group" "main" {
  name       = "accudefend-redis-subnet"
  subnet_ids = module.vpc_primary.private_subnets
}

resource "aws_security_group" "redis" {
  name        = "accudefend-redis-sg"
  description = "Security group for Redis cluster"
  vpc_id      = module.vpc_primary.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "accudefend-redis-sg"
  }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "accudefend-redis"
  description                = "Redis cluster for AccuDefend"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 3
  port                       = 6379
  parameter_group_name       = "default.redis7"

  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = var.redis_auth_token

  automatic_failover_enabled = true
  multi_az_enabled           = true

  snapshot_retention_limit   = 7
  snapshot_window            = "04:00-05:00"

  tags = {
    Name = "accudefend-redis"
  }
}

# =============================================================================
# S3 BUCKETS - Evidence Storage
# =============================================================================

resource "aws_s3_bucket" "evidence_primary" {
  bucket = "accudefend-evidence-${var.environment}-${var.primary_region}"

  tags = {
    Name        = "AccuDefend Evidence Storage - Primary"
    DataClass   = "Confidential"
    Compliance  = "PCI-DSS"
  }
}

resource "aws_s3_bucket_versioning" "evidence_primary" {
  bucket = aws_s3_bucket.evidence_primary.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence_primary" {
  bucket = aws_s3_bucket.evidence_primary.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "evidence_primary" {
  bucket = aws_s3_bucket.evidence_primary.id

  rule {
    id     = "transition-to-glacier"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555  # 7 years retention for compliance
    }
  }
}

resource "aws_s3_bucket_replication_configuration" "evidence_primary" {
  depends_on = [aws_s3_bucket_versioning.evidence_primary]

  role   = aws_iam_role.s3_replication.arn
  bucket = aws_s3_bucket.evidence_primary.id

  rule {
    id     = "replicate-to-secondary"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.evidence_secondary.arn
      storage_class = "STANDARD"

      encryption_configuration {
        replica_kms_key_id = aws_kms_key.s3_secondary.arn
      }
    }

    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }
  }
}

# Secondary S3 Bucket (DR)
resource "aws_s3_bucket" "evidence_secondary" {
  provider = aws.secondary
  bucket   = "accudefend-evidence-${var.environment}-${var.secondary_region}"

  tags = {
    Name        = "AccuDefend Evidence Storage - Secondary"
    DataClass   = "Confidential"
    Compliance  = "PCI-DSS"
  }
}

# Backlog Storage Bucket
resource "aws_s3_bucket" "backlog" {
  bucket = "accudefend-backlog-${var.environment}"

  tags = {
    Name = "AccuDefend Technical Backlog Storage"
  }
}

# AI Models Bucket
resource "aws_s3_bucket" "ai_models" {
  bucket = "accudefend-ai-models-${var.environment}"

  tags = {
    Name = "AccuDefend AI Models Storage"
  }
}

# =============================================================================
# ECS - Container Orchestration
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = "accudefend-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  configuration {
    execute_command_configuration {
      kms_key_id = aws_kms_key.ecs.arn
      logging    = "OVERRIDE"

      log_configuration {
        cloud_watch_encryption_enabled = true
        cloud_watch_log_group_name     = aws_cloudwatch_log_group.ecs.name
      }
    }
  }

  tags = {
    Name = "accudefend-cluster"
  }
}

resource "aws_security_group" "ecs" {
  name        = "accudefend-ecs-sg"
  description = "Security group for ECS tasks"
  vpc_id      = module.vpc_primary.vpc_id

  ingress {
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "accudefend-ecs-sg"
  }
}

# ECS Task Definition - Backend API
resource "aws_ecs_task_definition" "backend" {
  family                   = "accudefend-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "backend"
      image = "${aws_ecr_repository.backend.repository_url}:latest"

      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "8000" }
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "REDIS_URL", valueFrom = aws_secretsmanager_secret.redis_url.arn },
        { name = "JWT_SECRET", valueFrom = aws_secretsmanager_secret.jwt_secret.arn },
        { name = "STRIPE_SECRET_KEY", valueFrom = aws_secretsmanager_secret.stripe_key.arn },
        { name = "STRIPE_WEBHOOK_SECRET", valueFrom = aws_secretsmanager_secret.stripe_webhook.arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.primary_region
          "awslogs-stream-prefix" = "backend"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "accudefend-backend-task"
  }
}

# ECS Task Definition - AI Agent Service
resource "aws_ecs_task_definition" "ai_agent" {
  family                   = "accudefend-ai-agent"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 2048
  memory                   = 4096
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_ai.arn

  container_definitions = jsonencode([
    {
      name  = "ai-agent"
      image = "${aws_ecr_repository.ai_agent.repository_url}:latest"

      portMappings = [
        {
          containerPort = 8001
          hostPort      = 8001
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "AI_SERVICE_PORT", value = "8001" },
        { name = "BACKLOG_BUCKET", value = aws_s3_bucket.backlog.id },
        { name = "AI_MODELS_BUCKET", value = aws_s3_bucket.ai_models.id }
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai_key.arn },
        { name = "ANTHROPIC_API_KEY", valueFrom = aws_secretsmanager_secret.anthropic_key.arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ai_agent.name
          "awslogs-region"        = var.primary_region
          "awslogs-stream-prefix" = "ai-agent"
        }
      }
    }
  ])

  tags = {
    Name = "accudefend-ai-agent-task"
  }
}

# ECS Service - Backend
resource "aws_ecs_service" "backend" {
  name            = "accudefend-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 3
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc_primary.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 8000
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "accudefend-backend-service"
  }
}

# =============================================================================
# APPLICATION LOAD BALANCER
# =============================================================================

resource "aws_security_group" "alb" {
  name        = "accudefend-alb-sg"
  description = "Security group for ALB"
  vpc_id      = module.vpc_primary.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "accudefend-alb-sg"
  }
}

resource "aws_lb" "main" {
  name               = "accudefend-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc_primary.public_subnets

  enable_deletion_protection = true

  access_logs {
    bucket  = aws_s3_bucket.logs.id
    prefix  = "alb-logs"
    enabled = true
  }

  tags = {
    Name = "accudefend-alb"
  }
}

resource "aws_lb_target_group" "backend" {
  name        = "accudefend-backend-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = module.vpc_primary.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = {
    Name = "accudefend-backend-tg"
  }
}

# =============================================================================
# KMS KEYS
# =============================================================================

resource "aws_kms_key" "database" {
  description             = "KMS key for RDS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "accudefend-db-key"
  }
}

resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "accudefend-s3-key"
  }
}

resource "aws_kms_key" "ecs" {
  description             = "KMS key for ECS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "accudefend-ecs-key"
  }
}

# =============================================================================
# CLOUDWATCH
# =============================================================================

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/accudefend-backend"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.cloudwatch.arn

  tags = {
    Name = "accudefend-backend-logs"
  }
}

resource "aws_cloudwatch_log_group" "ai_agent" {
  name              = "/ecs/accudefend-ai-agent"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.cloudwatch.arn

  tags = {
    Name = "accudefend-ai-agent-logs"
  }
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/accudefend-cluster"
  retention_in_days = 90
  kms_key_id        = aws_kms_key.cloudwatch.arn

  tags = {
    Name = "accudefend-ecs-logs"
  }
}

# =============================================================================
# SECRETS MANAGER
# =============================================================================

resource "aws_secretsmanager_secret" "database_url" {
  name        = "accudefend/database-url"
  description = "PostgreSQL connection string"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "accudefend-database-url"
  }
}

resource "aws_secretsmanager_secret" "redis_url" {
  name        = "accudefend/redis-url"
  description = "Redis connection string"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "accudefend-redis-url"
  }
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name        = "accudefend/jwt-secret"
  description = "JWT signing secret"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "accudefend-jwt-secret"
  }
}

resource "aws_secretsmanager_secret" "stripe_key" {
  name        = "accudefend/stripe-secret-key"
  description = "Stripe API secret key"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "accudefend-stripe-key"
  }
}

resource "aws_secretsmanager_secret" "stripe_webhook" {
  name        = "accudefend/stripe-webhook-secret"
  description = "Stripe webhook signing secret"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "accudefend-stripe-webhook"
  }
}

resource "aws_secretsmanager_secret" "openai_key" {
  name        = "accudefend/openai-api-key"
  description = "OpenAI API key for AI agents"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "accudefend-openai-key"
  }
}

resource "aws_secretsmanager_secret" "anthropic_key" {
  name        = "accudefend/anthropic-api-key"
  description = "Anthropic API key for AI agents"
  kms_key_id  = aws_kms_key.secrets.arn

  tags = {
    Name = "accudefend-anthropic-key"
  }
}

# =============================================================================
# ECR REPOSITORIES
# =============================================================================

resource "aws_ecr_repository" "backend" {
  name                 = "accudefend-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.ecr.arn
  }

  tags = {
    Name = "accudefend-backend"
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "accudefend-frontend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.ecr.arn
  }

  tags = {
    Name = "accudefend-frontend"
  }
}

resource "aws_ecr_repository" "ai_agent" {
  name                 = "accudefend-ai-agent"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.ecr.arn
  }

  tags = {
    Name = "accudefend-ai-agent"
  }
}

# =============================================================================
# SNS - Notifications
# =============================================================================

resource "aws_sns_topic" "alerts" {
  name              = "accudefend-alerts"
  kms_master_key_id = aws_kms_key.sns.arn

  tags = {
    Name = "accudefend-alerts"
  }
}

resource "aws_sns_topic" "backlog_updates" {
  name              = "accudefend-backlog-updates"
  kms_master_key_id = aws_kms_key.sns.arn

  tags = {
    Name = "accudefend-backlog-updates"
  }
}

# =============================================================================
# SQS - Message Queues
# =============================================================================

resource "aws_sqs_queue" "webhook_processing" {
  name                       = "accudefend-webhook-processing"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 300

  kms_master_key_id                 = aws_kms_key.sqs.arn
  kms_data_key_reuse_period_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.webhook_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "accudefend-webhook-processing"
  }
}

resource "aws_sqs_queue" "webhook_dlq" {
  name                      = "accudefend-webhook-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = aws_kms_key.sqs.arn

  tags = {
    Name = "accudefend-webhook-dlq"
  }
}

resource "aws_sqs_queue" "ai_analysis" {
  name                       = "accudefend-ai-analysis"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 600

  kms_master_key_id = aws_kms_key.sqs.arn

  tags = {
    Name = "accudefend-ai-analysis"
  }
}

resource "aws_sqs_queue" "backlog_tasks" {
  name                       = "accudefend-backlog-tasks"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  visibility_timeout_seconds = 300

  kms_master_key_id = aws_kms_key.sqs.arn

  tags = {
    Name = "accudefend-backlog-tasks"
  }
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "vpc_id" {
  description = "Primary VPC ID"
  value       = module.vpc_primary.vpc_id
}

output "rds_cluster_endpoint" {
  description = "RDS cluster endpoint"
  value       = aws_rds_cluster.primary.endpoint
}

output "redis_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "s3_evidence_bucket" {
  description = "S3 bucket for evidence storage"
  value       = aws_s3_bucket.evidence_primary.id
}

output "s3_backlog_bucket" {
  description = "S3 bucket for backlog storage"
  value       = aws_s3_bucket.backlog.id
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}
