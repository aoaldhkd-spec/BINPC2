import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['verbose'],
    // ESM 모듈을 정상 처리하기 위해 pool을 forks로 설정.
    // 파일마다 프로세스 분리 — 150 VU 로드 테스트가 같은 워커 메모리를 더럽히지 않게.
    pool: 'forks',
    isolate: true,
    fileParallelism: true,
    env: {
      SESSION_SECRET: 'test-session-secret-for-vitest-only',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
    },
  },
});
