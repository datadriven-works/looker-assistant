import {
  Agent,
  AgentResult,
  Guardrail,
  GuardrailResult,
  Message,
  RunContext,
  ToolCall,
} from './primitives'

/**
 * Result of running a single step in the agent loop
 */
interface SingleStepResult {
  // The original input that was used
  originalInput: string | Message[]

  // The model's response for this step
  modelResponse: unknown

  // The items that were generated during this step
  generatedItems: unknown[]

  // What to do next
  nextStep: NextStep
}

/**
 * Base type for next steps
 */
type NextStep = NextStepFinalOutput | NextStepHandoff | NextStepRunAgain

/**
 * Next step that indicates the agent produced a final output
 */
interface NextStepFinalOutput {
  type: 'final_output'
  output: string | unknown
}

/**
 * Next step that indicates a handoff to another agent
 */
interface NextStepHandoff {
  type: 'handoff'
  newAgent: Agent
}

/**
 * Next step that indicates the agent should be run again
 */
interface NextStepRunAgain {
  type: 'run_again'
}

/**
 * Result of running a guardrail
 */
interface GuardrailCheckResult {
  // The guardrail that was run
  guardrail: Guardrail

  // The output of the guardrail
  output: GuardrailResult
}

/**
 * Error thrown when a guardrail tripwire is triggered
 */
export class GuardrailTripwireTriggered extends Error {
  result: GuardrailCheckResult

  constructor(result: GuardrailCheckResult) {
    super(`Guardrail tripwire triggered: ${result.guardrail.name}`)
    this.result = result
    this.name = 'GuardrailTripwireTriggered'
  }
}

/**
 * Error thrown when the maximum number of turns is exceeded
 */
export class MaxTurnsExceeded extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MaxTurnsExceeded'
  }
}

/**
 * Configuration for a run
 */
export interface RunConfig {
  // Name of the workflow for tracing purposes
  workflowName?: string

  // ID for the trace
  traceId?: string

  // Group ID for the trace
  groupId?: string

  // Additional metadata for the trace
  traceMetadata?: Record<string, unknown>

  // Whether tracing is disabled
  tracingDisabled?: boolean

  // Additional input guardrails to run
  inputGuardrails?: Guardrail[]

  // Additional output guardrails to run
  outputGuardrails?: Guardrail[]

  // Model to use (overrides the agent's model)
  model?: string

  // Model settings to use (merged with the agent's settings)
  modelSettings?: Record<string, unknown>
}

/**
 * Lifecycle hooks for a run
 */
export interface RunHooks {
  // Called when an agent starts
  onAgentStart?: (context: RunContext, agent: Agent) => Promise<void>

  // Called when a tool is about to be called
  onToolStart?: (
    context: RunContext,
    agent: Agent,
    tool: { name: string; description: string },
    params: Record<string, unknown>
  ) => Promise<void>

  // Called when a tool call completes
  onToolEnd?: (
    context: RunContext,
    agent: Agent,
    tool: { name: string; description: string },
    params: Record<string, unknown>,
    result: unknown
  ) => Promise<void>
}

/**
 * Tool call interface
 */
// Interface moved to imports from primitives

/**
 * Runner class for executing agents and managing their workflows
 */
export class Runner {
  /**
   * Default maximum number of turns to run an agent
   */
  private static DEFAULT_MAX_TURNS = 10

  /**
   * Run an agent asynchronously with the given input and context
   *
   * The agent will run in a loop until a final output is generated. The loop runs like so:
   * 1. The agent is invoked with the given input.
   * 2. If there is a final output, the loop terminates.
   * 3. If there's a handoff, we run the loop again, with the new agent.
   * 4. Else, we run tool calls (if any), and re-run the loop.
   *
   * @param startingAgent The agent to run
   * @param input The input to the agent (string or message array)
   * @param options Additional options for the run
   * @returns Promise resolving to the result of the agent run
   */
  static async run(
    startingAgent: Agent,
    input: string | Message[],
    options: {
      context?: RunContext
      maxTurns?: number
      hooks?: RunHooks
      runConfig?: RunConfig
    } = {}
  ): Promise<AgentResult> {
    const { context, maxTurns = this.DEFAULT_MAX_TURNS, hooks = {}, runConfig = {} } = options

    let currentTurn = 0
    let originalInput = this.deepCopy(input)
    let generatedItems: unknown[] = []

    const contextWrapper = { context }

    let currentAgent = startingAgent
    let shouldRunAgentStartHooks = true

    try {
      while (currentTurn < maxTurns) {
        currentTurn++

        console.debug(`Running agent ${currentAgent.name} (turn ${currentTurn})`)

        let turnResult: SingleStepResult

        if (currentTurn === 1) {
          // For the first turn, run input guardrails
          try {
            await this.runInputGuardrails(
              startingAgent,
              [...(startingAgent.inputGuardrails || []), ...(runConfig.inputGuardrails || [])],
              this.deepCopy(input),
              contextWrapper
            )
          } catch (error) {
            if (error instanceof GuardrailTripwireTriggered) {
              // If a guardrail is triggered, return early
              throw error
            }
            console.error('Error running input guardrails:', error)
          }

          turnResult = await this.runSingleTurn(
            currentAgent,
            originalInput,
            generatedItems,
            hooks,
            contextWrapper,
            shouldRunAgentStartHooks
          )
        } else {
          turnResult = await this.runSingleTurn(
            currentAgent,
            originalInput,
            generatedItems,
            hooks,
            contextWrapper,
            shouldRunAgentStartHooks
          )
        }

        shouldRunAgentStartHooks = false
        originalInput = turnResult.originalInput
        generatedItems = turnResult.generatedItems

        if (turnResult.nextStep.type === 'final_output') {
          try {
            await this.runOutputGuardrails(
              [...(currentAgent.outputGuardrails || []), ...(runConfig.outputGuardrails || [])],
              currentAgent,
              turnResult.nextStep.output,
              contextWrapper
            )
          } catch (error) {
            if (error instanceof GuardrailTripwireTriggered) {
              // If a guardrail is triggered, return early
              throw error
            }
            console.error('Error running output guardrails:', error)
          }

          // Ensure the final output is a string
          const finalOutput =
            typeof turnResult.nextStep.output === 'string'
              ? turnResult.nextStep.output
              : String(turnResult.nextStep.output)

          return {
            finalOutput,
            handoffPerformed: false,
            toolCalls: [], // In a real implementation, you'd track tool calls
            context: contextWrapper.context,
          }
        } else if (turnResult.nextStep.type === 'handoff') {
          currentAgent = turnResult.nextStep.newAgent
          shouldRunAgentStartHooks = true
        } else if (turnResult.nextStep.type === 'run_again') {
          // Just continue the loop
        } else {
          const nextStepType = (turnResult.nextStep as { type: string }).type
          throw new Error(`Unknown next step type: ${nextStepType}`)
        }
      }

      throw new MaxTurnsExceeded(`Max turns (${maxTurns}) exceeded`)
    } catch (error) {
      // Re-throw guardrail and max turns errors
      if (error instanceof GuardrailTripwireTriggered || error instanceof MaxTurnsExceeded) {
        throw error
      }

      // For any other error, wrap it
      console.error('Error running agent:', error)
      throw new Error(
        `Error running agent: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Run an agent synchronously (blocking) with the given input and context
   *
   * @param startingAgent The agent to run
   * @param input The input to the agent (string or message array)
   * @param options Additional options for the run
   * @returns The result of the agent run
   */
  static runSync(
    startingAgent: Agent,
    input: string | Message[],
    options: {
      context?: RunContext
      maxTurns?: number
      hooks?: RunHooks
      runConfig?: RunConfig
    } = {}
  ): AgentResult {
    // In browser or Node.js environments, we can't truly run synchronously
    // This is a simplified version that assumes the async function completes quickly
    let result: AgentResult | undefined
    let error: unknown

    const promise = this.run(startingAgent, input, options)
    promise.then(
      (res) => {
        result = res
      },
      (err) => {
        error = err
      }
    )

    // In a real implementation, you'd need to properly handle synchronous execution
    // This is not truly synchronous and would require different approaches depending on the environment

    if (error) {
      throw error
    }

    if (!result) {
      throw new Error('Agent execution failed or did not complete synchronously')
    }

    return result
  }

  /**
   * Run input guardrails for an agent
   */
  private static async runInputGuardrails(
    agent: Agent,
    guardrails: Guardrail[],
    input: string | Message[],
    contextWrapper: { context?: RunContext }
  ): Promise<GuardrailCheckResult[]> {
    if (!guardrails || guardrails.length === 0) {
      return []
    }

    const guardrailPromises = guardrails.map((guardrail) =>
      this.runSingleInputGuardrail(agent, guardrail, input, contextWrapper)
    )

    const results: GuardrailCheckResult[] = []

    for (const promise of guardrailPromises) {
      try {
        const result = await promise
        if (result.output.tripwireTriggered) {
          throw new GuardrailTripwireTriggered(result)
        }
        results.push(result)
      } catch (error) {
        if (error instanceof GuardrailTripwireTriggered) {
          throw error
        }
        console.error('Error running guardrail:', error)
      }
    }

    return results
  }

  /**
   * Run a single input guardrail
   */
  private static async runSingleInputGuardrail(
    agent: Agent,
    guardrail: Guardrail,
    input: string | Message[],
    contextWrapper: { context?: RunContext }
  ): Promise<GuardrailCheckResult> {
    try {
      const output = await guardrail.validate(input, contextWrapper.context)
      return { guardrail, output }
    } catch (error) {
      console.error(`Error running guardrail ${guardrail.name}:`, error)
      throw error
    }
  }

  /**
   * Run output guardrails for an agent
   */
  private static async runOutputGuardrails(
    guardrails: Guardrail[],
    agent: Agent,
    output: unknown,
    contextWrapper: { context?: RunContext }
  ): Promise<GuardrailCheckResult[]> {
    if (!guardrails || guardrails.length === 0) {
      return []
    }

    const guardrailPromises = guardrails.map((guardrail) =>
      this.runSingleOutputGuardrail(guardrail, agent, output, contextWrapper)
    )

    const results: GuardrailCheckResult[] = []

    for (const promise of guardrailPromises) {
      try {
        const result = await promise
        if (result.output.tripwireTriggered) {
          throw new GuardrailTripwireTriggered(result)
        }
        results.push(result)
      } catch (error) {
        if (error instanceof GuardrailTripwireTriggered) {
          throw error
        }
        console.error('Error running guardrail:', error)
      }
    }

    return results
  }

  /**
   * Run a single output guardrail
   */
  private static async runSingleOutputGuardrail(
    guardrail: Guardrail,
    agent: Agent,
    output: unknown,
    contextWrapper: { context?: RunContext }
  ): Promise<GuardrailCheckResult> {
    try {
      const result = await guardrail.validate(output, contextWrapper.context)
      return { guardrail, output: result }
    } catch (error) {
      console.error(`Error running guardrail ${guardrail.name}:`, error)
      throw error
    }
  }

  /**
   * Run a single turn of the agent loop
   */
  private static async runSingleTurn(
    agent: Agent,
    originalInput: string | Message[],
    generatedItems: unknown[],
    hooks: RunHooks,
    contextWrapper: { context?: RunContext },
    shouldRunAgentStartHooks: boolean
  ): Promise<SingleStepResult> {
    // Run agent start hooks if needed
    if (shouldRunAgentStartHooks && hooks.onAgentStart) {
      await hooks.onAgentStart(contextWrapper.context!, agent)
    }

    // 1. Get the system prompt from the agent
    const systemPrompt = agent.getSystemPrompt
      ? await agent.getSystemPrompt()
      : 'You are a helpful AI assistant.'

    // 2. Prepare the input including all generated items
    const messages: Array<{ role: string; content: string }> = []

    // Format original input as messages
    if (typeof originalInput === 'string') {
      messages.push({
        role: 'user',
        content: originalInput,
      })
    } else {
      // Add all messages from the input
      messages.push(...originalInput)
    }

    // Add all generated items as messages
    if (generatedItems && generatedItems.length > 0) {
      // Transform tool calls and results into messages
      for (const item of generatedItems) {
        if (typeof item === 'object' && item !== null) {
          const toolCall = item as Record<string, unknown>

          // Add assistant message for tool call
          if (toolCall.name) {
            messages.push({
              role: 'assistant',
              content: `I'll help you with that by using the ${String(toolCall.name)} tool.`,
            })

            // Add tool message with result
            if (toolCall.result !== undefined) {
              messages.push({
                role: 'tool',
                content: JSON.stringify(toolCall.result),
              })
            }
          }
        }
      }
    }

    // 3. Use the model to get a response
    try {
      // Import the generateContent function
      const { generateContent } = await import('../hooks/useGenerateContent').then((module) =>
        module.useGenerateContent()
      )

      // Prepare tools for the model
      const formattedTools =
        agent.tools?.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: Object.entries(tool.parameters).reduce(
            (acc, [key, def]) => {
              acc[key] = {
                type: def.type,
                description: def.description || '',
                required: def.required || false,
                enum: def.enum || undefined,
              }
              return acc
            },
            {} as Record<
              string,
              {
                type: string
                description: string
                required: boolean
                enum?: string[] | undefined
              }
            >
          ),
        })) || []

      // Prepare handoffs for the model
      const handoffTools =
        agent.handoffs?.map((handoff) => ({
          name: `handoff_to_${
            typeof handoff.targetAgent === 'string' ? handoff.targetAgent : handoff.targetAgent.name
          }`,
          description: handoff.description,
          parameters: {
            reason: {
              type: 'string',
              description: 'Reason for handing off to this agent',
              required: true,
            },
          },
        })) || []

      // Combine all tools
      const allTools = [...formattedTools, ...handoffTools]

      // Prepare model parameters
      const modelParameters = {
        temperature: (agent.modelSettings?.temperature as number) || 0.7,
        max_output_tokens: (agent.modelSettings?.maxOutputTokens as number) || 4096,
        top_p: (agent.modelSettings?.topP as number) || 0.95,
      }

      // Define a response schema if the agent has an output type
      const responseSchema = agent.outputType
        ? {
            type: 'object',
            properties: agent.outputType,
            required: Object.keys(agent.outputType || {}),
          }
        : null

      // Call the model
      const modelResponse = await generateContent({
        contents: messages,
        parameters: modelParameters,
        responseSchema,
        tools: allTools.length > 0 ? allTools : undefined,
        modelName: agent.modelSettings?.model || 'gemini-1.5-pro',
        systemInstruction: systemPrompt,
      })

      // 4. Process the response to determine next steps
      const processedResponse = await this.processModelResponse(modelResponse, agent)

      // 5. Handle tool calls, output generation, or handoffs
      if (processedResponse.handoffAgent) {
        // If there's a handoff, create a handoff next step
        const handoffAgent = this.getHandoffAgent(processedResponse.handoffAgent)
        return {
          originalInput,
          modelResponse: processedResponse,
          generatedItems,
          nextStep: {
            type: 'handoff',
            newAgent: handoffAgent,
          },
        }
      } else if (processedResponse.toolCalls && processedResponse.toolCalls.length > 0) {
        // If there are tool calls, execute them and create a run again step
        const executedToolCalls = await this.executeToolCalls(
          processedResponse.toolCalls,
          agent,
          hooks,
          contextWrapper
        )

        // Add the tool calls to generated items
        const newItems = [...generatedItems, ...executedToolCalls]

        return {
          originalInput,
          modelResponse: processedResponse,
          generatedItems: newItems,
          nextStep: { type: 'run_again' },
        }
      } else {
        // Otherwise, this is a final output
        return {
          originalInput,
          modelResponse: processedResponse,
          generatedItems,
          nextStep: {
            type: 'final_output',
            output: processedResponse.finalOutput,
          },
        }
      }
    } catch (error) {
      console.error('Error running model:', error)
      throw new Error(
        `Failed to run model: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Process the raw model response into a structured format
   */
  private static async processModelResponse(
    modelResponse: unknown,
    agent: Agent
  ): Promise<AgentResult> {
    // Handle different response formats
    let finalOutput = ''
    const toolCalls: ToolCall[] = []
    let handoffAgent: string | Agent | undefined

    try {
      // Type assertion to access properties
      const response = modelResponse as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string
              functionCall?: {
                name: string
                args?: Record<string, unknown>
              }
            }>
            text?: string
            structuredOutput?: {
              data?: unknown
            }
          }
        }>
        text?: string
      }

      // Check if the response contains tool calls
      if (response.candidates?.[0]?.content?.parts) {
        const parts = response.candidates[0].content.parts || []

        // Extract text content
        const textParts = parts.filter((part) => 'text' in part && part.text !== undefined)
        if (textParts.length > 0) {
          finalOutput = textParts.map((part) => part.text || '').join('\n')
        }

        // Extract function calls
        const functionParts = parts.filter(
          (part) => 'functionCall' in part && part.functionCall !== undefined
        )
        for (const part of functionParts) {
          if (part.functionCall) {
            const functionCall = part.functionCall
            const name = functionCall.name

            // Check if this is a handoff function call
            if (name.startsWith('handoff_to_')) {
              const targetAgentName = name.replace('handoff_to_', '')

              // Find the handoff agent
              const handoff = agent.handoffs?.find((h) => {
                const handoffName =
                  typeof h.targetAgent === 'string' ? h.targetAgent : h.targetAgent.name
                return handoffName === targetAgentName
              })

              if (handoff) {
                handoffAgent = handoff.targetAgent
              }
            } else {
              // Add as a tool call
              toolCalls.push({
                name,
                parameters: functionCall.args || {},
                result: null, // To be filled after execution
              })
            }
          }
        }
      } else if (response.candidates?.[0]?.content?.text) {
        // Simple text response
        finalOutput = response.candidates[0].content.text
      } else if (typeof response.candidates?.[0]?.content === 'string') {
        // Direct string response
        finalOutput = response.candidates[0].content as string
      } else if (response.text) {
        // Legacy format
        finalOutput = response.text
      } else {
        // Try to extract structured output
        const structuredOutput = response.candidates?.[0]?.content?.structuredOutput?.data
        if (structuredOutput) {
          finalOutput = JSON.stringify(structuredOutput)
        } else {
          console.warn('Unrecognized response format:', response)
          finalOutput = 'Unable to parse model response'
        }
      }
    } catch (error) {
      console.error('Error processing model response:', error)
      finalOutput = 'Error processing model response'
    }

    return {
      finalOutput,
      handoffPerformed: !!handoffAgent,
      handoffAgent,
      toolCalls,
      context: undefined,
    }
  }

  /**
   * Execute tool calls and return the results
   */
  private static async executeToolCalls(
    toolCalls: Array<{ name: string; parameters: Record<string, unknown> }>,
    agent: Agent,
    hooks: RunHooks,
    contextWrapper: { context?: RunContext }
  ): Promise<Array<{ name: string; parameters: Record<string, unknown>; result: unknown }>> {
    const results = []

    for (const toolCall of toolCalls) {
      // Find the tool in the agent's tools
      const tool = agent.tools?.find((t) => t.name === toolCall.name)

      if (tool) {
        try {
          // Run the onToolStart hook if it exists
          if (hooks.onToolStart) {
            await hooks.onToolStart(
              contextWrapper.context!,
              agent,
              { name: tool.name, description: tool.description },
              toolCall.parameters
            )
          }

          // Execute the tool
          const result = await tool.execute(toolCall.parameters)

          // Run the onToolEnd hook if it exists
          if (hooks.onToolEnd) {
            await hooks.onToolEnd(
              contextWrapper.context!,
              agent,
              { name: tool.name, description: tool.description },
              toolCall.parameters,
              result
            )
          }

          // Add the result to the tool call
          results.push({
            ...toolCall,
            result,
          })
        } catch (error) {
          console.error(`Error executing tool ${toolCall.name}:`, error)

          // Add the error to the result
          results.push({
            ...toolCall,
            result: {
              error: true,
              message: error instanceof Error ? error.message : String(error),
            },
          })
        }
      } else {
        console.warn(`Tool ${toolCall.name} not found`)

        // Add a not found error to the result
        results.push({
          ...toolCall,
          result: {
            error: true,
            message: `Tool ${toolCall.name} not found`,
          },
        })
      }
    }

    return results
  }

  /**
   * Get an agent for a handoff
   */
  private static getHandoffAgent(handoffTarget: string | Agent): Agent {
    if (typeof handoffTarget === 'string') {
      // In a real implementation, you would look up the agent by name
      // For now, we'll just throw an error
      throw new Error(`Cannot find handoff agent named ${handoffTarget}`)
    } else {
      return handoffTarget
    }
  }

  /**
   * Deep copy an object
   */
  private static deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj))
  }
}
