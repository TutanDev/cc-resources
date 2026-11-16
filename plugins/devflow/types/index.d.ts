// The session values the devflow hooks keep: the plans each agent wrote since
// it last handed back, and the agents already sent back once to fix one.

// A plan an agent wrote since it last handed back.
export type DevflowPlanWrite = {
  // `main`, or a subagent's id.
  agent: string
  // The plan's path, as the agent's first write named it.
  path: string
  // The structure check's messages for the plan before the agent first wrote
  // it: problems it found, so not the agent's to fix.
  before: string[]
}

declare module 'claude-code' {
  interface PluginState {
    devflow: {
      written: DevflowPlanWrite[]
      sentBack: string[]
    }
  }
}
