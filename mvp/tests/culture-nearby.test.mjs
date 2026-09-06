import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessCultureTicket,
  cultureTaipeiDateTime,
} from '../lib/culture-nearby.mjs';

test('normalizes slash-separated Culture API times to explicit Taipei time', () => {
  assert.equal(
    cultureTaipeiDateTime('2026/09/05 20:00:00'),
    '2026-09-05T20:00:00+08:00',
  );
  assert.equal(
    cultureTaipeiDateTime('2026-09-06 14:30'),
    '2026-09-06T14:30:00+08:00',
  );
});

test('does not infer free admission from onSales=N or an empty price', () => {
  for (const onSales of ['N', 'Y', '']) {
    const ticket = assessCultureTicket({ onSales, price: '' });
    assert.equal(ticket.directCostTwd, null);
    assert.equal(ticket.admissionCostTwd, null);
    assert.equal(ticket.verificationStatus, 'UNVERIFIED');
  }
});

test('sets zero cost only when the price text explicitly says free', () => {
  const ticket = assessCultureTicket({ onSales: 'N', price: '免費入場' });
  assert.equal(ticket.directCostTwd, 0);
  assert.equal(ticket.admissionCostTwd, 0);
  assert.equal(ticket.verificationStatus, 'UNVERIFIED');
});

test('does not claim zero cost when free and paid language conflict', () => {
  const ticket = assessCultureTicket({
    onSales: 'Y',
    price: '活動免費，惟入場需購票 500 元',
  });
  assert.equal(ticket.directCostTwd, null);
  assert.equal(ticket.admissionCostTwd, null);
  assert.equal(ticket.verificationStatus, 'CONFLICTED');
});
