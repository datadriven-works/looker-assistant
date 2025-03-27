import { useState, useEffect } from 'react'

const EnvTest = () => {
  const [envVars, setEnvVars] = useState<Record<string, string>>({})

  useEffect(() => {
    // Collect all environment variables
    const vars: Record<string, string> = {}

    // Get all process.env variables
    // Filter only variables that start with VITE_ for security
    for (const key in process.env) {
      if (key.startsWith('VITE_')) {
        vars[key] = process.env[key] as string
      }
    }

    setEnvVars(vars)
  }, [])

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h2 className="text-xl font-bold mb-4">Environment Variables (process.env)</h2>

      {Object.keys(envVars).length === 0 ? (
        <p>No environment variables found.</p>
      ) : (
        <ul className="list-disc pl-6">
          {Object.entries(envVars).map(([key, value]) => (
            <li key={key} className="mb-2">
              <span className="font-mono bg-gray-200 px-1 rounded">{key}</span>: {value}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 p-3 bg-blue-100 rounded">
        <p className="text-sm">
          Note: Only variables prefixed with <code>VITE_</code> are shown for security.
        </p>
      </div>
    </div>
  )
}

export default EnvTest
