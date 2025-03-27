import { Suspense } from "react"
import { ExtensionProvider40 } from "@looker/extension-sdk-react"
import { store } from "./store"
import { Provider } from 'react-redux'

import "./styles.scss"
import ChatSurface from "./components/ChatSurface"


const App = () => {
  return (
    <Suspense fallback={<></>}>
      <Provider store={store}>
        <ExtensionProvider40>
          <ChatSurface />
        </ExtensionProvider40>
      </Provider>
    </Suspense>
  )
}

export default App
