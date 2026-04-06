import type { ChatCompletionContentPart, ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ResponseInputFile, ResponseInputImage, ResponseInputText } from 'openai/resources/responses/responses'
import type { AgentToolBinaryResult, AgentToolResult } from './types.js'

function toDataUrl(base64: string, mimeType: string): string {
	return base64.startsWith('data:') ? base64 : `data:${mimeType};base64,${base64}`
}

function normalizeCompletionsImageDetail(
	detail: 'low' | 'high' | 'auto' | 'original' | undefined
): 'low' | 'high' | 'auto' {
	if (!detail || detail === 'original') {
		return 'auto'
	}

	return detail
}

function createBinaryToolResultSummary(result: AgentToolBinaryResult): string {
	if (result.type === 'image') {
		return `[Tool returned image: ${result.mimeType}]`
	}

	return `[Tool returned file: ${result.filename} (${result.mimeType})]`
}

export function getToolResultText(result: AgentToolResult): string {
	if (typeof result === 'string') {
		return result
	}

	return result.text ?? createBinaryToolResultSummary(result)
}

export function serializeToolResultForResponses(
	result: AgentToolResult
): string | Array<ResponseInputText | ResponseInputImage | ResponseInputFile> {
	if (typeof result === 'string') {
		return result
	}

	const content: Array<ResponseInputText | ResponseInputImage | ResponseInputFile> = []

	if (result.text) {
		content.push({ type: 'input_text', text: result.text })
	}

	if (result.type === 'image') {
		content.push({
			type: 'input_image',
			image_url: toDataUrl(result.base64, result.mimeType),
			detail: result.detail ?? 'auto',
		})
	} else {
		content.push({
			type: 'input_file',
			filename: result.filename,
			file_data: toDataUrl(result.base64, result.mimeType),
		})
	}

	return content
}

export function appendToolResultForCompletions(
	messages: ChatCompletionMessageParam[],
	toolCallId: string,
	result: AgentToolResult
): ChatCompletionMessageParam[] {
	return [...messages, { role: 'tool', tool_call_id: toolCallId, content: getToolResultText(result) }]
}

export function createToolResultAttachmentParts(
	toolName: string,
	toolCallId: string,
	result: AgentToolResult
): ChatCompletionContentPart[] {
	if (typeof result === 'string') {
		return []
	}

	const parts: ChatCompletionContentPart[] = [
		{
			type: 'text',
			text: `Tool "${toolName}" returned the attached ${result.type}. Use it as the tool result for call "${toolCallId}".${
				result.text ? ` Tool note: ${result.text}` : ''
			}`,
		},
	]

	if (result.type === 'image') {
		parts.push({
			type: 'image_url',
			image_url: {
				url: toDataUrl(result.base64, result.mimeType),
				detail: normalizeCompletionsImageDetail(result.detail),
			},
		})
	} else {
		parts.push({
			type: 'file',
			file: {
				file_data: toDataUrl(result.base64, result.mimeType),
				filename: result.filename,
			},
		})
	}

	return parts
}
