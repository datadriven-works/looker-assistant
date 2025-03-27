export interface AgentState {
  messages: Array<{
    role: string
    content: string
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
export * from './baseAgent'
