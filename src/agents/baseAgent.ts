import { Agent, AgentResult, Guardrail, Handoff, Message, RunContext, Tool } from './primitives'

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
   * Run the agent with the given input and context
   *
   * @param input Input to the agent (text or message array)
   * @param context Optional context for the agent run
   * @returns Promise resolving to the result of the agent run
   */
  async run(input: string | Message[], context?: RunContext): Promise<AgentResult> {
    // In a real implementation, this would:
    // 1. Apply input guardrails
    // 2. Process the input with the LLM
    // 3. Handle any tool calls
    // 4. Check for handoffs
    // 5. Apply output guardrails
    // 6. Return the result

    // This is a placeholder implementation
    return {
      finalOutput: "Placeholder implementation. This agent doesn't do anything yet.",
      handoffPerformed: false,
      toolCalls: [],
      context,
    }
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
