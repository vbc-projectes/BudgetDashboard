module.exports = {
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/tests/jest.setup.js'],
    testTimeout: 10000,
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/migrations/**'
    ],
    coverageThreshold: {
        global: { lines: 50, functions: 50 }
    }
};
