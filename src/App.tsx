import { Suspense } from 'react'
import { ExtensionProvider } from '@looker/extension-sdk-react'
import { Provider } from 'react-redux'
import { store } from './store'

import './styles.scss'
import Assistant from './components/Assistant'
import { LinearProgress } from '@mui/material'

const App = () => {
  return (
    <Suspense fallback={<></>}>
      <Provider store={store}>
        <ExtensionProvider loadingComponent={<LinearProgress />} requiredLookerVersion=">=24.0">
          <Assistant />
        </ExtensionProvider>
      </Provider>
    </Suspense>
  )
}

export default App
