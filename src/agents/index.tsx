export interface AgentState {
  messages: Array<{
    role: string
    parts: Array<string | Record<string, unknown>>
  }>
  currentAgent: string
  visitedNodes: string[]
  originalQuery: string
  maxVisits: number
  // Add additional fields from the RunContext
  state?: Record<string, unknown>
}

// Export the AgentState to prevent circular references
export * from './primitives'
export * from './runner'
