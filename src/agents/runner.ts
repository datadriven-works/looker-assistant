import { Agent, AgentResult, Guardrail, GuardrailResult, Message, RunContext } from './primitives'

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

    // In a real implementation, you would:
    // 1. Get the system prompt
    // 2. Prepare the input including all generated items
    // 3. Get the model response
    // 4. Process the response to determine next steps
    // 5. Handle tool calls, output generation, or handoffs

    // This is a simplified implementation
    const response = await agent.run(originalInput, contextWrapper.context)

    // Check if this is a final output or if we need another step
    if (response.handoffPerformed && response.handoffAgent) {
      // If a handoff was performed, create a handoff next step
      const handoffAgent = this.getHandoffAgent(response.handoffAgent)
      return {
        originalInput,
        modelResponse: response,
        generatedItems,
        nextStep: {
          type: 'handoff',
          newAgent: handoffAgent,
        },
      }
    } else if (response.toolCalls && response.toolCalls.length > 0) {
      // If tool calls were made, add them to generated items and create a run again step
      const newItems = [...generatedItems, ...response.toolCalls]
      return {
        originalInput,
        modelResponse: response,
        generatedItems: newItems,
        nextStep: { type: 'run_again' },
      }
    } else {
      // Otherwise, this is a final output
      return {
        originalInput,
        modelResponse: response,
        generatedItems,
        nextStep: {
          type: 'final_output',
          output: response.finalOutput,
        },
      }
    }
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
