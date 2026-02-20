/**
 * AccuDefend - AWS Infrastructure Variables
 */

# =============================================================================
# GENERAL
# =============================================================================

variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "project_name" {
  description = "Project name for tagging"
  type        = string
  default     = "AccuDefend"
}

# =============================================================================
# REGIONS
# =============================================================================

variable "primary_region" {
  description = "Primary AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "secondary_region" {
  description = "Secondary AWS region for disaster recovery"
  type        = string
  default     = "us-west-2"
}

variable "eu_region" {
  description = "EU region for GDPR-compliant data storage"
  type        = string
  default     = "eu-west-1"
}

# =============================================================================
# DATABASE
# =============================================================================

variable "db_instance_class" {
  description = "RDS Aurora instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "db_password" {
  description = "Master password for RDS"
  type        = string
  sensitive   = true
}

variable "db_backup_retention_days" {
  description = "Number of days to retain database backups"
  type        = number
  default     = 35
}

# =============================================================================
# REDIS
# =============================================================================

variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.r6g.large"
}

variable "redis_auth_token" {
  description = "Auth token for Redis cluster"
  type        = string
  sensitive   = true
}

variable "redis_num_cache_clusters" {
  description = "Number of Redis cache clusters"
  type        = number
  default     = 3
}

# =============================================================================
# ECS
# =============================================================================

variable "backend_cpu" {
  description = "CPU units for backend task"
  type        = number
  default     = 1024
}

variable "backend_memory" {
  description = "Memory for backend task (MB)"
  type        = number
  default     = 2048
}

variable "backend_desired_count" {
  description = "Desired number of backend tasks"
  type        = number
  default     = 3
}

variable "ai_agent_cpu" {
  description = "CPU units for AI agent task"
  type        = number
  default     = 2048
}

variable "ai_agent_memory" {
  description = "Memory for AI agent task (MB)"
  type        = number
  default     = 4096
}

variable "ai_agent_desired_count" {
  description = "Desired number of AI agent tasks"
  type        = number
  default     = 2
}

# =============================================================================
# NETWORKING
# =============================================================================

variable "vpc_cidr_primary" {
  description = "CIDR block for primary VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "vpc_cidr_secondary" {
  description = "CIDR block for secondary VPC"
  type        = string
  default     = "10.1.0.0/16"
}

# =============================================================================
# DOMAIN & SSL
# =============================================================================

variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = "accudefend.com"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for HTTPS"
  type        = string
  default     = ""
}

# =============================================================================
# THIRD-PARTY INTEGRATIONS
# =============================================================================

variable "stripe_secret_key" {
  description = "Stripe API secret key"
  type        = string
  sensitive   = true
}

variable "stripe_webhook_secret" {
  description = "Stripe webhook signing secret"
  type        = string
  sensitive   = true
}

variable "adyen_api_key" {
  description = "Adyen API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "adyen_hmac_key" {
  description = "Adyen HMAC key for webhooks"
  type        = string
  sensitive   = true
  default     = ""
}

variable "shift4_api_key" {
  description = "Shift4 API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "elavon_api_key" {
  description = "Elavon API key"
  type        = string
  sensitive   = true
  default     = ""
}

# =============================================================================
# AI SERVICES
# =============================================================================

variable "openai_api_key" {
  description = "OpenAI API key for AI agents"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI agents"
  type        = string
  sensitive   = true
}

# =============================================================================
# MONITORING
# =============================================================================

variable "cloudwatch_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 90
}

variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring"
  type        = bool
  default     = true
}

# =============================================================================
# S3
# =============================================================================

variable "evidence_retention_days" {
  description = "Days to retain evidence in standard storage before transitioning"
  type        = number
  default     = 90
}

variable "evidence_glacier_days" {
  description = "Days before transitioning to Glacier"
  type        = number
  default     = 365
}

variable "evidence_expiration_days" {
  description = "Days before evidence expiration (compliance requirement)"
  type        = number
  default     = 2555  # 7 years
}
