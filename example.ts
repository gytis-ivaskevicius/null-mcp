#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env --allow-run
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { NullMCP, resourceTextResult, toolTextResult } from "./NullMCP.ts"
import { z } from "zod"

const decoder = new TextDecoder()

await new NullMCP({ name: "null-mcp", version: "1.0.0" })
  .registerTools({
    echo: {
      title: "Echo",
      description: "Echos supplied text",
      inputSchema: { text: z.string().describe("The text to echo") },
      callback: ({ text }) => toolTextResult(`Echo: ${text}`),
      test: (input) => ({ text: input }),
    },
    review: {
      title: "Code Review",
      description: "Runs deno fmt, deno lint, and deno check",
      inputSchema: {},
      test: () => ({}),
      callback: async () => {
        try {
          await new Deno.Command("deno", { args: ["fmt"] }).output()

          const lintResult = await new Deno.Command("deno", {
            args: ["lint"],
            stdout: "null",
            stderr: "piped",
          }).output()

          const checkResult = await new Deno.Command("deno", {
            args: ["check", "."],
            stdout: "null",
            stderr: "piped",
          }).output()

          const lintOutput = lintResult.code !== 0 ? decoder.decode(lintResult.stderr) : ""
          const checkOutput = checkResult.code !== 0 ? decoder.decode(checkResult.stderr) : ""

          return toolTextResult([
            lintResult.code === 0 && checkResult.code === 0 ? "✅ All checks passed!" : "❌ Checks failed:",
            `Lint: ${lintResult.code === 0 ? "✅" : `❌\n${lintOutput}`}`,
            `Type Check: ${checkResult.code === 0 ? "✅" : `❌\n${checkOutput}`}`,
          ].join("\n"))
        } catch (error) {
          return toolTextResult(`Error during review: ${error instanceof Error ? error.message : String(error)}`)
        }
      },
    },
  })
  .registerResources({
    config: {
      uri: "config://app",
      title: "Application Config",
      description: "Application configuration data",
      mimeType: "text/plain",
      callback: (uri) => resourceTextResult(uri.href, "App configuration here"),
      test: (input) => input || "config://app",
    },
  })
  .connect(new StdioServerTransport())
