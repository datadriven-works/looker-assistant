import { useSelector } from 'react-redux'
import { RootState } from '../store'
import { useCallback, useEffect } from 'react'
import FunctionCallMessage from './ChatSurface/FunctionCallMessage'
import FunctionCallResponseMessage from './ChatSurface/FunctionCallResponseMessage'
import Message from './ChatSurface/Message'
import { LinearProgress } from '@mui/material'

interface ThreadProps {
  endOfMessagesRef: React.RefObject<HTMLDivElement>
}
const Thread = ({ endOfMessagesRef }: ThreadProps) => {
  const { isQuerying, thread } = useSelector((state: RootState) => state.assistant)

  const scrollIntoView = useCallback(() => {
    if (endOfMessagesRef?.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [endOfMessagesRef])

  useEffect(() => {
    scrollIntoView()
  }, [thread?.messages])

  const messages = thread?.messages

  return (
    <div className="">
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
      <div ref={endOfMessagesRef} />
    </div>
  )
}

export default Thread
