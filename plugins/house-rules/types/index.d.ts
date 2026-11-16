// The session value the house-rules hooks keep: the agents that loaded the
// unslop skill in this conversation, each `main` or a subagent's id.
export type UnsloppedAgents = string[]

declare module 'claude-code' {
  interface PluginState {
    'house-rules': {
      unslopped: UnsloppedAgents
    }
  }
}
