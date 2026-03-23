import type { ChatCompletionTool, ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions'
import { logger } from './logger'
import { downloadAndExtract } from './tools/download'
import { sensorAnomalies } from './tools/sensor-anomalies'
import { operatorAnomalies } from './tools/operator-anomalies'
import { verifyResult } from './tools/verify-result'

export const toolDefinitions: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'run_evaluation',
			description:
				'Runs the full sensor anomaly detection pipeline: downloads data, runs programmatic sensor checks, classifies operator notes via LLM, merges all anomaly IDs, and submits to the verify endpoint. Returns the final result.',
			parameters: {
				type: 'object',
				properties: {},
				required: [],
			},
		},
	},
]

async function runEvaluationPipeline(): Promise<string> {
	logger.agent('info', 'Starting evaluation pipeline')

	logger.agent('info', 'Step 1/4: Downloading and extracting sensor data')
	const downloadResult = await downloadAndExtract()
	logger.tool('info', 'Download complete', downloadResult)

	logger.agent('info', 'Step 2/4: Running programmatic sensor anomaly checks')
	const sensorResult = await sensorAnomalies()
	logger.tool('info', 'Sensor anomalies found', {
		anomaly_count: sensorResult.anomaly_count,
		normal_count: sensorResult.normal_count,
	})

	logger.agent('info', 'Step 3/4: Analyzing operator notes via LLM')
	const operatorResult = await operatorAnomalies()
	logger.tool('info', 'Operator anomalies found', {
		anomaly_count: operatorResult.anomaly_count,
		notes_analyzed: operatorResult.notes_analyzed,
		notes_filtered_out: operatorResult.notes_filtered_out,
	})

	const mergedIds = [...new Set([...sensorResult.anomaly_ids, ...operatorResult.anomaly_ids])].sort()
	logger.agent('info', 'Step 4/4: Submitting merged anomaly IDs', { total: mergedIds.length })

	const verifyResponse = await verifyResult(mergedIds)

	if (verifyResponse.flag) {
		logger.agent('info', `FLAG CAPTURED: ${verifyResponse.flag}`)
		process.exit(0)
	}

	logger.agent('error', 'No flag captured', { response: verifyResponse.response })
	process.exit(1)
}

export async function executeTool(toolCall: ChatCompletionMessageFunctionToolCall): Promise<string> {
	const { name } = toolCall.function
	logger.tool('info', `Executing tool: ${name}`)

	try {
		switch (name) {
			case 'run_evaluation': {
				return await runEvaluationPipeline()
			}
			default:
				return JSON.stringify({ error: `Unknown tool: ${name}` })
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		logger.tool('error', `Tool execution failed: ${name}`, { error: message })
		return JSON.stringify({ error: message })
	}
}
