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

const generateHistory = (messages: ChatMessage[]) => {
  const history: any[] = []
  messages.forEach((oneMessage: ChatMessage) => {
    const parts = []
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

  const { query, isQuerying, thread } = useSelector(
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

    const initialMessage: TextMessage = {
      uuid: uuidv4(),
      message: query,
      actor: 'user',
      createdAt: Date.now(),
      type: 'text',
    }
    dispatch(addMessage(initialMessage))

    const responseMessage: TextMessage = {
      uuid: uuidv4(),
      message: 'Echo: ' + query,
      actor: 'model',
      createdAt: Date.now(),
      type: 'text',
    }
    dispatch(addMessage(responseMessage))
    const contentList: ChatMessage[] = [...(thread?.messages || [])]
    const tools: any[] = []
    const systemInstruction = ''

    const response = await generateContent({
      contents: generateHistory(contentList),
      tools,
      systemInstruction,
    })

    console.log(response)

    dispatch(setIsQuerying(false))
    dispatch(setQuery(''))

    // scroll to bottom of message thread
    scrollIntoView()
  }, [dispatch, query])

  useEffect(() => {
    if (!query || query === '') {
      return
    }

    submitMessage()
    scrollIntoView()
  }, [query])

  return (
    <>
      <div className="flex-grow overflow-y-auto max-h-full mb-36 ">
        <div className="max-w-4xl mx-auto mt-8">
          <Thread endOfMessagesRef={endOfMessagesRef} />
        </div>
      </div>
      <div
        className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 w-4/5  transition-all duration-300 ease-in-out mb-10`}
      >
        <PromptInput />
      </div>
    </>
  )
}

export default ChatSurface
