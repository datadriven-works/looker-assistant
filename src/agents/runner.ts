import { generateContent, MessagePart } from '../hooks/useGenerateContent'
import { Agent, AgentResult, Guardrail, GuardrailResult, RunContext, ToolCall } from './primitives'
import { v4 as uuidv4 } from 'uuid'
/**
 * Result of running a single step in the agent loop
 */
interface SingleStepResult {
  // The original input that was used
  originalInput: MessagePart[]

  // The model's response for this step
  modelResponse: unknown

  // The items that were generated during this step
  generatedItems: unknown[]

  // Items that should be returned to the UI for display
  returnItems: unknown[]

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

export interface GeminiModelResponse {
  text?: string
  functionCall?: {
    name: string
    args: Record<string, unknown>
  }
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
    input: string | MessagePart[],
    options: {
      context?: RunContext
      maxTurns?: number
      hooks?: RunHooks
      runConfig?: RunConfig
    } = {}
  ): Promise<AgentResult> {
    const { context, maxTurns = this.DEFAULT_MAX_TURNS, hooks = {}, runConfig = {} } = options

    let currentTurn = 0
    let originalInput: MessagePart[] = []

    if (typeof input === 'string') {
      originalInput = [{ role: 'user', parts: [input] }]
    } else {
      originalInput = input
    }

    let generatedItems: unknown[] = []
    let returnItems: unknown[] = [] // Track items to return to the UI

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
              originalInput,
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
            shouldRunAgentStartHooks,
            returnItems // Pass the returnItems array
          )
        } else {
          turnResult = await this.runSingleTurn(
            currentAgent,
            originalInput,
            generatedItems,
            hooks,
            contextWrapper,
            shouldRunAgentStartHooks,
            returnItems // Pass the returnItems array
          )
        }

        shouldRunAgentStartHooks = false
        originalInput = turnResult.originalInput
        generatedItems = turnResult.generatedItems
        returnItems = turnResult.returnItems // Update returnItems from the turn result

        console.log('turnResult', turnResult)

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
            toolCalls: generatedItems.filter(
              (item) =>
                typeof item === 'object' && item !== null && 'name' in item && 'parameters' in item
            ) as ToolCall[], // Include all tool calls from generated items
            context: contextWrapper.context,
            returnItems, // Include the accumulated returnItems
          }
        } else if (turnResult.nextStep.type === 'handoff') {
          currentAgent = turnResult.nextStep.newAgent
          shouldRunAgentStartHooks = true
        } else if (turnResult.nextStep.type === 'run_again') {
          // Just continue the loop
          console.log('run_again')
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
    input: string | MessagePart[],
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
    input: MessagePart[],
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
    _agent: Agent,
    guardrail: Guardrail,
    input: MessagePart[],
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
    _agent: Agent,
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
    originalInput: MessagePart[],
    generatedItems: unknown[],
    hooks: RunHooks,
    contextWrapper: { context?: RunContext },
    shouldRunAgentStartHooks: boolean,
    returnItems: unknown[]
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
    const messages: MessagePart[] = []

    // add any inject messages as context in the conversation
    if (agent.injectMessages && agent.injectMessages.length > 0) {
      messages.push(...agent.injectMessages)
    }

    // Add all messages from the input
    messages.push(...originalInput)

    // add the generated items as messages
    if (generatedItems && generatedItems.length > 0) {
      generatedItems.forEach((item) => {
        // add function calls
        if (typeof item === 'object' && item !== null && 'name' in item && 'parameters' in item) {
          const itemUuid = uuidv4()

          // this was a tool call
          messages.push({
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: itemUuid,
                  name: item.name,
                  args: item.parameters || {},
                },
              },
            ],
          })

          // add the result of the tool call as a message
          if ('result' in item) {
            messages.push({
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    id: itemUuid,
                    name: item.name,
                    response: {
                      name: item.name,
                      content: item.result,
                    },
                  },
                },
              ],
            })
          }
        } else {
          // add the generated item as a message
        }
      })
    }

    console.log('originalInput', originalInput)
    console.log('messages', messages)

    // 3. Use the model to get a response
    try {
      // Prepare handoffs for the model
      const handoffTools =
        agent.handoffs?.map((handoff) => ({
          name: `handoff_to_${
            typeof handoff.targetAgent === 'string' ? handoff.targetAgent : handoff.targetAgent.name
          }`,
          description: handoff.description || handoff.targetAgent?.handoffDescription || '',
          parameters: {
            type: 'OBJECT',
            properties: {
              reason: {
                type: 'STRING',
                description: 'Reason for handing off to this agent',
              },
            },
            required: ['reason'],
          },
        })) || []

      // Combine all tools
      const allTools = [...(agent.tools || []), ...handoffTools]

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

      console.log('About to generate content with messages', messages)

      // Call the model
      const modelResponse = await generateContent({
        contents: messages,
        parameters: modelParameters,
        responseSchema,
        tools: allTools.length > 0 ? allTools : undefined,
        modelName: agent.modelSettings?.model || 'gemini-2.0-flash',
        systemInstruction: systemPrompt,
      })

      // 4. Process the response to determine next steps
      const processedResponse = await this.processModelResponse(modelResponse)

      // 5. Handle tool calls, output generation, or handoffs
      if (processedResponse.handoffAgent) {
        // If there's a handoff, create a handoff next step
        const handoffAgent = this.getHandoffAgent(processedResponse.handoffAgent.agentName, agent)
        returnItems.push({
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'handoff',
                args: {
                  agentName: processedResponse.handoffAgent.agentName,
                  reason: processedResponse.handoffAgent.reason,
                },
              },
            },
          ],
        })
        return {
          originalInput,
          modelResponse: processedResponse,
          generatedItems,
          returnItems,
          nextStep: {
            type: 'handoff',
            newAgent: handoffAgent,
          },
        }
      } else if (processedResponse.toolCalls && processedResponse.toolCalls.length > 0) {
        console.log('toolCalls', processedResponse.toolCalls)
        // If there are tool calls, execute them and create a run again step
        const executedToolCalls = await this.executeToolCalls(
          processedResponse.toolCalls,
          agent,
          hooks,
          contextWrapper
        )

        console.log('executedToolCalls', executedToolCalls)

        // Add any tool calls marked with showInThread to returnItems
        for (const toolCall of executedToolCalls) {
          if (toolCall.showInThread) {
            returnItems.push(toolCall)
          }
        }

        // Add the tool calls to generated items
        const newItems = [...generatedItems, ...executedToolCalls]

        console.log('newItems', newItems)

        return {
          originalInput,
          modelResponse: processedResponse,
          generatedItems: newItems,
          returnItems,
          nextStep: { type: 'run_again' },
        }
      } else {
        // Otherwise, this is a final output
        return {
          originalInput,
          modelResponse: processedResponse,
          generatedItems,
          returnItems,
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
    modelResponse: GeminiModelResponse[]
  ): Promise<AgentResult> {
    // Handle different response formats
    let finalOutput = ''
    let toolCalls: ToolCall[] = []
    let handoffAgent: { agentName: string | Agent; reason: string } | undefined

    try {
      // Process any textual responses
      let responseText = ''
      modelResponse.forEach((oneResponse: GeminiModelResponse) => {
        if (oneResponse.text) {
          responseText += oneResponse.text
        }
      })

      // Find function calls in the response
      toolCalls = modelResponse
        .filter((oneResponse: GeminiModelResponse) => oneResponse.functionCall !== undefined)
        .map((oneResponse: GeminiModelResponse) => ({
          name: oneResponse.functionCall?.name || '',
          parameters: oneResponse.functionCall?.args || {},
          result: null,
        }))

      // Check for handoff function calls
      const handoffCall = toolCalls.find((call) => call.name.startsWith('handoff_to_'))
      if (handoffCall) {
        // Extract the agent name from the function call name (remove 'handoff_to_' prefix)
        const agentName = handoffCall.name.substring('handoff_to_'.length)
        handoffAgent = {
          agentName: agentName,
          reason: handoffCall.parameters.reason as string,
        }
        console.log(
          `Handoff requested to agent: ${agentName}, reason: ${handoffCall.parameters.reason}`
        )
      }

      // Filter out handoff function calls from the toolCalls list
      toolCalls = toolCalls.filter((call) => !call.name.startsWith('handoff_to_'))

      if (responseText && responseText.trim() !== '') {
        // Legacy format
        finalOutput = responseText
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
  ): Promise<
    Array<{
      name: string
      parameters: Record<string, unknown>
      result: unknown
      showInThread?: boolean
    }>
  > {
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
            showInThread: tool.showInThread,
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
            showInThread: tool.showInThread,
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
          showInThread: false,
        })
      }
    }

    return results
  }

  /**
   * Get an agent for a handoff
   */
  private static getHandoffAgent(handoffTarget: string | Agent, currentAgent?: Agent): Agent {
    if (typeof handoffTarget === 'string') {
      // Try to find the handoff target in the current agent's handoffs
      if (currentAgent && currentAgent.handoffs) {
        const handoff = currentAgent.handoffs.find((h) => {
          if (typeof h.targetAgent === 'string') {
            return h.targetAgent === handoffTarget
          } else {
            return h.targetAgent.name === handoffTarget
          }
        })

        if (handoff) {
          return typeof handoff.targetAgent === 'string'
            ? ({ name: handoff.targetAgent } as unknown as Agent) // This is a temporary placeholder since we don't have a real agent registry
            : handoff.targetAgent
        }
      }

      // If we get here, we couldn't find the agent
      throw new Error(`Cannot find handoff agent named ${handoffTarget}`)
    } else {
      return handoffTarget
    }
  }
}
