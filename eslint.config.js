module.exports = [
    {
        files: ['db.js', 'app.js', 'public/**/*.js', 'test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                Buffer: 'readonly',
                URL: 'readonly',
                console: 'readonly',
                process: 'readonly',
                require: 'readonly',
                module: 'readonly',
                __dirname: 'readonly',
                fetch: 'readonly',
                Headers: 'readonly',
                document: 'readonly',
                window: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                FormData: 'readonly'
            }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-eval': 'error',
            'no-implied-eval': 'error'
        }
    }
];
