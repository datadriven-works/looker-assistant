/**
 * Configuration for the agent system
 */

export const DEFAULT_MODEL = 'gemini-2.0-flash'

/**
 * Configuration for the triage agent
 */
export const TRIAGE_AGENT_CONFIG = {
  modelName: DEFAULT_MODEL,
  temperature: 0, // Keep deterministic for routing
}

/**
 * Configuration for the user info agent
 */
export const USER_INFO_AGENT_CONFIG = {
  modelName: DEFAULT_MODEL,
  temperature: 0.7, // Allow for some creativity in responses
}

/**
 * Configuration for the general knowledge agent
 */
export const GENERAL_KNOWLEDGE_AGENT_CONFIG = {
  modelName: DEFAULT_MODEL,
  temperature: 0.7, // Allow for some creativity in responses
}

/**
 * Enable debug logging for the agent system
 */
export const DEBUG_ENABLED = process.env.AGENT_DEBUG === 'true'
