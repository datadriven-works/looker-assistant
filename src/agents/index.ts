import {
  TRIAGE_AGENT_CONFIG,
  USER_INFO_AGENT_CONFIG,
  GENERAL_KNOWLEDGE_AGENT_CONFIG,
  DEBUG_ENABLED,
} from './config'

/**
 * Represents the supported agent types
 */
export enum AgentType {
  USER_INFO = 'USER_INFO',
  GENERAL_KNOWLEDGE = 'GENERAL_KNOWLEDGE',
}

/**
 * Creates the system prompt for the triage agent
 */
function createTriageSystemPrompt(): string {
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
 * Creates the system prompt for the user information agent
 */
function createUserInfoSystemPrompt(): string {
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
 * Creates the system prompt for the general knowledge agent
 */
function createGeneralKnowledgeSystemPrompt(): string {
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
 * Process a query through the multi-agent system using the generateContent function
 *
 * @param query The user's query
 * @param generateContent The function to use for content generation
 * @returns A response from the appropriate agent
 */
export async function processAgentQuery(
  query: string,
  generateContent: (params: {
    contents: Array<{ role: string; parts: Array<string> }>
    tools?: Array<Record<string, unknown>>
    systemInstruction?: string
    parameters?: Record<string, unknown>
  }) => Promise<Array<{ text?: string }>>
): Promise<string> {
  try {
    // Step 1: Determine agent type with triage agent
    const triageResponse = await generateContent({
      contents: [
        {
          role: 'user',
          parts: [query],
        },
      ],
      systemInstruction: createTriageSystemPrompt(),
      parameters: {
        temperature: TRIAGE_AGENT_CONFIG.temperature,
      },
    })

    // Extract triage result
    const agentTypeStr = triageResponse
      .map((item) => item.text || '')
      .join('')
      .trim()

    if (DEBUG_ENABLED) {
      console.log(`Triage result: ${agentTypeStr}`)
    }

    let systemPrompt: string
    let parameters: Record<string, unknown>

    // Determine which agent to use based on triage result
    if (agentTypeStr === 'USER_INFO') {
      systemPrompt = createUserInfoSystemPrompt()
      parameters = {
        temperature: USER_INFO_AGENT_CONFIG.temperature,
      }
    } else {
      // Default to general knowledge for any other response
      systemPrompt = createGeneralKnowledgeSystemPrompt()
      parameters = {
        temperature: GENERAL_KNOWLEDGE_AGENT_CONFIG.temperature,
      }
    }

    // Step 2: Get response from the specialized agent
    const specialistResponse = await generateContent({
      contents: [
        {
          role: 'user',
          parts: [query],
        },
      ],
      systemInstruction: systemPrompt,
      parameters,
    })

    // Extract and return the response text
    return specialistResponse
      .map((item) => item.text || '')
      .join('')
      .trim()
  } catch (error) {
    console.error('Error processing query with agents:', error)
    return 'Sorry, I encountered an error while processing your request. Please try again.'
  }
}

/**
 * For debugging - get information about the agent system
 */
export function getAgentSystemInfo(): string {
  return `Agent System Structure:
  
- Triage Agent: Routes queries to specialized agents
- User Information Agent: Handles user-specific queries
- General Knowledge Agent: Handles general knowledge queries

The system uses your existing generateContent function to communicate with the model.`
}
