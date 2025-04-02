import { generateContent, MessagePart } from '../hooks/useGenerateContent'
import { SemanticModel } from '../slices/assistantSlice'
import { Agent } from './primitives'

// Helper function for formatting row data
const formatRow = (field: any) => {
  return `| ${field.name || ''} | ${field.field_type || ''} | ${field.type || ''} | ${
    field.label || ''
  } | ${field.description || ''} | ${field.tags?.join(', ') || ''} |`
}

// Placeholder documentation variables - replace with actual documentation content in production
const looker_filter_doc = 'Looker filter documentation placeholder'
const looker_visualization_doc = 'Looker visualization documentation placeholder'
const looker_query_body = 'Looker query body documentation placeholder'

/**
 * Helper function to format explore data with dimensions and measures as a markdown table
 */
const formatExploreData = (dimensions: any[], measures: any[]): string => {
  return `
    Here are the dimensions and measures that are defined in this data set:
     | Field Id | Field Type | LookML Type | Label | Description | Tags |
     |------------|------------|-------------|-------|-------------|------|
     ${dimensions.map(formatRow).join('\n')}
     ${measures.map(formatRow).join('\n')}
     `
}

const findBestExplore = async (
  userRequest: string,
  semanticModels: {
    [exploreKey: string]: SemanticModel
  }
) => {
  const systemInstruction = `You are a helpful assistant that is an expert in Looker. You are given a user request and a list of semantic models. You need to find the best explore to answer the user request. You will return the explore id and model name.`

  let exploreListMarkdown =
    'Below is a list of explores that you can use to answer the user request.\n\n'
  Object.keys(semanticModels)
    .map((exploreKey) => {
      const oneExplore = semanticModels[exploreKey]
      const dimensions = oneExplore.dimensions
      const measures = oneExplore.measures

      exploreListMarkdown += `# Explore: ${exploreKey}\n\n`
      exploreListMarkdown += formatExploreData(dimensions, measures)
    })
    .join('\n')

  const contents = [
    {
      role: 'user',
      parts: [exploreListMarkdown],
    },
    {
      role: 'user',
      parts: [`Here is the user request: ${userRequest}`],
    },
  ]

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      modelName: { type: 'STRING', description: 'Model' },
      exploreId: { type: 'STRING', description: 'Explore Name' },
      reason: {
        type: 'STRING',
        description: 'Reason for choosing the explore',
      },
    },
    required: ['modelName', 'exploreId', 'reason'],
  }

  const response = await generateContent({
    contents: contents as MessagePart[],
    systemInstruction,
    responseSchema,
  })

  return response[0]['object']
}

const sanitizeExploreDefinition = ({
  modelName,
  exploreId,
  semanticModels,
}: {
  modelName: string
  exploreId: string
  semanticModels: { [exploreKey: string]: SemanticModel }
}) => {
  let model = modelName
  let view = exploreId

  // the model might contain the full explore key
  if (model.split(':').length > 1) {
    model = model.split(':')[0]
    view = model.split(':')[1]
  } else if (view.split(':').length > 1) {
    model = view.split(':')[0]
    view = view.split(':')[1]
  }

  const exploreKey = `${model}:${view}`

  if (!semanticModels[exploreKey]) {
    throw new Error(`Explore ${exploreKey} not found`)
  }

  return {
    exploreKey: exploreKey,
    model: model,
    view: view,
  }
}

const getExploreData = async ({
  userRequest,
  modelName,
  exploreId,
  semanticModels,
}: {
  userRequest: string
  modelName: string
  exploreId: string
  semanticModels: { [exploreKey: string]: SemanticModel }
}) => {
  // Get the resolved explore key directly, same as in get_explore_query
  const { exploreKey, model, view } = sanitizeExploreDefinition({
    modelName,
    exploreId,
    semanticModels,
  })
  const dimensions = semanticModels[exploreKey]?.dimensions || []
  const measures = semanticModels[exploreKey]?.measures || []

  console.log('Using explore key for data retrieval:', exploreKey)

  // First generate the explore query
  const exploreDefinition = await generateExploreQuery({
    userRequest,
    modelName: model,
    exploreId: view,
    dimensions,
    measures,
  })

  // Now use the explore definition to call the Looker API and get the raw data
  try {
    console.log('Running inline query with definition:', exploreDefinition)

    // This is where you would call the Looker API with the exploreDefinition
    // Example:
    // const rawData = await lookerClient.run_inline_query(exploreDefinition)

    // For now, return the explore definition since the API call implementation might be elsewhere
    return {
      queryDefinition: exploreDefinition,
      // rawData: rawData  // Uncomment and implement when the API integration is ready
    }
  } catch (error) {
    console.error('Error running Looker query:', error)
    throw error
  }
}

const generateExploreQuery = async ({
  userRequest,
  modelName,
  exploreId,
  dimensions,
  measures,
}: {
  userRequest: string
  modelName: string
  exploreId: string
  dimensions: any[]
  measures: any[]
}) => {
  const systemInstruction = `You are a helpful assistant that generates a Looker explore request body that answers the user question. The request body will be compatible with the Looker API endpoints for run_inline_query. It will use the dimensions/measures defined in the semantic model to create the explore.

    Your job is to generate a request body that is compatible with the Looker API endpoints for run_inline_query. You will do the following:
    * fields - figure out which fields need to be included
    * filters - based on the user question, figure out which filters need to be applied
    * filter_expression - based on the user question, figure out which filter expression needs to be applied
    * pivots - figure out which fields need to be pivoted by
    * sorts - figure out which fields need to be sorted by
    * vis_config - figure out which visualization needs to be applied
    

    You ABSOLUTELY MUST NOT include any fields that are not defined in the semantic model. 

    You ABSOLUTELY MUST use the filters and filter_expression fields to filter the data. Almost every question will require a filter.
    `

  const backgroundInformation = formatExploreData(dimensions, measures)

  const filterDocumentation = `
     ${looker_filter_doc}
    `

  const visualizationDocumentation = `
     ${looker_visualization_doc}
    `

  const queryBodyDocumentation = `
     ${looker_query_body}
    `

  const prompt = `${userRequest}`
  const contents = [
    {
      role: 'user',
      parts: [backgroundInformation],
    },
    {
      role: 'user',
      parts: [filterDocumentation],
    },
    {
      role: 'user',
      parts: [visualizationDocumentation],
    },
    {
      role: 'user',
      parts: [queryBodyDocumentation],
    },
    {
      role: 'user',
      parts: [`Generate the query body that answers the request: \n\n\n ${prompt}`],
    },
  ]

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      model: { type: 'STRING', default: modelName, description: 'Model' },
      view: { type: 'STRING', default: exploreId, description: 'Explore Name' },
      pivots: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Fields to pivot by. They must also be in the fields array.',
      },
      row_total: { type: 'STRING', description: 'Raw Total', default: '' },
      vis_config: {
        type: 'OBJECT',
        description:
          'Visualization configuration properties. These properties are typically opaque and differ based on the type of visualization used. There is no specified set of allowed keys. The values can be any type supported by JSON. A "type" key with a string value is often present, and is used by Looker to determine which visualization to present. Visualizations ignore unknown vis_config properties.',
        properties: {
          type: {
            type: 'STRING',
            description: 'The type of visualization to use',
            enum: [
              'looker_column',
              'looker_bar',
              'looker_scatter',
              'looker_line',
              'looker_area',
              'looker_pie',
              'looker_donut_multiples',
              'looker_google_map',
              'looker_grid',
            ],
          },
        },
        additionalProperties: {
          type: 'STRING',
        },
        required: ['type'],
      },
      fields: { type: 'ARRAY', items: { type: 'STRING' }, default: [] },
      filters: {
        type: 'ARRAY',
        description:
          'The filters to apply to the explore. The keys are the dimensions and measures defined in the semantic model. The values are the filter values. Use the documentation how to use filters in Looker.',
        items: {
          type: 'OBJECT',
          properties: {
            field: { type: 'STRING', description: 'The dimension or measure id to filter on' },
            value: { type: 'STRING', description: 'The value to filter on' },
          },
        },
      },
      sorts: { type: 'ARRAY', items: { type: 'STRING' }, default: [] },
      limit: { type: 'INTEGER', default: 500 },
    },
    required: ['model', 'view', 'fields', 'filters', 'limit', 'vis_config'],
  }

  const response = await generateContent({
    contents: contents as MessagePart[],
    systemInstruction,
    responseSchema,
  })

  console.log('explore query response', response)

  const exploreDefinition = response[0]['object']
  exploreDefinition['model'] = modelName
  exploreDefinition['view'] = exploreId

  // fix the filters to be a dictionary instead of an array
  exploreDefinition['filters'] = exploreDefinition['filters'].reduce((acc: any, filter: any) => {
    acc[filter['field']] = filter['value']
    return acc
  }, {})

  return exploreDefinition
}

export const buildExploreAgent = (semanticModels: {
  [exploreKey: string]: SemanticModel
}): Agent => {
  const injectedExploreAgentMessages: MessagePart[] = []

  if (semanticModels) {
    Object.keys(semanticModels).forEach((exploreKey) => {
      const explore = semanticModels[exploreKey]
      injectedExploreAgentMessages.push({
        role: 'user',
        parts: [
          `The explore ${exploreKey} has the following dimensions: ${explore.dimensions
            .map((dimension: any) => dimension.name)
            .join(', ')}`,
          `The explore ${exploreKey} has the following measures: ${explore.measures
            .map((measure: any) => measure.name)
            .join(', ')}`,
        ],
      })
    })
  }

  return {
    name: 'ExploreAgent',
    description:
      'You know everything about the Looker explores that the user is able to see. Including the defined dimensions and measures.',
    getSystemPrompt: async () => {
      return 'You are a helpful assistant that can answer questions about the Looker explores that the user is able to see. Including the defined dimensions and measures. You can also generate the request body to a Looker explore that answers the user question. The request body will be compatible with the Looker API endpoints for run_inline_query. It will use the dimensions/measures defined in the semantic model to create the explore.'
    },
    modelSettings: {
      model: 'gemini-2.0-flash',
    },
    handoffDescription:
      'Always handoff to the explore agent if there is a question looker explore related. Questions like "What dimensions are there in the explore?", "What measures are there in the explore?", "What is the total revenue for the explore?", etc. There might also be questions like "What explore should I use to answer this question?". You can also generate the request body to a Looker explore that answers the user question. The request body will be compatible with the Looker API endpoints for run_inline_query. It will use the dimensions/measures defined in the semantic model to create the explore.',
    injectMessages: injectedExploreAgentMessages,
    tools: [
      {
        name: 'find_best_explore',
        description:
          'Find the best explore to answer the user question. This will return the explore id and model name.',
        parameters: {
          type: 'OBJECT',
          properties: {
            user_request: {
              type: 'STRING',
              description: 'The user request to find the best explore for',
            },
          },
          required: ['user_request'],
        },
        showInThread: true,
        execute: async (params: any) => {
          console.log('find_best_explore', params)
          const user_request = params.user_request
          return await findBestExplore(user_request, semanticModels)
        },
      },
      {
        name: 'get_explore_data',
        description:
          'Get the data from the explore. This will return the raw data from the explore.',
        parameters: {
          type: 'OBJECT',
          properties: {
            user_request: {
              type: 'STRING',
              description: 'The user request to get the explore data for',
            },
            model_name: {
              type: 'STRING',
              description: 'The name of the model to use, e.g. "sales_orders"',
            },
            explore_id: {
              type: 'STRING',
              description: 'The id of the explore to use, e.g. "orders"',
            },
          },
          required: ['user_request', 'model_name', 'explore_id'],
        },
        showInThread: true,
        execute: async (params: any) => {
          console.log('get_explore_data', params)
          const user_request = params.user_request
          const model_name = params.model_name
          const explore_id = params.explore_id

          return await getExploreData({
            userRequest: user_request,
            modelName: model_name,
            exploreId: explore_id,
            semanticModels,
          })
        },
      },
      {
        name: 'get_explore_query',
        description:
          'Generate the request body to a Looker explore that answers the user question. The request body will be compatible with the Looker API endpoints for run_inline_query. It will use the dimensions/measures defined in the semantic model to create the explore. This will also trigger the embedding of the explore in the UI for the user to view. When you use this function, you do not need to follow up by showing the user the request body. You can summarize what we have done so far.',
        parameters: {
          type: 'OBJECT',
          properties: {
            user_request: {
              type: 'STRING',
              description: 'The user request to transform into a Looker explore',
            },
            model_name: {
              type: 'STRING',
              description: 'The name of the model to use, e.g. "sales_orders"',
            },
            explore_id: {
              type: 'STRING',
              description: 'The id of the explore to use, e.g. "orders"',
            },
          },
          required: ['user_request', 'model_name', 'explore_id'],
        },
        showInThread: true,
        execute: async (params: any) => {
          console.log('get_explore_query', params)
          const user_request = params.user_request
          const model_name = params.model_name
          const explore_id = params.explore_id

          // Get the resolved explore key
          const { exploreKey, model, view } = sanitizeExploreDefinition({
            modelName: model_name,
            exploreId: explore_id,
            semanticModels,
          })
          const dimensions = semanticModels[exploreKey]?.dimensions || []
          const measures = semanticModels[exploreKey]?.measures || []

          console.log('Using explore key:', exploreKey)

          return await generateExploreQuery({
            userRequest: user_request,
            modelName: model,
            exploreId: view,
            dimensions,
            measures,
          })
        },
      },
    ],
  }
}

// Export the function for use in ChatSurface
export { buildExploreAgent as exploreAgent }
