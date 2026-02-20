-- CreateEnum
CREATE TYPE "BacklogStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'TESTING', 'DONE', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BacklogPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "BacklogCategory" AS ENUM ('BUG', 'FEATURE', 'ENHANCEMENT', 'TECH_DEBT', 'SECURITY', 'PERFORMANCE', 'DOCUMENTATION', 'INFRASTRUCTURE');

-- CreateEnum
CREATE TYPE "AIAgentType" AS ENUM ('BACKLOG_MANAGER', 'CODE_REVIEWER', 'DOCUMENTATION_AGENT', 'TEST_GENERATOR', 'SECURITY_SCANNER', 'PERFORMANCE_MONITOR', 'DISPUTE_ANALYZER', 'EVIDENCE_PROCESSOR');

-- CreateEnum
CREATE TYPE "AIAgentStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'ERROR', 'DISABLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EvidenceType" ADD VALUE 'INCIDENT_REPORT';
ALTER TYPE "EvidenceType" ADD VALUE 'DAMAGE_PHOTOS';
ALTER TYPE "EvidenceType" ADD VALUE 'POLICE_REPORT';
ALTER TYPE "EvidenceType" ADD VALUE 'NO_SHOW_DOCUMENTATION';

-- CreateTable
CREATE TABLE "backlog_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "BacklogStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "BacklogPriority" NOT NULL DEFAULT 'MEDIUM',
    "category" "BacklogCategory" NOT NULL,
    "story_points" INTEGER,
    "epic_id" TEXT,
    "sprint_id" TEXT,
    "assignee_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "ai_agent_id" TEXT,
    "ai_confidence" DECIMAL(5,2),
    "ai_reasoning" TEXT,
    "acceptance_criteria" JSONB,
    "technical_notes" TEXT,
    "labels" TEXT[],
    "estimated_hours" DECIMAL(6,2),
    "actual_hours" DECIMAL(6,2),
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_epics" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "BacklogStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "BacklogPriority" NOT NULL DEFAULT 'MEDIUM',
    "start_date" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_epics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sprints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "velocity" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "backlog_item_id" TEXT NOT NULL,
    "author_id" TEXT,
    "ai_agent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backlog_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_dependencies" (
    "id" TEXT NOT NULL,
    "dependency_type" TEXT NOT NULL,
    "dependent_item_id" TEXT NOT NULL,
    "blocking_item_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backlog_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_activities" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "backlog_item_id" TEXT NOT NULL,
    "user_id" TEXT,
    "ai_agent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backlog_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backlog_attachments" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "backlog_item_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backlog_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AIAgentType" NOT NULL,
    "description" TEXT,
    "status" "AIAgentStatus" NOT NULL DEFAULT 'IDLE',
    "config" JSONB,
    "schedule" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "capabilities" TEXT[],
    "model_provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model_name" TEXT NOT NULL DEFAULT 'claude-3-sonnet',
    "max_tokens" INTEGER NOT NULL DEFAULT 4096,
    "temperature" DECIMAL(3,2) NOT NULL DEFAULT 0.7,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "successful_runs" INTEGER NOT NULL DEFAULT 0,
    "failed_runs" INTEGER NOT NULL DEFAULT 0,
    "avg_duration_ms" DECIMAL(10,2),
    "last_run_at" TIMESTAMP(3),
    "last_error_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_runs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "tokens_used" INTEGER,
    "cost" DECIMAL(10,6),
    "error_message" TEXT,
    "error_stack" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "agent_id" TEXT NOT NULL,

    CONSTRAINT "ai_agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "config" JSONB,
    "credentials" JSONB,
    "webhook_url" TEXT,
    "webhook_secret" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "last_sync_status" TEXT,
    "sync_errors" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "response" JSONB,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "integration_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backlog_items_status_idx" ON "backlog_items"("status");

-- CreateIndex
CREATE INDEX "backlog_items_priority_idx" ON "backlog_items"("priority");

-- CreateIndex
CREATE INDEX "backlog_items_category_idx" ON "backlog_items"("category");

-- CreateIndex
CREATE INDEX "backlog_items_epic_id_idx" ON "backlog_items"("epic_id");

-- CreateIndex
CREATE INDEX "backlog_items_sprint_id_idx" ON "backlog_items"("sprint_id");

-- CreateIndex
CREATE INDEX "backlog_items_assignee_id_idx" ON "backlog_items"("assignee_id");

-- CreateIndex
CREATE INDEX "backlog_items_ai_agent_id_idx" ON "backlog_items"("ai_agent_id");

-- CreateIndex
CREATE INDEX "backlog_comments_backlog_item_id_idx" ON "backlog_comments"("backlog_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "backlog_dependencies_dependent_item_id_blocking_item_id_key" ON "backlog_dependencies"("dependent_item_id", "blocking_item_id");

-- CreateIndex
CREATE INDEX "backlog_activities_backlog_item_id_idx" ON "backlog_activities"("backlog_item_id");

-- CreateIndex
CREATE INDEX "backlog_attachments_backlog_item_id_idx" ON "backlog_attachments"("backlog_item_id");

-- CreateIndex
CREATE INDEX "ai_agents_type_idx" ON "ai_agents"("type");

-- CreateIndex
CREATE INDEX "ai_agents_status_idx" ON "ai_agents"("status");

-- CreateIndex
CREATE INDEX "ai_agent_runs_agent_id_idx" ON "ai_agent_runs"("agent_id");

-- CreateIndex
CREATE INDEX "ai_agent_runs_status_idx" ON "ai_agent_runs"("status");

-- CreateIndex
CREATE INDEX "ai_agent_runs_started_at_idx" ON "ai_agent_runs"("started_at");

-- CreateIndex
CREATE INDEX "integrations_type_idx" ON "integrations"("type");

-- CreateIndex
CREATE INDEX "integrations_status_idx" ON "integrations"("status");

-- CreateIndex
CREATE INDEX "integration_events_integration_id_idx" ON "integration_events"("integration_id");

-- CreateIndex
CREATE INDEX "integration_events_event_type_idx" ON "integration_events"("event_type");

-- CreateIndex
CREATE INDEX "integration_events_processed_idx" ON "integration_events"("processed");

-- AddForeignKey
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "backlog_epics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_sprint_id_fkey" FOREIGN KEY ("sprint_id") REFERENCES "sprints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_items" ADD CONSTRAINT "backlog_items_ai_agent_id_fkey" FOREIGN KEY ("ai_agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_comments" ADD CONSTRAINT "backlog_comments_backlog_item_id_fkey" FOREIGN KEY ("backlog_item_id") REFERENCES "backlog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_comments" ADD CONSTRAINT "backlog_comments_ai_agent_id_fkey" FOREIGN KEY ("ai_agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_dependencies" ADD CONSTRAINT "backlog_dependencies_dependent_item_id_fkey" FOREIGN KEY ("dependent_item_id") REFERENCES "backlog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_dependencies" ADD CONSTRAINT "backlog_dependencies_blocking_item_id_fkey" FOREIGN KEY ("blocking_item_id") REFERENCES "backlog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_activities" ADD CONSTRAINT "backlog_activities_backlog_item_id_fkey" FOREIGN KEY ("backlog_item_id") REFERENCES "backlog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_activities" ADD CONSTRAINT "backlog_activities_ai_agent_id_fkey" FOREIGN KEY ("ai_agent_id") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backlog_attachments" ADD CONSTRAINT "backlog_attachments_backlog_item_id_fkey" FOREIGN KEY ("backlog_item_id") REFERENCES "backlog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
