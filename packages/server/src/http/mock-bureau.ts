import { createHash } from 'node:crypto';
import { Router } from 'express';
import type { MockBureauOptions } from '../config.ts';

export const ratingFor = (score: number): string => {
  if (score >= 750) return 'A · Riesgo bajo';
  if (score >= 650) return 'B · Riesgo moderado';
  if (score >= 550) return 'C · Riesgo medio-alto';
  return 'D · Riesgo alto';
};

/** Score determinista por documento (300–850) para que el demo sea reproducible. */
export const scoreFor = (documentId: string): number =>
  300 + (createHash('sha256').update(documentId).digest().readUInt32BE(0) % 551);

/**
 * Simula un servicio externo de Buró Crediticio: latencia de 2–4 s y ~30 % de respuestas 503.
 * Vive en el mismo proceso por simplicidad, pero se consume vía HTTP como si fuera externo.
 */
export function mockBureauRouter(options: MockBureauOptions, random: () => number = Math.random): Router {
  const r = Router();
  r.get('/:documentId', async (req, res) => {
    const latency = options.minLatencyMs + random() * (options.maxLatencyMs - options.minLatencyMs);
    await new Promise((resolve) => setTimeout(resolve, latency));

    if (random() < options.failureRate) {
      res.setHeader('Retry-After', '1');
      res.status(503).json({ error: 'Service Unavailable' });
      return;
    }
    const score = scoreFor(req.params.documentId);
    res.json({ documentId: req.params.documentId, score, rating: ratingFor(score), consultedAt: new Date().toISOString() });
  });
  return r;
}
