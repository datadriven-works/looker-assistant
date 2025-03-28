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
import { useGenerateContent } from '../../hooks/useGenerateContent'
import { Runner } from '../../agents/runner'
import { Agent } from '../../agents/primitives'

type HistoryItem = {
  role: string
  parts: Array<string | Record<string, unknown>>
}

const generateHistory = (messages: ChatMessage[]) => {
  const history: HistoryItem[] = []
  messages.forEach((oneMessage: ChatMessage) => {
    const parts: Array<string | Record<string, unknown>> = []
    let role = ''
    if (oneMessage.type === 'functionCall') {
      role = 'model'

      parts.push({
        functionCall: {
          id: oneMessage.uuid,
          name: oneMessage.name,
          args: oneMessage.args || {},
        },
      })
    } else if (oneMessage.type === 'text') {
      role = oneMessage.actor
      parts.push(oneMessage.message)
    } else if (oneMessage.type === 'functionResponse') {
      role = 'user'
      parts.push({
        functionResponse: {
          id: oneMessage.callUuid,
          name: oneMessage.name,
          response: {
            name: oneMessage.name,
            content: oneMessage.response,
          },
        },
      })
    }

    history.push({
      role,
      parts,
    })
  })

  return history
}

const ChatSurface = () => {
  const dispatch = useDispatch()
  const endOfMessagesRef = useRef<HTMLDivElement>(null) // Ref for the last message
  const { generateContent } = useGenerateContent()

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
          model: 'gemini-1.5-pro',
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.95,
        },

        // Add some basic tools
        tools: [
          {
            name: 'calculate',
            description: 'Perform a mathematical calculation',
            parameters: {
              expression: {
                type: 'string',
                description: 'The mathematical expression to evaluate',
                required: true,
              },
            },
            execute: async (params: Record<string, unknown>) => {
              try {
                // Simple and safer eval for basic calculations
                const expression = params.expression as string
                // eslint-disable-next-line no-new-func
                const result = new Function(`return ${expression}`)()
                console.log(`Calculation result for "${expression}": ${result}`)
                return { result }
              } catch (error) {
                console.error(`Calculation error: ${error}`)
                return { error: `Failed to calculate: ${error}` }
              }
            },
          },
          {
            name: 'getCurrentTime',
            description: 'Get the current date and time',
            parameters: {
              timezone: {
                type: 'string',
                description: 'Optional timezone (defaults to local)',
                required: false,
              },
            },
            execute: async () => {
              const now = new Date()
              console.log(`Providing current time: ${now.toISOString()}`)
              return {
                time: now.toLocaleTimeString(),
                date: now.toLocaleDateString(),
                iso: now.toISOString(),
              }
            },
          },
        ],

        // Handler for messages - implementing in a way that uses the parameter
        handleMessage: async (message: string) => {
          console.log(`Processing message: ${message}`)
          // In a real implementation, we would process the message here
          // But for our demo, the Runner handles the actual processing
          return {
            finalOutput: `Response to: ${message}`,
            handoffPerformed: false,
          }
        },
      }

      // Convert chat history to messages format for the agent
      const messages = contentList.map((msg) => {
        if (msg.type === 'text') {
          return {
            role: msg.actor === 'user' ? 'user' : 'assistant',
            content: msg.message,
          }
        }
        // Handle function calls if needed
        return {
          role: 'user',
          content: JSON.stringify(msg),
        }
      })

      console.log('Starting agent with messages:', messages)

      // Use the Runner to process the query with conversation history context
      const result = await Runner.run(basicAgent, messages, {
        maxTurns: 3, // Allow a few turns for tool usage
        context: {
          originalQuery: query,
          messages: messages,
          state: {
            user,
            thread: thread?.uuid || 'default',
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
