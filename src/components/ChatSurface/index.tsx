import Thread from '../Thread'
import PromptInput from '../PromptInput'
import { useDispatch, useSelector } from 'react-redux'
import { useCallback, useContext, useEffect, useMemo } from 'react'
import {
  addMessage,
  AssistantState,
  ChatMessage,
  setIsQuerying,
  setQuery,
  TextMessage,
  FunctionCall,
  FunctionResponse,
} from '../../slices/assistantSlice'
import { RootState } from '../../store'
import { v4 as uuidv4 } from 'uuid'
import { generateContent, MessagePart } from '../../hooks/useGenerateContent'
import { Runner } from '../../agents/runner'
import { Agent, Handoff, ToolCall } from '../../agents/primitives'
import { buildExploreAgent } from '../../agents/exploreAgent'
import { ExtensionContext } from '@looker/extension-sdk-react'

// Ensure our generateHistory function correctly maps to MessagePart objects
const generateHistory = (messages: ChatMessage[]): MessagePart[] => {
  return messages.map((oneMessage: ChatMessage): MessagePart => {
    // Default to user role if we can't determine
    let role: 'user' | 'model' = 'user'
    let parts: Array<string | Record<string, unknown>> = []

    if (oneMessage.type === 'functionCall') {
      role = 'model'
      parts = [
        {
          functionCall: {
            id: oneMessage.uuid,
            name: oneMessage.name,
            args: oneMessage.args || {},
          },
        },
      ]
    } else if (oneMessage.type === 'text') {
      // Ensure role is either 'user' or 'model'
      role = oneMessage.actor === 'user' ? 'user' : 'model'
      parts = [oneMessage.message]
    } else if (oneMessage.type === 'functionResponse') {
      role = 'user'
      parts = [
        {
          functionResponse: {
            id: oneMessage.callUuid,
            name: oneMessage.name,
            response: {
              name: oneMessage.name,
              content: oneMessage.response,
            },
          },
        },
      ]
    }

    // Cast to satisfy TypeScript - we know our structure matches what's expected
    return {
      role,
      parts,
    } as MessagePart
  })
}

const ChatSurface = () => {
  const dispatch = useDispatch()

  const { core40SDK: lookerSDK } = useContext(ExtensionContext)

  const { query, thread, user, semanticModels, dashboard } = useSelector(
    (state: RootState) => state.assistant as AssistantState
  )

  const isMountedOnDashboard = useMemo(() => {
    return dashboard?.id && dashboard?.elementId
  }, [dashboard])

  const submitMessage = useCallback(async () => {
    if (query === '') {
      return
    }

    dispatch(setQuery(query))
    dispatch(setIsQuerying(true))

    const initialMessage: TextMessage = {
      uuid: uuidv4(),
      message: query,
      actor: 'user',
      createdAt: Date.now(),
      type: 'text',
    }
    dispatch(addMessage(initialMessage))
    const contentList: ChatMessage[] = [...(thread?.messages || [])]
    contentList.push(initialMessage)

    try {
      // Process the query with our agent system
      console.log('Processing with agent system...')

      const injectedDashboardAgentMessages: MessagePart[] = []
      if (isMountedOnDashboard) {
        injectedDashboardAgentMessages.push(
          {
            role: 'user',
            parts: [
              'Here are the details about the dashboard you are embedded in: ' +
                dashboard?.data.map((query) => query.queryTitle).join(', ') +
                '\n \n Here is the description of the dashboard: ' +
                dashboard?.description,
            ],
          },
          {
            role: 'user',
            parts: ['Here is the data for the dashboard: ' + JSON.stringify(dashboard?.data)],
          }
        )
      }

      const dashboardAgent: Agent = {
        name: 'DashboardAgent',
        description: 'You know everything about the Looker dashboard that the user is able to see.',
        getSystemPrompt: async () => {
          return 'You are a helpful assistant that can answer questions about the Looker dashboard that the user is able to see.'
        },
        injectMessages: injectedDashboardAgentMessages,
        modelSettings: {
          model: 'gemini-2.0-flash',
        },
        handoffDescription:
          'The assistant is mounted on a dashboard. If the user asks about the dashboard, handoff to this agent.',
      }

      const userAgent: Agent = {
        name: 'UserAssistant',
        description: 'A helpful assistant that answers questions directly.',
        getSystemPrompt: async () => {
          return (
            'You know everything about the user. You are a helpful assistant that answers questions directly. Here is all the information you know about the user: ' +
            JSON.stringify(user)
          )
        },
        modelSettings: {
          model: 'gemini-2.0-flash',
        },
        handoffDescription:
          'Always handoff to the user assistant if there is a question around the user like their groups, names, etc.',
      }

      // Create a basic agent with no handoff capabilities
      const handoffs: Handoff[] = [
        {
          targetAgent: userAgent,
        },
        {
          targetAgent: buildExploreAgent(semanticModels, lookerSDK),
        },
      ]

      let basicAgentSystemPrompt =
        "You are a helpful, concise assistant. Provide accurate and useful information to the user's questions. You are embedded in Looker, which is a Business Intelligence tool made by Google. You are either in stand-alone mode, or embedded in a dashboard. If you are embedded in a dashboard, you can answer questions about the dashboard. If you are in stand-alone mode, you can answer questions about Looker. You can also perform calculations and get current time when needed. You have the ability to handoff to other agents who are going to be experts in their respective fields. If you are asked to run a tool that is not available, you should handoff to the correct agent"

      if (isMountedOnDashboard) {
        basicAgentSystemPrompt +=
          'You are embedded in a dashboard. If the user asks about the dashboard, handoff to the dashboard agent.'
        handoffs.push({
          targetAgent: dashboardAgent,
        })
      }

      console.log('handoffs', handoffs)

      const basicAgent: Agent = {
        name: 'BasicAssistant',
        description: 'A helpful assistant that answers questions directly.',

        // Return a system prompt for the agent
        getSystemPrompt: async () => {
          return basicAgentSystemPrompt
        },

        // Basic model settings
        modelSettings: {
          model: 'gemini-2.0-flash',
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.95,
        },

        handoffs,

        // Add some basic tools
        tools: [
          {
            name: 'getCurrentTime',
            description: 'Get the current date and time',
            parameters: {
              type: 'OBJECT',
              properties: {
                timezone: {
                  type: 'STRING',
                  description: 'Optional timezone (defaults to local)',
                },
              },
              required: ['timezone'],
            },
            showInThread: true,
            execute: async (params) => {
              const now = new Date()
              // Use the timezone parameter if provided
              const timezone = params?.timezone as string | undefined

              console.log(
                `Providing current time: ${now.toISOString()}${
                  timezone ? ` in timezone ${timezone}` : ''
                }`
              )

              let timeDisplay, dateDisplay

              if (timezone) {
                // Format with the specified timezone
                try {
                  timeDisplay = now.toLocaleTimeString(undefined, { timeZone: timezone })
                  dateDisplay = now.toLocaleDateString(undefined, { timeZone: timezone })
                } catch (error) {
                  // Fallback if timezone is invalid
                  console.error(`Invalid timezone: ${timezone}. Using local timezone.`)
                  timeDisplay = now.toLocaleTimeString()
                  dateDisplay = now.toLocaleDateString()
                }
              } else {
                // Use local timezone
                timeDisplay = now.toLocaleTimeString()
                dateDisplay = now.toLocaleDateString()
              }

              return [
                {
                  text: `Current time: ${timeDisplay}, Date: ${dateDisplay}, ISO: ${now.toISOString()}${
                    timezone ? ` (Timezone: ${timezone})` : ''
                  }`,
                },
              ]
            },
          },
        ],
      }

      // Use the Runner to process the query with conversation history context
      const result = await Runner.run(basicAgent, generateHistory(contentList), {
        maxTurns: 5, // Allow a few turns for tool usage
        context: {
          originalQuery: query,
          messages: generateHistory(contentList),
          state: {
            user,
            thread: thread.uuid,
          },
        },
      })

      console.log('Agent response:', result)

      // Process any return items that should be shown in the thread
      if (result.returnItems && result.returnItems.length > 0) {
        for (const item of result.returnItems) {
          // Check if it's a tool call
          if (typeof item === 'object' && item !== null && 'name' in item && 'parameters' in item) {
            const toolCall = item as ToolCall

            // Add the function call to the thread
            const functionCallMessage: FunctionCall = {
              uuid: uuidv4(),
              name: toolCall.name,
              args: toolCall.parameters,
              createdAt: Date.now(),
              type: 'functionCall',
            }
            dispatch(addMessage(functionCallMessage))

            // Also add the function response to the thread
            const functionResponseMessage: FunctionResponse = {
              uuid: uuidv4(),
              callUuid: functionCallMessage.uuid,
              name: toolCall.name,
              response: toolCall.result,
              createdAt: Date.now(),
              type: 'functionResponse',
            }
            dispatch(addMessage(functionResponseMessage))
          }
        }
      }

      const responseText = result.finalOutput

      const responseMessage: TextMessage = {
        uuid: uuidv4(),
        message: responseText,
        actor: 'model',
        createdAt: Date.now(),
        type: 'text',
      }
      dispatch(addMessage(responseMessage))
    } catch (error) {
      console.error('Error processing with agent system:', error)

      // Fallback to the original content generation if agent system fails
      const tools: Array<Record<string, unknown>> = []
      const systemInstruction = ''

      console.log(contentList)
      console.log(generateHistory(contentList))

      const response = await generateContent({
        contents: generateHistory(contentList),
        tools,
        systemInstruction,
      })

      // Process any textual responses
      let responseText = ''
      response.forEach((oneResponse: { text?: string }) => {
        if (oneResponse.text) {
          responseText += oneResponse.text
        }
      })

      const responseMessage: TextMessage = {
        uuid: uuidv4(),
        message: responseText,
        actor: 'model',
        createdAt: Date.now(),
        type: 'text',
      }
      dispatch(addMessage(responseMessage))
    }

    dispatch(setIsQuerying(false))
    dispatch(setQuery(''))
  }, [dispatch, query, thread?.messages, generateContent, user])

  useEffect(() => {
    if (!query || query === '') {
      return
    }

    submitMessage()
  }, [query])

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-grow overflow-hidden relative">
        <div className="absolute inset-0 max-w-4xl mx-auto overflow-y-auto scroll-smooth">
          <Thread />
        </div>
      </div>
      <div className="flex justify-center py-5 bg-gray-50 border-t border-gray-200 shadow-md">
        <PromptInput />
      </div>
    </div>
  )
}

export default ChatSurface
