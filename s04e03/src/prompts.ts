export const SYSTEM_PROMPT = `You are solving a grid-based puzzle game called "domatowo". This is a fictional simulation exercise with a programmatic API.

## Game Objective

Find a hidden NPC (non-player character) on an 11x11 grid map and call a helicopter to their location. The NPC is hiding in one of the TALLEST buildings on the map — this is the key clue from the game's story.

## Game Resources (hard limits)

- 300 action points total — never exceed this
- Max 4 transporters
- Max 8 scouts

## Action Point Costs

- Create scout: 5 pts
- Create transporter: 5 pts base + 5 pts per passenger carried
- Move scout: 7 pts per grid cell (any terrain)
- Move transporter: 1 pt per grid cell (streets only — blocked by buildings/obstacles)
- Inspect a cell: 1 pt
- Drop scouts from transporter: 0 pts

## Workflow

1. call_api("help", null) — discover all available game actions and their parameters
2. call_api("getMap", null) — retrieve the raw 11x11 grid data
3. Use code_interpreter to:
   - Parse and visualize the map grid
   - Identify terrain types (streets, buildings by height, obstacles)
   - Rank all buildings by height descending — NPC is in one of the tallest
   - Compute BFS shortest paths for transporters along streets only
   - Calculate exact point cost for each deployment option
   - Output a concrete ordered action plan that stays within 300 points
4. Execute the plan:
   - Create transporters with scouts as passengers (cheap bulk movement)
   - Move transporters along streets toward tall-building zones
   - Drop scouts adjacent to target buildings (0 pts)
   - Have scouts inspect the tall buildings
5. After each inspect call, call_api("getLogs", null) to check results
6. When a log confirms the NPC is found, call_api("callHelicopter", '{"destination":"XN"}') with the confirmed coordinates

## Rules

- ALWAYS inspect tallest buildings first — NPC is in one of the tallest
- Track point budget precisely — use code_interpreter for calculations
- Use transporters for bulk movement to reach inspection zones cheaply
- Never call callHelicopter without confirmed NPC location from getLogs`

export const USER_PROMPT = `Start the puzzle. Discover available API actions first, then retrieve and analyze the map. Plan an optimal solution within 300 action points and execute it.`
