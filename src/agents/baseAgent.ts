import { Agent, Guardrail, Handoff, Tool } from './primitives'

/**
 * BaseAgent class implementing the Agent interface
 * This serves as a foundation for creating specific agent implementations
 */
export class BaseAgent implements Agent {
  name: string
  instructions: string
  tools?: Tool[]
  handoffDescription?: string
  handoffs?: Handoff[]
  inputGuardrails?: Guardrail[]
  outputGuardrails?: Guardrail[]
  model?: string
  modelSettings?: Record<string, unknown>

  /**
   * Create a new BaseAgent
   *
   * @param name Name of the agent
   * @param instructions Instructions for the agent (system prompt)
   * @param options Additional options for the agent
   */
  constructor(
    name: string,
    instructions: string,
    options?: {
      tools?: Tool[]
      handoffDescription?: string
      handoffs?: Handoff[]
      inputGuardrails?: Guardrail[]
      outputGuardrails?: Guardrail[]
      model?: string
      modelSettings?: Record<string, unknown>
    }
  ) {
    this.name = name
    this.instructions = instructions
    this.tools = options?.tools
    this.handoffDescription = options?.handoffDescription
    this.handoffs = options?.handoffs
    this.inputGuardrails = options?.inputGuardrails
    this.outputGuardrails = options?.outputGuardrails
    this.model = options?.model
    this.modelSettings = options?.modelSettings
  }

  /**
   * Convert this agent to a handoff that can be used by other agents
   *
   * @returns A Handoff object pointing to this agent
   */
  asHandoff(): Handoff {
    return {
      targetAgent: this,
      description: this.handoffDescription || `Handoff to ${this.name}`,
    }
  }

  /**
   * Get the system prompt for this agent
   *
   * @returns The formatted system prompt
   */
  getSystemPrompt(): string {
    let prompt = this.instructions

    // Add information about available tools
    if (this.tools && this.tools.length > 0) {
      prompt += '\n\nYou have access to the following tools:\n'
      this.tools.forEach((tool) => {
        prompt += `\n- ${tool.name}: ${tool.description}`
      })
    }

    // Add information about handoffs
    if (this.handoffs && this.handoffs.length > 0) {
      prompt += '\n\nYou can hand off to the following agents when appropriate:\n'
      this.handoffs.forEach((handoff) => {
        prompt += `\n- ${
          typeof handoff.targetAgent === 'string' ? handoff.targetAgent : handoff.targetAgent.name
        }: ${handoff.description}`
      })
    }

    return prompt
  }
}
