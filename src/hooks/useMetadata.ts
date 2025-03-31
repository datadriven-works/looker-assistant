import { useEffect, useContext, useCallback, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { ExtensionContext40, getCore40SDK } from '@looker/extension-sdk-react'
import {
  setIsMetadataLoaded,
  setUser,
  setAssistantConfig,
  ExploreDefinition,
  setExplores,
  setSemanticModels,
  SemanticModel,
  setDashboard,
} from '../slices/assistantSlice'
import { RootState } from '../store'

export const useMetadata = () => {
  const dispatch = useDispatch()
  const sdk = getCore40SDK()
  const { tileHostData } = useContext(ExtensionContext40)
  const [dashboardDataFetched, setDashboardDataFetched] = useState(false)

  const { assistantConfig } = useSelector((state: RootState) => state.assistant)

  const loadConfig = async () => {
    try {
      const config = await import('../config/assistant_config.yaml')
      dispatch(setAssistantConfig(config.default))
    } catch {
      console.log('No custom assistant config found, using default empty config')
      dispatch(setAssistantConfig({}))
    }
  }

  const fetchSemanticModel = async (
    modelName: string,
    exploreId: string,
    exploreKey: string
  ): Promise<SemanticModel | undefined> => {
    if (!modelName || !exploreId) {
      console.error('Default Looker Model or Explore is blank or unspecified')
      return
    }

    try {
      const response = await sdk.ok(
        sdk.lookml_model_explore({
          lookml_model_name: modelName,
          explore_name: exploreId,
          fields: 'fields',
        })
      )

      const { fields } = response

      if (!fields || !fields.dimensions || !fields.measures) {
        return undefined
      }

      const dimensions = fields.dimensions
        .filter(({ hidden }: any) => !hidden)
        .map(({ name, type, label, description, tags }: any) => ({
          name,
          type,
          label,
          description,
          tags,
        }))

      const measures = fields.measures
        .filter(({ hidden }: any) => !hidden)
        .map(({ name, type, label, description, tags }: any) => ({
          name,
          type,
          label,
          description,
          tags,
        }))

      return {
        exploreId,
        modelName,
        exploreKey,
        dimensions,
        measures,
      }
    } catch (error) {
      console.error(`Failed to fetch semantic model for ${modelName}::${exploreId} ${error}`)
      return undefined
    }
  }

  const getDashboard = useCallback(async () => {
    if (!tileHostData.dashboardId || !tileHostData.elementId) {
      return
    }

    const dashboardMetadata = {
      filters: tileHostData.dashboardFilters || {},
      id: tileHostData.dashboardId,
      elementId: tileHostData.elementId,
      queries: await sdk
        .ok(
          sdk.dashboard_dashboard_elements(
            tileHostData.dashboardId as string,
            'query,result_maker,note_text,title,query_id'
          )
        )
        .then((elements) =>
          elements
            .filter((element) => element.query || element.result_maker)
            .map((element) => {
              const { query, note_text, title } = element
              return {
                queryBody: query || element.result_maker?.query,
                note_text,
                title,
              }
            })
        ),
      description: await sdk
        .ok(sdk.dashboard(tileHostData.dashboardId as string, 'description'))
        .then((res) => res.description || ''),
    }

    dispatch(setDashboard(dashboardMetadata))
  }, [tileHostData])

  const getExplores = async () => {
    try {
      // Fetch all explores from Looker
      const allModels = await sdk.ok(
        sdk.all_lookml_models({
          fields: 'name,label,description,explores',
        })
      )

      const definedExplores: ExploreDefinition[] = []

      // Iterate through models to get their explores
      for (const model of allModels) {
        const explores = model.explores
        if (!explores || explores.length === 0) {
          continue
        }

        for (const oneExplore of explores) {
          const oneExploreKey = `${model.name}:${oneExplore.name}`
          if (assistantConfig?.explore_blacklist?.includes(oneExploreKey)) {
            continue
          }

          // check for samples in the config
          const samples = assistantConfig?.sample_prompts?.[oneExploreKey] || []

          // if there is a whilte list, only add the explore if it is in the whitelist
          if (
            assistantConfig?.explore_whitelist &&
            assistantConfig?.explore_whitelist?.length > 0
          ) {
            if (!assistantConfig?.explore_whitelist?.includes(oneExploreKey)) {
              continue
            }

            definedExplores.push({
              exploreKey: oneExploreKey,
              modelName: model.name!,
              exploreId: oneExplore.name || '',
              samples: samples,
            })
          } else {
            definedExplores.push({
              exploreKey: oneExploreKey,
              modelName: model.name!,
              exploreId: oneExplore.name || '',
              samples: samples,
            })
          }
        }
      }

      // sort the defined explores by the explore name
      definedExplores.sort((a, b) => a.exploreId.localeCompare(b.exploreId))
      dispatch(setExplores(definedExplores))

      try {
        const fetchPromises = definedExplores.map((explore) => {
          const [modelName, exploreId] = explore.exploreKey.split(':')
          return fetchSemanticModel(modelName, exploreId, explore.exploreKey).then((model) => ({
            exploreKey: explore.exploreKey,
            model,
          }))
        })

        const results = await Promise.all(fetchPromises)
        const semanticModels: { [explore: string]: SemanticModel } = {}

        results.forEach(({ exploreKey, model }) => {
          if (model) {
            semanticModels[exploreKey] = model
          }
        })

        dispatch(setSemanticModels(semanticModels))
      } catch (error) {
        console.error(`Failed to load semantic models, ${error}`)
      }
    } catch (error) {
      console.error('Error fetching explores:', error)
    }
  }

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
    loadConfig()
  }, [])

  useEffect(() => {
    if (tileHostData.dashboardId && tileHostData.elementId && !dashboardDataFetched) {
      getDashboard()
      setDashboardDataFetched(true)
    }
  }, [tileHostData])

  useEffect(() => {
    if (assistantConfig) {
      Promise.all([getUser(), getExplores()]).finally(() => {
        dispatch(setIsMetadataLoaded(true))
      })
    }
  }, [assistantConfig])
}
