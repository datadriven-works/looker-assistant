import { FunctionResponse } from '../../slices/assistantSlice'
import { ExploreEmbed } from '../ExploreEmbed'
const FunctionCallResponseMessage = ({ message }: { message: FunctionResponse }) => {
  console.log('FunctionCallResponseMessage', message)
  if (message.name === 'get_explore_query') {
    const response = message.response
    console.log('FunctionCallResponseMessage - Response', response)
    return (
      <ExploreEmbed
        modelName={response.model}
        exploreId={response.view}
        exploreParams={{
          fields: response.fields,
          filters: response.filters,
          pivots: response.pivots,
          vis_config: response.vis_config,
          sorts: response.sorts,
          limit: response.limit,
          filter_expression: response.filter_expression,
        }}
      />
    )
  }
  return <></>
}
export default FunctionCallResponseMessage
