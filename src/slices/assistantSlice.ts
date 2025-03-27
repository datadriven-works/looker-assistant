import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { v4 as uuidv4 } from 'uuid'

export interface Setting {
  name: string
  description: string
  value: boolean
}

export interface Settings {
  [key: string]: Setting
}

interface Field {
  name: string
  type: string
  description: string
  tags: string[]
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
    exploreParams: ExploreParams
  }
  history: Thread[]
  semanticModels: {
    [exploreKey: string]: SemanticModel
  }
  query: string
  settings: Settings,
  isMetadataLoaded: boolean,
  isSemanticModelLoaded: boolean
}

export const newThreadState = () => {
  const thread: Thread = {    
    uuid: uuidv4(),
    messages: [],
    createdAt: Date.now()
  }
  return thread
}


export const initialState: AssistantState = {
  isQuerying: false,
  user: null,
  sidePanel: {
    isSidePanelOpen: false,
    exploreParams: {},
  },
  history: [],
  query: '',
  semanticModels: {},
  settings: {
    show_explore_data: {
      name: 'Show Explore Data',
      description: 'By default, expand the data panel in the Explore',
      value: false,
    },
  },
  isMetadataLoaded: false,
  isSemanticModelLoaded: false
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
    setSetting: (
      state,
      action: PayloadAction<{ id: keyof Settings; value: boolean }>,
    ) => {
      const { id, value } = action.payload
      if (state.settings[id]) {
        state.settings[id].value = value
      }
    },
    clearHistory : (state) => {
      state.history = []
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
      state.history.push(action.payload)
    },
    setIsMetadataLoaded: (
      state, 
      action: PayloadAction<boolean>
    ) => {
      state.isMetadataLoaded = action.payload
    },
    setIsSemanticModelLoaded: (state, action: PayloadAction<boolean>) => {
      state.isSemanticModelLoaded = action.payload
    },
  },
})

export const {
  setIsQuerying,
  clearHistory,
  setQuery,
  resetChat,
  addMessage,
  setIsMetadataLoaded,
  setIsSemanticModelLoaded,

  setSetting,
  resetSettings,

  setUser,
} = assistantSlice.actions

export default assistantSlice.reducer
