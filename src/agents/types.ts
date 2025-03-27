import { RunnableConfig } from '@langchain/core/runnables'

// Define message types
export interface ChatMessage {
  content: string
  role: 'user' | 'assistant' | 'system' | 'function'
}

// State for the agent system
export interface AgentState {
  messages: ChatMessage[]
  agentType?: 'triage' | 'userInfo' | 'generalKnowledge'
}

// Function to create a new agent state
export function createAgentState(): AgentState {
  return {
    messages: [],
  }
}

// ConfigWithMetadata type for tracking execution
export type ConfigWithMetadata = RunnableConfig & {
  metadata?: Record<string, unknown>
}

// Agent system nodes
export enum AgentNodes {
  TRIAGE = 'triage',
  USER_INFO = 'userInfo',
  GENERAL_KNOWLEDGE = 'generalKnowledge',
}
