import { useSelector } from 'react-redux'
import { RootState } from '../store'
import { useCallback, useEffect, useRef } from 'react'
import FunctionCallMessage from './ChatSurface/FunctionCallMessage'
import FunctionCallResponseMessage from './ChatSurface/FunctionCallResponseMessage'
import Message from './ChatSurface/Message'
import { LinearProgress } from '@mui/material'

const Thread = () => {
  const { isQuerying, thread } = useSelector((state: RootState) => state.assistant)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      try {
        // Use both methods for better browser compatibility
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })

        // Find scrollable parent as fallback
        let parent = messagesEndRef.current.parentElement
        while (parent) {
          const hasScrollableContent = parent.scrollHeight > parent.clientHeight
          if (hasScrollableContent && getComputedStyle(parent).overflowY === 'auto') {
            parent.scrollTop = parent.scrollHeight
            break
          }
          parent = parent.parentElement
        }
      } catch (error) {
        console.error('Failed to scroll to bottom:', error)
      }
    }
  }, [])

  // Add a short delay to ensure content is fully rendered before scrolling
  const delayedScrollToBottom = useCallback(() => {
    setTimeout(scrollToBottom, 100)
  }, [scrollToBottom])

  // Scroll when messages change
  useEffect(() => {
    delayedScrollToBottom()
  }, [thread?.messages, delayedScrollToBottom])

  // Scroll on initial load
  useEffect(() => {
    delayedScrollToBottom()
  }, [])

  const messages = thread?.messages || []

  return (
    <div className="flex flex-col min-h-full py-4 space-y-4">
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
        return null
      })}
      {isQuerying && (
        <div className="flex flex-col w-64 text-gray-300">
          <LinearProgress />
        </div>
      )}
      <div ref={messagesEndRef} className="h-0 w-full clear-both" />
    </div>
  )
}

export default Thread
