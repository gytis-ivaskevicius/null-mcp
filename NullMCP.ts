import { McpServer, ReadResourceCallback, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ServerOptions, Transport } from "@modelcontextprotocol/sdk"
import type {
  CallToolResult,
  ContentBlock,
  Implementation,
  ReadResourceResult,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js"
import { type ZodRawShape } from "zod"

/** MCP tool configuration for AI assistants. */
export type Tool<InputArgs extends ZodRawShape, OutputArgs extends ZodRawShape> = {
  /** Tool title */
  title?: string
  /** Tool description */
  description?: string
  /** Input schema (Zod) */
  inputSchema?: InputArgs
  /** Output schema (Zod) */
  outputSchema?: OutputArgs
  /** Tool annotations */
  annotations?: ToolAnnotations
  /** Tool implementation */
  callback: ToolCallback<InputArgs>
  /** CLI input parser for testing via CLI */
  test?: (input: string) => Record<string, unknown>
}

/** MCP resource configuration for data access. */
export type Resource = {
  /** Resource URI */
  uri: string
  /** Resource title */
  title?: string
  /** Resource description */
  description?: string
  /** Content MIME type */
  mimeType?: string
  /** Resource content provider */
  callback: ReadResourceCallback
  /** CLI input parser for testing via CLI */
  test?: (input: string) => string
}

/** Main MCP server class with built-in CLI testing. */
export class NullMCP {
  server: McpServer
  private _connected = false
  private _tools: Record<string, Tool<ZodRawShape, ZodRawShape>> = {}
  private _resources: Record<string, Resource> = {}

  /**
   * Create a new MCP server instance.
   * @param serverInfo Server name and version
   * @param options Optional server configuration
   */
  constructor(serverInfo: Implementation, options?: ServerOptions) {
    if (!serverInfo.name?.trim()) {
      throw new Error("Server name is required")
    }
    if (!serverInfo.version?.trim()) {
      throw new Error("Server version is required")
    }
    this.server = new McpServer(serverInfo, options)
  }

  /**
   * Register tools with the MCP server.
   * @param tools Object mapping tool names to tool configurations
   * @returns This instance for method chaining
   */
  registerTools(tools: Record<string, Tool<ZodRawShape, ZodRawShape>>): NullMCP {
    this._tools = { ...this._tools, ...tools }
    Object.entries(tools).forEach(([name, tool]) => {
      try {
        this.server.registerTool(
          name,
          {
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
          },
          tool.callback,
        )
      } catch (error) {
        console.error(`Failed to register tool '${name}':`, error)
        throw error
      }
    })
    return this
  }

  /**
   * Register resources with the MCP server.
   * @param resources Object mapping resource names to resource configurations
   * @returns This instance for method chaining
   */
  registerResources(resources: Record<string, Resource>): NullMCP {
    this._resources = { ...this._resources, ...resources }
    Object.entries(resources).forEach(([name, resource]) => {
      try {
        this.server.registerResource(
          name,
          resource.uri,
          {
            title: resource.title,
            description: resource.description,
            mimeType: resource.mimeType,
          },
          resource.callback,
        )
      } catch (error) {
        console.error(`Failed to register resource '${name}':`, error)
        throw error
      }
    })
    return this
  }

  /**
   * Connect the MCP server or run CLI command.
   * @param transport Optional transport layer (defaults to stdio)
   */
  async connect(transport?: Transport) {
    if (this._connected) {
      throw new Error("Server already connected")
    }

    const args = Deno.args
    if (args.length >= 2) {
      if (args[0] === "tool") {
        await this.runCliTool(args[1], args.slice(2).join(" "))
        return
      }
      if (args[0] === "resource") {
        await this.runCliResource(args[1], args.slice(2).join(" "))
        return
      }
    }

    await this.server.connect(transport ?? new StdioServerTransport())
    this._connected = true
    console.info("MCP Server started and connected")
  }

  private async runCliTool(toolName: string, input: string) {
    const tool = this._tools[toolName]
    if (!tool) {
      this.showError(`Tool '${toolName}' not found`, `Available tools: ${Object.keys(this._tools).join(", ")}`)
    }

    if (!tool.test) {
      this.showError(`Tool '${toolName}' does not have a test configuration`)
    }

    try {
      const args = tool.test(input)
      const result = await tool.callback(args, this.createCallbackExtra())
      this.outputTextContent(result.content)
    } catch (error) {
      this.showError(`Error running tool '${toolName}':`, error)
    }
  }

  private async runCliResource(resourceName: string, input: string) {
    const resource = this._resources[resourceName]
    if (!resource) {
      this.showError(
        `Resource '${resourceName}' not found`,
        `Available resources: ${Object.keys(this._resources).join(", ")}`,
      )
    }

    if (!resource.test) {
      this.showError(`Resource '${resourceName}' does not have a test configuration`)
    }

    try {
      const uriString = resource.test(input)
      const result = await resource.callback(new URL(uriString), this.createCallbackExtra())
      result.contents?.forEach((content) => console.log(content.text || content.blob))
    } catch (error) {
      this.showError(`Error reading resource '${resourceName}':`, error)
    }
  }

  private createCallbackExtra() {
    return {
      signal: new AbortController().signal,
      requestId: "cli-test",
      sendNotification: () => Promise.resolve(),
      sendRequest: () => Promise.resolve({}),
    }
  }

  private outputTextContent(content?: { type: string; text?: string }[]) {
    content
      ?.filter((it) => it.type === "text")
      .forEach((it) => console.log(it.text))
  }

  private showError(message: string, detail?: unknown): never {
    console.error(message)
    if (detail) console.error(detail)
    Deno.exit(1)
  }

  async close(): Promise<void> {
    if (this._connected) {
      await this.server.close()
      this._connected = false
      console.info("MCP Server disconnected")
    }
  }
}

/**
 * Helper function to create a text content block.
 * @param text The text content
 * @returns Content block object
 */
export function toolTextContent(text: string): ContentBlock {
  return { type: "text", text }
}

/**
 * Helper function to create a tool result with text content.
 * @param text The response text
 * @returns Tool call result
 */
export function toolTextResult(text: string): CallToolResult {
  return { content: [toolTextContent(text)] }
}

/**
 * Helper function to create a resource result with text content.
 * @param uri The resource URI
 * @param text The resource content
 * @returns Resource read result
 */
export function resourceTextResult(uri: string, text: string): ReadResourceResult {
  return { contents: [{ uri, text }] }
}
