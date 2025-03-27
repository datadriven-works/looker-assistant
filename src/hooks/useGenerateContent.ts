import { ModelParameters } from '../utils/VertexHelper'
import CryptoJS from 'crypto-js'
import looker_filter_doc from '../documents/looker_filter_doc.md'
import looker_visualization_doc from '../documents/looker_visualization_doc.md'
import looker_query_body from '../documents/looker_query_body.md'


export function formatRow(field: {
  name?: string
  type?: string
  label?: string
  description?: string
  tags?: string[]
}) {
  // Initialize properties with default values if not provided
  const name = field.name || ''
  const type = field.type || ''
  const label = field.label || ''
  const description = field.description || ''
  const tags = field.tags ? field.tags.join(', ') : ''

  // Return a markdown row
  return `| ${name} | ${type} | ${label} | ${description} | ${tags} |`
}


export const useGenerateContent = () => {
  // cloud function
  const VERTEX_AI_ENDPOINT = process.env.VERTEX_AI_ENDPOINT || ''
  const VERTEX_CF_AUTH_TOKEN = process.env.VERTEX_CF_AUTH_TOKEN || ''


  const summarizeData = async (data: string) => {

    const systemInstruction = `You are a helpful assistant that summarizes the data. The data is in markdown format.`
    const prompt = `Make a summary of this data for a slide presentation. The summary should be a markdown documents that contains a list of sections, each section should have the following details:  a section title, which is the title for the given part of the summary, and key points which a list of key points for the concise summary. Data should be returned in each section, you will be penalized if it doesn't adhere to this format. Each summary should only be included once. Do not include the same summary twice.
    `
    const response = await generateContent({
      contents: [{ role: 'user', parts: [data] }, { role: 'user', parts: [prompt] }],
      systemInstruction,
    })

    return response
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

    const backgroundInformation = `
    Here are the dimensions and measures that are defined in this data set:
     | Field Id | Field Type | LookML Type | Label | Description | Tags |
     |------------|------------|-------------|-------|-------------|------|
     ${dimensions.map(formatRow).join('\n')}
     ${measures.map(formatRow).join('\n')}
    `

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
      contents,
      systemInstruction,
      responseSchema,
    })

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

  const generateContent = async ({
    contents,
    parameters = {},
    responseSchema = null,
    tools = [],
    modelName = 'gemini-2.0-flash',
    systemInstruction = '',
  }: {
    contents: any[]
    parameters?: ModelParameters
    responseSchema?: any
    history?: any[]
    tools?: any[]
    modelName?: string
    systemInstruction?: string
  }) => {
    const defaultParameters = {
      temperature: 2,
      max_output_tokens: 8192,
      top_p: 0.95,
    }

    if (!parameters) {
      parameters = defaultParameters
    } else {
      Object.assign(defaultParameters, parameters)
    }

    const body = {
      model_name: modelName,
      contents: '',
      parameters: parameters,
      response_schema: null,
      history: contents,
      tools: tools,
      system_instruction: systemInstruction,
    }

    if (responseSchema) {
      body['response_schema'] = responseSchema
    }

    const jsonBody = JSON.stringify(body)

    const signature = CryptoJS.HmacSHA256(jsonBody, VERTEX_CF_AUTH_TOKEN).toString()
    const path = VERTEX_AI_ENDPOINT + '/generate_content'
    const responseData = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
      },

      body: jsonBody,
    })

    const textResponse = await responseData.text() // Fetch the response as text first

    return JSON.parse(textResponse)
  }

  return {
    generateContent,
    generateExploreQuery,
    summarizeData,
  }
}
