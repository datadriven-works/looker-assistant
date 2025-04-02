import { FunctionResponse } from '../../slices/assistantSlice'
import { ExploreEmbed } from '../ExploreEmbed'
const FunctionCallResponseMessage = ({ message }: { message: FunctionResponse }) => {
  console.log('FunctionCallResponseMessage', message)
  if (message.name === 'get_explore_query') {
    const response = message.response
    return (
      <ExploreEmbed
        modelName={response.modelName}
        exploreId={response.exploreId}
        exploreParams={response.exploreParams}
      />
    )
  }
  return <></>
}
export default FunctionCallResponseMessage
