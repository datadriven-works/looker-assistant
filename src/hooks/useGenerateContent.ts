import CryptoJS from 'crypto-js'
import { ModelParameters } from '../utils/VertexHelper'

// Export the MessagePart interface to be used elsewhere
export interface MessagePart {
  role: 'user' | 'model'
  parts: Array<string | Record<string, unknown>>
}

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

// Define a flexible params interface that can accept different message formats
export interface GenerateContentParams {
  contents: MessagePart[]
  parameters?: ModelParameters
  responseSchema?: any
  history?: any[]
  tools?: any[]
  modelName?: string
  systemInstruction?: string
}

export const useGenerateContent = () => {
  // cloud function
  const VERTEX_AI_ENDPOINT = process.env.VERTEX_AI_ENDPOINT || ''
  const VERTEX_CF_AUTH_TOKEN = process.env.VERTEX_CF_AUTH_TOKEN || ''

  const generateContent = async ({
    contents,
    parameters = {},
    responseSchema = null,
    tools = [],
    modelName = 'gemini-2.0-flash',
    systemInstruction = '',
  }: GenerateContentParams) => {
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
  }
}
