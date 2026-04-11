import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'
import { calculateSyncRatioTool } from './tools/timetravel/calculate-sync-ratio'
import { lookupProtectionLevelTool } from './tools/timetravel/lookup-protection-level'
import { timetravelConfigureTool } from './tools/timetravel/configure'
import { timetravelGetConfigTool } from './tools/timetravel/get-config'
import { timetravelHelpTool } from './tools/timetravel/help'
import { timetravelResetTool } from './tools/timetravel/reset'
import { AgentBrowser } from '@mastra/agent-browser'
import { createConfig } from '@ai-devs/core/dist/config'

const config = createConfig()

const INSTRUCTIONS = `You are autonomous operator solving the "timetravel" task.

Your scope is the API side plus frontend side in the browser.

# Core workflow:
## API configuration:
1. Use timetravel-get-config or timetravel-help for current state.
2. Verify device is in standby before changing API settings.
3. Use calculate-sync-ratio for the chosen date.
4. Configure year, month, day, then syncRatio via API.
5. Use lookup-protection-level to get the required PWR value for the target year.
6. Setup correct Sync Ratio
7. Inspect configure responses for stabilization hints and configure if needed.
8. Re-check device state after configuration.

## Frontend interaction:
1. Use browser to setup PT-A/B switches, ACTIVE switch, PWR slider
2. Make the jump in time when fluxDensity is 100% using ORB.

Manual switches:
- future jump: PT-A off, PT-B on
- past jump: PT-A on, PT-B off
- tunnel: PT-A on, PT-B on

How to jump using frontend:
- Setup the configuration using
- You can only click to jump in time when fluxDensity is 100% and the device is active.

Communication:
- Use timetravel-reset if the machine enters a bad state.
- Never ask the user to calculate syncRatio or look up PWR—use the tools.

Flag Capture:
- If you receive a flag in the form of FLG:xxxx immediately tell the user "FLAG CAPTURED: xxxx"

Goal: 
- Make time jumps as ordered by the user.`

export const timeTravelAgent = new Agent({
	id: 'time-travel-agent',
	name: 'Time Travel Agent',
	instructions: INSTRUCTIONS,
	model: 'openai/gpt-5.4-mini',
	browser: new AgentBrowser({
		onLaunch: async (browser) => {
			browser.browser.navigateTo(`${config.hubEndpoint}/timetravel_preview`)
		},
		headless: false,
		cdpUrl: 'http://127.0.0.1:9222',
	}),
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
	memory: new Memory({
		options: {
			lastMessages: 100,
		},
	}),
})
