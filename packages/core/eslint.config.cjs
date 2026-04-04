/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */

const js = require('@eslint/js')
const tseslint = require('typescript-eslint')

module.exports = [
	{ ignores: ['dist/**', 'coverage/**', 'test-reports/**', 'test-results/**', 'node_modules/**'] },
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
