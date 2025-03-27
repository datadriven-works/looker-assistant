import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { AgentNodes, AgentState } from './types'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'

/**
 * Creates the system prompt for the triage agent
 */
const createSystemPrompt = (): string => {
  return `You are a triage agent responsible for directing user queries to the appropriate specialized agent.
Your job is to analyze the user's query and decide which agent should handle it:

1. User Information Agent: For questions about user-specific data, account information, settings, or anything related to the user's personal information or activity.
2. General Knowledge Agent: For questions about general topics, facts, how-to guides, or any information that is not specific to the user.

After analyzing the query, respond ONLY with one of these exact strings:
- "USER_INFO" - If the query is about user-specific information
- "GENERAL_KNOWLEDGE" - If the query is about general knowledge

Do not include any explanation or additional text in your response.`
}

/**
 * Creates the triage agent that determines where to route user queries
 *
 * @returns A runnable sequence that outputs "USER_INFO" or "GENERAL_KNOWLEDGE"
 */
export function createTriageAgent() {
  // Create the LLM instance
  const llm = new ChatOpenAI({
    modelName: 'gpt-4-turbo',
    temperature: 0, // We want deterministic routing
  })

  // Create the prompt template
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', createSystemPrompt()],
    ['human', '{input}'],
  ])

  // Create the runnable sequence
  return RunnableSequence.from([promptTemplate, llm, new StringOutputParser()])
}

/**
 * Determines the next node based on the triage result
 *
 * @param state - The current agent state
 * @returns The next node to route to
 */
export function routeToNextAgent(state: AgentState) {
  // Get the latest message from the assistant (the triage result)
  const lastMessage = state.messages[state.messages.length - 1]

  if (lastMessage.role !== 'assistant') {
    throw new Error('Expected last message to be from assistant')
  }

  // Determine the next node based on the triage result
  const triageResult = lastMessage.content.trim()

  if (triageResult === 'USER_INFO') {
    return AgentNodes.USER_INFO
  } else if (triageResult === 'GENERAL_KNOWLEDGE') {
    return AgentNodes.GENERAL_KNOWLEDGE
  } else {
    // If we get an unexpected result, default to general knowledge
    console.warn(`Unexpected triage result: ${triageResult}. Defaulting to general knowledge.`)
    return AgentNodes.GENERAL_KNOWLEDGE
  }
}
