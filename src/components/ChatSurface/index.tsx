import Thread from '../Thread'
import PromptInput from '../PromptInput'
import { useDispatch, useSelector } from 'react-redux'
import { useCallback, useEffect, useRef } from 'react'
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
import { Agent } from '../../agents/primitives'

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

  const { query, isQuerying, thread, user } = useSelector(
    (state: RootState) => state.assistant as AssistantState
  )

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

      // *****************************************************
      // AGENT ARCHITECTURE EXPLANATION:
      //
      // There are two ways to use agents in this system:
      //
      // 1. Direct usage: Call agent.handleMessage() directly
      //    - You manage the execution yourself
      //    - You handle tool calls and multi-turn interactions
      //    - Good for simple use cases or custom flows
      //
      // 2. Runner-managed (what we're using here):
      //    - Use Runner.run(agent, messages, options)
      //    - The Runner manages the entire execution flow
      //    - Takes care of tools, guardrails, handoffs, etc.
      //    - Best for complex interactions and standard flows
      //
      // The handleMessage method is only used in the first approach
      // *****************************************************

      const userAgent: Agent = {
        name: 'UserAssistant',
        description: 'A helpful assistant that answers questions directly.',
        getSystemPrompt: async () => {
          return 'You know everything about the user. You are a helpful assistant that answers questions directly.'
        },
        modelSettings: {
          model: 'gemini-2.0-flash',
        },
        handleMessage: async () => {
          return {
            finalOutput: '',
            handoffPerformed: false,
          }
        },
      }

      // Create a basic agent with no handoff capabilities
      const basicAgent: Agent = {
        name: 'BasicAssistant',
        description: 'A helpful assistant that answers questions directly.',

        // Return a system prompt for the agent
        getSystemPrompt: async () => {
          return "You are a helpful, concise assistant. Provide accurate and useful information to the user's questions. You can perform calculations and get current time when needed."
        },

        // Basic model settings
        modelSettings: {
          model: 'gemini-2.0-flash',
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.95,
        },

        handoffs: [
          {
            targetAgent: userAgent,
            description:
              'Always handoff to the user assistant if there is a question around the user like their groups, names, etc.',
          },
        ],

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

        // handleMessage is required by the Agent interface, but not used when
        // using the Runner.run() method. The Runner takes care of the entire execution flow.
        handleMessage: async () => {
          // This is just a placeholder to satisfy the interface requirement
          console.log(`Note: This handleMessage method is not used when using Runner.run()`)
          return {
            finalOutput: '',
            handoffPerformed: false,
          }
        },
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
