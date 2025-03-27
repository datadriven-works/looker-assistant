/**
 * Configuration for the agent system
 */

/**
 * Get the OpenAI API key from environment variables
 */
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

/**
 * Configuration for the triage agent
 */
export const TRIAGE_AGENT_CONFIG = {
  modelName: process.env.TRIAGE_MODEL || 'gpt-4o-mini',
  apiKey: OPENAI_API_KEY,
  temperature: 0, // Keep deterministic for routing
}

/**
 * Configuration for the user info agent
 */
export const USER_INFO_AGENT_CONFIG = {
  modelName: process.env.USER_INFO_MODEL || 'gpt-4o-mini',
  apiKey: OPENAI_API_KEY,
  temperature: 0.7, // Allow for some creativity in responses
}

/**
 * Configuration for the general knowledge agent
 */
export const GENERAL_KNOWLEDGE_AGENT_CONFIG = {
  modelName: process.env.GENERAL_KNOWLEDGE_MODEL || 'gpt-4o-mini',
  apiKey: OPENAI_API_KEY,
  temperature: 0.7, // Allow for some creativity in responses
}

/**
 * Enable debug logging for the agent system
 */
export const DEBUG_ENABLED = process.env.AGENT_DEBUG === 'true'
