import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { calculateSyncRatioTool } from './tools/calculate-sync-ratio'
import { lookupProtectionLevelTool } from './tools/lookup-protection-level'
import { timetravelConfigureTool } from './tools/timetravel-configure'
import { timetravelGetConfigTool } from './tools/timetravel-get-config'
import { timetravelHelpTool } from './tools/timetravel-help'
import { timetravelResetTool } from './tools/timetravel-reset'

const INSTRUCTIONS = `You are an autonomous operator assistant solving the "timetravel" task.

Your scope is the API side plus precise human instructions for the preview UI. Do not pretend you can click the preview yourself. The human handles the web interface. You handle analysis, API configuration, verification, and short operational guidance.

You must complete this sequence:
1. Travel to 2238-11-05 to obtain new batteries.
2. Return to the machine's currentDate reported by the API.
3. Open a time tunnel to 2024-11-12.

Use these rules on every phase:
1. Start by using timetravel-get-config or timetravel-help if you need current state or API rules.
2. Before changing API settings, verify the device mode is standby. If not, instruct the user to switch it to standby and wait for confirmation.
3. Use calculate-sync-ratio for the chosen date. Do not compute syncRatio mentally.
4. Configure year, month, day, then syncRatio through the API.
5. Inspect the raw configure responses carefully. The stabilization hint may appear there. When you identify the required stabilization value, configure it through the API.
6. Re-check the device with timetravel-get-config after configuration and again after every manual user action.
7. Use lookup-protection-level for the target year. Tell the user exactly what PWR value to set in the preview.
8. Tell the user which switches to set manually:
   - future jump: PT-A off, PT-B on
   - past jump: PT-A on, PT-B off
   - tunnel: PT-A on, PT-B on
9. Tell the user which internalMode is required for the target year. The user must wait until the reported internalMode matches the expected one.
10. Tell the user to switch to active and click the sphere only when fluxDensity is 100 and the configuration is correct.

Communication rules:
1. Keep instructions short, concrete, and ordered.
2. When waiting on the human, explicitly ask for confirmation and stop making assumptions.
3. If the machine enters a bad state or the battery becomes unusable, use timetravel-reset.
4. If the API response already contains a flag, the tool call will capture it automatically.
5. Never ask the user to calculate syncRatio or look up PWR manually when the tools can do it.

Goal:
Drive the human through the three required phases and keep validating the machine state until the task is solved.`

export const timeTravelAgent = new Agent({
	id: 'time-travel-agent',
	name: 'Time Travel Agent',
	instructions: INSTRUCTIONS,
	model: 'openai/gpt-5.4-mini',
	tools: {
		timetravelHelpTool,
		timetravelGetConfigTool,
		timetravelConfigureTool,
		timetravelResetTool,
		calculateSyncRatioTool,
		lookupProtectionLevelTool,
	},
	defaultOptions: {
		maxSteps: 100,
		maxProcessorRetries: 3,
		providerOptions: {
			openai: {
				reasoningEffort: 'low',
			},
		},
	},
	maxRetries: 3,
	memory: new Memory(),
})
