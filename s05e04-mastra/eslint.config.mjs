import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
	{
		ignores: [
			'.mastra/**',
			'dist/**',
			'coverage/**',
			'test-reports/**',
			'test-results/**',
			'node_modules/**',
			'.agents/**',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
		},
	},
]
