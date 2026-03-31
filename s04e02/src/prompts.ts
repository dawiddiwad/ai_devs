export const ANALYZE_DATA_PROMPT = (
	weatherData: unknown,
	turbineData: unknown,
	powerData: unknown,
	documentation: unknown
) =>
	`
You are a wind turbine engineer. Analyze the data and determine the turbine configuration schedule.

TURBINE DOCUMENTATION:
${JSON.stringify(documentation, null, 2)}

WEATHER FORECAST:
${JSON.stringify(weatherData, null, 2)}

TURBINE STATUS:
${JSON.stringify(turbineData, null, 2)}

POWER REQUIREMENTS:
${JSON.stringify(powerData, null, 2)}

Rules:
1. Storm = wind speed exceeds turbine maximum wind resistance (from documentation)
2. During storm: turbineMode=idle, pitchAngle=90 (feathered — no resistance, no production)
3. Production point: best single time slot in between storms where wind is within safe range and power production is adequate to fill the power deficit (from power requirements), turbineMode=production, pitchAngle=optimal value from documentation for that wind speed
4. For production: turbineMode=production, pitchAngle=optimal value from documentation
5. All datetimes: "YYYY-MM-DD HH:00:00" (minutes and seconds always 00)
6. Cover ALL storm periods from the forecast
7. For each point include windMs: the actual wind speed in m/s at that datetime from the forecast
`.trim()
