/**
 * Primitives for the Agent system based on OpenAI Agents SDK design
 */

import { GenerateContentParams, MessagePart } from '../hooks/useGenerateContent'
import { GeminiModelResponse } from './runner'

/**
 * Parameter definition for a tool
 */
export interface ParameterDefinition {
  type: string
  name?: string
  description?: string
  enum?: string[]
  required?: string[]
  properties?: any
}

/**
 * Tool interface - represents a capability that an Agent can use
 */
export interface Tool {
  name: string
  description: string
  parameters: ParameterDefinition
  execute: (params?: Record<string, unknown>) => Promise<any>
  showInThread?: boolean
}

/**
 * Output type definition for structured outputs
 */
export interface OutputTypeDefinition {
  type: string
  description?: string
  required?: boolean
  properties?: Record<string, OutputTypeDefinition>
  items?: OutputTypeDefinition
}

/**
 * Agent interface - represents an LLM-powered agent that can be run
 */
export interface Agent {
  // Agent identity
  name: string
  description: string

  // Optional system prompt override
  getSystemPrompt?: () => Promise<string>

  // Model settings
  modelSettings?: {
    model?: string
    temperature?: number
    maxOutputTokens?: number
    topP?: number
  }

  // Optional output type definition for structured outputs
  outputType?: Record<string, { type: string; description?: string }>

  // Optional guardrails for input/output
  inputGuardrails?: Guardrail[]
  outputGuardrails?: Guardrail[]

  // Optional tools the agent can use
  tools?: Tool[]

  // Optional handoffs this agent can perform
  handoffs?: Handoff[]

  // Optional description of when this agent should handoff
  handoffDescription?: string

  // optional list of messages to inject into the conersation before the turn.
  // this is useful to pass in context into the conversation that is only needed for the turn
  injectMessages?: MessagePart[]
}

/**
 * Handoff interface - enables delegation between agents
 */
export interface Handoff {
  // The agent to hand off to
  targetAgent: Agent

  // Description of when this handoff should be used
  description?: string

  // Optional filter to determine if handoff should be allowed
  filter?: (input: string | MessagePart[], context?: RunContext) => Promise<boolean>
}

/**
 * Guardrail interface - validates inputs/outputs to agents
 */
export interface Guardrail {
  // Name of the guardrail
  name: string

  // Description of what this guardrail checks
  description: string

  // Function to validate input or output
  validate: (
    input: string | MessagePart[] | unknown,
    context?: RunContext
  ) => Promise<GuardrailResult>
}

/**
 * GuardrailResult interface - result of a guardrail validation
 */
export interface GuardrailResult {
  // Whether the guardrail was triggered (true = blocked)
  tripwireTriggered: boolean

  // Additional information about why the guardrail was triggered
  info?: Record<string, unknown>

  // Optional message to show to the user if tripwire was triggered
  message?: string
}

/**
 * RunContext interface - context for an agent run
 */
export interface RunContext {
  // Conversation history
  messages?: MessagePart[]

  // Original query that started this conversation
  originalQuery?: string

  // Visited nodes in the graph of agents
  visitedNodes?: string[]

  // Custom data that can be accessed by agents, tools, and guardrails
  state?: Record<string, unknown> & {
    // Generate content function that can be used by the Runner
    generateContent?: (params: GenerateContentParams) => Promise<GeminiModelResponse[]>

    // Any other state properties
    [key: string]: unknown
  }
}

/**
 * Tool call result
 */
export interface ToolCall {
  name: string
  parameters: Record<string, unknown>
  result: unknown
  showInThread?: boolean
}

/**
 * AgentResult interface - result of an agent run
 */
export interface AgentResult {
  // Final output text from the agent
  finalOutput: string

  // Whether a handoff was performed
  handoffPerformed: boolean

  // If handoff was performed, which agent was it handed off to
  handoffAgent?: { agentName: string | Agent; reason: string }

  // The tool calls that were made during the run
  toolCalls?: ToolCall[]

  // Updated context after the run
  context?: RunContext

  // Items that should be returned to the UI for display
  returnItems?: unknown[]
}
