import { FunctionCall } from '../../slices/assistantSlice'
import clsx from 'clsx'
import { SquareFunction } from 'lucide-react'

const FunctionCallMessage = ({ message }: { message: FunctionCall }) => {
  const functionName = message.name.replace(/_/g, ' ')
  // camel case to words
  const functionNameWords = functionName
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()

  return (
    <div className={`flex justify-start mb-2`}>
      <div className={`max-w-[70%]`}>
        <div
          className={clsx(
            'rounded-full border-gray-300 border px-2 py-1 text-xs cursor-pointer hover:bg-gray-100'
          )}
        >
          <div className="flex items-center gap-2">
            <SquareFunction className="w-4 h-4" />
            <span>{functionNameWords}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FunctionCallMessage
