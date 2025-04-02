import { useSelector } from 'react-redux'
import { RootState } from '../store'
import { useCallback, useEffect, useRef } from 'react'
import FunctionCallMessage from './ChatSurface/FunctionCallMessage'
import FunctionCallResponseMessage from './ChatSurface/FunctionCallResponseMessage'
import Message from './ChatSurface/Message'
import { LinearProgress } from '@mui/material'

const Thread = () => {
  const { isQuerying, thread } = useSelector((state: RootState) => state.assistant)

  // Create a ref for the thread container
  const threadContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    if (threadContainerRef?.current) {
      const container = threadContainerRef.current
      container.scrollTop = container.scrollHeight
    }
  }, [threadContainerRef])

  useEffect(() => {
    scrollToBottom()
  }, [thread?.messages, scrollToBottom])

  const messages = thread?.messages

  return (
    <div ref={threadContainerRef} className="relative overflow-y-auto h-full">
      {messages.map((message) => {
        if (message.type === 'functionCall') {
          return <FunctionCallMessage key={message.uuid} message={message} />
        } else if (message.type === 'functionResponse') {
          return <FunctionCallResponseMessage key={message.uuid} message={message} />
        } else if (message.type == 'text') {
          return (
            <Message
              key={message.uuid}
              message={message.message}
              actor={message.actor}
              createdAt={message.createdAt}
            />
          )
        }
      })}
      {isQuerying && (
        <div className="flex flex-col text-gray-300 size-8 w-64">
          <LinearProgress />
        </div>
      )}
    </div>
  )
}

export default Thread
