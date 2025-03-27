/**
 * Primitives for the Agent system based on OpenAI Agents SDK design
 */

/**
 * Message interface for conversation history
 */
export interface Message {
  role: string
  content: string
}

/**
 * Parameter definition for a tool
 */
export interface ParameterDefinition {
  type: string
  description?: string
  enum?: string[]
  required?: boolean
}

/**
 * Tool interface - represents a capability that an Agent can use
 */
export interface Tool {
  name: string
  description: string
  parameters: Record<string, ParameterDefinition>
  execute: (params: Record<string, unknown>) => Promise<unknown>
}

/**
 * Agent interface - represents an LLM equipped with instructions and tools
 */
export interface Agent {
  // Basic properties
  name: string
  instructions: string

  // Tools that this agent can use
  tools?: Tool[]

  // Handoff capabilities
  handoffDescription?: string
  handoffs?: Handoff[]

  // Safety features
  inputGuardrails?: Guardrail[]
  outputGuardrails?: Guardrail[]

  // Model configuration
  model?: string
  modelSettings?: Record<string, unknown>

  // Methods
  run: (input: string | Message[], context?: RunContext) => Promise<AgentResult>
  asHandoff: () => Handoff // Convert this agent to a handoff
}

/**
 * Handoff interface - enables delegation between agents
 */
export interface Handoff {
  // The agent to hand off to
  targetAgent: string | Agent

  // Description of when this handoff should be used
  description: string

  // Optional filter to determine if handoff should be allowed
  filter?: (input: string | Message[], context?: RunContext) => Promise<boolean>
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
  validate: (input: string | Message[] | unknown, context?: RunContext) => Promise<GuardrailResult>
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
  messages?: Message[]

  // Original query that started this conversation
  originalQuery?: string

  // Visited nodes in the graph of agents
  visitedNodes?: string[]

  // Custom data that can be accessed by agents, tools, and guardrails
  state?: Record<string, unknown>
}

/**
 * Tool call result
 */
export interface ToolCall {
  name: string
  parameters: Record<string, unknown>
  result: unknown
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
  handoffAgent?: string

  // The tool calls that were made during the run
  toolCalls?: ToolCall[]

  // Updated context after the run
  context?: RunContext
}
