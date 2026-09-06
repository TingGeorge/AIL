import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseCreateCampaignInput,
  parseCommitmentMutationInput,
  parseCreateInviteInput,
  parseCreateTeamInput,
  parseRedeemInviteInput,
  parseUpsertCommitmentInput,
  pledgeInputFromMutation,
  TeamContractError,
} from '../lib/team-contract.ts';
import {
  createTeam,
  createTeamCampaign,
  createTeamInvite,
  hashInviteToken,
  listTeamCampaignsForUser,
  readTeamCampaign,
  redeemTeamInvite,
  TEAM_CAMPAIGN_LIST_LIMIT,
  TeamServerError,
  upsertTeamCommitment,
  withdrawTeamCommitment,
} from '../lib/team-server.ts';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const schema = [
  '../drizzle/0001_p0_core.sql',
  '../drizzle/0003_open_data_ingestion.sql',
]
  .map((file) => readFileSync(path.resolve(testDirectory, file), 'utf8'))
  .join('\n');
const fixedNow = new Date('2026-09-06T04:00:00.000Z');

class SqliteStatement {
  constructor(database, query, values = [], onExecute = () => {}) {
    this.database = database;
    this.query = query;
    this.values = values;
    this.onExecute = onExecute;
  }

  bind(...values) {
    return new SqliteStatement(
      this.database,
      this.query,
      values,
      this.onExecute,
    );
  }

  async first() {
    this.onExecute();
    return this.database.prepare(this.query).get(...this.values) ?? null;
  }

  async all() {
    this.onExecute();
    return {
      results: this.database.prepare(this.query).all(...this.values),
    };
  }

  async run() {
    this.onExecute();
    const result = this.database.prepare(this.query).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    this.database.exec(schema);
    this.queryCount = 0;
  }

  prepare(query) {
    return new SqliteStatement(this.database, query, [], () => {
      this.queryCount += 1;
    });
  }

  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

function insertUser(db, id) {
  const now = fixedNow.toISOString();
  db.database
    .prepare(
      "INSERT INTO users (id, auth_subject, status, created_at, updated_at) VALUES (?, ?, 'ACTIVE', ?, ?)",
    )
    .run(id, `username:${id}`, now, now);
}

function insertPlace(db, id = 'place-yuanshan', overrides = {}) {
  const {
    status = 'ACTIVE',
    kind = 'RESTAURANT',
    latE6 = 25_071_330,
    lngE6 = 121_520_240,
    provider = null,
    imported = true,
  } = overrides;
  db.database
    .prepare(
      "INSERT OR IGNORE INTO areas (id, name, anchor_place_provider, radius_m) VALUES ('area-yuanshan', '圓山', 'TEST', 2000)",
    )
    .run();
  db.database
    .prepare(
      "INSERT INTO places (id, area_id, kind, name, lat_e6, lng_e6, status, created_at, updated_at) VALUES (?, 'area-yuanshan', ?, '測試店家', ?, ?, ?, ?, ?)",
    )
    .run(
      id,
      kind,
      latE6,
      lngE6,
      status,
      fixedNow.toISOString(),
      fixedNow.toISOString(),
    );
  if (provider) {
    db.database
      .prepare(
        'INSERT INTO external_place_refs (place_id, provider, external_id) VALUES (?, ?, ?)',
      )
      .run(id, provider, id);
  }
  db.database
    .prepare(
      "INSERT OR IGNORE INTO sources (id, origin_type, authority_level, publisher_name, retention_policy) VALUES ('catalog-source', 'OFFICIAL', 5, 'Test', 'TEST_ONLY')",
    )
    .run();
  db.database
    .prepare(
      "INSERT OR IGNORE INTO source_snapshots (id, source_id, fetched_at, content_hash) VALUES ('catalog-snapshot', 'catalog-source', ?, 'test-hash')",
    )
    .run(fixedNow.toISOString());
  db.database
    .prepare(
      "INSERT OR IGNORE INTO source_resources (id, source_id, landing_url, resource_url, agency, license_name, rights_basis, terms_url, content_scope, format, fetched_at, content_hash) VALUES ('catalog-resource', 'catalog-source', 'https://example.test', 'https://example.test/data', 'Test', 'CC0', 'OPEN_LICENSE', 'https://example.test/terms', 'tests', 'JSON', ?, 'test-hash')",
    )
    .run(fixedNow.toISOString());
  db.database
    .prepare(
      "INSERT OR IGNORE INTO import_runs (id, area_id, importer_version, started_at, completed_at, status) VALUES ('catalog-run', 'area-yuanshan', 'test', ?, ?, 'COMPLETED')",
    )
    .run(fixedNow.toISOString(), fixedNow.toISOString());
  if (imported) {
    db.database
      .prepare(
        "INSERT INTO import_items (run_id, source_resource_id, external_id, subject_type, subject_id, status, source_snapshot_id) VALUES ('catalog-run', 'catalog-resource', ?, 'PLACE', ?, 'IMPORTED', 'catalog-snapshot')",
      )
      .run(id, id);
  }
  return id;
}

function insertPublicOffer(
  db,
  {
    id,
    placeId,
    minPeople = null,
    minQuantity = null,
    validFrom = null,
    validUntil = null,
    verificationStatus = 'OFFICIAL_CONFIRMED',
  },
) {
  db.database
    .prepare(
      `INSERT INTO offers
         (id, place_id, offer_type, title, regular_price_twd, offer_price_twd,
          min_people, min_quantity, valid_from, valid_until,
          verification_status, visibility)
       VALUES (?, ?, 'GROUP_BUY', '公開優惠', 500, 400, ?, ?, ?, ?, ?, 'PUBLIC')`,
    )
    .run(
      id,
      placeId,
      minPeople,
      minQuantity,
      validFrom,
      validUntil,
      verificationStatus,
    );
  return id;
}

function addMember(db, teamId, userId, role = 'MEMBER') {
  db.database
    .prepare(
      "INSERT INTO team_members (team_id, user_id, role, member_status, joined_at) VALUES (?, ?, ?, 'ACTIVE', ?)",
    )
    .run(teamId, userId, role, fixedNow.toISOString());
}

function harness() {
  const db = new SqliteD1();
  let id = 0;
  let inviteToken = 0;
  return {
    db,
    options: {
      now: fixedNow,
      createId: () => `generated-${++id}`,
      createInviteToken: () => `${'A'.repeat(42)}${String(inviteToken++ % 10)}`,
    },
  };
}

function hasTeamError(code) {
  return (error) => error instanceof TeamServerError && error.code === code;
}

test('Team inputs are strict, bounded, and never accept client identity or pricing', () => {
  assert.deepEqual(parseCreateTeamInput({ name: '  省錢小隊  ' }), {
    name: '省錢小隊',
  });
  assert.deepEqual(parseCreateInviteInput({}), { maxUses: 10 });
  assert.deepEqual(parseRedeemInviteInput({ token: 'a'.repeat(43) }), {
    token: 'a'.repeat(43),
  });
  assert.deepEqual(parseUpsertCommitmentInput({ quantity: 2 }), {
    quantity: 2,
    maxCostTwd: null,
  });
  assert.deepEqual(parseCommitmentMutationInput({ action: 'WITHDRAW' }), {
    action: 'WITHDRAW',
  });
  assert.deepEqual(parseCommitmentMutationInput({ quantity: 3 }), {
    action: 'PLEDGE',
    quantity: 3,
    maxCostTwd: null,
  });

  for (const input of [
    { name: 'team', ownerId: 'attacker' },
    { name: '' },
    { name: 'x'.repeat(61) },
  ]) {
    assert.throws(() => parseCreateTeamInput(input), TeamContractError);
  }
  assert.throws(
    () => parseCreateInviteInput({ maxUses: 2, role: 'OWNER' }),
    TeamContractError,
  );
  assert.throws(
    () =>
      parseCreateCampaignInput({
        catalogItemId: 'PLACE:place-a',
        offerId: 'offer-a',
        title: '不允許兩種來源',
        targetPeople: 2,
        deadline: '2026-09-07T04:00:00.000Z',
      }),
    TeamContractError,
  );
  assert.throws(
    () =>
      parseCreateCampaignInput({
        catalogItemId: 'PLACE:place-a',
        title: '惡意價格',
        targetPeople: 2,
        deadline: '2026-09-07T04:00:00.000Z',
        offerPriceTwd: 1,
        verificationStatus: 'OFFICIAL_CONFIRMED',
      }),
    TeamContractError,
  );
  assert.throws(
    () => parseUpsertCommitmentInput({ quantity: 0, userId: 'attacker' }),
    TeamContractError,
  );
  for (const catalogItemId of [
    'place-a',
    'OPPORTUNITY:event-a',
    'PLACE:',
    'PLACE:../secret',
    'PLACE:台北',
    'PLACE:has space',
    ' PLACE:place-a',
  ]) {
    assert.throws(
      () =>
        parseCreateCampaignInput({
          catalogItemId,
          title: '錯誤 catalog id',
          targetPeople: 2,
          deadline: '2026-09-07T04:00:00.000Z',
        }),
      TeamContractError,
    );
  }
  for (const deadline of [
    '2026-02-30T04:00:00.000Z',
    '2026-09-07T24:00:00.000Z',
    '2026-09-07T04:60:00.000Z',
  ]) {
    assert.throws(
      () =>
        parseCreateCampaignInput({
          catalogItemId: 'PLACE:place-a',
          title: '錯誤日期',
          targetPeople: 2,
          deadline,
        }),
      TeamContractError,
    );
  }
  assert.throws(
    () =>
      parseCreateCampaignInput({
        placeId: 'place-a',
        title: '舊版欄位',
        targetPeople: 2,
        deadline: '2026-09-07T04:00:00.000Z',
      }),
    TeamContractError,
  );
  assert.throws(
    () =>
      parseCommitmentMutationInput({
        action: 'WITHDRAW',
        quantity: 1,
      }),
    TeamContractError,
  );
});

test('creating a team installs its owner and invite tokens are stored only as hashes', async () => {
  const { db, options } = harness();
  try {
    insertUser(db, 'owner');
    insertUser(db, 'member');
    const team = await createTeam(db, 'owner', { name: '圓山小隊' }, options);
    assert.equal(team.role, 'OWNER');
    assert.equal(team.memberCount, 1);
    assert.deepEqual(
      {
        ...db.database
          .prepare(
            'SELECT role, member_status FROM team_members WHERE team_id = ? AND user_id = ?',
          )
          .get(team.id, 'owner'),
      },
      { role: 'OWNER', member_status: 'ACTIVE' },
    );

    const invite = await createTeamInvite(
      db,
      'owner',
      team.id,
      { maxUses: 3 },
      options,
    );
    const stored = db.database
      .prepare(
        'SELECT token_hash, max_uses, use_count FROM team_invites WHERE id = ?',
      )
      .get(invite.id);
    assert.notEqual(stored.token_hash, invite.token);
    assert.equal(stored.token_hash, await hashInviteToken(invite.token));
    assert.equal(stored.max_uses, 3);
    assert.equal(stored.use_count, 0);
    assert.equal(
      new Date(invite.expiresAt).getTime() - fixedNow.getTime(),
      72 * 60 * 60 * 1_000,
    );

    addMember(db, team.id, 'member');
    await assert.rejects(
      () => createTeamInvite(db, 'member', team.id, {}, options),
      hasTeamError('team_role_required'),
    );
  } finally {
    db.close();
  }
});

test('redeeming an invite is idempotent and rejects expired or full invites', async () => {
  const { db, options } = harness();
  try {
    for (const user of ['owner', 'first', 'second', 'third'])
      insertUser(db, user);
    const team = await createTeam(db, 'owner', { name: '滿員測試' }, options);
    const invite = await createTeamInvite(
      db,
      'owner',
      team.id,
      { maxUses: 1 },
      options,
    );

    const first = await redeemTeamInvite(
      db,
      'first',
      { token: invite.token },
      options,
    );
    assert.equal(first.joined, true);
    const again = await redeemTeamInvite(
      db,
      'first',
      { token: invite.token },
      options,
    );
    assert.equal(again.joined, false);
    assert.equal(
      db.database
        .prepare('SELECT use_count FROM team_invites WHERE id = ?')
        .get(invite.id).use_count,
      1,
    );
    await assert.rejects(
      () => redeemTeamInvite(db, 'second', { token: invite.token }, options),
      hasTeamError('invite_full'),
    );

    const expired = await createTeamInvite(db, 'owner', team.id, {}, options);
    db.database
      .prepare('UPDATE team_invites SET expires_at = ? WHERE id = ?')
      .run('2026-09-06T03:59:59.000Z', expired.id);
    await assert.rejects(
      () => redeemTeamInvite(db, 'third', { token: expired.token }, options),
      hasTeamError('invite_expired'),
    );
  } finally {
    db.close();
  }
});

test('campaign intent offers contain no invented pricing and commitments update threshold atomically', async () => {
  const { db, options } = harness();
  try {
    for (const user of ['owner', 'member', 'outsider']) insertUser(db, user);
    const placeId = insertPlace(db);
    const team = await createTeam(db, 'owner', { name: '便當團' }, options);
    addMember(db, team.id, 'member');

    await assert.rejects(
      () =>
        createTeamCampaign(
          db,
          'member',
          team.id,
          {
            catalogItemId: `PLACE:${placeId}`,
            title: '兩人便當意願',
            targetPeople: 2,
            deadline: '2026-09-07T04:00:00.000Z',
          },
          options,
        ),
      hasTeamError('team_role_required'),
    );

    let campaign = await createTeamCampaign(
      db,
      'owner',
      team.id,
      {
        catalogItemId: `PLACE:${placeId}`,
        title: '兩人便當意願',
        targetPeople: 2,
        deadline: '2026-09-07T04:00:00.000Z',
      },
      options,
    );
    assert.equal(campaign.pricingVerified, false);
    assert.equal(campaign.offer.catalogItemId, `PLACE:${placeId}`);
    const offer = {
      ...db.database
        .prepare(
          'SELECT offer_type, regular_price_twd, offer_price_twd, verification_status, visibility FROM offers WHERE id = ?',
        )
        .get(campaign.offer.id),
    };
    assert.deepEqual(offer, {
      offer_type: 'TEAM_INTENT',
      regular_price_twd: null,
      offer_price_twd: null,
      verification_status: 'UNVERIFIED',
      visibility: 'TEAM',
    });

    await assert.rejects(
      () =>
        upsertTeamCommitment(
          db,
          'outsider',
          campaign.id,
          { quantity: 1 },
          options,
        ),
      hasTeamError('team_membership_required'),
    );

    campaign = await upsertTeamCommitment(
      db,
      'owner',
      campaign.id,
      { quantity: 1 },
      options,
    );
    campaign = await upsertTeamCommitment(
      db,
      'owner',
      campaign.id,
      { quantity: 1 },
      options,
    );
    assert.equal(campaign.progress.pledgedPeople, 1);
    assert.equal(campaign.status, 'OPEN');
    assert.equal(
      db.database
        .prepare(
          'SELECT COUNT(*) AS count FROM group_commitments WHERE campaign_id = ?',
        )
        .get(campaign.id).count,
      1,
    );

    campaign = await upsertTeamCommitment(
      db,
      'member',
      campaign.id,
      { quantity: 1, maxCostTwd: 300 },
      options,
    );
    assert.equal(campaign.progress.pledgedPeople, 2);
    assert.equal(campaign.progress.thresholdMet, true);
    assert.equal(campaign.status, 'THRESHOLD_MET');

    campaign = await withdrawTeamCommitment(db, 'member', campaign.id, options);
    campaign = await withdrawTeamCommitment(db, 'member', campaign.id, options);
    assert.equal(campaign.progress.pledgedPeople, 1);
    assert.equal(campaign.progress.thresholdMet, false);
    assert.equal(campaign.status, 'OPEN');
    assert.equal(
      db.database
        .prepare(
          "SELECT COUNT(*) AS count FROM group_commitments WHERE campaign_id = ? AND status = 'WITHDRAWN'",
        )
        .get(campaign.id).count,
      1,
    );

    const readBack = await readTeamCampaign(db, 'owner', campaign.id, options);
    assert.deepEqual(readBack.progress, campaign.progress);
  } finally {
    db.close();
  }
});

test('parsed PLEDGE mutations project to the strict server commitment input', async () => {
  const { db, options } = harness();
  try {
    insertUser(db, 'owner');
    const placeId = insertPlace(db);
    const team = await createTeam(db, 'owner', { name: '路由契約團' }, options);
    const campaign = await createTeamCampaign(
      db,
      'owner',
      team.id,
      {
        catalogItemId: `PLACE:${placeId}`,
        title: '路由承諾測試',
        targetPeople: 2,
        deadline: '2026-09-07T04:00:00.000Z',
      },
      options,
    );
    const mutation = parseCommitmentMutationInput({
      action: 'PLEDGE',
      quantity: 2,
      maxCostTwd: 450,
    });
    const serverInput = pledgeInputFromMutation(mutation);
    assert.deepEqual(serverInput, { quantity: 2, maxCostTwd: 450 });
    assert.equal('action' in serverInput, false);

    const updated = await upsertTeamCommitment(
      db,
      'owner',
      campaign.id,
      serverInput,
      options,
    );
    assert.deepEqual(updated.myCommitment, {
      quantity: 2,
      maxCostTwd: 450,
      status: 'PLEDGED',
      updatedAt: fixedNow.toISOString(),
    });
  } finally {
    db.close();
  }
});

test('campaign writes reject missing offers, elapsed deadlines, and closed campaigns', async () => {
  const { db, options } = harness();
  try {
    insertUser(db, 'owner');
    insertPlace(db);
    const team = await createTeam(db, 'owner', { name: '截止測試' }, options);
    await assert.rejects(
      () =>
        createTeamCampaign(
          db,
          'owner',
          team.id,
          {
            offerId: 'missing-offer',
            title: '不存在優惠',
            targetPeople: 2,
            deadline: '2026-09-07T04:00:00.000Z',
          },
          options,
        ),
      hasTeamError('offer_not_found'),
    );
    await assert.rejects(
      () =>
        createTeamCampaign(
          db,
          'owner',
          team.id,
          {
            catalogItemId: 'PLACE:place-yuanshan',
            title: '過期意願',
            targetPeople: 2,
            deadline: '2026-09-06T03:00:00.000Z',
          },
          options,
        ),
      hasTeamError('invalid_campaign_deadline'),
    );

    const campaign = await createTeamCampaign(
      db,
      'owner',
      team.id,
      {
        catalogItemId: 'PLACE:place-yuanshan',
        title: '關閉意願',
        targetPeople: 2,
        deadline: '2026-09-07T04:00:00.000Z',
      },
      options,
    );
    db.database
      .prepare("UPDATE group_campaigns SET status = 'CLOSED' WHERE id = ?")
      .run(campaign.id);
    await assert.rejects(
      () =>
        upsertTeamCommitment(
          db,
          'owner',
          campaign.id,
          { quantity: 1 },
          options,
        ),
      hasTeamError('campaign_closed'),
    );
  } finally {
    db.close();
  }
});

test('campaign discovery is membership-protected and orders active before historical campaigns', async () => {
  const { db, options } = harness();
  try {
    insertUser(db, 'owner');
    insertUser(db, 'outsider');
    const placeId = insertPlace(db);
    const team = await createTeam(db, 'owner', { name: '探索團' }, options);
    const makeCampaign = (title, deadline) =>
      createTeamCampaign(
        db,
        'owner',
        team.id,
        {
          catalogItemId: `PLACE:${placeId}`,
          title,
          targetPeople: 2,
          deadline,
        },
        options,
      );

    const active = await makeCampaign('進行中', '2026-09-07T04:00:00.000Z');
    const expired = await makeCampaign('已過期', '2026-09-08T04:00:00.000Z');
    const closed = await makeCampaign('已關閉', '2026-09-09T04:00:00.000Z');
    db.database
      .prepare('UPDATE group_campaigns SET deadline = ? WHERE id = ?')
      .run('2026-09-05T04:00:00.000Z', expired.id);
    db.database
      .prepare("UPDATE group_campaigns SET status = 'CLOSED' WHERE id = ?")
      .run(closed.id);

    const campaigns = await listTeamCampaignsForUser(
      db,
      'owner',
      team.id,
      options,
    );
    assert.deepEqual(
      campaigns.map((campaign) => campaign.id),
      [active.id, closed.id, expired.id],
    );
    assert.deepEqual(
      campaigns.map((campaign) => campaign.status),
      ['OPEN', 'CLOSED', 'EXPIRED'],
    );
    assert.ok(
      campaigns.every(
        (campaign) => campaign.offer.catalogItemId === `PLACE:${placeId}`,
      ),
    );
    await assert.rejects(
      () => listTeamCampaignsForUser(db, 'outsider', team.id, options),
      hasTeamError('team_membership_required'),
    );
  } finally {
    db.close();
  }
});

test('TEAM offers are reusable only inside their owning team', async () => {
  const { db, options } = harness();
  try {
    insertUser(db, 'owner-a');
    insertUser(db, 'owner-b');
    const placeId = insertPlace(db);
    const teamA = await createTeam(db, 'owner-a', { name: 'A 團' }, options);
    const teamB = await createTeam(db, 'owner-b', { name: 'B 團' }, options);
    const original = await createTeamCampaign(
      db,
      'owner-a',
      teamA.id,
      {
        catalogItemId: `PLACE:${placeId}`,
        title: 'A 團私有意願',
        targetPeople: 2,
        deadline: '2026-09-10T04:00:00.000Z',
      },
      options,
    );

    await assert.rejects(
      () =>
        createTeamCampaign(
          db,
          'owner-b',
          teamB.id,
          {
            offerId: original.offer.id,
            title: '跨團竊用',
            targetPeople: 2,
            deadline: '2026-09-09T04:00:00.000Z',
          },
          options,
        ),
      (error) =>
        error instanceof TeamServerError &&
        error.status === 404 &&
        error.code === 'offer_not_found',
    );

    const sameTeam = await createTeamCampaign(
      db,
      'owner-a',
      teamA.id,
      {
        offerId: original.offer.id,
        title: '同團延伸',
        targetPeople: 2,
        deadline: '2026-09-09T04:00:00.000Z',
      },
      options,
    );
    assert.equal(sameTeam.offer.id, original.offer.id);
  } finally {
    db.close();
  }
});

test('verified offers enforce validity and acquisition minima', async () => {
  const { db, options } = harness();
  try {
    insertUser(db, 'owner');
    insertUser(db, 'member');
    const placeId = insertPlace(db);
    const team = await createTeam(db, 'owner', { name: '優惠門檻團' }, options);
    addMember(db, team.id, 'member');
    const offerId = insertPublicOffer(db, {
      id: 'public-minimum-offer',
      placeId,
      minPeople: 10,
      minQuantity: 20,
      validFrom: '2026-09-05T04:00:00.000Z',
      validUntil: '2026-09-10T04:00:00.000Z',
    });

    for (const input of [
      { targetPeople: 2, targetQuantity: 20 },
      { targetPeople: 10 },
      { targetPeople: 10, targetQuantity: 19 },
    ]) {
      await assert.rejects(
        () =>
          createTeamCampaign(
            db,
            'owner',
            team.id,
            {
              offerId,
              title: '低於真實門檻',
              ...input,
              deadline: '2026-09-09T04:00:00.000Z',
            },
            options,
          ),
        hasTeamError('campaign_target_below_offer_minimum'),
      );
    }
    await assert.rejects(
      () =>
        createTeamCampaign(
          db,
          'owner',
          team.id,
          {
            offerId,
            title: '超出優惠期限',
            targetPeople: 10,
            targetQuantity: 20,
            deadline: '2026-09-11T04:00:00.000Z',
          },
          options,
        ),
      hasTeamError('campaign_deadline_exceeds_offer'),
    );

    let campaign = await createTeamCampaign(
      db,
      'owner',
      team.id,
      {
        offerId,
        title: '十人成團優惠',
        targetPeople: 10,
        targetQuantity: 20,
        deadline: '2026-09-09T04:00:00.000Z',
      },
      options,
    );
    assert.equal(campaign.pricingVerified, true);
    campaign = await upsertTeamCommitment(
      db,
      'owner',
      campaign.id,
      { quantity: 10 },
      options,
    );
    campaign = await upsertTeamCommitment(
      db,
      'member',
      campaign.id,
      { quantity: 10 },
      options,
    );
    assert.equal(campaign.progress.pledgedPeople, 2);
    assert.equal(campaign.progress.pledgedQuantity, 20);
    assert.equal(campaign.progress.thresholdMet, false);
    assert.equal(campaign.status, 'OPEN');

    db.database
      .prepare('UPDATE offers SET valid_from = ? WHERE id = ?')
      .run('2026-09-07T04:00:00.000Z', offerId);
    assert.equal(
      (await readTeamCampaign(db, 'owner', campaign.id, options))
        .pricingVerified,
      false,
    );
    assert.equal(
      (await listTeamCampaignsForUser(db, 'owner', team.id, options)).find(
        (listed) => listed.id === campaign.id,
      ).pricingVerified,
      false,
    );

    db.database
      .prepare('UPDATE offers SET valid_from = ?, valid_until = ? WHERE id = ?')
      .run('2026-09-05T04:00:00.000Z', '2026-09-06T03:59:59.000Z', offerId);
    assert.equal(
      (await readTeamCampaign(db, 'owner', campaign.id, options))
        .pricingVerified,
      false,
    );
    await assert.rejects(
      () =>
        createTeamCampaign(
          db,
          'owner',
          team.id,
          {
            offerId,
            title: '過期優惠',
            targetPeople: 10,
            targetQuantity: 20,
            deadline: '2026-09-08T04:00:00.000Z',
          },
          options,
        ),
      hasTeamError('offer_expired'),
    );
  } finally {
    db.close();
  }
});

test('intent campaigns accept only places currently eligible for the catalog', async () => {
  const { db, options } = harness();
  try {
    insertUser(db, 'owner');
    const team = await createTeam(db, 'owner', { name: 'Catalog 團' }, options);
    insertPlace(db, 'permanently-closed', { status: 'PERM_CLOSED' });
    insertPlace(db, 'missing-location', { latE6: null });
    insertPlace(db, 'unsupported-venue', { kind: 'VENUE' });
    insertPlace(db, 'not-currently-imported', { imported: false });
    insertPlace(db, 'non-pharmacy-store', { kind: 'STORE' });

    for (const placeId of [
      'permanently-closed',
      'missing-location',
      'unsupported-venue',
      'not-currently-imported',
      'non-pharmacy-store',
    ]) {
      await assert.rejects(
        () =>
          createTeamCampaign(
            db,
            'owner',
            team.id,
            {
              catalogItemId: `PLACE:${placeId}`,
              title: '非 catalog 地點',
              targetPeople: 2,
              deadline: '2026-09-07T04:00:00.000Z',
            },
            options,
          ),
        hasTeamError('place_not_found'),
      );
    }

    const pharmacyId = insertPlace(db, 'eligible-pharmacy', {
      kind: 'STORE',
      provider: 'TAIPEI_PHARMACY',
    });
    const campaign = await createTeamCampaign(
      db,
      'owner',
      team.id,
      {
        catalogItemId: `PLACE:${pharmacyId}`,
        title: '合格藥局意願',
        targetPeople: 2,
        deadline: '2026-09-07T04:00:00.000Z',
      },
      options,
    );
    assert.equal(campaign.offer.catalogItemId, `PLACE:${pharmacyId}`);
  } finally {
    db.close();
  }
});

test('campaign discovery caps at 50 with two D1 queries and deterministic order', async () => {
  const { db, options } = harness();
  try {
    insertUser(db, 'owner');
    const placeId = insertPlace(db);
    const team = await createTeam(db, 'owner', { name: '大型探索團' }, options);
    const created = [];
    for (let index = 1; index <= 55; index += 1) {
      created.push(
        await createTeamCampaign(
          db,
          'owner',
          team.id,
          {
            catalogItemId: `PLACE:${placeId}`,
            title: `活動 ${String(index).padStart(2, '0')}`,
            targetPeople: 2,
            deadline: new Date(
              fixedNow.getTime() + index * 86_400_000,
            ).toISOString(),
          },
          options,
        ),
      );
    }
    await upsertTeamCommitment(
      db,
      'owner',
      created[0].id,
      { quantity: 3, maxCostTwd: 500 },
      options,
    );

    const queryCountBefore = db.queryCount;
    const listed = await listTeamCampaignsForUser(
      db,
      'owner',
      team.id,
      options,
    );
    assert.equal(db.queryCount - queryCountBefore, 2);
    assert.equal(listed.length, TEAM_CAMPAIGN_LIST_LIMIT);
    assert.deepEqual(
      listed.map((campaign) => campaign.id),
      created.slice(0, TEAM_CAMPAIGN_LIST_LIMIT).map((campaign) => campaign.id),
    );
    assert.equal(listed[0].progress.pledgedPeople, 1);
    assert.equal(listed[0].progress.pledgedQuantity, 3);
    assert.deepEqual(listed[0].myCommitment, {
      quantity: 3,
      maxCostTwd: 500,
      status: 'PLEDGED',
      updatedAt: fixedNow.toISOString(),
    });
  } finally {
    db.close();
  }
});
