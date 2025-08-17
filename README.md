# NullMCP

A minimal TypeScript library for building custom Model Context Protocol (MCP) servers with built-in CLI testing.

## Why NullMCP?

Build project-specific MCP servers without wrestling with the official SDK's complexity. NullMCP provides:

- **Zero-config setup** - Import and start building immediately
- **CLI testing built-in** - Test your tools without MCP clients
- **Type-safe API** - Simple wrapper around the official MCP SDK
- **Project-focused** - Designed for custom implementations, not generic servers

## Installation

Add NullMCP to your TypeScript project:

### my-mcp-server.ts

```typescript
#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env --allow-run
import { NullMCP, toolTextResult } from "https://deno.land/x/null-mcp/mod.ts"
import { z } from "zod"

await new NullMCP({ name: "my-project-mcp", version: "1.0.0" })
  .registerTools({
    myTool: {
      title: "My Custom Tool",
      description: "Does something specific to my project",
      inputSchema: { input: z.string() },
      callback: ({ input }) => toolTextResult(`Processed: ${input}`),
      // $ ./my-mcp-server.ts tool myTool <THIS_IS_GOING_TO_BE_PASSED_AS_INPUT>
      // Used for quickly testing MCP tool
      test: (input) => ({ input }),
    },
  })
  .connect()
```

Then make it executable and run:

```bash
chmod +x my-mcp-server.ts
./my-mcp-server.ts tool myTool "test input"
```

## MCP Client Integration

Add your custom server to Claude Desktop or other MCP clients (`.mcp.json`):

```json
{
  "mcpServers": {
    "my-project": {
      "type": "stdio",
      "command": "./my-mcp-server.ts",
      "env": {}
    }
  }
}
```

## CLI Testing

Test your tools directly during development:

```bash
# Test tools instantly
./my-mcp-server.ts tool myTool "test input"
./my-mcp-server.ts tool anotherTool "different input"

# Test resources
./my-mcp-server.ts resource myResource "optional-param"
```

## Common Use Cases

**Project Documentation:**

```typescript
.registerTools({
  searchDocs: {
    title: "Search Documentation",
    inputSchema: { query: z.string() },
    callback: async ({ query }) => {
      // Search your project's docs
      const results = await searchProjectDocs(query)
      return toolTextResult(results) // Function to cover most of the usecases, you can define your own content output manually
    },
    test: (input) => ({ query: input })
  }
})
```

**Database Operations:**

```typescript
.registerTools({
  queryDB: {
    title: "Query Database",
    inputSchema: { sql: z.string() },
    callback: async ({ sql }) => {
      const results = await db.query(sql)
      return toolTextResult(JSON.stringify(results))
    },
    test: (input) => ({ sql: input })
  }
})
```

**Custom Workflows:**

```typescript
.registerTools({
  deployProject: {
    title: "Deploy to Staging",
    inputSchema: { branch: z.string().optional() },
    callback: async ({ branch = "main" }) => {
      // Your deployment logic
      await runDeployment(branch)
      return toolTextResult(`Deployed ${branch} to staging`)
    },
    test: (input) => ({ branch: input || "main" })
  }
})
```

## API Reference

### Basic Structure

```typescript
import { NullMCP, resourceTextResult, toolTextResult } from "https://deno.land/x/null-mcp/mod.ts"

await new NullMCP({ name: "your-project", version: "1.0.0" })
  .registerTools({/* your tools */})
  .registerResources({/* your resources */})
  .connect()
```

### Tool Definition

```typescript
toolName: {
  title: "Human-readable title",
  description: "What this tool does",
  inputSchema: { param: z.string() },      // Zod schema for validation
  callback: ({ param }) => {               // Your implementation
    return toolTextResult("response")
  },
  test: (cliInput) => ({ param: cliInput }) // How should it be invoked via CLI (Generally for testing purposes)
}
```

### Resource Definition

```typescript
resourceName: {
  uri: "custom://resource-identifier",
  title: "Resource Title",
  description: "What this resource provides",
  mimeType: "text/plain",
  callback: (uri) => {
    return resourceTextResult(uri.href, "resource content")
  },
  test: (cliInput) => cliInput || "default://uri"
}
```

## Example Implementation

See `example.ts` in this repository for a working example with echo, review tools, and config resource.

## Contributing

This project uses Deno. To contribute:

```bash
git clone <repo>
cd null-mcp
deno task check  # Format, lint, type check
deno task test   # Run test suite
```
