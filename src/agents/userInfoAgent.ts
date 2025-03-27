import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatOpenAI } from '@langchain/openai'
import { AgentState } from './types'
import { RunnableSequence } from '@langchain/core/runnables'
import { StringOutputParser } from '@langchain/core/output_parsers'

/**
 * Creates the system prompt for the user information agent
 */
const createSystemPrompt = (): string => {
  return `You are a specialized User Information Agent that handles queries about user-specific data.
Your focus is on responding to questions about the user's:
- Account information
- Personal settings
- Usage history
- Preferences
- Other user-specific information

Provide personalized, specific answers when you have the information required.
If you don't have enough information to answer a user-specific question, politely explain that you'll need more details.

When responding, maintain a helpful, friendly, and professional tone.`
}

/**
 * Formats the user message and history for the user information agent
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
 * Creates the user information agent
 *
 * @returns A runnable sequence that handles user information queries
 */
export function createUserInfoAgent() {
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
