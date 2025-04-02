import { FunctionResponse } from '../../slices/assistantSlice'
import { ExploreEmbed } from '../ExploreEmbed'
const FunctionCallResponseMessage = ({ message }: { message: FunctionResponse }) => {
  console.log('FunctionCallResponseMessage', message)
  if (message.name === 'get_explore_query') {
    const response = message.response
    console.log('FunctionCallResponseMessage - Response', response)

    let view = response.view
    if (view.includes(':')) {
      view = view.split(':')[1]
    }

    let model = response.model
    if (model.includes(':')) {
      model = model.split(':')[0]
    }

    return (
      <div className="my-4">
        <ExploreEmbed
          modelName={model}
          exploreId={view}
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
      </div>
    )
  }
  return <></>
}
export default FunctionCallResponseMessage
