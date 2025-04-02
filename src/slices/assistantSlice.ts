import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'
import { Filters } from '@looker/extension-sdk'

export interface ExploreParams {
  fields?: string[]
  filters?: Record<string, string>
  pivots?: string[]
  vis_config?: any
  sorts?: string[]
  limit?: string
  filter_expression?: string
}

export interface Setting {
  name: string
  description: string
  value: boolean
}

export interface Settings {
  [key: string]: Setting
}

export interface AssistantConfig {
  sample_prompts?: Record<string, string[]>
  explore_whitelist?: string[]
  explore_blacklist?: string[]
  allowed_looker_group_ids?: string[]
}

interface Field {
  name: string
  type: string
  description: string
  tags: string[]
}

export interface ExploreDefinition {
  exploreKey: string
  modelName: string
  exploreId: string
  samples: string[]
}

export interface TextMessage {
  uuid: string
  actor: 'user' | 'model'
  createdAt: number
  message: string
  type: 'text'
}

export interface FunctionCall {
  uuid: string
  name: string
  args: any
  createdAt: number
  type: 'functionCall'
}

export interface FunctionResponse {
  uuid: string
  callUuid: string
  name: string
  response: any
  createdAt: number
  type: 'functionResponse'
}

export type ChatMessage = TextMessage | FunctionCall | FunctionResponse

export type Thread = {
  uuid: string
  messages: ChatMessage[]
  createdAt: number
}

export interface SemanticModel {
  dimensions: Field[]
  measures: Field[]
  exploreKey: string
  exploreId: string
  modelName: string
}

export interface Dashboard {
  id: string
  elementId: string
  queries: any[]
  description: string
  filters: Filters
  data: any[]
}

export interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  group_ids: string[]
}

export interface AssistantState {
  isQuerying: boolean
  user: User | null
  sidePanel: {
    isSidePanelOpen: boolean
  }
  thread: Thread
  semanticModels: {
    [exploreKey: string]: SemanticModel
  }
  assistantConfig: AssistantConfig
  query: string
  settings: Settings
  explores: ExploreDefinition[]
  dashboard: Dashboard | null

  isMetadataLoaded: boolean
}

export const newThreadState = () => {
  const thread: Thread = {
    uuid: uuidv4(),
    messages: [],
    createdAt: Date.now(),
  }
  return thread
}

export const initialState: AssistantState = {
  isQuerying: false,
  user: null,
  sidePanel: {
    isSidePanelOpen: false,
  },
  thread: newThreadState(),
  query: '',
  semanticModels: {},
  assistantConfig: {},
  settings: {},
  explores: [],
  dashboard: null,
  isMetadataLoaded: false,
}

export const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    resetAssistant: () => {
      return initialState
    },
    setIsQuerying: (state, action: PayloadAction<boolean>) => {
      state.isQuerying = action.payload
    },
    resetSettings: (state) => {
      state.settings = initialState.settings
    },
    setSetting: (state, action: PayloadAction<{ id: keyof Settings; value: boolean }>) => {
      const { id, value } = action.payload
      if (state.settings[id]) {
        state.settings[id].value = value
      }
    },
    setAssistantConfig: (state, action: PayloadAction<AssistantConfig>) => {
      state.assistantConfig = action.payload
    },
    setExplores(state, action: PayloadAction<ExploreDefinition[]>) {
      state.explores = action.payload
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload
    },
    setQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload
    },
    resetChat: (state) => {
      state.query = ''
      state.isQuerying = false
    },
    addMessage: (state, action: PayloadAction<ChatMessage>) => {
      if (action.payload.uuid === undefined) {
        action.payload.uuid = uuidv4()
      }
      state.thread.messages.push(action.payload)
    },
    setIsMetadataLoaded: (state, action: PayloadAction<boolean>) => {
      state.isMetadataLoaded = action.payload
    },
    setSemanticModels: (state, action: PayloadAction<Record<string, SemanticModel>>) => {
      state.semanticModels = action.payload
    },
    setDashboard: (state, action: PayloadAction<Dashboard>) => {
      state.dashboard = action.payload
    },
    setDashboardData: (state, action: PayloadAction<any[]>) => {
      if (state.dashboard) {
        state.dashboard.data = action.payload
      }
    },
  },
})

export const {
  setIsQuerying,
  setQuery,
  resetChat,
  addMessage,
  setIsMetadataLoaded,
  setAssistantConfig,
  setSemanticModels,
  setExplores,
  setSetting,
  resetSettings,
  setDashboard,
  setDashboardData,
  setUser,
} = assistantSlice.actions

export default assistantSlice.reducer
