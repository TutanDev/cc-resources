// The types of plan-structure.mjs, for the hooks module that imports it.

export type PlanProblem = {
  // The 1-based line the problem is on, or the line of the heading under which
  // the missing part belongs.
  line: number
  // What is wrong and what to write instead; it never names a line number.
  message: string
}

export declare function checkPlan(text: string): PlanProblem[]
