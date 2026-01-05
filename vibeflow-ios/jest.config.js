module.exports = {
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.property.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['babel-jest', { presets: ['@babel/preset-typescript'] }],
  },
  testEnvironment: 'node',
};
