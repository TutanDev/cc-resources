// The session values the dmf hooks keep: which agents loaded an implementation
// skill, the C# files written since the turn last ended, and whether a dmf
// reviewer ran since then or the turn was already sent back to run one.
export type DmfReview = 'none' | 'ran' | 'asked'

declare module 'claude-code' {
  interface PluginState {
    dmf: { guided: string[]; unreviewed: string[]; review: DmfReview }
  }
}
