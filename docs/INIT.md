# Kata Curriculum Vision

A hands-on learning curriculum for frontend engineers to build real proficiency with LLM-based systems, agentic architectures, and the Anthropic TypeScript SDK — ultimately preparing them for the **Anthropic Architect Certification**.

---

## Target Audience

Frontend engineers comfortable with TypeScript and React. The challenge for this audience is developing an intuition for how LLMs work *as orchestrated systems*, not just as chat APIs. The curriculum provides a common infrastructure so learners can call the Anthropic API directly from the browser — no backend required.

The learning path is centered on the [anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript).

---

## Certification Domains in Scope

- **Domain 1 — Agentic Architecture & Orchestration**
  Design and implement agentic systems using Claude's Agent SDK. Covers agentic loops, multi-agent orchestration, hooks, workflows, session management, and task decomposition patterns for production-grade AI applications.

- **Domain 2 — Tool Design & MCP Integration**
  Design effective tools and integrate with Model Context Protocol (MCP) servers. Covers tool description best practices, structured error responses, tool distribution, MCP configuration, and Claude's built-in tools.

- **Domain 4 — Prompt Engineering & Structured Output**
  Master prompt engineering techniques for production systems. Covers explicit criteria, few-shot prompting, `tool_use` for structured output, JSON schema design, validation-retry loops, and multi-pass review strategies.

- **Domain 5 — Context Management & Reliability**
  Manage context effectively in production systems. Covers progressive summarization risks, context positioning, escalation patterns, error propagation, context degradation, human review, and information provenance.

> **Domain 3** (LLM code assistants) is out of scope — this curriculum focuses on agentic systems and tool integration rather than code generation workflows.

---

## Application Shell

A minimal React app: a chat UI, a `.env` file with the Anthropic API key, and a set of kata tasks. No extra complexity — just ESLint, Prettier, Material UI, and the bare minimum to run and look clean.

---

## Kata Structure

Each kata lives in its own folder and contains:

- `README.md` — learning objectives and task instructions
- `<Component>.tsx` — skeleton with task stubs (the learner's workspace)
- `<Component>.solution.tsx` — completed reference implementation

---

## Kata 1 — Basic Chat (Implemented)

A working chat interface that walks through three tasks in sequence:

1. Initialize the Anthropic client and send a message to the API
2. Context management — stateless API, full conversation history passed on every request, ability to start a new chat
3. Tool use — agent loop, a `set_theme` tool, handling `stop_reason: 'tool_use'`

---

## Roadmap

Only Kata 1 is implemented. The number and scope of future katas is deliberately open — the priority is a meaningful, solid first kata before expanding the curriculum. Future katas will address the remaining certification domains and introduce a unifying domain or narrative to make the exercises feel less clinical.

---

## API Key Setup

A dedicated guide for obtaining an Anthropic API key with step-by-step instructions is referenced from each kata's README. See `docs/ANTHROPIC_API.md`.

---

## Resources

- [Exam Guide (PDF)](https://everpath-course-content.s3-accelerate.amazonaws.com/instructor%2F8lsy243ftffjjy1cx9lm3o2bw%2Fpublic%2F1773274827%2FClaude+Certified+Architect+%E2%80%93+Foundations+Certification+Exam+Guide.pdf)
- [claudecertifications.com — Exam Guide](https://claudecertifications.com/claude-certified-architect/exam-guide)
- [claudecertificationguide.com](https://claudecertificationguide.com/)
- [certsafari.com — Anthropic Architect](https://www.certsafari.com/anthropic/claude-certified-architect)
