import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { FunctionTool } from 'openai/resources/responses/responses'
import { logger } from '../logger'
import type { BoundTool } from '../tool-factory'

const ALLOWED_TOOLS = [
	'browser_navigate',
	'browser_snapshot',
	'browser_click',
	'browser_type',
	'browser_fill',
	'browser_select_option',
	'browser_navigate_back',
]

let mcpClient: Client | null = null

async function getMcpClient(): Promise<Client> {
	if (mcpClient) return mcpClient

	const transport = new StdioClientTransport({
		command: 'npx',
		args: ['@playwright/mcp' /*'--headless'*/, '--viewport-size=1280,800'],
	})

	const client = new Client({ name: 'okoeditor', version: '1.0.0' }, { capabilities: {} })
	await client.connect(transport)
	mcpClient = client

	process.on('exit', () => {
		client.close()
	})

	return client
}

export async function initBrowserTools(): Promise<BoundTool[]> {
	const client = await getMcpClient()
	const { tools } = await client.listTools()

	logger.tool('info', `Playwright MCP tools available: ${tools.map((t) => t.name).join(', ')}`)

	return tools
		.filter((t) => ALLOWED_TOOLS.includes(t.name))
		.map((t) => {
			const schema = t.inputSchema as Record<string, unknown>

			const definition: FunctionTool = {
				type: 'function',
				name: t.name,
				description: t.description ?? t.name,
				parameters: schema,
				strict: false,
			}

			return {
				definition,
				execute: async (args: unknown) => {
					logger.tool('info', `Browser: ${t.name}`, { args })
					const result = await client.callTool({
						name: t.name,
						arguments: (args ?? {}) as Record<string, unknown>,
					})
					logger.tool('info', `Browser done: ${t.name}`)
					return JSON.stringify(result)
				},
			} satisfies BoundTool
		})
}
