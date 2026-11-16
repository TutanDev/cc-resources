// The session values the house-rules hooks keep.

// The agents that loaded the unslop skill in this conversation, each `main`
// or a subagent's id.
export type UnsloppedAgents = string[]

// What the person's latest prompt asked for, which opens a guarded change
// until their next prompt: a changelog's released sections and intro, and a
// version bump.
export type AskedFor = {
  changelog: boolean
  versionBump: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'house-rules': {
      unslopped: UnsloppedAgents
      askedFor: AskedFor
    }
  }
}
