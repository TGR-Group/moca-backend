import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@/': '/src/client',
        }
    },
    test: {
        globals: true
    },
})