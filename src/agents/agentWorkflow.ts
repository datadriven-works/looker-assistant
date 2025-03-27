import { StateGraph, END } from '@langchain/langgraph'
import { AgentNodes, AgentState, ChatMessage, ConfigWithMetadata, createAgentState } from './types'
import { createTriageAgent, routeToNextAgent } from './triageAgent'
import { createUserInfoAgent } from './userInfoAgent'
import { createGeneralKnowledgeAgent } from './generalKnowledgeAgent'

/**
 * Processes a user message and updates the agent state
 *
 * @param state - The current agent state
 * @param message - The user message
 * @returns The updated agent state
 */
function processUserMessage(state: AgentState, message: string): AgentState {
  // Create a new user message
  const userMessage: ChatMessage = {
    content: message,
    role: 'user',
  }

  // Add the message to the state
  return {
    ...state,
    messages: [...state.messages, userMessage],
  }
}

/**
 * Processes an assistant message and updates the agent state
 *
 * @param state - The current agent state
 * @param message - The assistant message
 * @returns The updated agent state
 */
function processAssistantMessage(state: AgentState, message: string): AgentState {
  // Create a new assistant message
  const assistantMessage: ChatMessage = {
    content: message,
    role: 'assistant',
  }

  // Add the message to the state
  return {
    ...state,
    messages: [...state.messages, assistantMessage],
  }
}

/**
 * Creates the agent workflow graph
 *
 * @returns A StateGraph instance that orchestrates the agent workflow
 */
export function createAgentWorkflow() {
  // Create the agents
  const triageAgent = createTriageAgent()
  const userInfoAgent = createUserInfoAgent()
  const generalKnowledgeAgent = createGeneralKnowledgeAgent()

  // Create the workflow graph
  const workflow = new StateGraph({
    channels: {},
  })

  // Add the nodes to the graph
  workflow.addNode(AgentNodes.TRIAGE, async (state: AgentState) => {
    // Run the triage agent to categorize the query
    const latestUserMessage =
      state.messages.filter((msg: ChatMessage) => msg.role === 'user').pop()?.content || ''

    // Get the triage decision
    const triageResult = await triageAgent.invoke(latestUserMessage)

    // Update the state with the triage result
    return processAssistantMessage(
      {
        ...state,
        agentType: triageResult === 'USER_INFO' ? 'userInfo' : 'generalKnowledge',
      },
      triageResult
    )
  })

  workflow.addNode(AgentNodes.USER_INFO, async (state: AgentState) => {
    // Run the user information agent
    const response = await userInfoAgent.invoke(state)

    // Update the state with the response
    return processAssistantMessage(state, response)
  })

  workflow.addNode(AgentNodes.GENERAL_KNOWLEDGE, async (state: AgentState) => {
    // Run the general knowledge agent
    const response = await generalKnowledgeAgent.invoke(state)

    // Update the state with the response
    return processAssistantMessage(state, response)
  })

  // Define the edges of the graph
  workflow.addEdge(AgentNodes.TRIAGE, routeToNextAgent)

  // Add edges from specialized agents to END
  workflow.addEdge(AgentNodes.USER_INFO, END)
  workflow.addEdge(AgentNodes.GENERAL_KNOWLEDGE, END)

  // Set the entry point
  workflow.setEntryPoint(AgentNodes.TRIAGE)

  // Compile the graph
  return workflow.compile()
}

/**
 * Main function to process a user query through the agent workflow
 *
 * @param query - The user query text
 * @returns The agent's response
 */
export async function processQuery(query: string): Promise<string> {
  // Create the agent workflow
  const agentWorkflow = createAgentWorkflow()

  // Create the initial state
  const initialState = createAgentState()

  // Process the user message
  const stateWithUserMessage = processUserMessage(initialState, query)

  // Run the workflow
  const finalState = await agentWorkflow.invoke(stateWithUserMessage)

  // Get the last assistant message as the response
  const lastAssistantMessage = finalState.messages.filter((msg) => msg.role === 'assistant').pop()

  return lastAssistantMessage?.content || 'Sorry, I was unable to process your query.'
}
