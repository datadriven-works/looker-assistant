import Thread from '../Thread'
import PromptInput from '../PromptInput'
import { useDispatch, useSelector } from 'react-redux'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  addMessage,
  AssistantState,
  ChatMessage,
  setIsQuerying,
  setQuery,
  TextMessage,
} from '../../slices/assistantSlice'
import { RootState } from '../../store'
import { v4 as uuidv4 } from 'uuid'
import { generateContent, MessagePart } from '../../hooks/useGenerateContent'
import { Runner } from '../../agents/runner'
import { Agent, Handoff } from '../../agents/primitives'

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
  const endOfMessagesRef = useRef<HTMLDivElement>(null) // Ref for the last message

  const { query, isQuerying, thread, user, semanticModels, dashboard } = useSelector(
    (state: RootState) => state.assistant as AssistantState
  )

  const isMountedOnDashboard = useMemo(() => {
    return dashboard?.id && dashboard?.elementId
  }, [dashboard])

  const scrollIntoView = useCallback(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [endOfMessagesRef])

  useEffect(() => {
    scrollIntoView()
  }, [dispatch, query, isQuerying])

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

      const injectedExploreAgentMessages: MessagePart[] = []

      Object.keys(semanticModels).forEach((exploreKey) => {
        const explore = semanticModels[exploreKey]
        injectedExploreAgentMessages.push({
          role: 'user',
          parts: [
            `The explore ${exploreKey} has the following dimensions: ${explore.dimensions
              .map((dimension) => dimension.name)
              .join(', ')}`,
            `The explore ${exploreKey} has the following measures: ${explore.measures
              .map((measure) => measure.name)
              .join(', ')}`,
          ],
        })
      })

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

      const exploreAgent: Agent = {
        name: 'ExploreAgent',
        description:
          'You know everything about the Looker explores that the user is able to see. Including the defined dimensions and measures.',
        getSystemPrompt: async () => {
          return 'You are a helpful assistant that can answer questions about the Looker explores that the user is able to see. Including the defined dimensions and measures.'
        },
        modelSettings: {
          model: 'gemini-2.0-flash',
        },
        handoffDescription:
          'Always handoff to the explore agent if there is a question looker explore related. Questions like "What dimensions are there in the explore?", "What measures are there in the explore?", "What is the total revenue for the explore?", etc. There might also be questions like "What explore should I use to answer this question?"',
        injectMessages: injectedExploreAgentMessages,
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
          targetAgent: exploreAgent,
        },
      ]

      let basicAgentSystemPrompt =
        "You are a helpful, concise assistant. Provide accurate and useful information to the user's questions. You are embedded in Looker, which is a Business Intelligence tool made by Google. You are either in stand-alone mode, or embedded in a dashboard. If you are embedded in a dashboard, you can answer questions about the dashboard. If you are in stand-alone mode, you can answer questions about Looker. You can also perform calculations and get current time when needed. You have the ability to handoff to other agents who are going to be experts in their respective fields."

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

    // scroll to bottom of message thread
    scrollIntoView()
  }, [dispatch, query, thread?.messages, generateContent, user])

  useEffect(() => {
    if (!query || query === '') {
      return
    }

    submitMessage()
    scrollIntoView()
  }, [query])

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-grow overflow-y-auto max-h-full">
        <div className="max-w-4xl mx-auto mt-8">
          <Thread endOfMessagesRef={endOfMessagesRef} />
        </div>
      </div>
      <div
        className={`flex justify-center duration-300 ease-in-out py-5 bg-gray-50 border-t border-gray-200 shadow-t-sm`}
      >
        <PromptInput />
      </div>
    </div>
  )
}

export default ChatSurface
