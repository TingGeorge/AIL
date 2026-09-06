import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePersonalCpScore,
  rebalancePersonalCpWeights,
} from '../lib/personal-cp.mjs';

const options = {
  cheapFar: {
    totalCost: 100,
    budget: 500,
    distanceKm: 1.8,
    maxDistanceKm: 2,
    matchedPreferences: 0,
    totalPreferences: 2,
  },
  nearExpensive: {
    totalCost: 450,
    budget: 500,
    distanceKm: 0.2,
    maxDistanceKm: 2,
    matchedPreferences: 0,
    totalPreferences: 2,
  },
  favorite: {
    totalCost: 250,
    budget: 500,
    distanceKm: 1,
    maxDistanceKm: 2,
    matchedPreferences: 2,
    totalPreferences: 2,
  },
};

function winner(weights) {
  return Object.entries(options)
    .map(([name, input]) => ({
      name,
      score: calculatePersonalCpScore({ ...input, weights }).rawScore,
    }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0].name;
}

test('each extreme weight promotes the matching option', () => {
  assert.equal(winner({ price: 100, distance: 0, preference: 0 }), 'cheapFar');
  assert.equal(
    winner({ price: 0, distance: 100, preference: 0 }),
    'nearExpensive',
  );
  assert.equal(
    winner({ price: 0, distance: 0, preference: 100 }),
    'favorite',
  );
});

test('moving one weight keeps an honest 100 percent total', () => {
  const next = rebalancePersonalCpWeights(
    { price: 55, distance: 30, preference: 15 },
    'preference',
    65,
  );

  assert.deepEqual(next, { price: 25, distance: 10, preference: 65 });
  assert.equal(next.price + next.distance + next.preference, 100);
});

test('raw score preserves small differences before display rounding', () => {
  const result = calculatePersonalCpScore({
    ...options.cheapFar,
    distanceKm: 1.333,
    weights: { price: 0, distance: 100, preference: 0 },
  });

  assert.notEqual(result.rawScore, result.score);
  assert.equal(result.score, 33);
});
