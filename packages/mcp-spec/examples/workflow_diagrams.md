# Example MCP workflow diagrams

Some illustrative sequence diagrams of various concepts that could be built as MCP servers.

**NOTE:** These are _examples_, not necessarily planned integrations!

### Google Drive Resource Requests

> a sequence diagram showing how resources would be requested from a Google Drive MCP server

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as Google Drive MCP Server
    participant GDrive as Google Drive API

    Client->>+Server: initialize
    Server-->>-Client: InitializeResult
    Client->>Server: initialized

    Client->>+Server: resources/list
    Server->>+GDrive: List files and folders
    GDrive-->>-Server: Files and folders list
    Server-->>-Client: ListResourcesResult

    Client->>+Server: resources/read (file.txt)
    Server->>+GDrive: Get file contents
    GDrive-->>-Server: File contents
    Server-->>-Client: ReadResourceResult

    opt Subscribe to folder updates
        Client->>+Server: resources/subscribe (folder/)
        Server-->>-Client: EmptyResult

        loop While subscribed
            GDrive-->>Server: File change notification
            Server->>Client: notifications/resources/updated (folder/newfile.txt)

            opt Read updated resource
                Client->>+Server: resources/read (folder/newfile.txt)
                Server->>+GDrive: Get file contents
                GDrive-->>-Server: File contents
                Server-->>-Client: ReadResourceResult
            end
        end

        Client->>+Server: resources/unsubscribe (folder/)
        Server-->>-Client: EmptyResult
    end
```

### Git MCP Server Tool Use

> an example of a Git MCP server, exposing a few Git commands as tool use for the LLM

```mermaid
sequenceDiagram
    participant User
    participant LLM
    participant MCP Client
    participant MCP Server
    participant Git System as Git

    User->>LLM: "Commit my changes and push"

    LLM->>MCP Client: Request available tools
    MCP Client->>MCP Server: tools/list
    MCP Server-->>MCP Client: ListToolsResult (Git commands)
    MCP Client-->>LLM: Available Git tools

    LLM->>MCP Client: tools/call (git status)
    MCP Client->>MCP Server: tools/call (git status)
    MCP Server->>Git System: git status
    Git System-->>MCP Server: status output
    MCP Server-->>MCP Client: CallToolResult (status)
    MCP Client-->>LLM: Git status result

    Note over LLM: LLM analyzes status, decides to commit

    LLM->>MCP Client: tools/call (git commit -m "Update files")
    MCP Client->>MCP Server: tools/call (git commit -m "Update files")
    MCP Server->>Git System: git commit -m "Update files"
    Git System-->>MCP Server: commit result
    MCP Server-->>MCP Client: CallToolResult (commit)
    MCP Client-->>LLM: Commit result

    LLM->>MCP Client: tools/call (git push)
    MCP Client->>MCP Server: tools/call (git push)
    MCP Server->>Git System: git push
    Git System-->>MCP Server: push result
    MCP Server-->>MCP Client: CallToolResult (push)
    MCP Client-->>LLM: Push result

    LLM->>User: "I've committed and pushed your changes!"
```

### Code Review Prompts

> … a code review assistant … could offer a set of specialized prompts to help developers conduct more thorough and efficient code reviews.

```mermaid
sequenceDiagram
    participant C as Client (e.g., IDE)
    participant S as Code Review Prompts MCP Server

    C->>S: initialize
    S-->>C: InitializeResult (capabilities, etc.)
    C->>S: initialized
    C->>S: prompts/list
    S-->>C: ListPromptsResult (available prompts)

    Note over C: User selects "security-review" prompt

    C->>S: prompts/get (name: "security-review", arguments)
    S-->>C: GetPromptResult (messages for security review)

    Note over C: User selects "performance-review" prompt

    C->>S: prompts/get (name: "performance-review", arguments)
    S-->>C: GetPromptResult (messages for performance review)

    Note over C: User selects "code-style-review" prompt

    C->>S: prompts/get (name: "code-style-review", arguments)
    S-->>C: GetPromptResult (messages for style review)
```

### GitHub PR Summaries Server

> an MCP server that summarizes GitHub pull requests
>
> …
>
>
> 1. MCP server loads all the PRs on a GitHub repo
> 2. MCP server requests LLM sampling to summarize each one
> 3. The summaries are vended as MCP resources

```mermaid
sequenceDiagram
    participant Client
    participant MCP Server
    participant GitHub API
    participant LLM

    Client->>MCP Server: initialize
    MCP Server->>Client: initialize_response
    Client->>MCP Server: initialized

    MCP Server->>GitHub API: Fetch all PRs
    GitHub API->>MCP Server: PR details

    loop For each PR
        MCP Server->>Client: sampling/createMessage (PR summary prompt)
        Client->>LLM: Sample
        LLM->>Client: Generated summary
        Client->>MCP Server: CreateMessageResult (PR summary)
        Note over MCP Server: Store summary as resource
    end

    Note over Client: Some time later...

    Client->>MCP Server: resources/list
    MCP Server->>Client: ListResourcesResult (PR summary URIs)

    Client->>MCP Server: resources/read (PR summary URI)
    MCP Server->>Client: ReadResourceResult (PR summary)

    Note over Client,MCP Server: Client can request more summaries as needed
```
