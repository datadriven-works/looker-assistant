import Thread from '../Thread'
import PromptInput from '../PromptInput'
import { useDispatch, useSelector } from 'react-redux'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  addMessage,
  AssistantState,
  ChatMessage,
  setIsQuerying,
  setQuery,
  TextMessage,
} from '../../slices/assistantSlice'
import { RootState } from '../../store'
import { v4 as uuidv4 } from 'uuid'
import { generateContent, MessagePart } from '../../hooks/useGenerateContent'
import { Runner } from '../../agents/runner'
import { Agent, Handoff } from '../../agents/primitives'

// Ensure our generateHistory function correctly maps to MessagePart objects
const generateHistory = (messages: ChatMessage[]): MessagePart[] => {
  return messages.map((oneMessage: ChatMessage): MessagePart => {
    // Default to user role if we can't determine
    let role: 'user' | 'model' = 'user'
    let parts: Array<string | Record<string, unknown>> = []

    if (oneMessage.type === 'functionCall') {
      role = 'model'
      parts = [
        {
          functionCall: {
            id: oneMessage.uuid,
            name: oneMessage.name,
            args: oneMessage.args || {},
          },
        },
      ]
    } else if (oneMessage.type === 'text') {
      // Ensure role is either 'user' or 'model'
      role = oneMessage.actor === 'user' ? 'user' : 'model'
      parts = [oneMessage.message]
    } else if (oneMessage.type === 'functionResponse') {
      role = 'user'
      parts = [
        {
          functionResponse: {
            id: oneMessage.callUuid,
            name: oneMessage.name,
            response: {
              name: oneMessage.name,
              content: oneMessage.response,
            },
          },
        },
      ]
    }

    // Cast to satisfy TypeScript - we know our structure matches what's expected
    return {
      role,
      parts,
    } as MessagePart
  })
}

const ChatSurface = () => {
  const dispatch = useDispatch()
  const pendingQueryRef = useRef<string | null>(null)
  const checkDataInterval = useRef<NodeJS.Timeout | null>(null)

  const { query, thread, user, semanticModels, dashboard } = useSelector(
    (state: RootState) => state.assistant as AssistantState
  )

  const isMountedOnDashboard = useMemo(() => {
    return dashboard?.id && dashboard?.elementId
  }, [dashboard])

  // Helper function to check if dashboard data is loaded
  const isDashboardDataLoaded = useCallback(() => {
    return !isMountedOnDashboard || (dashboard?.data && dashboard.data.length > 0)
  }, [isMountedOnDashboard, dashboard])

  // Extracted function to handle the actual agent processing
  const runAgentProcessing = useCallback(async (currentQuery: string, messages: ChatMessage[]) => {
    console.log('Running agent processing for query:', currentQuery)
    try {
      // Process the query with our agent system
      console.log('Processing with agent system...')

      const injectedExploreAgentMessages: MessagePart[] = []

      Object.keys(semanticModels).forEach((exploreKey) => {
        const explore = semanticModels[exploreKey]
        injectedExploreAgentMessages.push({
          role: 'user',
          parts: [
            `The explore ${exploreKey} has the following dimensions: ${explore.dimensions
              .map((dimension) => dimension.name)
              .join(', ')}`,
            `The explore ${exploreKey} has the following measures: ${explore.measures
              .map((measure) => measure.name)
              .join(', ')}`,
          ],
        })
      })

      const injectedDashboardAgentMessages: MessagePart[] = []
      if (isMountedOnDashboard) {
        console.log('Dashboard data available:', dashboard?.data ? 'yes' : 'no')
        console.log('Dashboard description:', dashboard?.description)
        
        // Only inject messages if we actually have dashboard data
        if (dashboard?.data && dashboard.data.length > 0) {
          injectedDashboardAgentMessages.push(
            {
              role: 'user',
              parts: [
                'Here are the details about the dashboard you are embedded in: ' +
                  dashboard?.data.map((query) => query.queryTitle).join(', ') +
                  '\n \n Here is the description of the dashboard: ' +
                  dashboard?.description,
              ],
            },
            {
              role: 'user',
              parts: ['Here is the data for the dashboard: ' + JSON.stringify(dashboard?.data)],
            }
          )
        } else {
          console.warn('Dashboard is mounted but no data is available!')
          injectedDashboardAgentMessages.push({
            role: 'user',
            parts: [
              'You are embedded in a dashboard, but detailed dashboard data is not available. When asked to summarize the dashboard, explain that you need more information about the dashboard to provide a useful summary.'
            ],
          })
        }
      }

      const dashboardAgent: Agent = {
        name: 'DashboardAgent',
        description: 'You know everything about the Looker dashboard that the user is able to see.',
        getSystemPrompt: async () => {
          return `You are a helpful assistant that can answer questions about the Looker dashboard that the user is able to see. ${
            dashboard?.data && dashboard.data.length > 0 
              ? `This dashboard contains: ${dashboard?.data.map(q => q.queryTitle).join(', ')}.` 
              : 'When asked to summarize the dashboard, check if you have received dashboard data. If not, explain that you need more data to provide a summary.'
          }`
        },
        injectMessages: injectedDashboardAgentMessages,
        modelSettings: {
          model: 'gemini-2.0-flash',
        },
        handoffDescription:
          'Always handoff to this agent if the user asks about the dashboard, including questions like "summarize the dashboard", "describe the dashboard", "tell me about this dashboard", or any other dashboard-related queries. If you are uncertain about a query, prefer to handoff to this agent rather than responding that you don\'t understand.',
      }

      const exploreAgent: Agent = {
        name: 'ExploreAgent',
        description:
          'You know everything about the Looker explores that the user is able to see. Including the defined dimensions and measures.',
        getSystemPrompt: async () => {
          return 'You are a helpful assistant that can answer questions about the Looker explores that the user is able to see. Including the defined dimensions and measures.'
        },
        modelSettings: {
          model: 'gemini-2.0-flash',
        },
        handoffDescription:
          'Always handoff to the explore agent if there is a question looker explore related. Questions like "What dimensions are there in the explore?", "What measures are there in the explore?", "What is the total revenue for the explore?", etc. There might also be questions like "What explore should I use to answer this question?"'
      }

      const userAgent: Agent = {
        name: 'UserAssistant',
        description: 'A helpful assistant that answers questions directly.',
        getSystemPrompt: async () => {
          return (
            'You know everything about the user. You are a helpful assistant that answers questions directly. Here is all the information you know about the user: ' +
            JSON.stringify(user)
          )
        },
        modelSettings: {
          model: 'gemini-2.0-flash',
        },
        handoffDescription:
          'Always handoff to the user assistant if there is a question around the user like their groups, names, etc.',
      }

      // Create a basic agent with no handoff capabilities
      const handoffs: Handoff[] = [
        {
          targetAgent: userAgent,
        },
        {
          targetAgent: exploreAgent,
        },
      ]

      let basicAgentSystemPrompt =
        "You are a helpful, concise assistant. Provide accurate and useful information to the user's questions. You are embedded in Looker, which is a Business Intelligence tool made by Google. You are either in stand-alone mode, or embedded in a dashboard. If you are embedded in a dashboard, you can answer questions about the dashboard. If you are in stand-alone mode, you can answer questions about Looker. You can also perform calculations and get current time when needed. You have the ability to handoff to other agents who are going to be experts in their respective fields."

      if (isMountedOnDashboard) {
        basicAgentSystemPrompt +=
          ' You are embedded in a dashboard. When a user asks about dashboard details, summaries, or any dashboard-related information, ALWAYS handoff to the dashboard agent rather than attempting to answer yourself or saying you don\'t understand. This includes queries like "summarize the dashboard", "what does this dashboard show", or any similar dashboard-related questions.'
        
        // Add the dashboard agent to handoffs with a filter function
        handoffs.push({
          targetAgent: dashboardAgent,
          description: "Handles all dashboard-related queries including summaries and descriptions",
          filter: async (input) => {
            console.log("Checking if query should be handled by dashboard agent...");
            
            // Convert input to string for easier processing
            let userQueryText = "";
            if (typeof input === 'string') {
              userQueryText = input.toLowerCase();
            } else if (Array.isArray(input)) {
              // Get the last user message
              const userMessages = input.filter(m => m.role === 'user');
              const lastUserMessage = userMessages[userMessages.length - 1];
              
              if (lastUserMessage && lastUserMessage.parts) {
                userQueryText = lastUserMessage.parts
                  .filter(part => typeof part === 'string')
                  .join(' ')
                  .toLowerCase();
              }
            }
            
            console.log("User query for dashboard filter:", userQueryText);
            
            // List of terms that should trigger a dashboard agent handoff
            const dashboardRelatedTerms = [
              'dashboard', 'summarize', 'summary', 'describe', 'tell me about', 
              'what does this show', 'what is this showing', 'explain this',
              'visualize', 'charts', 'data'
            ];
            
            // Check if any dashboard terms are in the query
            const shouldHandoff = dashboardRelatedTerms.some(term => 
              userQueryText.includes(term)
            );
            
            console.log("Should handoff to dashboard agent:", shouldHandoff);
            return shouldHandoff;
          }
        });
      }

      console.log('handoffs', handoffs)

      const basicAgent: Agent = {
        name: 'BasicAssistant',
        description: 'A helpful assistant that answers questions directly.',

        // Return a system prompt for the agent
        getSystemPrompt: async () => {
          return basicAgentSystemPrompt
        },

        // Basic model settings
        modelSettings: {
          model: 'gemini-2.0-flash',
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.95,
        },

        handoffs,

        // Add some basic tools
        tools: [
          {
            name: 'getCurrentTime',
            description: 'Get the current date and time',
            parameters: {
              type: 'OBJECT',
              properties: {
                timezone: {
                  type: 'STRING',
                  description: 'Optional timezone (defaults to local)',
                },
              },
              required: [], // Making timezone optional by removing it from required
            },
            execute: async (params?: Record<string, unknown>) => {
              const now = new Date()
              // Use the timezone parameter if provided
              const timezone = params?.timezone as string | undefined

              console.log(
                `Providing current time: ${now.toISOString()}${timezone ? ` in timezone ${timezone}` : ''}`
              )

              let timeDisplay, dateDisplay

              if (timezone) {
                // Format with the specified timezone
                try {
                  timeDisplay = now.toLocaleTimeString(undefined, { timeZone: timezone })
                  dateDisplay = now.toLocaleDateString(undefined, { timeZone: timezone })
                } catch (error) {
                  // Fallback if timezone is invalid
                  console.error(`Invalid timezone: ${timezone}. Using local timezone.`)
                  timeDisplay = now.toLocaleTimeString()
                  dateDisplay = now.toLocaleDateString()
                }
              } else {
                // Use local timezone
                timeDisplay = now.toLocaleTimeString()
                dateDisplay = now.toLocaleDateString()
              }

              return [
                {
                  text: `Current time: ${timeDisplay}, Date: ${dateDisplay}, ISO: ${now.toISOString()}${timezone ? ` (Timezone: ${timezone})` : ''}`,
                },
              ]
            },
          },
        ],
      }

      // Use the Runner to process the query with conversation history context
      const result = await Runner.run(basicAgent, generateHistory(messages), {
        maxTurns: 5, // Allow a few turns for tool usage
        context: {
          originalQuery: currentQuery,
          messages: generateHistory(messages),
          state: {
            user,
            thread: thread?.uuid, // Use optional chaining for thread
          },
        },
        hooks: {
          onAgentStart: async (_context, agent) => {
            console.log(`Agent started: ${agent.name}`)
            console.log('Current query:', currentQuery)
            console.log('Agent description:', agent.description)
            console.log('Dashboard mounted:', isMountedOnDashboard)
            if (agent.name === 'DashboardAgent') {
              console.log('Dashboard agent injected messages:', injectedDashboardAgentMessages)
            }
          }
        }
      })

      console.log('Agent response:', result)
      const responseText = result.finalOutput

      const responseMessage: TextMessage = {
        uuid: uuidv4(),
        message: responseText,
        actor: 'model',
        createdAt: Date.now(),
        type: 'text',
      }
      dispatch(addMessage(responseMessage))
    } catch (error) {
      console.error('Error processing with agent system:', error)

      // Fallback to the original content generation if agent system fails
      const tools: Array<Record<string, unknown>> = []
      const systemInstruction = ''

      console.log(messages)
      console.log(generateHistory(messages))

      const response = await generateContent({
        contents: generateHistory(messages),
        tools,
        systemInstruction,
      })

      // Process any textual responses
      let responseText = ''
      response.forEach((oneResponse: { text?: string }) => {
        if (oneResponse.text) {
          responseText += oneResponse.text
        }
      })

      const responseMessage: TextMessage = {
        uuid: uuidv4(),
        message: responseText || "Sorry, I encountered an error processing your request.", // Add fallback text
        actor: 'model',
        createdAt: Date.now(),
        type: 'text',
      }
      dispatch(addMessage(responseMessage))
    }

    dispatch(setIsQuerying(false))
    // No need to clear query here, it was cleared earlier

  }, [dispatch, semanticModels, isMountedOnDashboard, dashboard, user, thread?.uuid, generateContent]) // Added dependencies

  const submitMessage = useCallback(async () => {
    if (query === '') {
      return
    }

    const currentQuery = query // Capture the query before clearing
    
    // Add user message immediately
    const initialMessage: TextMessage = {
      uuid: uuidv4(),
      message: currentQuery,
      actor: 'user',
      createdAt: Date.now(),
      type: 'text',
    }
    dispatch(addMessage(initialMessage))
    
    // Get the updated list of messages *after* adding the new one
    // Note: Accessing state directly like this isn't ideal in React, but necessary here
    // to pass the absolute latest message list to the processing function immediately.
    // A more robust solution might involve passing message IDs or using a different state management pattern.
    const updatedMessages = [...(thread?.messages || []), initialMessage]

    // Check if we need to wait for dashboard data
    if (isMountedOnDashboard && !isDashboardDataLoaded()) {
      console.log('Dashboard data not loaded yet, setting pending query')
      
      // Set as pending query and show loading state
      pendingQueryRef.current = currentQuery
      dispatch(setIsQuerying(true))
      dispatch(setQuery('')) // Clear input field
      return // Stop here, wait for polling to trigger processing
    }

    // If data is loaded or not in dashboard mode, proceed immediately
    dispatch(setIsQuerying(true))
    dispatch(setQuery('')) // Clear input field
    
    // Run the agent processing
    await runAgentProcessing(currentQuery, updatedMessages)

  }, [dispatch, query, thread?.messages, isMountedOnDashboard, isDashboardDataLoaded, runAgentProcessing]) // Added dependencies

  // Function to process a query when dashboard data becomes available
  const processPendingQuery = useCallback(async () => { // Make async
    if (pendingQueryRef.current && isDashboardDataLoaded()) {
      const pendingQuery = pendingQueryRef.current
      console.log('Dashboard data now loaded, processing pending query:', pendingQuery)
      pendingQueryRef.current = null
      
      // Clear the interval if it exists
      if (checkDataInterval.current) {
        clearInterval(checkDataInterval.current)
        checkDataInterval.current = null
      }
      
      // Get the current messages AFTER the initial user message was added
      // Using the thread selector ensures we have the message list *as it was* when the pending query was set
      const currentMessages = thread?.messages || []

      // Trigger agent processing using the extracted function
      await runAgentProcessing(pendingQuery, currentMessages)
    }
  }, [dispatch, isDashboardDataLoaded, runAgentProcessing, thread?.messages]) // Added dependencies

  // Set up an effect to check for dashboard data when there's a pending query
  useEffect(() => {
    // If we have a pending query but no interval running, start one
    if (pendingQueryRef.current && !checkDataInterval.current) {
      checkDataInterval.current = setInterval(() => {
        processPendingQuery()
      }, 500) // Check every 500ms
      
      // Safety cleanup after 30 seconds to prevent infinite checking
      setTimeout(() => {
        if (checkDataInterval.current) {
          clearInterval(checkDataInterval.current)
          checkDataInterval.current = null
          
          // If we still have a pending query after timeout, show an error
          if (pendingQueryRef.current) {
            console.error('Dashboard data failed to load within timeout period')
            pendingQueryRef.current = null
            dispatch(setIsQuerying(false))
          }
        }
      }, 30000)
    }
    
    return () => {
      if (checkDataInterval.current) {
        clearInterval(checkDataInterval.current)
        checkDataInterval.current = null
      }
    }
  }, [processPendingQuery, dispatch])

  // useEffect to trigger submitMessage when query changes (and is not empty)
  useEffect(() => {
    if (query && query !== '') {
      submitMessage()
    }
  }, [query, submitMessage]) // submitMessage is now a dependency

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-grow overflow-y-auto max-h-full">
        <div className="max-w-4xl mx-auto mt-8">
          <Thread />
        </div>
      </div>
      <div
        className={`flex justify-center duration-300 ease-in-out py-5 bg-gray-50 border-t border-gray-200 shadow-t-sm`}
      >
        <PromptInput />
      </div>
    </div>
  )
}

export default ChatSurface
