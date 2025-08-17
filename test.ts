import { describe, it } from "@std/testing/bdd"
import { expect } from "@std/expect"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

interface ContentBlock {
  type: string
  text?: string
}

async function createMcpClient() {
  const transport = new StdioClientTransport({
    command: "deno",
    args: ["run", "--allow-net", "--allow-read", "--allow-env", "--allow-run", "example.ts"],
    cwd: ".",
  })

  const client = new Client({
    name: "test-client",
    version: "0.1.0",
  })

  await client.connect(transport)
  return { client, transport }
}

async function withMcpClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const { client } = await createMcpClient()
  try {
    return await fn(client)
  } finally {
    await client.close()
    // Force cleanup with a small delay to ensure proper shutdown
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

async function runCliCommand(args: string[]) {
  const result = await new Deno.Command("./example.ts", {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output()

  const stdout = new TextDecoder().decode(result.stdout).trim()
  const stderr = new TextDecoder().decode(result.stderr).trim()

  return { code: result.code, stdout, stderr }
}

describe("CLI Tool Tests", () => {
  it("should echo text correctly", async () => {
    const result = await runCliCommand(["tool", "echo", "Hello CLI"])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("Echo: Hello CLI")
  })

  it("should run review tool", async () => {
    const result = await runCliCommand(["tool", "review"])
    expect(result.code).toBe(0)
    expect(result.stdout).toMatch(/✅|❌/)
  })

  it("should handle nonexistent tool", async () => {
    const result = await runCliCommand(["tool", "nonexistent"])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Tool 'nonexistent' not found")
  })
})

describe("CLI Resource Tests", () => {
  it("should read config resource", async () => {
    const result = await runCliCommand(["resource", "config"])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("App configuration here")
  })

  it("should read config resource with custom URI", async () => {
    const result = await runCliCommand(["resource", "config", "config://custom"])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("App configuration here")
  })

  it("should handle nonexistent resource", async () => {
    const result = await runCliCommand(["resource", "nonexistent"])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Resource 'nonexistent' not found")
  })
})

describe("MCP Protocol Tests", () => {
  it("should connect to MCP server", async () => {
    await withMcpClient(async () => {
      // Connection test - just connecting and disconnecting
    })
  })

  it("should list tools", async () => {
    await withMcpClient(async (client) => {
      const response = await client.listTools()
      expect(response.tools).toBeDefined()
      expect(response.tools!.length).toBeGreaterThan(0)

      const toolNames = response.tools!.map((t) => t.name)
      expect(toolNames).toContain("echo")
      expect(toolNames).toContain("review")
    })
  })

  it("should call echo tool", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "echo",
        arguments: { text: "Hello MCP" },
      })

      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)
      expect((result.content as ContentBlock[]).length).toBeGreaterThan(0)

      const textContent = (result.content as ContentBlock[]).find((c: ContentBlock) => c.type === "text")
      expect(textContent).toBeDefined()
      expect(textContent!.text).toContain("Echo: Hello MCP")
    })
  })

  it("should call review tool", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "review",
        arguments: {},
      })

      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)
      expect((result.content as ContentBlock[]).length).toBeGreaterThan(0)

      const textContent = (result.content as ContentBlock[]).find((c: ContentBlock) => c.type === "text")
      expect(textContent).toBeDefined()
      expect(textContent!.text).toBeDefined()
    })
  })

  it("should list resources", async () => {
    await withMcpClient(async (client) => {
      const response = await client.listResources()
      expect(response.resources).toBeDefined()
      expect(response.resources!.length).toBeGreaterThan(0)

      const resourceNames = response.resources!.map((r) => r.name)
      expect(resourceNames).toContain("config")
    })
  })

  it("should read config resource", async () => {
    await withMcpClient(async (client) => {
      const result = await client.readResource({
        uri: "config://app",
      })

      expect(result.contents).toBeDefined()
      expect(result.contents!.length).toBeGreaterThan(0)

      const content = result.contents![0]
      expect(content.text).toContain("App configuration here")
    })
  })
})

describe("Error Handling Tests", () => {
  it("should handle nonexistent tool call", async () => {
    await withMcpClient(async (client) => {
      await expect(client.callTool({
        name: "nonexistent",
        arguments: {},
      })).rejects.toThrow()
    })
  })

  it("should handle echo tool with missing arguments", async () => {
    await withMcpClient(async (client) => {
      await expect(client.callTool({
        name: "echo",
        arguments: {},
      })).rejects.toThrow()
    })
  })

  it("should handle nonexistent resource", async () => {
    await withMcpClient(async (client) => {
      await expect(client.readResource({
        uri: "nonexistent://resource",
      })).rejects.toThrow()
    })
  })
})

describe("Performance Tests", () => {
  it("should handle multiple concurrent tool calls", async () => {
    await withMcpClient(async (client) => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        client.callTool({
          name: "echo",
          arguments: { text: `Message ${i}` },
        }))

      const results = await Promise.all(promises)
      expect(results).toHaveLength(5)

      results.forEach((result, i) => {
        const textContent = (result.content as ContentBlock[]).find((c: ContentBlock) => c.type === "text")
        expect(textContent!.text).toContain(`Message ${i}`)
      })
    })
  })
})
