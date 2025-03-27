import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { AgentState } from './types'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'

/**
 * Creates the system prompt for the general knowledge agent
 */
const createSystemPrompt = (): string => {
  return `You are a specialized General Knowledge Agent that handles queries about factual information and general topics.
Your focus is on responding to questions about:
- Facts and information
- How-to guides and processes
- Concepts and explanations
- General advice
- Any topic that doesn't require user-specific data

Provide comprehensive, accurate information based on your knowledge.
When you're uncertain, acknowledge the limits of your knowledge rather than making up information.

When responding, use a clear, informative, and educational tone.`
}

/**
 * Formats the user message and history for the general knowledge agent
 */
const formatMessages = (state: AgentState) => {
  // Format the messages for the prompt template
  const formattedMessages = state.messages
    .filter((msg) => msg.role === 'user')
    .map((msg) => msg.content)
    .join('\n\n')

  // Get the most recent user message
  const latestUserMessage = state.messages.filter((msg) => msg.role === 'user').pop()?.content || ''

  return {
    history: formattedMessages,
    input: latestUserMessage,
  }
}

/**
 * Creates the general knowledge agent
 *
 * @returns A runnable sequence that handles general knowledge queries
 */
export function createGeneralKnowledgeAgent() {
  // Create the LLM instance
  const llm = new ChatOpenAI({
    modelName: 'gpt-4-turbo',
    temperature: 0.7, // A bit of temperature for natural responses
  })

  // Create the prompt template
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', createSystemPrompt()],
    ['human', 'Previous conversation (if any):\n{history}\n\nCurrent query: {input}'],
  ])

  // Create the runnable sequence
  return RunnableSequence.from([
    {
      // Preprocess the input to extract what we need
      input: (state: AgentState) => formatMessages(state),
    },
    promptTemplate,
    llm,
    new StringOutputParser(),
  ])
}
