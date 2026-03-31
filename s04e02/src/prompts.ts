export const PARSE_API_DOCS_PROMPT = (helpText: string) =>
	`
You are analyzing windpower API documentation.

Extract the action names needed to queue async jobs for:
1. Weather forecast data
2. Turbine specifications (max wind speed, pitch angle limits, etc.)
3. Power/energy requirements (demand schedule)
4. The parameter names that unlockCodeGenerator requires.

API docs:
${helpText}
`.trim()

export const ANALYZE_DATA_PROMPT = (weatherData: unknown, turbineData: unknown, powerData: unknown) =>
	`
You are a wind turbine engineer. Analyze the data and determine the turbine configuration schedule.

WEATHER FORECAST:
${JSON.stringify(weatherData, null, 2)}

TURBINE SPECIFICATIONS:
${JSON.stringify(turbineData, null, 2)}

POWER REQUIREMENTS:
${JSON.stringify(powerData, null, 2)}

Rules:
1. Storm = wind speed exceeds turbine maximum wind resistance
2. During storm: turbineMode=idle, pitchAngle=90 (feathered — no resistance, no production)
3. Production point: best single time slot where wind is within safe range AND power is needed
4. For production: turbineMode=production, pitchAngle=optimal per turbine specs
5. All datetimes: "YYYY-MM-DD HH:00:00" (minutes and seconds always 00)
6. Cover ALL storm periods from the forecast
`.trim()
