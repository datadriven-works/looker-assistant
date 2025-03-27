import { LinearProgress } from '@mui/material'

export const Loading = () => {
  return (
    <div className="flex justify-center items-center h-screen w-full">
      <div className="flex flex-col space-y-4 mx-auto max-w-2xl p-4">
        <h1 className="text-5xl font-bold">
          <span className="bg-clip-text text-transparent  bg-gradient-to-r from-pink-500 to-violet-500">
            Hello.
          </span>
        </h1>
        <h1 className="text-3xl text-gray-400">Getting everything ready...</h1>
        <div className="max-w-2xl text-blue-300">
          <LinearProgress color="inherit" />
        </div>
      </div>
    </div>
  )
}
