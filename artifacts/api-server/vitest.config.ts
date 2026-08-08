import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['verbose'],
    // ESM 모듈을 정상 처리하기 위해 pool을 forks로 설정
    pool: 'forks',
    env: {
      SESSION_SECRET: 'test-session-secret-for-vitest-only',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
    },
  },
});
