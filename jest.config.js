module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/*.test.js'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
    ],
    coveragePathIgnorePatterns: [
        '/node_modules/',
    ],
};
