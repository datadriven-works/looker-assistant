import js from '@eslint/js'
import globals from 'globals'
import { FlatCompat } from '@eslint/eslintrc'

// Create compat instance
const compat = new FlatCompat()

export default [
  // Ignore patterns
  { ignores: ['dist/**'] },

  // Base JS config
  js.configs.recommended,

  // Base configs with compat layer
  ...compat.config({
    extends: [
      'plugin:@typescript-eslint/recommended',
      'plugin:react/recommended',
      'plugin:react-hooks/recommended',
      'plugin:jsx-a11y/recommended',
    ],
  }),

  // Apply to all supported files
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      semi: ['error', 'never'],
      'react-hooks/exhaustive-deps': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
]
