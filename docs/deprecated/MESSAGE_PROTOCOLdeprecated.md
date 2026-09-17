# Messages Shape

- [Messages Shape](#messages-shape)
  - [Stateless API](#stateless-api)
  - [Tool Use — Agent Loop](#tool-use--agent-loop)
  - [Multi-Block Messages](#multi-block-messages)
    - [Parallel Tool Use](#parallel-tool-use)
    - [Text + Image Blocks](#text--image-blocks)

## Stateless API

The Anthropic API is **stateless**: it holds no memory between calls. Every request must carry the full conversation history. The client is responsible for accumulating messages.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Anthropic API

    Note over C: Turn 1
    C->>A: [ user: "What is quantum computing?" ]
    A-->>C: [ assistant: "Quantum computing uses qu-bits..." ]

    Note over C: Turn 2 — replay history + add new message
    C->>A: [ user: "What is quantum computing?" ]
    C->>A: [ assistant: "Quantum computing uses qu-bits..." ]
    C->>A: [ user: "How does that differ from classical?" ]
    A-->>C: [ assistant: "Classical computers use bits..." ]

    Note over C: Turn 3 — history keeps growing
    C->>A: [ user: "What is quantum computing?" ]
    C->>A: [ assistant: "Quantum computing uses qu-bits..." ]
    C->>A: [ user: "How does that differ from classical?" ]
    C->>A: [ assistant: "Classical computers use bits..." ]
    C->>A: [ user: "Give me an example algorithm." ]
    A-->>C: [ assistant: "Grover's algorithm, for example..." ]

    Note over A: No session retained — each request is independent
```

## Tool Use — Agent Loop

When the model decides to call a tool, the API returns `stop_reason: "tool_use"` instead of a final answer. The client executes the tool, appends the result, and calls the API again. This loop repeats until `stop_reason: "end_turn"`.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Anthropic API
    participant T as Tool

    Note over C: Send message + tool definitions
    C->>A: tools: [get_theme]
    C->>A: [ user: "What theme is the app using?" ]

    Note over A: Decides to call a tool
    A-->>C: [ assistant: tool_use → get_theme ]
    Note over C: stop_reason: "tool_use"

    C->>T: execute get_theme()
    T-->>C: "dark"

    Note over C: Append tool_result and re-send full history
    C->>A: tools: [get_theme]
    C->>A: [ user: "What theme is the app using?" ]
    C->>A: [ assistant: tool_use → get_theme ]
    C->>A: [ user: tool_result → "dark" ]

    Note over A: Has tool result — generates final answer
    A-->>C: [ assistant: "The app is using the dark theme." ]
    Note over C: stop_reason: "end_turn" — loop exits
```

## Multi-Block Messages

A message's `content` field can be an array of blocks instead of a plain string. This lets a single message carry mixed types — text, tool calls, and tool results — in one turn.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Anthropic API

    Note over C: Turn 1 — user asks
    C->>A: user: "What is the current UI state?"

    Note over A: Replies with text + tool_use in one message
    A-->>C: assistant: [ text: "Let me check that for you." ]
    A-->>C: assistant: [ tool_use id=tu_01 → get_theme ]

    Note over C: Turn 2 — replay history + add tool_result
    C->>A: user: "What is the current UI state?"
    C->>A: assistant: [ text block + tool_use tu_01 ]
    C->>A: user: [ tool_result id=tu_01 → "dark" ]

    Note over A: Has tool result — generates final answer
    A-->>C: assistant: [ text: "The theme is dark." ]
```

### Parallel Tool Use

The API can request multiple tools in a single assistant message. The client must return all results in one `user` message before the next generation.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Anthropic API

    C->>A: user: "Describe the current UI."

    Note over A: Requests two tools at once
    A-->>C: assistant: [ tool_use id=tu_02 → get_theme ]
    A-->>C: assistant: [ tool_use id=tu_03 → get_window_size ]

    Note over C: Return ALL results in a single user message
    C->>A: user: "Describe the current UI."
    C->>A: assistant: [ tool_use tu_02 + tool_use tu_03 ]
    C->>A: user: [ tool_result tu_02 → "dark" ]
    C->>A: user: [ tool_result tu_03 → "1280x800" ]

    A-->>C: assistant: [ text: "The app is dark-themed at 1280x800." ]
```

### Text + Image Blocks

A user message can mix `text` and `image` blocks in the same `content` array, sending both to the model in a single turn.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Anthropic API

    Note over C: One user message with two content blocks
    C->>A: user: [ text: "What is in this image?" ]
    C->>A: user: [ image: base64-encoded data ]

    Note over A: Reads both blocks as one turn
    A-->>C: assistant: [ text: "The image shows..." ]
```
