/**
 * In-process synthetic 150-client smoke test: NOT 150 devices, live SSE or production load.
 * Uses a temporary Express app and mocks; does not contact Render, Netlify or production DB.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { eventCycleUnlocked } from '../lib/db-event-cycle-heart.js';
import { newParticipantAdmissionReject } from '../lib/db-event-admission.js';

describe('synthetic 150-client admission/read smoke', () => {
  it('handles 150 concurrent unique visitor requests without failures or wrong-event admission', async () => {
    const event = { session_active: true, event_cycle_started_at: '2026-10-13T18:00:00+09:00',
      event_cycle_reset_complete: false };
    const app = express();
    app.get('/synthetic-read/:id', (req, res) => {
      const at = req.query.now === 'closed'
        ? new Date('2026-10-14T01:00:00+09:00')
        : new Date('2026-10-13T23:30:00+09:00');
      const closed = newParticipantAdmissionReject(event, { isAdmin: false, isTestRuntime: false }, at);
      const unlocks = eventCycleUnlocked({ startedAt: event.event_cycle_started_at,
        resetComplete: false, now: at });
      res.json({ visitor: req.params.id, admission: !closed, grant: unlocks.has('red') });
    });
    const started = Date.now();
    const out = await Promise.all(Array.from({ length: 150 }, (_, i) =>
      request(app).get('/synthetic-read/' + i)));
    const elapsedMs = Date.now() - started;
    expect(out).toHaveLength(150);
    expect(out.every((res, i) => res.status === 200
      && res.body.visitor === String(i) && res.body.admission === true
      && res.body.grant === true)).toBe(true);
    const closed = await Promise.all(Array.from({ length: 150 }, (_, i) =>
      request(app).get('/synthetic-read/' + i).query({ now: 'closed' })));
    expect(closed.every(res => res.status === 200 && res.body.admission === false
      && res.body.grant === true)).toBe(true);
    // Only diagnostic. In-process timing is not a production SLA/latency claim.
    process.stdout.write('[synthetic-150] admission requests=' + out.length
      + ' elapsedMs=' + elapsedMs + ' (NOT production load)\\n');
  });
});
