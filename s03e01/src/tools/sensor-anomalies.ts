import fs from 'fs'
import path from 'path'
import { z } from 'zod/v4'
import { config } from '../config'
import { logger } from '../logger'

const VALID_RANGES: Record<string, { min: number; max: number }> = {
	temperature_K: { min: 553, max: 873 },
	pressure_bar: { min: 60, max: 160 },
	water_level_meters: { min: 5.0, max: 15.0 },
	voltage_supply_v: { min: 229.0, max: 231.0 },
	humidity_percent: { min: 40.0, max: 80.0 },
}

const SENSOR_TYPE_TO_FIELD: Record<string, string> = {
	temperature: 'temperature_K',
	pressure: 'pressure_bar',
	water: 'water_level_meters',
	voltage: 'voltage_supply_v',
	humidity: 'humidity_percent',
}

const ALL_SENSOR_FIELDS = Object.values(SENSOR_TYPE_TO_FIELD)

const SensorFileSchema = z.object({
	sensor_type: z.string(),
	timestamp: z.number(),
	temperature_K: z.number(),
	pressure_bar: z.number(),
	water_level_meters: z.number(),
	voltage_supply_v: z.number(),
	humidity_percent: z.number(),
	operator_notes: z.string(),
})

type SensorFile = z.infer<typeof SensorFileSchema>

export interface NormalRecord {
	fileId: string
	data: SensorFile
}

let normalRecords: NormalRecord[] = []

export function getNormalRecords(): NormalRecord[] {
	return normalRecords
}

function getActiveFields(sensorType: string): string[] {
	const types = sensorType
		.split('/')
		.map((t) => t.trim().toLowerCase())
		.sort()
	return types.map((t) => SENSOR_TYPE_TO_FIELD[t]).filter((f): f is string => f !== undefined)
}

function validateSensor(data: SensorFile): boolean {
	const activeFields = getActiveFields(data.sensor_type)

	for (const field of activeFields) {
		const value = data[field as keyof SensorFile] as number
		const range = VALID_RANGES[field]
		if (!range) continue
		if (value < range.min || value > range.max) {
			return false
		}
	}

	for (const field of ALL_SENSOR_FIELDS) {
		if (!activeFields.includes(field)) {
			const value = data[field as keyof SensorFile] as number
			if (value !== 0) {
				return false
			}
		}
	}

	return true
}

export async function sensorAnomalies(): Promise<{
	anomaly_ids: string[]
	anomaly_count: number
	normal_count: number
	total_files: number
	type_groups: Record<string, number>
}> {
	const dataDir = path.resolve(config.dataDir)
	const files = fs
		.readdirSync(dataDir)
		.filter((f) => f.endsWith('.json'))
		.sort()

	const anomalyIds: string[] = []
	normalRecords = []
	const typeGroups: Record<string, number> = {}

	for (const file of files) {
		const filePath = path.join(dataDir, file)
		const raw = fs.readFileSync(filePath, 'utf-8')
		const parsed = JSON.parse(raw)
		const result = SensorFileSchema.safeParse(parsed)

		if (!result.success) {
			logger.tool('warn', 'Invalid sensor file schema', { file, errors: result.error.issues })
			const fileId = file.replace('.json', '')
			anomalyIds.push(fileId)
			continue
		}

		const data = result.data
		const fileId = file.replace('.json', '')

		const normalizedType = data.sensor_type
			.split('/')
			.map((t) => t.trim().toLowerCase())
			.sort()
			.join('/')
		typeGroups[normalizedType] = (typeGroups[normalizedType] || 0) + 1

		if (validateSensor(data)) {
			normalRecords.push({ fileId, data })
		} else {
			anomalyIds.push(fileId)
		}
	}

	logger.tool('info', 'Sensor anomaly analysis complete', {
		anomaly_count: anomalyIds.length,
		normal_count: normalRecords.length,
		total_files: files.length,
	})

	return {
		anomaly_ids: anomalyIds,
		anomaly_count: anomalyIds.length,
		normal_count: normalRecords.length,
		total_files: files.length,
		type_groups: typeGroups,
	}
}
