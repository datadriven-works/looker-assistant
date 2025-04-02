import React, { useContext, useRef, useEffect } from 'react'
import styled from 'styled-components'
import { LookerEmbedSDK } from '@looker/embed-sdk'
import { ExtensionContext } from '@looker/extension-sdk-react'
import { useSelector } from 'react-redux'
import { RootState } from '../store'
import { ExploreParams } from '../slices/assistantSlice'
import { ExploreHelper } from '../utils/ExploreHelper'

export interface ExploreEmbedProps {
  modelName: string | null | undefined
  exploreId: string | null | undefined
  exploreParams: ExploreParams
}

export const ExploreEmbed = ({ modelName, exploreId, exploreParams }: ExploreEmbedProps) => {
  const ref = useRef<HTMLDivElement>(null)

  const { extensionSDK } = useContext(ExtensionContext)
  const [exploreRunStart, setExploreRunStart] = React.useState(false)
  const { settings } = useSelector((state: RootState) => state.assistant)

  const canceller = (event: any) => {
    return { cancel: !event.modal }
  }

  const handleQueryError = () => {
    setTimeout(() => !exploreRunStart && animateExploreLoad(), 10)
  }

  const animateExploreLoad = () => {
    document.getElementById('embedcontainer')?.style.setProperty('opacity', '1')
  }

  useEffect(() => {
    const hostUrl = extensionSDK?.lookerHostData?.hostUrl
    const el = ref.current
    if (el && hostUrl && exploreParams) {
      const paramsObj: any = {
        // For Looker Original use window.origin for Looker Core use hostUrl
        embed_domain: hostUrl, //window.origin, //hostUrl,
        sdk: '2',
        _theme: JSON.stringify({
          key_color: '#174ea6',
          background_color: '#f4f6fa',
        }),
        toggle: 'pik,vis,dat',
      }

      if (settings['show_explore_data'].value) {
        paramsObj['toggle'] = 'pik,vis'
      }

      console.log('Explore Params for embed', exploreParams)
      const encodedParams = ExploreHelper.encodeExploreParams(exploreParams)
      for (const key in encodedParams) {
        paramsObj[key] = encodedParams[key]
      }

      console.log('Explore Embed - Params', paramsObj)

      el.innerHTML = ''
      LookerEmbedSDK.init(hostUrl)
      LookerEmbedSDK.createExploreWithId(modelName + '/' + exploreId)
        .appendTo(el)
        .withClassName('looker-embed')
        .withParams(paramsObj)
        .withDynamicIFrameHeight()
        .on('explore:ready', () => handleQueryError())
        .on('drillmenu:click', canceller)
        .on('drillmodal:explore', canceller)
        .on('explore:run:start', () => {
          setExploreRunStart(true)
          animateExploreLoad()
        })
        .on('explore:run:complete', () => setExploreRunStart(false))
        .build()
        .connect()
        .catch((error: Error) => {
          // @TODO - This should probably throw a visible error

          console.error('Connection error', error)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploreParams])

  if (!modelName || !exploreId || !exploreParams) {
    return <></>
  }

  if (!exploreParams || Object.keys(exploreParams).length === 0) {
    return <></>
  }

  return (
    <div className="h-full w-full">
      <EmbedContainer id="embedcontainer" ref={ref} />
    </div>
  )
}

const EmbedContainer = styled.div<{}>`
  backgroundcolor: #f7f7f7;
  width: 100%;
  height: 100%;
  animation: fadeIn ease-in ease-out 3s;
  > iframe {
    min-height: 600px;
    width: 100%;
    height: 100%;
    display: block;
    backgroundcolor: #f7f7f7;
  }
`
