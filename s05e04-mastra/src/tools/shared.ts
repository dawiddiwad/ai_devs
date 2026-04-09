import type { AxiosResponse } from 'axios'

export function stringifyUnknown(value: unknown): string {
	if (typeof value === 'string') {
		return value
	}

	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

export function filterHupResponse(response: AxiosResponse): { repeat: boolean; reason?: string } {
	const responseAsString = JSON.stringify(response.data)

	if (responseAsString.length > 1000) {
		return { repeat: true, reason: `Response too long to display with ${responseAsString.length} characters` }
	}

	if (response.status >= 400) {
		return {
			repeat: true,
			reason: `Frequency scanner returned error with status ${response.status}, details: ${responseAsString}`,
		}
	}

	if (responseAsString.toLocaleLowerCase().includes('crash')) {
		return {
			repeat: true,
			reason: `Rocket crashed, please restart, details: ${responseAsString}`,
		}
	}

	return { repeat: false }
}
