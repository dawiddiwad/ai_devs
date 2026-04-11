import { Mastra } from '@mastra/core/mastra'
import { rocketAgent } from '../rocket-agent'
import { timeTravelAgent } from '../time-travel-agent'
import { MastraCompositeStore } from '@mastra/core/storage'
import { DuckDBStore } from '@mastra/duckdb'
import { LibSQLStore } from '@mastra/libsql'
import { PinoLogger } from '@mastra/loggers'
import { Observability, DefaultExporter, CloudExporter, SensitiveDataFilter } from '@mastra/observability'
import { calculateSyncRatioTool } from '../tools/timetravel/calculate-sync-ratio'
import { frequencyScannerTool } from '../tools/rocket/frequency-scanner'
import { getRadioHintTool } from '../tools/rocket/get-radio-hint'
import { lookupProtectionLevelTool } from '../tools/timetravel/lookup-protection-level'
import { moveRocketTool } from '../tools/rocket/move'
import { startGameTool } from '../tools/rocket/start-game'
import { MastraEditor } from '@mastra/editor'
import { timetravelConfigureTool } from '../tools/timetravel/configure'
import { timetravelGetConfigTool } from '../tools/timetravel/get-config'
import { timetravelHelpTool } from '../tools/timetravel/help'
import { timetravelResetTool } from '../tools/timetravel/reset'

export const mastra = new Mastra({
	tools: {
		startGameTool,
		frequencyScannerTool,
		getRadioHintTool,
		moveRocketTool,
		timetravelHelpTool,
		timetravelGetConfigTool,
		timetravelConfigureTool,
		timetravelResetTool,
		calculateSyncRatioTool,
		lookupProtectionLevelTool,
	},
	agents: { rocketAgent, timeTravelAgent },
	editor: new MastraEditor(),
	storage: new MastraCompositeStore({
		id: 'composite-storage',
		default: new LibSQLStore({
			id: 'mastra-storage',
			url: 'file:./agent.db',
		}),
		domains: {
			observability: await new DuckDBStore({
				id: 'observability-storage',
				path: './observability.duckdb',
			}).getStore('observability'),
		},
	}),
	logger: new PinoLogger({
		name: 'MastraLogger',
		level: 'info',
	}),
	observability: new Observability({
		configs: {
			default: {
				serviceName: 'MastraObservability',
				exporters: [new DefaultExporter(), new CloudExporter()],
				spanOutputProcessors: [new SensitiveDataFilter()],
			},
		},
	}),
})
