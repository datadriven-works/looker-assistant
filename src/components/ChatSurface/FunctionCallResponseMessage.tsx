import { FunctionResponse } from '../../slices/assistantSlice'

const FunctionCallResponseMessage = ({ message }: { message: FunctionResponse }) => {
  console.log('FunctionCallResponseMessage', message)
  return <></>
}

export default FunctionCallResponseMessage
