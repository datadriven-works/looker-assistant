import { useState, Suspense } from 'react'
import { ExtensionProvider40 } from '@looker/extension-sdk-react'
import './styles.scss'

const App = () => {
  const [count, setCount] = useState(0)

  return (
    <Suspense fallback={<></>}>
      <ExtensionProvider40>
        <div className="container mx-auto p-4">
          <div className="card bg-white shadow-lg rounded-lg p-6">
            <h1 className="card__title text-2xl font-bold mb-4">React + SCSS + Tailwind test</h1>
            <div className="card__content">
              <button 
                className="button--primary mr-4"
                onClick={() => setCount((count) => count + 1)}
              >
                Count is {count}
              </button>
              <p className="my-4 text-gray-700">
                Edit <code className="bg-gray-100 px-1 rounded">src/App.tsx</code> and save to test HMR
              </p>
            </div>
            <button className="button--secondary mt-2">
              Secondary Button Example
            </button>
            
            {/* Pure Tailwind section */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h2 className="text-xl font-semibold text-blue-600 mb-3">Pure Tailwind Section</h2>
              <div className="flex space-x-4">
                <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded transition-colors">
                  Tailwind Button
                </button>
                <button className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded transition-colors">
                  Another Button
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                This section is styled using only Tailwind CSS classes
              </p>
            </div>
          </div>
        </div>
      </ExtensionProvider40>
    </Suspense>
  )
}

export default App
