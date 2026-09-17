# What else could we do regarding this project? Or - open questions?

## Gaps in the core sequence

- **Error handling & retries** — what happens when a tool fails, the API errors, or the model halts unexpectedly? Should there be a lab that intentionally breaks things?
- **System prompt** — none of the current labs use one. It's fundamental for controlling agent behavior and scope. Should it be introduced early (Hello?) or as its own lab?
- **Context window management** — history grows unbounded across the loop. How do production agents handle summarization or truncation? Worth a dedicated lab?
- **Observability** — the current labs show inputs and outputs but not the agent's reasoning trace. How do you log and inspect what the agent decided and why?
