import Thread from '../Thread'
import PromptInput from '../PromptInput'
import { useDispatch, useSelector } from 'react-redux'
import { useCallback, useEffect, useRef } from 'react'
import { AssistantState, setIsQuerying, setQuery } from '../../slices/assistantSlice'
import { RootState } from '../../store'

const ChatSurface = () => {
  const dispatch = useDispatch()
  const endOfMessagesRef = useRef<HTMLDivElement>(null) // Ref for the last message

  const { query, isQuerying } = useSelector((state: RootState) => state.assistant as AssistantState)

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

    // PROCESS THE QUERY

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
          <Thread />
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
