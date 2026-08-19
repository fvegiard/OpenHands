"""Corpus of all Mavis knowledge — skills, env, plugins, agent memory.

Each entry is a dict with `id`, `text`, `payload` (metadata for filtering).
The embedder consumes `text` and produces a 384-dim vector.
"""

# All skills available in this session (from the system prompt's available_skills)
SKILLS = [
    # Code & Engineering
    {"id": "skill:code-savant", "text": "Autonomous coding agent that plans, implements, reviews, delivers. Keywords: code, build, implement, create, develop, fix, refactor, architect, debug, optimize, script, automate.", "payload": {"name": "code-savant", "category": "code", "type": "skill"}},
    {"id": "skill:senior-software-engineer", "text": "Engineering principles for building software like a senior engineer. Architecture guidance, code quality standards, development best practices, technical decision-making frameworks.", "payload": {"name": "senior-software-engineer", "category": "code", "type": "skill"}},
    {"id": "skill:minimax-coder-agents", "text": "Multi-agent parallel coding. Spawns frontend-dev, backend-dev, code-reviewer, debugger, documenter, tester in parallel. Triggers: build me an app, full-stack project, parallel coding, multi-agent development.", "payload": {"name": "minimax-coder-agents", "category": "code", "type": "skill"}},
    {"id": "skill:ai-agents-architect", "text": "Expert in designing and building autonomous AI agents. Agent architecture, tool integration, memory systems, planning strategies, multi-agent orchestration.", "payload": {"name": "ai-agents-architect", "category": "code", "type": "skill"}},
    {"id": "skill:mini-coder-max", "text": "Autonomous coding agent that systematically plans, implements, reviews, and delivers high-quality code. Trigger keywords: code, build, implement, create, develop, fix, refactor, architect.", "payload": {"name": "mini-coder-max", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:brainstorming", "text": "MUST use before any creative work. Explores user intent, requirements and design before implementation. Hard-gate: no implementation until design approved.", "payload": {"name": "superpowers:brainstorming", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:writing-plans", "text": "Spec or requirements for a multi-step task, before touching code. Writes a full plan with checkpoints.", "payload": {"name": "superpowers:writing-plans", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:executing-plans", "text": "Run an implementation plan in a separate session with review checkpoints.", "payload": {"name": "superpowers:executing-plans", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:test-driven-development", "text": "TDD before any feature or bugfix, before writing implementation code. Red-green-refactor.", "payload": {"name": "superpowers:test-driven-development", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:systematic-debugging", "text": "Encountering any bug, test failure, or unexpected behavior, before proposing fixes.", "payload": {"name": "superpowers:systematic-debugging", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:verification-before-completion", "text": "About to claim work is complete, fixed, or passing, before committing or creating PRs. Evidence before assertions.", "payload": {"name": "superpowers:verification-before-completion", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:dispatching-parallel-agents", "text": "Facing 2+ independent tasks that can be worked on without shared state or sequential dependencies.", "payload": {"name": "superpowers:dispatching-parallel-agents", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:subagent-driven-development", "text": "Executing implementation plans with independent tasks in the current session.", "payload": {"name": "superpowers:subagent-driven-development", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:using-git-worktrees", "text": "Starting feature work that needs isolation from current workspace or before executing implementation plans.", "payload": {"name": "superpowers:using-git-worktrees", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:finishing-a-development-branch", "text": "Implementation is complete, all tests pass, need to decide how to integrate the work.", "payload": {"name": "superpowers:finishing-a-development-branch", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:requesting-code-review", "text": "Completing tasks, implementing major features, or before merging to verify work meets requirements.", "payload": {"name": "superpowers:requesting-code-review", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:receiving-code-review", "text": "Receiving code review feedback, before implementing suggestions. Technical rigor, not performative agreement.", "payload": {"name": "superpowers:receiving-code-review", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:writing-skills", "text": "Creating new skills, editing existing skills, or verifying skills work before deployment.", "payload": {"name": "superpowers:writing-skills", "category": "code", "type": "skill"}},
    {"id": "skill:superpowers:using-superpowers", "text": "Establishes how to find and use skills. Required skill invocation before ANY response including clarifying questions.", "payload": {"name": "superpowers:using-superpowers", "category": "code", "type": "skill"}},
    {"id": "skill:worktree-management", "text": "Git worktree workflow for isolated development. Load BEFORE any git code change.", "payload": {"name": "worktree-management", "category": "code", "type": "skill"}},
    {"id": "skill:setup-dev-environment", "text": "Scaffold a Cursor cloud-agent development environment. Writes Dockerfile, AGENTS.md, .cursor/environment.json, .env.example.", "payload": {"name": "setup-dev-environment", "category": "code", "type": "skill"}},
    {"id": "skill:claude-code-command-creator", "text": "Create Claude Code slash commands and custom command extensions.", "payload": {"name": "claude-code-command-creator", "category": "code", "type": "skill"}},
    {"id": "skill:skill-builder", "text": "Create comprehensive skill files for AI agents following established conventions.", "payload": {"name": "skill-builder", "category": "code", "type": "skill"}},
    {"id": "skill:skill-creator", "text": "Create a new Mavis skill. Repeated workflow into a skill, or build a new reusable procedure.", "payload": {"name": "skill-creator", "category": "code", "type": "skill"}},
    {"id": "skill:app-builder", "text": "Full-stack application builder. Web apps, APIs, mobile apps from natural language requests.", "payload": {"name": "app-builder", "category": "code", "type": "skill"}},
    {"id": "skill:fullstack-dev", "text": "Full-stack backend architecture and frontend-backend integration. REST API + React/Next.js/Node/Python/Go. Design service layers, error handling, auth flows, file uploads, real-time features.", "payload": {"name": "fullstack-dev", "category": "code", "type": "skill"}},
    {"id": "skill:workflow-automation-designer", "text": "Creates efficient, maintainable, scalable automation workflows. Design workflows, automate processes, build automation pipelines.", "payload": {"name": "workflow-automation-designer", "category": "code", "type": "skill"}},
    {"id": "skill:workflow-patterns", "text": "Conductor TDD workflow, phase checkpoints, git commits for tasks, verification protocol.", "payload": {"name": "workflow-patterns", "category": "code", "type": "skill"}},
    {"id": "skill:powerpoint-pptx", "text": "Create, inspect, edit Microsoft PowerPoint presentations and PPTX decks. Layouts, templates, placeholders, notes, charts, visual QA.", "payload": {"name": "powerpoint-pptx", "category": "code", "type": "skill"}},
    {"id": "skill:ppt:pptx", "text": "Read, create, edit PowerPoint PPTX. Parsing, summarizing, theme/layout inspection, PptxGenJS creation, XML editing.", "payload": {"name": "ppt:pptx", "category": "code", "type": "skill"}},
    {"id": "skill:pptx", "text": "Read, create, edit PowerPoint PPTX/PPT. Parsing, theme/layout inspection, PptxGenJS, XML workflows.", "payload": {"name": "pptx", "category": "code", "type": "skill"}},
    {"id": "skill:pptx-generator", "text": "Generate, edit, read PowerPoint presentations. Cover, TOC, content, section divider, summary slides. PptxGenJS. markitdown extraction.", "payload": {"name": "pptx-generator", "category": "code", "type": "skill"}},
    {"id": "skill:presentation-slides-creator", "text": "Create stunning PowerPoint presentations with slides, charts, animations.", "payload": {"name": "presentation-slides-creator", "category": "code", "type": "skill"}},
    {"id": "skill:html-presentation-generator", "text": "Generate professional multi-page HTML presentations exportable to PDF/PPTX. Cover, TOC, section dividers, content, summary. Triggers: PPT, presentation, slides, 演示文稿, 幻灯片, HTML PPT, slide deck.", "payload": {"name": "html-presentation-generator", "category": "code", "type": "skill"}},
    {"id": "skill:visual-page", "text": "Create self-contained visual HTML page with diagrams, charts, tables, timelines, interactive layouts when plain text cannot convey info.", "payload": {"name": "visual-page", "category": "code", "type": "skill"}},
    {"id": "skill:visual-content-generator", "text": "Professional visual content generation. Presentations (PDF+PPTX), infographics, charts, dashboards, timelines, flowcharts, mind maps.", "payload": {"name": "visual-content-generator", "category": "code", "type": "skill"}},

    # Frontend / UI / Design
    {"id": "skill:frontend-design", "text": "Create distinctive, production-grade frontend interfaces with high design quality. Web components, pages, artifacts, posters, applications.", "payload": {"name": "frontend-design", "category": "design", "type": "skill"}},
    {"id": "skill:superdesign:superdesign", "text": "Design/redesign frontend UI on the Superdesign canvas. Pages, features, flows, new products. Visual variants, design systems, static posters, flyers, cover art.", "payload": {"name": "superdesign:superdesign", "category": "design", "type": "skill"}},
    {"id": "skill:3d-web-dev-specialist", "text": "Expert 3D WebGL developer. Three.js projects, scroll-driven 3D animations, immersive WebGL effects, Three.js tutorials, award-worthy 3D portfolios. GSAP ScrollTrigger, shader programming.", "payload": {"name": "3d-web-dev-specialist", "category": "design", "type": "skill"}},
    {"id": "skill:ui-ux-pro-max", "text": "UI/UX design intelligence for web and mobile. 50+ design styles, 97 color palettes, 57 font pairings, 99 UX guidelines, 25 chart types across 9 tech stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui).", "payload": {"name": "ui-ux-pro-max", "category": "design", "type": "skill"}},
    {"id": "skill:web-design-reviewer", "text": "Review/fix website design issues. Visual + source code review. UI/UX issues, responsive layouts, accessibility, visual consistency, design bugs across desktop/mobile/tablet.", "payload": {"name": "web-design-reviewer", "category": "design", "type": "skill"}},
    {"id": "skill:interactive-visualization-architect", "text": "Turn any concept into stunning interactive web animations. Science principles, mechanical structures, math concepts, abstract ideas. Triggers: 演示, 可视化, 动画, visualize, animate, demonstrate.", "payload": {"name": "interactive-visualization-architect", "category": "design", "type": "skill"}},
    {"id": "skill:minimax-graphic-designer", "text": "Performance Ad Image Generator for Instagram 3:4 Lead Gen. Instagram ads, Facebook ads, high-converting ad visuals, conversion-focused graphics, lead generation ads.", "payload": {"name": "minimax-graphic-designer", "category": "design", "type": "skill"}},

    # Document / Office
    {"id": "skill:minimax-docx", "text": "Professional DOCX creation, editing, formatting using OpenXML SDK. Create, fill, template-apply. Reports, proposals, contracts, forms.", "payload": {"name": "minimax-docx", "category": "office", "type": "skill"}},
    {"id": "skill:docx", "text": "Unified DOCX skill. Create, template-apply, edit/fill, read, repair, compare Word documents. Formal Word deliverables, DOCX diagnosis.", "payload": {"name": "docx", "category": "office", "type": "skill"}},
    {"id": "skill:minimax-pdf", "text": "PDF when visual quality and design identity matter. CREATE/FILL/REFORMAT. Token-based design system: color, typography, spacing. Print-ready.", "payload": {"name": "minimax-pdf", "category": "office", "type": "skill"}},
    {"id": "skill:pdf", "text": "Unified PDF. Generate, reformat, fill, read. Text-to-PDF reports, Markdown→PDF, PDF form filling, OCR-assisted extraction, page operations.", "payload": {"name": "pdf", "category": "office", "type": "skill"}},
    {"id": "skill:pdf:pdf", "text": "Unified PDF. Generate, reformat, fill, read. LaTeX thesis, Markdown→PDF, PDF form filling, OCR, page operations, layout-preserving translation.", "payload": {"name": "pdf:pdf", "category": "office", "type": "skill"}},
    {"id": "skill:minimax-xlsx", "text": "Open/create/read/analyze/edit/validate Excel. Spreadsheets, financial models, pivot tables. pandas + openpyxl, formula recalc, financial formatting.", "payload": {"name": "minimax-xlsx", "category": "office", "type": "skill"}},
    {"id": "skill:excel:xlsx", "text": "Spreadsheet. Read, edit, create, convert .xlsx/.xlsm/.csv/.tsv. Editing columns, formulas, formatting, charting, cleaning, creating spreadsheets.", "payload": {"name": "excel:xlsx", "category": "office", "type": "skill"}},
    {"id": "skill:xlsx", "text": "Spreadsheet. Read, edit, create, convert .xlsx/.xlsm/.csv/.tsv. Editing columns, formulas, formatting, charting, cleaning.", "payload": {"name": "xlsx", "category": "office", "type": "skill"}},

    # Research / Knowledge
    {"id": "skill:deep-research", "text": "Complex open-ended Deep Research with external verification. Market/industry analysis, technical research, competitor, trend, policy, fact verification. 5 consecutive step prompts: factual background, question understanding, deep analysis, search/verify, final answer.", "payload": {"name": "deep-research", "category": "research", "type": "skill"}},
    {"id": "skill:deep-research-10x", "text": "10x deeper research with multi-layer verification, intelligence scoring, iterative refinement, expert-level analysis. Thorough, deep dive, systematic investigation, due diligence.", "payload": {"name": "deep-research-10x", "category": "research", "type": "skill"}},
    {"id": "skill:deep-research-agent", "text": "Comprehensive research agent. Deep research, comprehensive analysis, market research, academic surveys, competitive analysis, technology trends. Triggers: 調査して, research, 分析して, レポートを作成.", "payload": {"name": "deep-research-agent", "category": "research", "type": "skill"}},
    {"id": "skill:market-research", "text": "Market research with sizing, segmentation, competitor mapping, pricing checks, demand validation. TAM, SAM, SOM, whitespace, category sizing. Decision-ready evidence.", "payload": {"name": "market-research", "category": "research", "type": "skill"}},
    {"id": "skill:ai-research-assistant", "text": "Rigorous scholarly analysis framework for academic papers. AI/ML/DL/CV/NLP. Methodology, comparison, contributions, research directions.", "payload": {"name": "ai-research-assistant", "category": "research", "type": "skill"}},
    {"id": "skill:knowledge-digest", "text": "Textbooks or PDFs to multimodal interactive learning. Handwritten notes, quiz webpages, slides, audio courses, mind maps. Triggers: learning materials, convert textbook, study notes, quiz generation.", "payload": {"name": "knowledge-digest", "category": "research", "type": "skill"}},
    {"id": "skill:notion:notion-knowledge-capture", "text": "Capture conversations and decisions into structured Notion pages. Wiki entries, how-tos, decisions, FAQs with proper linking.", "payload": {"name": "notion:notion-knowledge-capture", "category": "research", "type": "skill"}},
    {"id": "skill:notion:notion-meeting-intelligence", "text": "Prepare meeting materials with Notion context and MiniMax Code research. Agendas/pre-reads tailored to attendees.", "payload": {"name": "notion:notion-meeting-intelligence", "category": "research", "type": "skill"}},
    {"id": "skill:notion:notion-research-documentation", "text": "Research across Notion and synthesize into structured documentation. Briefs, comparisons, reports with citations.", "payload": {"name": "notion:notion-research-documentation", "category": "research", "type": "skill"}},
    {"id": "skill:notion:notion-spec-to-implementation", "text": "Turn Notion specs into implementation plans, tasks, progress tracking. PRDs/feature specs to Notion plans + tasks.", "payload": {"name": "notion:notion-spec-to-implementation", "category": "research", "type": "skill"}},
    {"id": "skill:jarvis-rag", "text": "Query user's Supabase knowledge base (66 vectors) using semantic search + Claude answer. Architecture, Tailscale, Kimi, Codex, crons, codex errors, alerts.", "payload": {"name": "jarvis-rag", "category": "research", "type": "skill"}},
    {"id": "skill:jarvis-rag-debug", "text": "Diagnose why mavis-rag returns bad/empty results. Auto-invocable when RAG is broken.", "payload": {"name": "jarvis-rag-debug", "category": "research", "type": "skill"}},

    # Browser / Web Automation
    {"id": "skill:browser-automation-testing", "text": "Automate web browser interactions and end-to-end testing with Playwright. Test websites, automate form submissions, run browser tests, UI automation.", "payload": {"name": "browser-automation-testing", "category": "browser", "type": "skill"}},
    {"id": "skill:web-automation-agent", "text": "Web automation and data extraction with TinyFish web agents and AgentQL. Scrape websites, extract structured data, automate web interactions, compare prices, monitor competitors.", "payload": {"name": "web-automation-agent", "category": "browser", "type": "skill"}},
    {"id": "skill:web-scraper", "text": "Scrape, crawl, extract data from websites. Extract content, crawl websites, collect data from the internet.", "payload": {"name": "web-scraper", "category": "browser", "type": "skill"}},

    # Productivity / Comms
    {"id": "skill:lark-tools", "text": "Feishu/Lark full-capability access via lark-cli. Anything related to Feishu or Lark.", "payload": {"name": "lark-tools", "category": "comms", "type": "skill"}},
    {"id": "skill:gog", "text": "Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, Docs.", "payload": {"name": "gog", "category": "comms", "type": "skill"}},
    {"id": "skill:slack", "text": "Control Slack from Clawdbot via the slack tool. React, pin/unpin in Slack channels or DMs.", "payload": {"name": "slack", "category": "comms", "type": "skill"}},
    {"id": "skill:n8n", "text": "Manage n8n workflows and automations via API. List, activate/deactivate, check execution status, manually trigger, debug.", "payload": {"name": "n8n", "category": "comms", "type": "skill"}},

    # Infra / API / Database
    {"id": "skill:api-gateway", "text": "Connect to 100+ APIs (Google Workspace, Microsoft 365, GitHub, Notion, Slack, Airtable, HubSpot) with managed OAuth. Maton.ai. Each service requires explicit OAuth.", "payload": {"name": "api-gateway", "category": "infra", "type": "skill"}},
    {"id": "skill:github", "text": "Interact with GitHub using the gh CLI. gh issue, gh pr, gh run, gh api for issues, PRs, CI runs, advanced queries.", "payload": {"name": "github", "category": "infra", "type": "skill"}},
    {"id": "skill:github-integration", "text": "GitHub Integration. Repository management, Pull Requests, Issues, code review operations. Create repositories, review PRs, manage issues, perform code reviews.", "payload": {"name": "github-integration", "category": "infra", "type": "skill"}},
    {"id": "skill:supabase-backend", "text": "Build backend services with Supabase. PostgreSQL, authentication, realtime subscriptions, storage. Set up Supabase, create database tables, build auth systems.", "payload": {"name": "supabase-backend", "category": "infra", "type": "skill"}},
    {"id": "skill:supabase-audit", "text": "Audit Supabase project for common anti-patterns. Missing RLS, anon-key in client, no indexes on FK columns, secrets in client bundles, oversized payloads. Outputs fix-it list with SQL.", "payload": {"name": "supabase-audit", "category": "infra", "type": "skill"}},
    {"id": "skill:supabase-reconfigure", "text": "Reconfigure Supabase project across multi-repo codebases. Detect URLs, identify hardcoded fallbacks, generate idempotent SQL, patch bridge code, set up cron self-trigger.", "payload": {"name": "supabase-reconfigure", "category": "infra", "type": "skill"}},
    {"id": "skill:clickhouse-best-practices", "text": "MUST USE when reviewing ClickHouse schemas, queries, configurations. 28 rules. CREATE TABLE, ALTER TABLE, ORDER BY, slow query, JOIN optimization, ReplacingMergeTree.", "payload": {"name": "clickhouse-best-practices", "category": "infra", "type": "skill"}},

    # AI / ML / Agent
    {"id": "skill:minimax-ai-agent-builder", "text": "Comprehensive guide to building your first AI agent using MiniMax. How to create AI agents, build autonomous assistants, develop LLM-powered applications.", "payload": {"name": "minimax-ai-agent-builder", "category": "ai", "type": "skill"}},
    {"id": "skill:ai-social-media-content", "text": "Generate images, videos, captions, thumbnails for TikTok, Instagram, YouTube, Twitter/X.", "payload": {"name": "ai-social-media-content", "category": "ai", "type": "skill"}},
    {"id": "skill:ai-video-creator", "text": "Generate stunning AI videos from text prompts or images with motion and animation.", "payload": {"name": "ai-video-creator", "category": "ai", "type": "skill"}},
    {"id": "skill:agentic-eval", "text": "Patterns for iterative evaluation and refinement of agent outputs. Self-critique loops, evaluator-optimizer pipelines, test-driven refinement workflows, rubric-based evaluation.", "payload": {"name": "agentic-eval", "category": "ai", "type": "skill"}},
    {"id": "skill:advanced-prompting-frameworks", "text": "Expert-level prompting frameworks. Multi-stage prompting pipelines, agentic workflows, self-correcting systems, meta-prompting architectures. CoT, ToT, ReAct, Reflexion.", "payload": {"name": "advanced-prompting-frameworks", "category": "ai", "type": "skill"}},
    {"id": "skill:insane-promax-cybertoolsmith", "text": "Ultra-advanced AI cybersecurity tool generator. CLI/GUI hacking, penetration testing, bug bounty, red team, blue team tools. Insane level red team C2 framework, GUI wireless hacking toolkit.", "payload": {"name": "insane-promax-cybertoolsmith", "category": "ai", "type": "skill"}},
    {"id": "skill:self-improving-agent", "text": "Captures learnings, errors, corrections. Commands fail, user corrects, missing features, APIs fail, knowledge outdated, better approaches discovered.", "payload": {"name": "self-improving-agent", "category": "ai", "type": "skill"}},

    # Business / Strategy
    {"id": "skill:ceo-assistant", "text": "Master AI assistant for CEOs and executives. End-to-end planning, executing, completing tasks. Strategic planning, decision-making, task decomposition. Trigger: plan, execute, review, strategy, project, milestone, goal, decision, prioritize, roadmap.", "payload": {"name": "ceo-assistant", "category": "business", "type": "skill"}},
    {"id": "skill:sales-power-map", "text": "B2B sales intelligence. Parse vague sales intent, discover target companies, mine org structures, build decision-maker Power Maps with contact info. Trigger: sell, find customers, power map, decision makers.", "payload": {"name": "sales-power-map", "category": "business", "type": "skill"}},
    {"id": "skill:seo-geo-optimization-expert", "text": "SEO and GEO (Generative Engine Optimization). EEAT score, CORE-EEAT audit, domain authority, CITE audit. Optimize for AI, get cited by ChatGPT, keyword research, on-page SEO.", "payload": {"name": "seo-geo-optimization-expert", "category": "business", "type": "skill"}},
    {"id": "skill:gstack-openclaw-ceo-review", "text": "Strategic challenge with 10-section review and 4 scope modes. Plan, challenge proposal, run CEO review, poke holes, think bigger, expand/reduce plan.", "payload": {"name": "gstack-openclaw-ceo-review", "category": "business", "type": "skill"}},
    {"id": "skill:gstack-openclaw-office-hours", "text": "YC Office Hours. Product interrogation with 6 forcing questions. Brainstorm, evaluate whether idea worth building, run office hours, think through new product idea.", "payload": {"name": "gstack-openclaw-office-hours", "category": "business", "type": "skill"}},
    {"id": "skill:gstack-openclaw-investigate", "text": "Root cause debugging methodology. 4-phase process: investigate, analyze, test, verify. Debug, fix bug, investigate error, do root cause analysis. Errors, stack traces, unexpected behavior, something stopped working.", "payload": {"name": "gstack-openclaw-investigate", "category": "business", "type": "skill"}},
    {"id": "skill:gstack-openclaw-retro", "text": "Weekly engineering retrospective. Commit history, work patterns, code quality metrics, persistent history, trend tracking. Per-person contributions, praise, growth areas.", "payload": {"name": "gstack-openclaw-retro", "category": "business", "type": "skill"}},
    {"id": "skill:autoselect-skill", "text": "Auto-select which skills to load for the current user turn. User message implies a domain (UI/UX, code review, deep research, plan-mode, debugging, doc work, sales/outreach) but skills not yet loaded. Outputs ranked skill recommendations with one-line reasons and opt-in /autoselect slash trigger.", "payload": {"name": "autoselect-skill", "category": "business", "type": "skill"}},

    # Plugin-building
    {"id": "skill:openclaw-assistant", "text": "Especialista en instalación, configuración y uso de openclaw (clawd.bot). VPS install, messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, Matrix), Gateway management, auth troubleshooting.", "payload": {"name": "openclaw-assistant", "category": "plugin", "type": "skill"}},
    {"id": "skill:opencli-universal-cli-hub", "text": "Ultimate CLI Powerhouse for AI Agents. Transform any website into a command. 87+ built-in adapters for Twitter, Bilibili, Reddit, Amazon, xiaohongshu, zhihu. Browser automation, desktop app control.", "payload": {"name": "opencli-universal-cli-hub", "category": "plugin", "type": "skill"}},
]

# 7 official Mavis plugins
PLUGINS = [
    {"id": "plugin:superdesign", "text": "Superdesign v0.4.4. Analyze existing interfaces, establish design systems, generate/iterate UI and marketing graphics on Superdesign canvas. Requires Superdesign sign-in. Category: Design & Sites.", "payload": {"name": "superdesign", "version": "0.4.4", "category": "Design & Sites", "type": "plugin"}},
    {"id": "plugin:everme", "text": "EverMe v1.0.3. Long-term personal memory. Read, retrieve, save long-term memory across sessions. Triggers: long-term preferences, OAuth token rotation discussion, save work preferences.", "payload": {"name": "everme", "version": "1.0.3", "category": "Productivity", "type": "plugin"}},
    {"id": "plugin:excel", "text": "Excel v1.0.3. Create, edit, analyze, convert Excel workbooks and delimited spreadsheet files. Live formulas, professional formatting, charts, data cleaning, formula recalculation. xlsx SKILL.", "payload": {"name": "excel", "version": "1.0.3", "category": "Office", "type": "plugin"}},
    {"id": "plugin:superpowers", "text": "Superpowers v6.2.4. Software development methodology for coding agents. Brainstorming, planning, TDD, debugging, code review, delivery workflows. 14 skills: brainstorming, dispatching-parallel-agents, executing-plans, finishing-a-development-branch, receiving-code-review, requesting-code-review, subagent-driven-development, systematic-debugging, test-driven-development, using-git-worktrees, using-superpowers, verification-before-completion, writing-plans, writing-skills.", "payload": {"name": "superpowers", "version": "6.2.4", "category": "Code", "type": "plugin"}},
    {"id": "plugin:ppt", "text": "PPT v1.0.3. Read, analyze, create, edit PowerPoint PPTX. Slide and speaker-note extraction, theme and layout audits, template-preserving updates, editable-element mapping, pre-delivery quality checks.", "payload": {"name": "ppt", "version": "1.0.3", "category": "Office", "type": "plugin"}},
    {"id": "plugin:pdf", "text": "PDF v1.0.3. Create, read, reformat, fill, transform, validate PDF. Professional reports, Markdown/LaTeX rendering, form filling, OCR-assisted extraction, page operations, layout-preserving translation, delivery quality checks.", "payload": {"name": "pdf", "version": "1.0.3", "category": "Office", "type": "plugin"}},
    {"id": "plugin:notion", "text": "Notion v1.0.3. Connect Notion workspace. Capture knowledge, prepare meetings, research across documents, turn product specifications into implementation plans. 4 skills: knowledge-capture, meeting-intelligence, research-documentation, spec-to-implementation.", "payload": {"name": "notion", "version": "1.0.3", "category": "Productivity", "type": "plugin"}},
]

# 26 Mavis skills just shipped in openagent
MAVIS_SKILLS = [
    {"id": "mavis-skill:add_agent", "text": "openagent skill. Add a new microagent in .openhands/microagents. YAML frontmatter with metadata. Triggers: new agent, new microagent, create agent, create an agent, create microagent, create a microagent, add agent, add an agent, add microagent, add a microagent, microagent template.", "payload": {"name": "add_agent", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:add_repo_inst", "text": "openagent skill. Add repository-level instructions in .openhands/microagents. Triggers: add repository instructions, repo-level guidance.", "payload": {"name": "add_repo_inst", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:address_pr_comments", "text": "openagent skill. Address PR review comments efficiently. Triggers: address PR comments, respond to review.", "payload": {"name": "address_pr_comments", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:agent_memory", "text": "openagent skill. Agent memory management. Persistent context, recall, store.", "payload": {"name": "agent_memory", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:agent_sdk_builder", "text": "openagent skill. Build an agent using the SDK. Inputs: INITIAL_PROMPT (initial SDK requirements). Triggers: /agent-builder.", "payload": {"name": "agent_sdk_builder", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:azure_devops", "text": "openagent skill. Azure DevOps integration. Work items, repos, pipelines.", "payload": {"name": "azure_devops", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:bitbucket", "text": "openagent skill. Bitbucket Cloud integration. Pull requests, repos, pipelines.", "payload": {"name": "bitbucket", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:bitbucket_data_center", "text": "openagent skill. Bitbucket Data Center integration. On-prem Bitbucket.", "payload": {"name": "bitbucket_data_center", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:code-review", "text": "openagent skill. Code review process. Expert software engineer reviewer. Actionable feedback on code quality, maintainability, security. DO NOT modify code; only feedback. Triggers: /codereview.", "payload": {"name": "code-review", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:codereview-roasted", "text": "openagent skill. Critical code reviewer with Linus Torvalds engineering mindset. 30+ years experience. 'Good Taste' first principle. Pragmatism over theoretical perfection. Triggers: /codereview-roasted.", "payload": {"name": "codereview-roasted", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:default-tools", "text": "openagent skill. Default tools for the openagent agent.", "payload": {"name": "default-tools", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:docker", "text": "openagent skill. Docker guidelines. Container best practices.", "payload": {"name": "docker", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:fix-py-line-too-long", "text": "openagent skill. Fix Python lines that are too long.", "payload": {"name": "fix-py-line-too-long", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:fix_test", "text": "openagent skill. Fix a failing test.", "payload": {"name": "fix_test", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:flarglebargle", "text": "openagent skill. Easter-egg skill with no real purpose — placeholder/canary. Triggers: flarglebargle.", "payload": {"name": "flarglebargle", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:github", "text": "openagent skill. GitHub API operations. Issues, PRs, repos, actions, gists. Auth via GITHUB_TOKEN.", "payload": {"name": "github", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:gitlab", "text": "openagent skill. GitLab API operations. Issues, MRs, repos, CI.", "payload": {"name": "gitlab", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:kubernetes", "text": "openagent skill. Kubernetes setup and management. kubectl, manifests, helm.", "payload": {"name": "kubernetes", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:npm", "text": "openagent skill. npm package management. Install, publish, scripts.", "payload": {"name": "npm", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:onboarding_agent", "text": "openagent skill. First-time user conversation. Onboard a new user to openagent. Triggers: /onboard.", "payload": {"name": "onboarding_agent", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:pdflatex", "text": "openagent skill. PDFLaTeX compilation for academic papers and reports.", "payload": {"name": "pdflatex", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:security", "text": "openagent skill. Security best practices. Secret detection, vulnerability scanning, secure coding.", "payload": {"name": "security", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:ssh", "text": "openagent skill (SSH Microagent). SSH connections and configuration. Tunneling, key auth, jump hosts.", "payload": {"name": "ssh", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:swift-linux", "text": "openagent skill. Swift on Linux. Build, test, cross-compile.", "payload": {"name": "swift-linux", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:update_pr_description", "text": "openagent skill. Update a PR description with a summary and test plan.", "payload": {"name": "update_pr_description", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
    {"id": "mavis-skill:update_test", "text": "openagent skill. Update an existing test to reflect new behavior.", "payload": {"name": "update_test", "type": "mavis-skill", "upstream": "All-Hands-AI/OpenHands"}},
]

# Environment access — what I told the user in the previous turn
ENVIRONMENT = [
    {"id": "env:llm:anthropic", "text": "Anthropic Claude. 1 API key + 2 OAuth tokens (primary + backup). Models: Sonnet 5, 4-6, Haiku 4-5. OAuth = Pro/Max plan access. Status: API key invalid, OAuth tokens may be live.", "payload": {"name": "anthropic", "type": "llm-provider", "status": "partial"}},
    {"id": "env:llm:openai", "text": "OpenAI. 3 keys (OPENAI_API_KEY_1/2/3). Models: GPT-4, GPT-4o, o1. Status: keys stale (per memory). Use OpenRouter proxy instead.", "payload": {"name": "openai", "type": "llm-provider", "status": "stale"}},
    {"id": "env:llm:openrouter", "text": "OpenRouter. 1 key. Default fallback for Mavis. 200+ models. Status: 200 OK live, but daily budget hit on embeddings.", "payload": {"name": "openrouter", "type": "llm-provider", "status": "live-with-budget-cap"}},
    {"id": "env:llm:gemini", "text": "Google Gemini. 4 keys (_1, _2_PRO, _3_GCP, _ANTIGRAVITY). Models: Flash, Pro. Status: keys invalid.", "payload": {"name": "gemini", "type": "llm-provider", "status": "stale"}},
    {"id": "env:llm:grok", "text": "xAI Grok. 1 key. Models: Grok 3/4. Status: 403, needs auth header fix.", "payload": {"name": "grok", "type": "llm-provider", "status": "needs-fix"}},
    {"id": "env:llm:deepseek", "text": "DeepSeek. 1 key. Models: V3, R1. Status: 401, needs X-API-Key header.", "payload": {"name": "deepseek", "type": "llm-provider", "status": "needs-fix"}},
    {"id": "env:llm:groq", "text": "Groq. 1 key. Ultra-fast Llama, Mixtral inference. Status: 200 OK live.", "payload": {"name": "groq", "type": "llm-provider", "status": "live"}},
    {"id": "env:llm:nvidia", "text": "NVIDIA NIM. 3 keys (CLOUD, PROD, TEST). Nemotron, Llama-Nemotron. Status: 404 on embeddings endpoint, but reachable.", "payload": {"name": "nvidia", "type": "llm-provider", "status": "reachable"}},
    {"id": "env:llm:ollama", "text": "Ollama Cloud. 2 keys (general + Kimi K3). Remote Ollama + Kimi K3. Status: 200 OK live.", "payload": {"name": "ollama", "type": "llm-provider", "status": "live"}},
    {"id": "env:llm:huggingface", "text": "HuggingFace. 1 token. Model hub, Inference API, dataset downloads. Status: 200 OK live.", "payload": {"name": "huggingface", "type": "llm-provider", "status": "live"}},

    {"id": "env:cloud:cloudflare", "text": "Cloudflare. account ID + token. R2 buckets, Workers, KV, Pages, DNS. Status: 403, needs scoped token (workspace-scoped; R2 + Workers work).", "payload": {"name": "cloudflare", "type": "cloud", "status": "needs-scope"}},
    {"id": "env:cloud:r2", "text": "Cloudflare R2 (S3-compatible). Access key + secret + endpoint. Static file storage.", "payload": {"name": "r2", "type": "cloud", "status": "via-cloudflare"}},
    {"id": "env:cloud:netlify", "text": "Netlify. 2 deploy tokens (PRIMARY, SECONDARY). Static + serverless deploys. Status: 200 OK live.", "payload": {"name": "netlify", "type": "cloud", "status": "live"}},
    {"id": "env:cloud:supabase", "text": "Supabase. 1 project beagwczwcraeefxkkcmq. Anon key, mgmt key, project key, URL. REST only (DNS blocks direct Postgres). 66+ vectors in mavis_knowledge.", "payload": {"name": "supabase", "type": "cloud", "status": "live-rest-only"}},

    {"id": "env:dev:github", "text": "GitHub. fvegiard user + 3 tokens (general, Gemini bot, Highlight bot) + 1 Copilot OAuth. 100+ repos including OpenHands, Mavis, quantum-agent, melanie-agent, 007-orchestrator, claude-code-mcp-fv, etc.", "payload": {"name": "github", "type": "dev-platform", "status": "live"}},
    {"id": "env:dev:cursor", "text": "Cursor Cloud Agent. API key. Spawn cloud agents, get diffs. Status: 200 OK live.", "payload": {"name": "cursor", "type": "dev-platform", "status": "live"}},
    {"id": "env:dev:opencode", "text": "OpenCode. 2 API keys (general + Go). OpenCode cloud.", "payload": {"name": "opencode", "type": "dev-platform", "status": "live"}},
    {"id": "env:dev:tailscale", "text": "Tailscale. Auth key 90-day. Join tailnet, SSH, Magic DNS. Status: cannot reach from sandbox (no Tailscale), fv-legion-2 OFFLINE since 2026-07-26.", "payload": {"name": "tailscale", "type": "dev-platform", "status": "unreachable-from-sandbox"}},

    {"id": "env:search:brave", "text": "Brave Search API. Web/news/image search. Status: 200 OK live.", "payload": {"name": "brave", "type": "search", "status": "live"}},

    {"id": "env:messaging:telegram", "text": "Telegram bot @MavisAgentBot (id 8683155181). Can send messages, react, reply. Status: 200 OK live. Token in TELEGRAM_BOT_TOKEN env.", "payload": {"name": "telegram", "type": "messaging", "status": "live"}},

    {"id": "env:security:virustotal", "text": "VirusTotal. URL/file hash scanning. Status: 200 OK live.", "payload": {"name": "virustotal", "type": "security", "status": "live"}},

    {"id": "env:other:stitch", "text": "Google Stitch. API key + asset key. Image generation, design.", "payload": {"name": "stitch", "type": "other", "status": "needs-oauth"}},
    {"id": "env:other:warp2", "text": "WARP2. Key. Workflow automation, internal MiniMax.", "payload": {"name": "warp2", "type": "other", "status": "internal"}},
]

# Agent memory topics (from MEMORY.md available_memory_topics)
MEMORY_TOPICS = [
    {"id": "memory:bun-runtime", "text": "bun + bunx preferred runtime for JS/TS on sandbox. Install path, bun-specific gotchas, bun.serve() WebSocket pattern. Use bun for installing JS packages, running scripts, building servers.", "payload": {"name": "bun-runtime", "type": "memory-topic", "size": 4256}},
    {"id": "memory:claude-desktop-setup", "text": "Claude Desktop for Linux (beta), auth, supervised test plan, sandbox quirks. Blocking: no fresh Claude auth token in this env.", "payload": {"name": "claude-desktop-setup", "type": "memory-topic", "size": 1904}},
    {"id": "memory:claude-oauth-pool", "text": "Claude API OAuth token pool unlock, model lineup, claude-call wrapper, ANTHROPIC_OAUTH_TOKEN failover chain. Read when working with Claude API calls, OAuth auth, or model selection.", "payload": {"name": "claude-oauth-pool", "type": "memory-topic", "size": 5331}},
    {"id": "memory:cursor-apis", "text": "Cursor Cloud Agent API: auth, endpoints (spawn agent, bug review), model list, integration patterns, and full bug triage log.", "payload": {"name": "cursor-apis", "type": "memory-topic", "size": 2488}},
    {"id": "memory:jarvis-stack", "text": "Jarvis v2.0 deployment, RAG layer, system prompt + Reflexion pattern, install scripts. mavis-* scripts, OAuth pool, RAG queries.", "payload": {"name": "jarvis-stack", "type": "memory-topic", "size": 4657}},
    {"id": "memory:mavis-platform", "text": "Mavis MiniMax-M3 integration for claw-anyllm: OpenAI-compatible API, reasoning tags, litefuse hooks, agent teams.", "payload": {"name": "mavis-platform", "type": "memory-topic", "size": 2264}},
    {"id": "memory:playwright-capabilities", "text": "Full surface of Playwright 2026 (v1.60+). Browser automation, scraping with vision, auth-flow tracing, screenshot/trace/HAR/PDF capture, multi-engine testing (Chromium/Firefox/WebKit).", "payload": {"name": "playwright-capabilities", "type": "memory-topic", "size": 13749}},
    {"id": "memory:pre-flight-protocol", "text": "MANDATORY protocol at the start of every conversation. 7-check protocol: env, files, software versions, API ping, sub-agents, mode decision, deliverable test. Discovery upfront, verification, then execution.", "payload": {"name": "pre-flight-protocol", "type": "memory-topic", "size": 4653}},
]

# Tools I have
TOOLS = [
    {"id": "tool:bash", "text": "Execute shell command in cloud sandbox. Background option for long-running. Use for any shell work.", "payload": {"name": "bash", "type": "tool"}},
    {"id": "tool:read", "text": "Read file from workspace. Supports text, images, video (mp4/avi/mov/mk4), PDF (with pages), Jupyter notebooks. Truncated by line count.", "payload": {"name": "read", "type": "tool"}},
    {"id": "tool:write", "text": "Write content to file. Creates parent dirs. Prefer edit() for modifications.", "payload": {"name": "write", "type": "tool"}},
    {"id": "tool:edit", "text": "Edit file with exact text replacement. old_string must match exactly, be unique.", "payload": {"name": "edit", "type": "tool"}},
    {"id": "tool:glob", "text": "Search files by glob pattern. Workspace-contained, sensitive files excluded.", "payload": {"name": "glob", "type": "tool"}},
    {"id": "tool:grep", "text": "Search file contents with ripgrep. files_with_matches/content/count modes.", "payload": {"name": "grep", "type": "tool"}},
    {"id": "tool:web_search", "text": "Web search for current info. News, prices, places, recent posts. freshness filter.", "payload": {"name": "web_search", "type": "tool"}},
    {"id": "tool:web_fetch", "text": "Fetch URL content. Default + deep modes for captcha/anti-bot.", "payload": {"name": "web_fetch", "type": "tool"}},
    {"id": "tool:image_synthesize", "text": "Generate images from prompts, optionally conditioned on reference images. Up to 10 per batch.", "payload": {"name": "image_synthesize", "type": "tool"}},
    {"id": "tool:gen_videos", "text": "Generate videos from prompts, async on server, may take minutes.", "payload": {"name": "gen_videos", "type": "tool"}},
    {"id": "tool:batch_text_to_audio", "text": "Batch TTS with voice and audio params per request.", "payload": {"name": "batch_text_to_audio", "type": "tool"}},
    {"id": "tool:synthesize_speech", "text": "Single text to speech. Use batch_* for multiple.", "payload": {"name": "synthesize_speech", "type": "tool"}},
    {"id": "tool:transcribe_audio", "text": "Transcribe single audio file to text.", "payload": {"name": "transcribe_audio", "type": "tool"}},
    {"id": "tool:audios_understand", "text": "Analyze local audio files. Batch up to 10.", "payload": {"name": "audios_understand", "type": "tool"}},
    {"id": "tool:mavis", "text": "Mavis CLI. agent/cron/session/drive CRUD. agent list, cron list, session list, drive files.", "payload": {"name": "mavis", "type": "tool"}},
    {"id": "tool:team", "text": "Team plan tool. Producer-vs-verifier adversarial workflow. run/status/steer/decision/cancel.", "payload": {"name": "team", "type": "tool"}},
    {"id": "tool:communicate", "text": "Talk to peer sessions. Send mode (to_session) or spawn mode (subagent).", "payload": {"name": "communicate", "type": "tool"}},
    {"id": "tool:todowrite", "text": "Task list for multi-step work. Exactly one in_progress.", "payload": {"name": "todowrite", "type": "tool"}},
    {"id": "tool:task", "text": "Cloud sub-agent. explore (read-only map), general (bounded delegated), scout (fast recon).", "payload": {"name": "task", "type": "tool"}},
    {"id": "tool:secret", "text": "Encrypted secrets CRUD for cloud tools. list/create/update/delete. Names = UPPERCASE env vars.", "payload": {"name": "secret", "type": "tool"}},
    {"id": "tool:memory_*", "text": "Memory system. memory_read, memory_search, memory_append, memory_edit, memory_summary_write, memory_topic_read/create/append/edit/delete/search.", "payload": {"name": "memory_*", "type": "tool"}},
    {"id": "tool:website_deploy", "text": "Public deployment of built static site. Requires user confirmation. Returns public URL.", "payload": {"name": "website_deploy", "type": "tool"}},
    {"id": "tool:images_search_and_download", "text": "Web image search + download to disk.", "payload": {"name": "images_search_and_download", "type": "tool"}},
    {"id": "tool:image_reverse_search", "text": "Find visually similar images for a local image. Writes markdown report.", "payload": {"name": "image_reverse_search", "type": "tool"}},
    {"id": "tool:skill", "text": "Read SKILL.md body for a hosted skill.", "payload": {"name": "skill", "type": "tool"}},
]

# Sub-agents
SUBAGENTS = [
    {"id": "subagent:explore", "text": "Read-only codebase exploration. Best for unfamiliar areas, architecture questions, impact analysis before implementation. Returns grounded map of files, symbols, data flow, constraints.", "payload": {"name": "explore", "type": "subagent"}},
    {"id": "subagent:general", "text": "Bounded delegated task. May require multiple steps or broader tool use. Self-contained execution with clear scope, expected output, constraints.", "payload": {"name": "general", "type": "subagent"}},
    {"id": "subagent:scout", "text": "Fast, read-only recon. External docs, dependency behavior, upstream examples, quick local/upstream confidence check. Concise answer before deeper work.", "payload": {"name": "scout", "type": "subagent"}},
]

# MCP servers
MCP_SERVERS = [
    {"id": "mcp:sequential-thinking", "text": "@modelcontextprotocol/server-sequential-thinking. Always loaded for non-trivial reasoning. Structured thought envelope with thoughtNumber/totalThoughts/nextThoughtNeeded/branches. Supports isRevision, revisesThought, branchFromThought. Use as scratchpad that gets its own commits/revisions.", "payload": {"name": "sequential-thinking", "type": "mcp-server", "package": "@modelcontextprotocol/server-sequential-thinking@2026.7.4", "always_loaded": True}},
]

# Concatenate everything into a single corpus
ALL_ENTRIES = SKILLS + PLUGINS + MAVIS_SKILLS + ENVIRONMENT + MEMORY_TOPICS + TOOLS + SUBAGENTS + MCP_SERVERS

if __name__ == "__main__":
    print(f"Corpus: {len(ALL_ENTRIES)} entries")
    by_type = {}
    for e in ALL_ENTRIES:
        t = e["payload"].get("type", "?")
        by_type[t] = by_type.get(t, 0) + 1
    for t, n in sorted(by_type.items()):
        print(f"  {t}: {n}")
