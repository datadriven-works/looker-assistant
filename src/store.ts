import { configureStore, Reducer } from '@reduxjs/toolkit'
import { combineReducers } from 'redux'
import assistantReducer, { AssistantState, initialState } from './slices/assistantSlice'

const rootReducer: Reducer<{
  assistant: AssistantState
}> = (state, action) => {
  if (state === undefined) {
    return { assistant: initialState }
  }
  return combineReducers({
    assistant: assistantReducer,
  })(state, action)
}

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST'],
      },
    }),
})

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
