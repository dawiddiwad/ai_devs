import fs from 'fs'
import path from 'path'
import axios from 'axios'
import AdmZip from 'adm-zip'
import { config } from '../config'
import { logger } from '../logger'

export async function downloadAndExtract(): Promise<{ status: string; file_count: number }> {
	const dataDir = path.resolve(config.dataDir)

	if (fs.existsSync(dataDir)) {
		logger.tool('info', 'Clearing existing data directory', { dataDir })
		fs.rmSync(dataDir, { recursive: true, force: true })
	}

	fs.mkdirSync(dataDir, { recursive: true })

	logger.api('info', 'Downloading sensors.zip', { url: config.sensorsDataUrl })
	const response = await axios.get(config.sensorsDataUrl, { responseType: 'arraybuffer' })
	logger.api('info', 'Download complete', { size: response.data.byteLength })

	const zip = new AdmZip(Buffer.from(response.data))
	const entries = zip.getEntries()

	let fileCount = 0
	for (const entry of entries) {
		if (entry.entryName.endsWith('.json') && !entry.isDirectory) {
			const fileName = path.basename(entry.entryName)
			const targetPath = path.join(dataDir, fileName)
			fs.writeFileSync(targetPath, entry.getData())
			fileCount++
		}
	}

	logger.tool('info', 'Extraction complete', { file_count: fileCount })
	return { status: 'ok', file_count: fileCount }
}
