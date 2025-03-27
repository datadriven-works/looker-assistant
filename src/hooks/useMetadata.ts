import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { getCore40SDK } from '@looker/extension-sdk-react'
import { setIsMetadataLoaded, setUser } from '../slices/assistantSlice'

export const useMetadata = () => {
  const dispatch = useDispatch()
  const sdk = getCore40SDK()

  const getUser = async () => {
    const user = await sdk.ok(sdk.me())
    dispatch(
      setUser({
        id: user.id || '',
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        group_ids: user.group_ids || [],
      })
    )
  }

  useEffect(() => {
    Promise.all([getUser()]).finally(() => {
      dispatch(setIsMetadataLoaded(true))
    })
  }, [])
}
