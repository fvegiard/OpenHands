---
name: my-project-knowledge
type: knowledge
version: 1.0.0
agent: CodeActAgent
triggers:
- my project
- my app
- my preferences
- my business
- vibe coding
- this project
---

# Personal project context (vibe coding)

When the user is doing **vibe coding** (non-developer friendly workflow) or asks about **their** app, product, stack, or preferences:

1. **Read** `MY_PROJECT_KNOWLEDGE.md` in the repository root if it exists. Treat it as the source of truth for *their* goals, constraints, and plain-language stack notes.
2. If that file is missing, read **`MY_PROJECT_KNOWLEDGE.example.md`**, then tell the user to copy it to `MY_PROJECT_KNOWLEDGE.md` and fill it in (no coding required).
3. **Never** ask them to put secrets (passwords, API keys, tokens) into either file. Prefer environment variables or Cursor/Secrets UI.
4. Prefer **simple explanations** and **small steps** unless they ask for depth.
5. After important changes they confirm, suggest a **one-line update** they can paste into the “Recent decisions” section of `MY_PROJECT_KNOWLEDGE.md` so knowledge stays fresh.
