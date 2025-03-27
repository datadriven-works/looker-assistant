import { FunctionCall } from '../../slices/assistantSlice'
import Chip from '@mui/material/Chip'
import clsx from 'clsx'

const FunctionCallMessage = ({ message }: { message: FunctionCall }) => {
  return (
    <div className={`flex justify-start mb-4`}>
      <div className={`max-w-[70%]`}>
        <div className={clsx('rounded-lg p-3 max-w-xl')}>
          <Chip label={message.name.replace(/_/g, ' ')} />
        </div>
      </div>
    </div>
  )
}

export default FunctionCallMessage
