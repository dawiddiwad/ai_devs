# Time Travel Assistant `timetravel`

## Goal

Provide a Mastra agent that handles the API side of the `timetravel` task and guides a human operator through the preview UI steps required to:

1. jump to `2238-11-05` and obtain replacement batteries
2. return to the device `currentDate`
3. open a tunnel to `2024-11-12`

## Scope

The implementation is intentionally human-in-the-loop.

- The agent handles API calls through `/verify`
- The agent computes deterministic values such as `syncRatio`
- The agent looks up the documented `PWR` value for a target year
- The human operator changes `PT-A`, `PT-B`, `PWR`, standby/active mode, and clicks the preview UI

## Agent

File: `src/time-travel-agent.ts`

The agent should:

1. inspect current device state with `getConfig`
2. calculate and configure the target date parameters through the API
3. inspect raw configure responses for stabilization hints
4. configure stabilization
5. verify state again with `getConfig`
6. tell the operator exactly what to do in the preview UI
7. re-check state after manual steps

## Tools

### API tools

- `timetravel-help`
- `timetravel-get-config`
- `timetravel-configure`
- `timetravel-reset`

All API tools submit answers to `/verify` with `task: "timetravel"` and return raw payloads.

### Deterministic helper tools

- `calculate-sync-ratio`
- `lookup-protection-level`

`calculate-sync-ratio` implements:

```text
((day * 8) + (month * 12) + (year * 7)) % 101
```

Then converts the modulo result into the decimal `syncRatio` expected by the API, for example `37 -> 0.37` and `100 -> 1.00`.

`lookup-protection-level` derives the documented `PWR` value from the published protection table and also returns the expected `internalMode` for the target year.

## Manual Guidance Rules

The agent must instruct the operator to use:

1. `PT-A = off`, `PT-B = on` for a jump into the future
2. `PT-A = on`, `PT-B = off` for a jump into the past
3. `PT-A = on`, `PT-B = on` for a tunnel

It must also remind the operator that:

1. API changes are only allowed in `standby`
2. `fluxDensity` must reach `100`
3. `internalMode` must match the target year range before activation

## Registration

The package should expose both Mastra agents side by side:

- `rocketAgent`
- `timeTravelAgent`

Both are registered in `src/mastra/index.ts`.

## Verification

Minimum verification step:

```bash
npm run build
```
