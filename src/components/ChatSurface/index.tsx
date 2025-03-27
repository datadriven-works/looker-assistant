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
import { processAgentQuery } from '../../agents'

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
      // Process the query with our agent system, passing the generateContent function and user data
      const responseText = await processAgentQuery(query, generateContent, user)

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
