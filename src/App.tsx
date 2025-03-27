import { Suspense } from 'react'
import { ExtensionProvider40 } from '@looker/extension-sdk-react'
import { persistor, store } from './store'
import { Provider } from 'react-redux'

import './styles.scss'
import Assistant from './components/Assistant'
import { LinearProgress } from '@mui/material'
import { PersistGate } from 'redux-persist/integration/react'

const App = () => {
  return (
    <Suspense fallback={<></>}>
      <Provider store={store}>
        <PersistGate loading={<LinearProgress />} persistor={persistor}>
          <ExtensionProvider40>
            <Assistant />
          </ExtensionProvider40>
        </PersistGate>
      </Provider>
    </Suspense>
  )
}

export default App
