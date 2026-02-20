/**
 * AccuDefend - AI-Powered Chargeback Defense Platform
 * AI Agents Service
 * Manages AI agents that automate backlog management, code review, and other tasks
 */

const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const backlogService = require('./backlog');
const { callAI, parseAIResponse } = require('./aiClient');

// =============================================================================
// AI AGENT CONFIGURATIONS
// =============================================================================

const AGENT_CONFIGS = {
  BACKLOG_MANAGER: {
    name: 'Backlog Manager',
    description: 'Creates, prioritizes, and manages backlog items based on system analysis',
    capabilities: [
      'create_backlog_item',
      'update_backlog_item',
      'prioritize_items',
      'suggest_estimates',
      'identify_dependencies',
      'generate_acceptance_criteria'
    ],
    schedule: '0 9 * * 1-5', // 9 AM weekdays
    defaultPrompt: `You are an AI assistant helping manage a software development backlog for AccuDefend, a hotel chargeback defense system. Your role is to:
1. Analyze system logs, errors, and performance metrics to identify issues
2. Create well-structured backlog items with clear descriptions
3. Prioritize items based on business impact and technical urgency
4. Suggest story point estimates based on complexity
5. Identify dependencies between items
6. Generate acceptance criteria for features`
  },

  CODE_REVIEWER: {
    name: 'Code Reviewer',
    description: 'Reviews pull requests and suggests improvements',
    capabilities: [
      'review_pull_request',
      'suggest_improvements',
      'check_security',
      'verify_tests',
      'comment_on_pr'
    ],
    schedule: null, // Event-driven
    defaultPrompt: `You are an AI code reviewer for AccuDefend. Review code changes for:
1. Code quality and best practices
2. Security vulnerabilities
3. Performance issues
4. Test coverage
5. Documentation completeness
Provide constructive feedback with specific suggestions.`
  },

  DOCUMENTATION_AGENT: {
    name: 'Documentation Agent',
    description: 'Generates and updates technical documentation',
    capabilities: [
      'generate_docs',
      'update_readme',
      'create_api_docs',
      'generate_changelog'
    ],
    schedule: '0 0 * * 0', // Weekly on Sunday
    defaultPrompt: `You are an AI documentation specialist for AccuDefend. Your role is to:
1. Keep README files up to date
2. Generate API documentation from code
3. Create changelogs from commits
4. Document architectural decisions
5. Maintain system design documents`
  },

  TEST_GENERATOR: {
    name: 'Test Generator',
    description: 'Creates test cases and improves test coverage',
    capabilities: [
      'generate_unit_tests',
      'generate_integration_tests',
      'identify_untested_code',
      'suggest_edge_cases'
    ],
    schedule: null, // Event-driven
    defaultPrompt: `You are an AI test engineer for AccuDefend. Generate comprehensive test cases that:
1. Cover edge cases and error scenarios
2. Test business logic thoroughly
3. Include integration tests for APIs
4. Verify security controls
5. Test performance under load`
  },

  SECURITY_SCANNER: {
    name: 'Security Scanner',
    description: 'Scans for vulnerabilities and security issues',
    capabilities: [
      'scan_dependencies',
      'check_secrets',
      'analyze_permissions',
      'identify_vulnerabilities',
      'create_security_issues'
    ],
    schedule: '0 2 * * *', // Daily at 2 AM
    defaultPrompt: `You are an AI security analyst for AccuDefend. Scan the codebase for:
1. Vulnerable dependencies
2. Hardcoded secrets or credentials
3. SQL injection risks
4. XSS vulnerabilities
5. Authentication/authorization issues
6. Data exposure risks`
  },

  PERFORMANCE_MONITOR: {
    name: 'Performance Monitor',
    description: 'Monitors and suggests performance optimizations',
    capabilities: [
      'analyze_metrics',
      'identify_bottlenecks',
      'suggest_optimizations',
      'create_performance_issues'
    ],
    schedule: '0 */6 * * *', // Every 6 hours
    defaultPrompt: `You are an AI performance analyst for AccuDefend. Monitor and analyze:
1. API response times
2. Database query performance
3. Memory usage patterns
4. CPU utilization
5. Cache hit rates
Create backlog items for performance improvements.`
  },

  DISPUTE_ANALYZER: {
    name: 'Dispute Analyzer',
    description: 'Analyzes chargeback cases and suggests strategies',
    capabilities: [
      'analyze_dispute',
      'calculate_confidence',
      'suggest_evidence',
      'generate_response'
    ],
    schedule: null, // Event-driven
    defaultPrompt: `You are an AI dispute analyst for AccuDefend. For each chargeback case:
1. Analyze the dispute type and reason code
2. Calculate win probability based on evidence
3. Identify missing evidence
4. Suggest response strategy
5. Generate dispute response documentation`
  },

  EVIDENCE_PROCESSOR: {
    name: 'Evidence Processor',
    description: 'Processes and validates evidence documents',
    capabilities: [
      'ocr_documents',
      'validate_evidence',
      'extract_data',
      'verify_signatures'
    ],
    schedule: null, // Event-driven
    defaultPrompt: `You are an AI evidence processor for AccuDefend. Process uploaded evidence:
1. Extract text using OCR
2. Validate document authenticity
3. Extract key information (dates, amounts, signatures)
4. Flag potential issues
5. Suggest evidence classification`
  }
};

// =============================================================================
// AI AGENT SERVICE
// =============================================================================

class AIAgentService {
  constructor() {
    this.runningAgents = new Map();
  }

  // ---------------------------------------------------------------------------
  // AGENT MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Initialize all agents
   */
  async initializeAgents() {
    for (const [type, config] of Object.entries(AGENT_CONFIGS)) {
      const existing = await prisma.aIAgent.findFirst({
        where: { type }
      });

      if (!existing) {
        await this.createAgent(type, config);
      }
    }

    logger.info('AI Agents initialized');
  }

  /**
   * Create a new agent
   */
  async createAgent(type, customConfig = {}) {
    const baseConfig = AGENT_CONFIGS[type];

    if (!baseConfig) {
      throw new Error(`Unknown agent type: ${type}`);
    }

    const agent = await prisma.aIAgent.create({
      data: {
        name: customConfig.name || baseConfig.name,
        type,
        description: customConfig.description || baseConfig.description,
        status: 'IDLE',
        config: {
          ...baseConfig,
          ...customConfig
        },
        schedule: customConfig.schedule || baseConfig.schedule,
        priority: customConfig.priority || 5,
        capabilities: baseConfig.capabilities,
        modelProvider: customConfig.modelProvider || 'anthropic',
        modelName: customConfig.modelName || 'claude-3-sonnet',
        maxTokens: customConfig.maxTokens || 4096,
        temperature: customConfig.temperature || 0.7
      }
    });

    logger.info(`AI Agent created: ${agent.name} (${agent.type})`);
    return agent;
  }

  /**
   * Get agent by ID
   */
  async getAgent(id) {
    return prisma.aIAgent.findUnique({
      where: { id },
      include: {
        runs: {
          take: 10,
          orderBy: { startedAt: 'desc' }
        },
        _count: {
          select: {
            backlogItems: true,
            comments: true
          }
        }
      }
    });
  }

  /**
   * List all agents
   */
  async listAgents(filters = {}) {
    const where = {};

    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    return prisma.aIAgent.findMany({
      where,
      include: {
        _count: {
          select: {
            backlogItems: true,
            runs: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Update agent configuration
   */
  async updateAgent(id, updates) {
    const agent = await prisma.aIAgent.update({
      where: { id },
      data: updates
    });

    logger.info(`AI Agent updated: ${agent.name}`);
    return agent;
  }

  /**
   * Enable/disable agent
   */
  async setAgentStatus(id, status) {
    return this.updateAgent(id, { status });
  }

  // ---------------------------------------------------------------------------
  // AGENT EXECUTION
  // ---------------------------------------------------------------------------

  /**
   * Run an agent
   */
  async runAgent(agentId, input = {}, trigger = 'manual') {
    const agent = await prisma.aIAgent.findUnique({ where: { id: agentId } });

    if (!agent) {
      throw new Error('Agent not found');
    }

    if (agent.status === 'DISABLED') {
      throw new Error('Agent is disabled');
    }

    if (agent.status === 'RUNNING') {
      throw new Error('Agent is already running');
    }

    // Create run record
    const run = await prisma.aIAgentRun.create({
      data: {
        agentId,
        status: 'running',
        trigger,
        input
      }
    });

    // Update agent status
    await prisma.aIAgent.update({
      where: { id: agentId },
      data: { status: 'RUNNING' }
    });

    // Execute agent in background
    this.executeAgent(agent, run, input).catch(error => {
      logger.error(`Agent execution failed: ${agent.name}`, error);
    });

    return run;
  }

  /**
   * Execute agent logic
   */
  async executeAgent(agent, run, input) {
    const startTime = Date.now();

    try {
      let output;

      switch (agent.type) {
        case 'BACKLOG_MANAGER':
          output = await this.runBacklogManager(agent, input);
          break;
        case 'CODE_REVIEWER':
          output = await this.runCodeReviewer(agent, input);
          break;
        case 'SECURITY_SCANNER':
          output = await this.runSecurityScanner(agent, input);
          break;
        case 'PERFORMANCE_MONITOR':
          output = await this.runPerformanceMonitor(agent, input);
          break;
        case 'DISPUTE_ANALYZER':
          output = await this.runDisputeAnalyzer(agent, input);
          break;
        case 'EVIDENCE_PROCESSOR':
          output = await this.runEvidenceProcessor(agent, input);
          break;
        default:
          output = { message: 'Agent type not implemented' };
      }

      const durationMs = Date.now() - startTime;

      // Update run record
      await prisma.aIAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          output,
          completedAt: new Date(),
          durationMs,
          tokensUsed: output.tokensUsed || 0
        }
      });

      // Update agent stats
      await prisma.aIAgent.update({
        where: { id: agent.id },
        data: {
          status: 'IDLE',
          totalRuns: { increment: 1 },
          successfulRuns: { increment: 1 },
          lastRunAt: new Date(),
          avgDuration: durationMs
        }
      });

      logger.info(`Agent completed: ${agent.name} (${durationMs}ms)`);
      return output;

    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Update run record with error
      await prisma.aIAgentRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          durationMs,
          errorMessage: error.message,
          errorStack: error.stack
        }
      });

      // Update agent stats
      await prisma.aIAgent.update({
        where: { id: agent.id },
        data: {
          status: 'ERROR',
          totalRuns: { increment: 1 },
          failedRuns: { increment: 1 },
          lastRunAt: new Date(),
          lastErrorAt: new Date(),
          lastError: error.message
        }
      });

      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // AGENT IMPLEMENTATIONS
  // ---------------------------------------------------------------------------

  /**
   * Backlog Manager Agent — powered by Ollama/llama3
   */
  async runBacklogManager(agent, input) {
    const items = [];

    // If pre-structured analysis was provided, process it directly
    if (input.analysis) {
      for (const issue of input.analysis.issues || []) {
        const item = await backlogService.createItem({
          title: issue.title,
          description: issue.description,
          category: issue.category || 'ENHANCEMENT',
          priority: issue.priority || 'MEDIUM',
          storyPoints: issue.estimatedPoints,
          aiGenerated: true,
          aiAgentId: agent.id,
          aiConfidence: issue.confidence || 0.8,
          aiReasoning: issue.reasoning,
          labels: issue.labels || ['ai-generated']
        }, null);
        items.push(item);
      }
    }

    // Get existing backlog items for context
    const existingItems = await backlogService.listItems({
      status: ['OPEN', 'IN_PROGRESS']
    });

    // Gather system metrics for AI analysis
    let systemContext = '';
    try {
      const [caseStats, recentErrors] = await Promise.all([
        prisma.chargeback.groupBy({
          by: ['status'],
          _count: true
        }),
        prisma.timelineEvent.findMany({
          where: { type: 'ERROR', createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          take: 10,
          orderBy: { createdAt: 'desc' }
        })
      ]);

      systemContext = `
SYSTEM METRICS (last 7 days):
- Case Distribution: ${caseStats.map(s => `${s.status}: ${s._count}`).join(', ')}
- Recent Errors: ${recentErrors.length} errors found
${recentErrors.slice(0, 3).map(e => `  - ${e.title}: ${e.description?.substring(0, 100)}`).join('\n')}
- Open Backlog Items: ${existingItems.total || 0}`;
    } catch (err) {
      systemContext = 'System metrics unavailable.';
    }

    const contextPrompt = `Analyze the AccuDefend system state and suggest backlog items. Return JSON:

${systemContext}

EXISTING BACKLOG (${existingItems.total || 0} items):
${(existingItems.items || []).slice(0, 5).map(i => `- [${i.priority}] ${i.title} (${i.status})`).join('\n') || 'No items'}

Return JSON:
{
  "suggestedItems": [
    {"title": "<item title>", "description": "<description>", "category": "<BUG|ENHANCEMENT|PERFORMANCE|SECURITY>", "priority": "<CRITICAL|HIGH|MEDIUM|LOW>", "estimatedPoints": <1-8>, "confidence": <0.0-1.0>, "reasoning": "<why this item>"}
  ],
  "priorityChanges": [
    {"itemTitle": "<existing item>", "suggestedPriority": "<new priority>", "reason": "<why change>"}
  ],
  "summary": "<overall assessment>"
}`;

    const systemPrompt = agent.config?.defaultPrompt || AGENT_CONFIGS.BACKLOG_MANAGER.defaultPrompt;
    const result = await callAI({
      systemPrompt,
      userPrompt: contextPrompt,
      maxTokens: 4096,
      temperature: 0.5
    });

    const aiSuggestions = parseAIResponse(result.content, { suggestedItems: [], priorityChanges: [], summary: '' });

    // Create AI-suggested backlog items
    for (const suggestion of (aiSuggestions.suggestedItems || []).slice(0, 5)) {
      try {
        const item = await backlogService.createItem({
          title: suggestion.title,
          description: suggestion.description,
          category: suggestion.category || 'ENHANCEMENT',
          priority: suggestion.priority || 'MEDIUM',
          storyPoints: suggestion.estimatedPoints,
          aiGenerated: true,
          aiAgentId: agent.id,
          aiConfidence: suggestion.confidence || 0.7,
          aiReasoning: suggestion.reasoning,
          labels: ['ai-generated', 'backlog-manager']
        }, null);
        items.push(item);
      } catch (err) {
        logger.warn(`Failed to create backlog item: ${suggestion.title}`, err.message);
      }
    }

    return {
      itemsCreated: items.length,
      itemsAnalyzed: existingItems.total || 0,
      priorityChanges: (aiSuggestions.priorityChanges || []).length,
      items,
      priorityChanges: aiSuggestions.priorityChanges || [],
      summary: aiSuggestions.summary,
      tokensUsed: result.tokensUsed
    };
  }

  /**
   * Code Reviewer Agent
   */
  async runCodeReviewer(agent, input) {
    const { pullRequest } = input;

    if (!pullRequest) {
      return { message: 'No pull request provided' };
    }

    // Analyze code changes
    // This would integrate with GitHub/GitLab API

    const comments = [];
    const suggestions = [];

    // AI analysis would populate these

    return {
      pullRequest: pullRequest.number,
      commentsAdded: comments.length,
      suggestionsAdded: suggestions.length,
      overallScore: 85,
      comments,
      suggestions
    };
  }

  /**
   * Security Scanner Agent — powered by Ollama/llama3
   */
  async runSecurityScanner(agent, input) {
    // Gather security-relevant system information
    let securityContext = '';
    try {
      const fs = require('fs');
      const path = require('path');
      const pkgPath = path.join(__dirname, '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = Object.entries(pkg.dependencies || {}).map(([k, v]) => `${k}@${v}`).join(', ');

      // Check for common security misconfigurations
      const envChecks = {
        jwtSecretIsDefault: process.env.JWT_SECRET?.includes('dev-only') || false,
        debugMode: process.env.LOG_LEVEL === 'debug',
        corsOrigins: process.env.CORS_ORIGINS || 'not set',
        nodeEnv: process.env.NODE_ENV || 'not set'
      };

      securityContext = `
DEPENDENCY LIST: ${deps}

CONFIGURATION CHECKS:
- JWT Secret: ${envChecks.jwtSecretIsDefault ? 'USING DEFAULT DEV KEY (INSECURE!)' : 'Custom key set'}
- Debug Mode: ${envChecks.debugMode ? 'ENABLED (should be disabled in prod)' : 'Disabled'}
- CORS Origins: ${envChecks.corsOrigins}
- NODE_ENV: ${envChecks.nodeEnv}
- Rate Limiting: ${process.env.RATE_LIMIT_MAX_REQUESTS || 'not configured'} req/window`;
    } catch (err) {
      securityContext = 'Could not gather system configuration.';
    }

    const contextPrompt = `Perform a security audit of this Node.js/Express chargeback defense system. Return JSON:

${securityContext}

Return JSON:
{
  "issues": [
    {"title": "<issue>", "severity": "<critical|high|medium|low>", "description": "<details>", "confidence": <0.0-1.0>, "recommendation": "<fix>"}
  ],
  "summary": "<overall security posture>"
}`;

    const systemPrompt = agent.config?.defaultPrompt || AGENT_CONFIGS.SECURITY_SCANNER.defaultPrompt;
    const result = await callAI({
      systemPrompt,
      userPrompt: contextPrompt,
      maxTokens: 4096,
      temperature: 0.2
    });

    const aiResult = parseAIResponse(result.content, { issues: [], summary: '' });
    const issues = aiResult.issues || [];

    // Create backlog items for critical and high issues
    for (const issue of issues.filter(i => ['critical', 'high'].includes(i.severity))) {
      try {
        await backlogService.createItem({
          title: `[Security] ${issue.title}`,
          description: `${issue.description}\n\nRecommendation: ${issue.recommendation || 'Review and fix.'}`,
          category: 'SECURITY',
          priority: issue.severity === 'critical' ? 'CRITICAL' : 'HIGH',
          aiGenerated: true,
          aiAgentId: agent.id,
          aiConfidence: issue.confidence || 0.8,
          labels: ['security', 'ai-generated']
        }, null);
      } catch (err) {
        logger.warn(`Failed to create security item: ${issue.title}`, err.message);
      }
    }

    return {
      issuesFound: issues.length,
      criticalIssues: issues.filter(i => i.severity === 'critical').length,
      highIssues: issues.filter(i => i.severity === 'high').length,
      issues,
      summary: aiResult.summary,
      tokensUsed: result.tokensUsed
    };
  }

  /**
   * Performance Monitor Agent — powered by Ollama/llama3
   */
  async runPerformanceMonitor(agent, input) {
    const metrics = input.metrics || {};
    const issues = [];

    // Basic threshold checks (always run, even without AI)
    if (metrics.avgResponseTime > 500) {
      issues.push({
        title: 'High API Response Time',
        description: `Average response time is ${metrics.avgResponseTime}ms (threshold: 500ms)`,
        priority: 'HIGH'
      });
    }
    if (metrics.errorRate > 0.01) {
      issues.push({
        title: 'Elevated Error Rate',
        description: `Error rate is ${(metrics.errorRate * 100).toFixed(2)}% (threshold: 1%)`,
        priority: 'HIGH'
      });
    }

    // Gather real system metrics
    let systemMetrics = '';
    try {
      const [totalCases, recentCases, pendingCases] = await Promise.all([
        prisma.chargeback.count(),
        prisma.chargeback.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
        prisma.chargeback.count({ where: { status: 'PENDING' } })
      ]);

      const memUsage = process.memoryUsage();
      const uptime = process.uptime();

      systemMetrics = `
SYSTEM METRICS:
- Total Cases in DB: ${totalCases}
- Cases (last 24h): ${recentCases}
- Pending Cases: ${pendingCases}
- Memory RSS: ${(memUsage.rss / 1024 / 1024).toFixed(1)} MB
- Memory Heap: ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)} / ${(memUsage.heapTotal / 1024 / 1024).toFixed(1)} MB
- Uptime: ${(uptime / 3600).toFixed(1)} hours
- Node Version: ${process.version}
${Object.keys(metrics).length > 0 ? `- Custom Metrics: ${JSON.stringify(metrics)}` : ''}`;
    } catch (err) {
      systemMetrics = 'Database metrics unavailable.';
    }

    const contextPrompt = `Analyze the AccuDefend system performance and suggest optimizations. Return JSON:

${systemMetrics}

THRESHOLD VIOLATIONS DETECTED: ${issues.length}
${issues.map(i => `- ${i.title}: ${i.description}`).join('\n')}

Return JSON:
{
  "healthScore": <0-100>,
  "recommendations": ["<optimization suggestions>"],
  "issues": [{"title": "<issue>", "priority": "<HIGH|MEDIUM|LOW>", "description": "<details>"}],
  "summary": "<overall health assessment>"
}`;

    const systemPrompt = agent.config?.defaultPrompt || AGENT_CONFIGS.PERFORMANCE_MONITOR.defaultPrompt;
    const result = await callAI({
      systemPrompt,
      userPrompt: contextPrompt,
      maxTokens: 2048,
      temperature: 0.3
    });

    const aiResult = parseAIResponse(result.content, { healthScore: 80, recommendations: [], issues: [], summary: '' });

    // Merge AI issues with threshold issues
    const allIssues = [...issues, ...(aiResult.issues || [])];

    // Create backlog items for significant issues
    for (const issue of allIssues.filter(i => i.priority === 'HIGH' || i.priority === 'CRITICAL')) {
      try {
        await backlogService.createItem({
          title: `[Performance] ${issue.title}`,
          description: issue.description,
          category: 'PERFORMANCE',
          priority: issue.priority,
          aiGenerated: true,
          aiAgentId: agent.id,
          labels: ['performance', 'ai-generated']
        }, null);
      } catch (err) {
        logger.warn(`Failed to create performance item: ${issue.title}`, err.message);
      }
    }

    return {
      healthScore: aiResult.healthScore,
      metricsAnalyzed: Object.keys(metrics).length,
      issuesFound: allIssues.length,
      issues: allIssues,
      recommendations: aiResult.recommendations || [],
      summary: aiResult.summary,
      tokensUsed: result.tokensUsed
    };
  }

  /**
   * Dispute Analyzer Agent — powered by Ollama/llama3
   */
  async runDisputeAnalyzer(agent, input) {
    const { chargebackId } = input;

    if (!chargebackId) {
      return { message: 'No chargeback ID provided' };
    }

    // Get chargeback details with all related data
    const chargeback = await prisma.chargeback.findUnique({
      where: { id: chargebackId },
      include: {
        evidence: true,
        property: true,
        reservation: true,
        timeline: { take: 5, orderBy: { createdAt: 'desc' } }
      }
    });

    if (!chargeback) {
      return { message: 'Chargeback not found' };
    }

    // Build evidence inventory
    const evidenceTypes = chargeback.evidence.map(e => e.type);
    const allEvidenceTypes = [
      'ID_SCAN', 'AUTH_SIGNATURE', 'FOLIO', 'REGISTRATION_CARD',
      'RECEIPT', 'CCTV', 'CHECK_IN_LOG', 'LOYALTY_DATA',
      'TERMINAL_REPORT', 'COMMUNICATION'
    ];
    const missingEvidence = allEvidenceTypes.filter(t => !evidenceTypes.includes(t));

    // Build context for AI
    const contextPrompt = `Analyze this hotel chargeback case and return a JSON response:

CASE DETAILS:
- Case Number: ${chargeback.caseNumber || 'N/A'}
- Amount: $${chargeback.amount || 0}
- Currency: ${chargeback.currency || 'USD'}
- Reason Code: ${chargeback.reasonCode || 'Unknown'}
- Card Type: ${chargeback.cardType || 'Unknown'}
- Card Last Four: ${chargeback.cardLastFour || 'N/A'}

GUEST INFO:
- Name: ${chargeback.guestName || 'Unknown'}
- Email: ${chargeback.guestEmail || 'N/A'}
- Check-in: ${chargeback.checkInDate || 'N/A'}
- Check-out: ${chargeback.checkOutDate || 'N/A'}
- Confirmation: ${chargeback.confirmationNumber || 'N/A'}

PROPERTY: ${chargeback.property?.name || 'Unknown'}

EVIDENCE ON FILE (${evidenceTypes.length} items): ${evidenceTypes.join(', ') || 'None'}
MISSING EVIDENCE: ${missingEvidence.join(', ') || 'All evidence collected'}

${chargeback.reservation ? `RESERVATION MATCHED: Yes (${chargeback.reservation.confirmationNumber})` : 'RESERVATION: Not linked'}

Return JSON with these fields:
{
  "confidenceScore": <number 0-100>,
  "recommendation": "<AUTO_SUBMIT|REVIEW|GATHER_MORE_EVIDENCE|UNLIKELY_TO_WIN>",
  "missingEvidence": ["<list of critical missing evidence>"],
  "fraudIndicators": {"positiveSignals": ["<list>"], "negativeSignals": ["<list>"]},
  "strategy": "<recommended defense strategy>",
  "reasoning": "<detailed reasoning for the confidence score>"
}`;

    const systemPrompt = agent.config?.defaultPrompt || AGENT_CONFIGS.DISPUTE_ANALYZER.defaultPrompt;
    const result = await callAI({
      systemPrompt,
      userPrompt: contextPrompt,
      maxTokens: agent.maxTokens || 4096,
      temperature: Number(agent.temperature) || 0.3
    });

    // Parse AI response
    const analysis = parseAIResponse(result.content, {
      confidenceScore: 70,
      recommendation: 'REVIEW',
      missingEvidence,
      fraudIndicators: { positiveSignals: [], negativeSignals: [] },
      strategy: 'Manual review recommended.',
      reasoning: 'AI analysis completed with fallback parsing.'
    });

    // Ensure confidence score is valid
    analysis.confidenceScore = Math.max(0, Math.min(100, Number(analysis.confidenceScore) || 70));

    // Determine AI recommendation based on confidence
    if (!analysis.recommendation) {
      if (analysis.confidenceScore >= 85) analysis.recommendation = 'AUTO_SUBMIT';
      else if (analysis.confidenceScore >= 70) analysis.recommendation = 'REVIEW';
      else if (analysis.confidenceScore >= 50) analysis.recommendation = 'GATHER_MORE_EVIDENCE';
      else analysis.recommendation = 'UNLIKELY_TO_WIN';
    }

    // Update chargeback with AI analysis
    await prisma.chargeback.update({
      where: { id: chargebackId },
      data: {
        confidenceScore: analysis.confidenceScore,
        aiAnalysis: analysis,
        aiRecommendation: analysis.recommendation,
        fraudIndicators: analysis.fraudIndicators
      }
    });

    // Create timeline event
    await prisma.timelineEvent.create({
      data: {
        chargebackId,
        type: 'AI_ANALYSIS',
        title: 'AI Dispute Analysis Complete',
        description: `Confidence: ${analysis.confidenceScore}% | Recommendation: ${analysis.recommendation} | Provider: ${result.provider}/${result.model}`,
        metadata: {
          confidenceScore: analysis.confidenceScore,
          recommendation: analysis.recommendation,
          tokensUsed: result.tokensUsed,
          provider: result.provider,
          model: result.model,
          durationMs: result.durationMs
        }
      }
    });

    logger.info(`Dispute analysis complete: ${chargeback.caseNumber} → ${analysis.confidenceScore}% (${analysis.recommendation})`);

    return {
      chargebackId,
      analysis,
      tokensUsed: result.tokensUsed
    };
  }

  /**
   * Evidence Processor Agent — powered by Ollama/llama3
   */
  async runEvidenceProcessor(agent, input) {
    const { evidenceId } = input;

    if (!evidenceId) {
      return { message: 'No evidence ID provided' };
    }

    // Get evidence details with chargeback context
    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: {
        chargeback: {
          select: { caseNumber: true, guestName: true, amount: true, reasonCode: true }
        }
      }
    });

    if (!evidence) {
      return { message: 'Evidence not found' };
    }

    const contextPrompt = `Analyze this evidence document for a hotel chargeback case and return JSON:

EVIDENCE DETAILS:
- Type: ${evidence.type}
- File: ${evidence.fileName || 'N/A'}
- MIME: ${evidence.mimeType || 'N/A'}
- Size: ${evidence.fileSize ? (evidence.fileSize / 1024).toFixed(1) + ' KB' : 'N/A'}
- Uploaded: ${evidence.createdAt}
${evidence.extractedText ? `- Existing OCR Text: ${evidence.extractedText.substring(0, 500)}` : '- No OCR text available yet'}

CASE CONTEXT:
- Case: ${evidence.chargeback?.caseNumber || 'N/A'}
- Guest: ${evidence.chargeback?.guestName || 'Unknown'}
- Amount: $${evidence.chargeback?.amount || 0}
- Reason Code: ${evidence.chargeback?.reasonCode || 'Unknown'}

Return JSON:
{
  "validationResult": "<valid|invalid|needs_review>",
  "confidence": <0.0-1.0>,
  "evidenceStrength": "<strong|moderate|weak>",
  "relevanceToCase": "<high|medium|low>",
  "suggestedCategory": "<best evidence category>",
  "issues": ["<any problems found>"],
  "summary": "<brief assessment>"
}`;

    const systemPrompt = agent.config?.defaultPrompt || AGENT_CONFIGS.EVIDENCE_PROCESSOR.defaultPrompt;
    const result = await callAI({
      systemPrompt,
      userPrompt: contextPrompt,
      maxTokens: 2048,
      temperature: 0.2
    });

    const processing = parseAIResponse(result.content, {
      validationResult: 'needs_review',
      confidence: 0.5,
      evidenceStrength: 'moderate',
      relevanceToCase: 'medium',
      issues: [],
      summary: 'AI processing completed with fallback.'
    });

    // Update evidence with AI assessment
    await prisma.evidence.update({
      where: { id: evidenceId },
      data: {
        verified: processing.validationResult === 'valid',
        verifiedAt: processing.validationResult === 'valid' ? new Date() : null
      }
    });

    logger.info(`Evidence processed: ${evidence.type} for ${evidence.chargeback?.caseNumber || evidenceId} → ${processing.validationResult}`);

    return {
      evidenceId,
      processing,
      tokensUsed: result.tokensUsed
    };
  }

  // ---------------------------------------------------------------------------
  // RUN HISTORY
  // ---------------------------------------------------------------------------

  /**
   * Get agent runs
   */
  async getAgentRuns(agentId, filters = {}) {
    const where = { agentId };

    if (filters.status) {
      where.status = filters.status;
    }

    return prisma.aIAgentRun.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: filters.limit || 50
    });
  }

  /**
   * Get run details
   */
  async getRunDetails(runId) {
    return prisma.aIAgentRun.findUnique({
      where: { id: runId },
      include: {
        agent: true
      }
    });
  }

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  /**
   * Get agent statistics
   */
  async getStatistics() {
    const agents = await prisma.aIAgent.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        totalRuns: true,
        successfulRuns: true,
        failedRuns: true,
        avgDuration: true,
        lastRunAt: true,
        _count: {
          select: {
            backlogItems: true
          }
        }
      }
    });

    const totalRuns = agents.reduce((sum, a) => sum + a.totalRuns, 0);
    const successfulRuns = agents.reduce((sum, a) => sum + a.successfulRuns, 0);
    const itemsCreated = agents.reduce((sum, a) => sum + a._count.backlogItems, 0);

    return {
      agents: agents.length,
      totalRuns,
      successfulRuns,
      failedRuns: totalRuns - successfulRuns,
      successRate: totalRuns > 0 ? ((successfulRuns / totalRuns) * 100).toFixed(1) : 0,
      itemsCreated,
      agentDetails: agents
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  AIAgentService: new AIAgentService(),
  AGENT_CONFIGS
};
