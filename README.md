# Looker Assistant

A powerful AI-powered assistant for Looker that helps users interact with their data through natural language queries. Leveraging Gemini AI models, this application allows users to ask questions about their Looker dashboards and explores, generating visualizations and insights without needing to know LookML.

## Overview

Looker Assistant is a React-based web application that integrates with Looker's extension framework, providing:

- Natural language interface for querying Looker data
- Semantic understanding of data models and explores
- AI-powered query generation for Looker
- Interactive chat-based UI
- Multi-agent architecture for specialized tasks

## Project Architecture

The application uses:

- **Frontend**: React with TypeScript and Vite
- **State Management**: Redux with Redux Toolkit
- **Styling**: Tailwind CSS with SCSS
- **AI Models**: Integration with Gemini AI models
- **Looker SDK**: For accessing Looker's API

### Agent Architecture

The application implements a multi-agent system with specialized capabilities:

- **BasicAgent**: Serves as the default agent that can answer general questions about Looker and intelligently hand off to specialized agents when needed.

- **ExploreAgent**: Handles queries about Looker explores and data models. This agent has complete knowledge of all explores the logged-in user has access to, including explore names, dimensions, and measures. It has three powerful tools:

  - `find_best_explore`: Determines the most relevant explore for a specific question
  - `get_explore_query`: Creates an embedded explore visualization based on natural language
  - `get_explore_data`: Fetches raw data from an explore to answer specific questions

- **DashboardAgent**: Automatically activated when the assistant is embedded in a dashboard. It loads and retains all the raw data from dashboard tiles, allowing it to answer detailed questions about the dashboard content.

- **UserAgent**: Maintains basic user information and handles user-specific queries.

The explore and user agents are always available, while the dashboard agent is conditionally activated when the application detects it's embedded within a dashboard.

## LLM Integration

This section describes how to set up the LLM Integration for the Looker Assistant.

### Getting Started for Development

1. Install a backend using terraform by [following the instructions](https://github.com/datadriven-works/gemini-backend/blob/main/README.md)

2. Save the backend details for use by the extension framework:
   - URL of the cloud function endpoint
   - AUTH_TOKEN that you generated to secure the endpoint

## Looker Extension Framework Setup

**Important**: If you are not familiar with the Looker Extension Framework, please review [this documentation](https://developers.looker.com/extensions/overview/) first before moving forward.

### Prerequisites

- Node.js (version less than 17)
- Yarn package manager
- Looker instance with API access
- Google Vertex AI project setup

### Installation

1. From the Looker Assistant root directory, install dependencies:

   ```bash
   yarn install
   ```

   > You may need to update your Node version or use a [Node version manager](https://github.com/nvm-sh/nvm) to change your Node version. You can print your version number in terminal with the following command:
   >
   > ```bash
   > $ node -v
   > ```

2. Create environment configuration:

   ```bash
   cp .env_example .env
   ```

3. Update the `.env` file with your Vertex AI endpoints and authentication tokens:

   ```
   VERTEX_AI_ENDPOINT=<Your Deployed Cloud Function Endpoint>
   VERTEX_CF_AUTH_TOKEN=<Your Token for Cloud Function Communication>
   ```

### Development

Start the development server:

```bash
yarn dev
```

**IMPORTANT**: If you are running the extension from a VM or another remote machine, you will need to Port Forward to the machine where you are accessing the Looker Instance from. Here's a boilerplate example for port forwarding the remote port 8080 to the local port 8080:
`ssh username@host -L 8080:localhost:8080`.

Your extension is now running and serving the JavaScript at https://localhost:8080/bundle.js.

### Setting Up in Looker

1. Log in to Looker and create a new project or use an existing project.

   Navigate to **Develop** => **Manage LookML Projects** => **New LookML Project**.

   Select "Blank Project" as your "Starting Point". You'll now have a new project with no files.

2. In your extension project, you have a [`manifest.lkml`](./manifestl.lkml) file.

   You can either drag & upload this file into your Looker project, or create a `manifest.lkml` with the same content. Change the `id`, `label`, or `url` as needed.

   **IMPORTANT**: Paste in the deployed Cloud Function URL into the `external_api_urls` list and uncomment that line if you are using the Cloud Function backend deployment. This will allowlist it in Looker for fetch requests.

   ```lookml
   application: assistant {
     label: "Assistant (Dev)"
     url: "https://localhost:8080/bundle.js"
     mount_points: {
       dashboard_vis: yes
       dashboard_tile: yes
       standalone: yes
     }
     entitlements: {
       local_storage:  yes
       use_embeds: yes
       navigation: yes
       use_iframes: yes
       new_window: yes

       core_api_methods: [
         "me", "all_lookml_models","dashboard","dashboard_dashboard_elements", "lookml_model_explore", "run_inline_query"
       ]
       external_api_urls: [
         "https://localhost:8080/bundle.js",
         "https://localhost:8080/bundle-version",
         "https://XXXX.cloudfunctions.net/gemini-backend-api"
       ]
       oauth2_urls: []
     }
   }
   ```

3. Create a `model` LookML file in your project. The name doesn't matter. The model and connection won't be used, and in the future this step may be eliminated.

   - Add a connection in this model. It can be any connection, it doesn't matter which.
   - [Configure the model you created](https://docs.looker.com/data-modeling/getting-started/create-projects#configuring_a_model) so that it has access to some connection.

4. Connect your new project to Git. You can do this multiple ways:

   - Create a new repository on GitHub or a similar service, and follow the instructions to [connect your project to Git](https://docs.looker.com/data-modeling/getting-started/setting-up-git-connection)
   - A simpler but less powerful approach is to set up git with the "Bare" repository option which does not require connecting to an external Git Service.

5. Commit your changes and deploy them to production through the Project UI.

6. Reload the page and click the `Browse` dropdown menu. You should see your extension in the list.

   - The extension will load the JavaScript from the `url` provided in the `application` definition.
   - Refreshing the extension page will bring in any new code changes from the extension template, although some changes will hot reload.

## Production Deployment

The process above requires your local development server to be running to load the extension code. To allow other people to use the extension, a production build of the extension needs to be run.

1. In your extension project directory on your development machine, build the extension:

   ```bash
   yarn build
   ```

2. Drag and drop ALL of the generated JavaScript files contained in the `dist` directory into the Looker project interface.

3. Modify your `manifest.lkml` to use `file` instead of `url` and point it at the `bundle.js` file.

Note that the additional JavaScript files generated during the production build process do not have to be mentioned in the manifest. These files will be loaded dynamically by the extension as and when they are needed. Note that to utilize code splitting, the Looker server must be at version 7.21 or above.

## Features

- **Semantic Search**: Find the best explore for answering a question
- **Query Generation**: Automatically generate Looker queries from natural language
- **Data Visualization**: Create appropriate visualizations based on query context
- **Interactive Chat**: Maintain conversation context for follow-up questions
- **Tool Execution**: Execute various tools like current time lookup or data retrieval

## Development Workflow

- **Building**: `yarn build`
- **Linting**: `yarn lint` or `yarn lint:fix`
- **Type Checking**: `yarn typecheck`
- **Development Server**: `yarn dev`
- **Preview Production**: `yarn preview`

## Technology Stack

- React 18
- TypeScript
- Redux Toolkit
- Vite
- Material UI
- Tailwind CSS
- Marked (for Markdown rendering)
- Looker Extension SDK
- Google Vertex AI services

## License

Proprietary - All rights reserved
