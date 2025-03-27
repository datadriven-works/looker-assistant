import { useSelector } from 'react-redux'
import { RootState } from '../store'
import ChatSurface from './ChatSurface'
import { Loading } from './Loading'
import { useMetadata } from '../hooks/useMetadata'
const Assistant = () => {
  const { isMetadataLoaded } = useSelector((state: RootState) => state.assistant)
  useMetadata()

  if (!isMetadataLoaded) {
    return <Loading />
  }

  return (
    <div className="flex flex-col h-full">
      <ChatSurface />
    </div>
  )
}

export default Assistant
