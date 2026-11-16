// The session values the dmf hooks keep: which agents loaded an implementation
// skill and which the workflow skill, the C# files written since the turn last
// ended, and whether a dmf reviewer ran since then or the turn was already sent
// back to run one.
export type DmfReview = 'none' | 'ran' | 'asked'

// The token counts of one reviewer run, summed over every request it made.
export type DmfReviewerTokens = {
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
}

// How a reviewer run ended, as its turn.complete says.
export type DmfReviewerOutcome = 'answer' | 'aborted' | 'refusal' | 'error'

// One finished run of a dmf reviewer.
export type DmfReviewerRun = {
  // The run's turn id: unique, and the run's key in the store.
  id: string
  agentId: string
  // The agent type, `dmf:fp-reviewer` or `dmf:dmf-reviewer`.
  type: string
  // The Agent call's short description of the task.
  description: string
  // The project folder the session ran in.
  project: string
  endedAt: number
  durationMs: number
  outcome: DmfReviewerOutcome
  // Absent when nothing counted: an interrupt before the first response, an API error.
  model?: string
  tokens?: DmfReviewerTokens
  // The reviewer's report, cut at a limit when it is longer.
  output: string
  isOutputCut: boolean
}

// A dmf reviewer that started and has not ended yet.
export type DmfRunningReviewer = {
  agentId: string
  type: string
  description: string
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    dmf: {
      guided: string[]
      workflowGuided: string[]
      unreviewed: string[]
      review: DmfReview
      // The reviewer runs of this session and the earlier ones the store keeps, oldest first.
      reviewerRuns: Shaped<DmfReviewerRun[]>
      reviewersRunning: Shaped<DmfRunningReviewer[]>
      // The run whose report the /dmf-reviews pane shows; '' for the list.
      reviewerRunShown: string
    }
  }
}
