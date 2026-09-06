import {
  type CampaignOfferDto,
  type CampaignProgressDto,
  type CampaignStatus,
  parseCreateCampaignInput,
  parseCreateInviteInput,
  parseCreateTeamInput,
  parseRedeemInviteInput,
  parseUpsertCommitmentInput,
  rawPlaceIdFromCatalogItemId,
  type RedeemedInviteDto,
  TEAM_INVITE_TTL_MS,
  TEAM_MAX_CAMPAIGN_DAYS,
  TeamContractError,
  type TeamCampaignDto,
  type TeamCommitmentDto,
  type TeamDto,
  type TeamInviteDto,
  type TeamRole,
  type TeamStatus,
} from './team-contract.ts';

export type TeamRunResult = { meta?: { changes?: number } };

export type TeamStatement = {
  bind: (...values: unknown[]) => TeamStatement;
  first: <T>() => Promise<T | null>;
  all?: <T>() => Promise<{ results?: T[] } | T[]>;
  run: () => Promise<TeamRunResult>;
};

export type TeamDatabase = {
  prepare: (query: string) => TeamStatement;
  batch: (statements: TeamStatement[]) => Promise<unknown[]>;
};

export type TeamServerOptions = {
  now?: Date;
  createId?: () => string;
  createInviteToken?: () => string;
};

type TeamMembershipRow = {
  id: string;
  name: string;
  status: TeamStatus;
  role: TeamRole;
  created_at: string;
  updated_at: string;
  version: number;
  member_count: number;
  active_campaign_count: number;
};

type InviteRow = {
  id: string;
  team_id: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  revoked_at: string | null;
  team_status: TeamStatus;
};

type OfferRow = {
  id: string;
  place_id: string;
  offer_type: string;
  title: string;
  regular_price_twd: number | null;
  offer_price_twd: number | null;
  min_people: number | null;
  min_quantity: number | null;
  verification_status: string;
  visibility: 'PRIVATE' | 'TEAM' | 'PUBLIC';
  valid_from: string | null;
  valid_until: string | null;
};

type CampaignRow = OfferRow & {
  campaign_id: string;
  team_id: string;
  campaign_title: string;
  target_people: number;
  target_quantity: number | null;
  deadline: string;
  campaign_status: CampaignStatus;
  version: number;
};

type CampaignListRow = CampaignRow & {
  pledged_people: number;
  pledged_quantity: number;
  my_quantity: number | null;
  my_max_cost_twd: number | null;
  my_status: 'PLEDGED' | 'CONFIRMED' | 'WITHDRAWN' | null;
  my_updated_at: string | null;
};

type ProgressRow = {
  pledged_people: number;
  pledged_quantity: number;
};

type CommitmentRow = {
  quantity: number;
  max_cost_twd: number | null;
  status: 'PLEDGED' | 'CONFIRMED' | 'WITHDRAWN';
  updated_at: string;
};

const pricingVerificationStatuses = new Set([
  'CORROBORATED',
  'PROVIDER_CONFIRMED',
  'OFFICIAL_CONFIRMED',
]);
export const TEAM_CAMPAIGN_LIST_LIMIT = 50;

export class TeamServerError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function serverOptions(options?: TeamServerOptions) {
  return {
    now: options?.now ? new Date(options.now) : new Date(),
    createId: options?.createId ?? (() => crypto.randomUUID()),
    createInviteToken: options?.createInviteToken ?? randomInviteToken,
  };
}

function randomInviteToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export async function hashInviteToken(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function resultChanges(result: unknown) {
  if (!result || typeof result !== 'object' || !('meta' in result)) return 0;
  const meta = (result as { meta?: unknown }).meta;
  if (!meta || typeof meta !== 'object' || !('changes' in meta)) return 0;
  const changes = (meta as { changes?: unknown }).changes;
  return typeof changes === 'number' ? changes : 0;
}

function teamDto(row: TeamMembershipRow): TeamDto {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    role: row.role,
    memberCount: Number(row.member_count),
    activeCampaignCount: Number(row.active_campaign_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: Number(row.version),
  };
}

async function statementRows<T>(statement: TeamStatement) {
  if (!statement.all) {
    throw new TeamServerError(
      503,
      'team_query_unavailable',
      '團隊查詢暫時無法使用。',
    );
  }
  const response = await statement.all<T>();
  return Array.isArray(response) ? response : (response.results ?? []);
}

async function loadTeamMembership(
  db: TeamDatabase,
  teamId: string,
  userId: string,
  now = new Date(),
) {
  return db
    .prepare(
      `SELECT t.id, t.name, t.status, t.created_at, t.updated_at, t.version,
              tm.role,
              (SELECT COUNT(*) FROM team_members active_member
                WHERE active_member.team_id = t.id
                  AND active_member.member_status = 'ACTIVE') AS member_count,
              (SELECT COUNT(*) FROM group_campaigns campaign
                WHERE campaign.team_id = t.id
                  AND campaign.status IN ('OPEN', 'THRESHOLD_MET')
                  AND campaign.deadline > ?) AS active_campaign_count
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
        WHERE t.id = ? AND tm.user_id = ? AND tm.member_status = 'ACTIVE'`,
    )
    .bind(now.toISOString(), teamId, userId)
    .first<TeamMembershipRow>();
}

async function requireTeamMembership(
  db: TeamDatabase,
  teamId: string,
  userId: string,
  options: {
    roles?: readonly TeamRole[];
    write?: boolean;
    now: Date;
  },
) {
  const row = await db
    .prepare(
      `SELECT t.id, t.name, t.status, t.created_at, t.updated_at, t.version,
              tm.role,
              (SELECT COUNT(*) FROM team_members active_member
                WHERE active_member.team_id = t.id
                  AND active_member.member_status = 'ACTIVE') AS member_count,
              (SELECT COUNT(*) FROM group_campaigns campaign
                WHERE campaign.team_id = t.id
                  AND campaign.status IN ('OPEN', 'THRESHOLD_MET')
                  AND campaign.deadline > ?) AS active_campaign_count
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
        WHERE t.id = ? AND tm.user_id = ? AND tm.member_status = 'ACTIVE'`,
    )
    .bind(options.now.toISOString(), teamId, userId)
    .first<TeamMembershipRow>();
  if (!row) {
    throw new TeamServerError(
      403,
      'team_membership_required',
      '只有團隊的有效成員可以進行這個操作。',
    );
  }
  if (options.write && row.status !== 'ACTIVE') {
    throw new TeamServerError(409, 'team_archived', '這個團隊已封存。');
  }
  if (options.roles && !options.roles.includes(row.role)) {
    throw new TeamServerError(
      403,
      'team_role_required',
      '只有團主或管理員可以進行這個操作。',
    );
  }
  return row;
}

export async function listTeamsForUser(
  db: TeamDatabase,
  userId: string,
  options?: TeamServerOptions,
) {
  const { now } = serverOptions(options);
  const statement = db
    .prepare(
      `SELECT t.id, t.name, t.status, t.created_at, t.updated_at, t.version,
              tm.role,
              (SELECT COUNT(*) FROM team_members active_member
                WHERE active_member.team_id = t.id
                  AND active_member.member_status = 'ACTIVE') AS member_count,
              (SELECT COUNT(*) FROM group_campaigns campaign
                WHERE campaign.team_id = t.id
                  AND campaign.status IN ('OPEN', 'THRESHOLD_MET')
                  AND campaign.deadline > ?) AS active_campaign_count
         FROM teams t
         JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = ? AND tm.member_status = 'ACTIVE'
        ORDER BY t.updated_at DESC, t.id ASC`,
    )
    .bind(now.toISOString(), userId);
  const rows = await statementRows<TeamMembershipRow>(statement);
  return rows.map(teamDto);
}

export async function readTeamForUser(
  db: TeamDatabase,
  userId: string,
  teamId: string,
  options?: TeamServerOptions,
) {
  const { now } = serverOptions(options);
  return teamDto(await requireTeamMembership(db, teamId, userId, { now }));
}

export async function createTeam(
  db: TeamDatabase,
  userId: string,
  input: unknown,
  options?: TeamServerOptions,
) {
  const parsed = parseCreateTeamInput(input);
  const { now, createId } = serverOptions(options);
  const id = createId();
  const timestamp = now.toISOString();
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO teams (id, name, owner_id, status, created_at, updated_at, version) VALUES (?, ?, ?, 'ACTIVE', ?, ?, 1)",
        )
        .bind(id, parsed.name, userId, timestamp, timestamp),
      db
        .prepare(
          "INSERT INTO team_members (team_id, user_id, role, member_status, joined_at) VALUES (?, ?, 'OWNER', 'ACTIVE', ?)",
        )
        .bind(id, userId, timestamp),
    ]);
  } catch {
    throw new TeamServerError(
      503,
      'team_create_failed',
      '團隊暫時無法建立，請稍後再試。',
    );
  }
  return {
    id,
    name: parsed.name,
    status: 'ACTIVE',
    role: 'OWNER',
    memberCount: 1,
    activeCampaignCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  } satisfies TeamDto;
}

export async function createTeamInvite(
  db: TeamDatabase,
  userId: string,
  teamId: string,
  input: unknown,
  options?: TeamServerOptions,
) {
  const parsed = parseCreateInviteInput(input);
  const resolved = serverOptions(options);
  await requireTeamMembership(db, teamId, userId, {
    roles: ['OWNER', 'ADMIN'],
    write: true,
    now: resolved.now,
  });
  const token = resolved.createInviteToken();
  parseRedeemInviteInput({ token });
  const tokenHash = await hashInviteToken(token);
  const id = resolved.createId();
  const expiresAt = new Date(
    resolved.now.getTime() + TEAM_INVITE_TTL_MS,
  ).toISOString();
  let result: TeamRunResult;
  try {
    result = await db
      .prepare(
        `INSERT INTO team_invites
           (id, team_id, token_hash, created_by, expires_at, max_uses, use_count, revoked_at)
         SELECT ?, t.id, ?, ?, ?, ?, 0, NULL
           FROM teams t
           JOIN team_members member ON member.team_id = t.id
          WHERE t.id = ? AND t.status = 'ACTIVE'
            AND member.user_id = ? AND member.member_status = 'ACTIVE'
            AND member.role IN ('OWNER', 'ADMIN')`,
      )
      .bind(id, tokenHash, userId, expiresAt, parsed.maxUses, teamId, userId)
      .run();
  } catch {
    throw new TeamServerError(
      503,
      'invite_create_failed',
      '邀請暫時無法建立，請稍後再試。',
    );
  }
  if (resultChanges(result) !== 1) {
    throw new TeamServerError(
      403,
      'team_role_required',
      '只有團主或管理員可以建立邀請。',
    );
  }
  return {
    id,
    teamId,
    token,
    expiresAt,
    maxUses: parsed.maxUses,
    useCount: 0,
  } satisfies TeamInviteDto;
}

async function loadInvite(db: TeamDatabase, tokenHash: string) {
  return db
    .prepare(
      `SELECT invite.id, invite.team_id, invite.expires_at, invite.max_uses,
              invite.use_count, invite.revoked_at, team.status AS team_status
         FROM team_invites invite
         JOIN teams team ON team.id = invite.team_id
        WHERE invite.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<InviteRow>();
}

export async function redeemTeamInvite(
  db: TeamDatabase,
  userId: string,
  input: unknown,
  options?: TeamServerOptions,
): Promise<RedeemedInviteDto> {
  const parsed = parseRedeemInviteInput(input);
  const { now } = serverOptions(options);
  const tokenHash = await hashInviteToken(parsed.token);
  const invite = await loadInvite(db, tokenHash);
  if (!invite) {
    throw new TeamServerError(404, 'invite_not_found', '找不到這份邀請。');
  }
  if (invite.team_status !== 'ACTIVE') {
    throw new TeamServerError(409, 'team_archived', '這個團隊已封存。');
  }

  const existing = await loadTeamMembership(db, invite.team_id, userId, now);
  if (existing) return { team: teamDto(existing), joined: false };
  if (invite.revoked_at) {
    throw new TeamServerError(410, 'invite_revoked', '這份邀請已被撤銷。');
  }
  if (Date.parse(invite.expires_at) <= now.getTime()) {
    throw new TeamServerError(410, 'invite_expired', '這份邀請已過期。');
  }
  if (invite.use_count >= invite.max_uses) {
    throw new TeamServerError(409, 'invite_full', '這份邀請已達使用上限。');
  }

  const timestamp = now.toISOString();
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO team_members
           (team_id, user_id, role, member_status, joined_at)
         SELECT invite.team_id, ?, 'MEMBER', 'ACTIVE', ?
           FROM team_invites invite
           JOIN teams team ON team.id = invite.team_id
          WHERE invite.id = ? AND invite.revoked_at IS NULL
            AND invite.expires_at > ? AND invite.use_count < invite.max_uses
            AND team.status = 'ACTIVE'
         ON CONFLICT(team_id, user_id) DO UPDATE SET
           role = 'MEMBER', member_status = 'ACTIVE', joined_at = excluded.joined_at
         WHERE team_members.member_status <> 'ACTIVE'`,
      )
      .bind(userId, timestamp, invite.id, timestamp),
    db
      .prepare(
        `UPDATE team_invites
            SET use_count = use_count + 1
          WHERE id = ? AND revoked_at IS NULL AND expires_at > ?
            AND use_count < max_uses AND changes() = 1`,
      )
      .bind(invite.id, timestamp),
  ]);
  const joined = resultChanges(results[1]) === 1;
  const membership = await loadTeamMembership(db, invite.team_id, userId, now);
  if (!membership) {
    const latest = await loadInvite(db, tokenHash);
    if (latest && latest.use_count >= latest.max_uses) {
      throw new TeamServerError(409, 'invite_full', '這份邀請已達使用上限。');
    }
    throw new TeamServerError(
      409,
      'invite_unavailable',
      '邀請已無法使用，請請團主重新建立。',
    );
  }
  return { team: teamDto(membership), joined };
}

async function loadEligibleOffer(
  db: TeamDatabase,
  offerId: string,
  teamId: string,
) {
  return db
    .prepare(
      `SELECT id, place_id, offer_type, title, regular_price_twd,
              offer_price_twd, min_people, min_quantity,
              verification_status, visibility, valid_from, valid_until
         FROM offers offer
        WHERE offer.id = ?
          AND (
            offer.visibility = 'PUBLIC'
            OR EXISTS (
              SELECT 1
                FROM group_campaigns campaign
               WHERE campaign.offer_id = offer.id AND campaign.team_id = ?
            )
          )`,
    )
    .bind(offerId, teamId)
    .first<OfferRow>();
}

function offerTime(value: string | null) {
  if (value === null) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function assertOfferCampaignRules(
  offer: OfferRow,
  input: {
    targetPeople: number;
    targetQuantity: number | null;
    deadline: string;
  },
  now: Date,
) {
  const validUntil = offerTime(offer.valid_until);
  if (
    offer.valid_until !== null &&
    (validUntil === null ||
      !Number.isFinite(validUntil) ||
      validUntil <= now.getTime())
  ) {
    throw new TeamServerError(
      409,
      'offer_expired',
      '這個 offer 已過有效期限。',
    );
  }
  if (
    validUntil !== null &&
    Number.isFinite(validUntil) &&
    Date.parse(input.deadline) > validUntil
  ) {
    throw new TeamServerError(
      400,
      'campaign_deadline_exceeds_offer',
      '活動截止時間不能晚於 offer 有效期限。',
    );
  }
  if (
    (offer.min_people !== null && input.targetPeople < offer.min_people) ||
    (offer.min_quantity !== null &&
      (input.targetQuantity === null ||
        input.targetQuantity < offer.min_quantity))
  ) {
    throw new TeamServerError(
      400,
      'campaign_target_below_offer_minimum',
      '活動門檻不能低於 offer 的成團條件。',
    );
  }
}

function assertCampaignDeadline(deadline: string, now: Date) {
  const deadlineMs = Date.parse(deadline);
  if (
    deadlineMs <= now.getTime() ||
    deadlineMs > now.getTime() + TEAM_MAX_CAMPAIGN_DAYS * 86_400_000
  ) {
    throw new TeamServerError(
      400,
      'invalid_campaign_deadline',
      `截止時間必須在未來 ${TEAM_MAX_CAMPAIGN_DAYS} 天內。`,
    );
  }
}

export async function createTeamCampaign(
  db: TeamDatabase,
  userId: string,
  teamId: string,
  input: unknown,
  options?: TeamServerOptions,
) {
  const parsed = parseCreateCampaignInput(input);
  const resolved = serverOptions(options);
  assertCampaignDeadline(parsed.deadline, resolved.now);
  await requireTeamMembership(db, teamId, userId, {
    roles: ['OWNER', 'ADMIN'],
    write: true,
    now: resolved.now,
  });

  let offer: OfferRow;
  const statements: TeamStatement[] = [];
  if (parsed.offerId) {
    const existing = await loadEligibleOffer(db, parsed.offerId, teamId);
    if (!existing) {
      throw new TeamServerError(404, 'offer_not_found', '找不到可用的 offer。');
    }
    assertOfferCampaignRules(existing, parsed, resolved.now);
    offer = existing;
  } else {
    const rawPlaceId = rawPlaceIdFromCatalogItemId(parsed.catalogItemId);
    const place = await db
      .prepare(
        `WITH latest_run AS (
           SELECT id
             FROM import_runs
            WHERE status = 'COMPLETED'
            ORDER BY completed_at DESC, id DESC
            LIMIT 1
         )
         SELECT place.id
           FROM places place
          WHERE place.id = ?
            AND place.status <> 'PERM_CLOSED'
            AND place.lat_e6 IS NOT NULL
            AND place.lng_e6 IS NOT NULL
            AND place.kind IN ('RESTAURANT', 'STORE', 'PUBLIC_RESOURCE', 'TRANSIT')
            AND (
              place.kind <> 'STORE'
              OR EXISTS (
                SELECT 1
                  FROM external_place_refs reference
                 WHERE reference.place_id = place.id
                   AND reference.provider = 'TAIPEI_PHARMACY'
              )
            )
            AND EXISTS (
              SELECT 1
                FROM import_items imported
               WHERE imported.run_id = (SELECT id FROM latest_run)
                 AND imported.subject_type = 'PLACE'
                 AND imported.subject_id = place.id
                 AND imported.status = 'IMPORTED'
            )`,
      )
      .bind(rawPlaceId)
      .first<{ id: string }>();
    if (!place) {
      throw new TeamServerError(404, 'place_not_found', '找不到這個地點。');
    }
    const offerId = resolved.createId();
    offer = {
      id: offerId,
      place_id: place.id,
      offer_type: 'TEAM_INTENT',
      title: parsed.title,
      regular_price_twd: null,
      offer_price_twd: null,
      min_people: parsed.targetPeople,
      min_quantity: parsed.targetQuantity,
      verification_status: 'UNVERIFIED',
      visibility: 'TEAM',
      valid_from: resolved.now.toISOString(),
      valid_until: parsed.deadline,
    };
    statements.push(
      db
        .prepare(
          `INSERT INTO offers
             (id, place_id, menu_item_id, offer_type, title,
              regular_price_twd, offer_price_twd, min_people, min_quantity,
              valid_from, valid_until, source_id, verification_status, visibility)
           VALUES (?, ?, NULL, 'TEAM_INTENT', ?, NULL, NULL, ?, ?, ?, ?, NULL,
                   'UNVERIFIED', 'TEAM')`,
        )
        .bind(
          offer.id,
          offer.place_id,
          parsed.title,
          parsed.targetPeople,
          parsed.targetQuantity,
          resolved.now.toISOString(),
          parsed.deadline,
        ),
    );
  }

  const campaignId = resolved.createId();
  statements.push(
    db
      .prepare(
        `INSERT INTO group_campaigns
           (id, team_id, offer_id, created_by, title, target_people,
            target_quantity, deadline, status, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 1)`,
      )
      .bind(
        campaignId,
        teamId,
        offer.id,
        userId,
        parsed.title,
        parsed.targetPeople,
        parsed.targetQuantity,
        parsed.deadline,
      ),
  );
  try {
    await db.batch(statements);
  } catch {
    throw new TeamServerError(
      503,
      'campaign_create_failed',
      '意願活動暫時無法建立，請稍後再試。',
    );
  }
  return readTeamCampaign(db, userId, campaignId, resolved);
}

async function loadCampaign(db: TeamDatabase, campaignId: string) {
  return db
    .prepare(
      `SELECT campaign.id AS campaign_id, campaign.team_id,
              campaign.title AS campaign_title, campaign.target_people,
              campaign.target_quantity, campaign.deadline,
              campaign.status AS campaign_status, campaign.version,
               offer.id, offer.place_id, offer.offer_type, offer.title,
               offer.regular_price_twd, offer.offer_price_twd,
               offer.min_people, offer.min_quantity, offer.verification_status,
               offer.visibility, offer.valid_from, offer.valid_until
         FROM group_campaigns campaign
         JOIN offers offer ON offer.id = campaign.offer_id
        WHERE campaign.id = ?`,
    )
    .bind(campaignId)
    .first<CampaignRow>();
}

async function loadTeamCampaigns(
  db: TeamDatabase,
  teamId: string,
  userId: string,
  now: Date,
) {
  return statementRows<CampaignListRow>(
    db
      .prepare(
        `WITH selected AS (
           SELECT campaign.*
             FROM group_campaigns campaign
            WHERE campaign.team_id = ?
            ORDER BY
              CASE WHEN campaign.status IN ('OPEN', 'THRESHOLD_MET')
                         AND campaign.deadline > ? THEN 0 ELSE 1 END,
              CASE WHEN campaign.status IN ('OPEN', 'THRESHOLD_MET')
                         AND campaign.deadline > ? THEN campaign.deadline END ASC,
              campaign.deadline DESC,
              campaign.id ASC
            LIMIT ?
         ),
         progress AS (
           SELECT commitment.campaign_id,
                  SUM(CASE WHEN commitment.status IN ('PLEDGED', 'CONFIRMED') THEN 1 ELSE 0 END) AS pledged_people,
                  SUM(CASE WHEN commitment.status IN ('PLEDGED', 'CONFIRMED') THEN commitment.quantity ELSE 0 END) AS pledged_quantity
             FROM group_commitments commitment
             JOIN selected ON selected.id = commitment.campaign_id
            GROUP BY commitment.campaign_id
         )
         SELECT campaign.id AS campaign_id, campaign.team_id,
                 campaign.title AS campaign_title, campaign.target_people,
                 campaign.target_quantity, campaign.deadline,
                 campaign.status AS campaign_status, campaign.version,
                 offer.id, offer.place_id, offer.offer_type, offer.title,
                 offer.regular_price_twd, offer.offer_price_twd,
                 offer.min_people, offer.min_quantity, offer.verification_status,
                 offer.visibility, offer.valid_from, offer.valid_until,
                 COALESCE(progress.pledged_people, 0) AS pledged_people,
                 COALESCE(progress.pledged_quantity, 0) AS pledged_quantity,
                 mine.quantity AS my_quantity,
                 mine.max_cost_twd AS my_max_cost_twd,
                 mine.status AS my_status,
                 mine.updated_at AS my_updated_at
            FROM selected campaign
            JOIN offers offer ON offer.id = campaign.offer_id
            LEFT JOIN progress ON progress.campaign_id = campaign.id
            LEFT JOIN group_commitments mine
              ON mine.campaign_id = campaign.id AND mine.user_id = ?
           ORDER BY
            CASE WHEN campaign.status IN ('OPEN', 'THRESHOLD_MET')
                       AND campaign.deadline > ? THEN 0 ELSE 1 END,
             CASE WHEN campaign.status IN ('OPEN', 'THRESHOLD_MET')
                        AND campaign.deadline > ? THEN campaign.deadline END ASC,
             campaign.deadline DESC,
             campaign.id ASC`,
      )
      .bind(
        teamId,
        now.toISOString(),
        now.toISOString(),
        TEAM_CAMPAIGN_LIST_LIMIT,
        userId,
        now.toISOString(),
        now.toISOString(),
      ),
  );
}

async function loadProgress(db: TeamDatabase, campaignId: string) {
  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('PLEDGED', 'CONFIRMED') THEN 1 ELSE 0 END), 0) AS pledged_people,
         COALESCE(SUM(CASE WHEN status IN ('PLEDGED', 'CONFIRMED') THEN quantity ELSE 0 END), 0) AS pledged_quantity
       FROM group_commitments
       WHERE campaign_id = ?`,
    )
    .bind(campaignId)
    .first<ProgressRow>();
  return {
    pledgedPeople: Number(row?.pledged_people ?? 0),
    pledgedQuantity: Number(row?.pledged_quantity ?? 0),
  };
}

async function loadCommitment(
  db: TeamDatabase,
  campaignId: string,
  userId: string,
) {
  return db
    .prepare(
      `SELECT quantity, max_cost_twd, status, updated_at
         FROM group_commitments
        WHERE campaign_id = ? AND user_id = ?`,
    )
    .bind(campaignId, userId)
    .first<CommitmentRow>();
}

function offerDto(row: CampaignRow): CampaignOfferDto {
  return {
    id: row.id,
    catalogItemId: `PLACE:${row.place_id}`,
    type: row.offer_type,
    title: row.title,
    regularPriceTwd: row.regular_price_twd,
    offerPriceTwd: row.offer_price_twd,
    verificationStatus: row.verification_status,
  };
}

function progressDto(
  row: CampaignRow,
  progress: { pledgedPeople: number; pledgedQuantity: number },
): CampaignProgressDto {
  return {
    ...progress,
    targetPeople: row.target_people,
    targetQuantity: row.target_quantity,
    thresholdMet:
      progress.pledgedPeople >= row.target_people &&
      (row.target_quantity === null ||
        progress.pledgedQuantity >= row.target_quantity),
  };
}

function effectiveCampaignStatus(
  row: CampaignRow,
  progress: CampaignProgressDto,
  now: Date,
): CampaignStatus {
  if (!['OPEN', 'THRESHOLD_MET'].includes(row.campaign_status)) {
    return row.campaign_status;
  }
  if (Date.parse(row.deadline) <= now.getTime()) return 'EXPIRED';
  return progress.thresholdMet ? 'THRESHOLD_MET' : 'OPEN';
}

function commitmentDto(row: CommitmentRow | null): TeamCommitmentDto | null {
  if (!row) return null;
  return {
    quantity: Number(row.quantity),
    maxCostTwd: row.max_cost_twd,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function pricingIsVerified(row: CampaignRow, now: Date) {
  const validFrom = offerTime(row.valid_from);
  const validUntil = offerTime(row.valid_until);
  return (
    row.offer_price_twd !== null &&
    pricingVerificationStatuses.has(row.verification_status) &&
    (validFrom === null ||
      (Number.isFinite(validFrom) && validFrom <= now.getTime())) &&
    (validUntil === null ||
      (Number.isFinite(validUntil) && validUntil > now.getTime()))
  );
}

async function campaignDto(
  db: TeamDatabase,
  userId: string,
  row: CampaignRow,
  now: Date,
): Promise<TeamCampaignDto> {
  const [progressValues, myCommitment] = await Promise.all([
    loadProgress(db, row.campaign_id),
    loadCommitment(db, row.campaign_id, userId),
  ]);
  const progress = progressDto(row, progressValues);
  return {
    id: row.campaign_id,
    teamId: row.team_id,
    title: row.campaign_title,
    status: effectiveCampaignStatus(row, progress, now),
    deadline: row.deadline,
    version: Number(row.version),
    offer: offerDto(row),
    pricingVerified: pricingIsVerified(row, now),
    progress,
    myCommitment: commitmentDto(myCommitment),
  };
}

function campaignListDto(row: CampaignListRow, now: Date): TeamCampaignDto {
  const progress = progressDto(row, {
    pledgedPeople: Number(row.pledged_people),
    pledgedQuantity: Number(row.pledged_quantity),
  });
  const myCommitment =
    row.my_status === null ||
    row.my_quantity === null ||
    row.my_updated_at === null
      ? null
      : commitmentDto({
          quantity: Number(row.my_quantity),
          max_cost_twd: row.my_max_cost_twd,
          status: row.my_status,
          updated_at: row.my_updated_at,
        });
  return {
    id: row.campaign_id,
    teamId: row.team_id,
    title: row.campaign_title,
    status: effectiveCampaignStatus(row, progress, now),
    deadline: row.deadline,
    version: Number(row.version),
    offer: offerDto(row),
    pricingVerified: pricingIsVerified(row, now),
    progress,
    myCommitment,
  };
}

export async function listTeamCampaignsForUser(
  db: TeamDatabase,
  userId: string,
  teamId: string,
  options?: TeamServerOptions,
) {
  const { now } = serverOptions(options);
  await requireTeamMembership(db, teamId, userId, { now });
  const rows = await loadTeamCampaigns(db, teamId, userId, now);
  return rows.map((row) => campaignListDto(row, now));
}

export async function readTeamCampaign(
  db: TeamDatabase,
  userId: string,
  campaignId: string,
  options?: TeamServerOptions,
): Promise<TeamCampaignDto> {
  const { now } = serverOptions(options);
  const row = await loadCampaign(db, campaignId);
  if (!row) {
    throw new TeamServerError(
      404,
      'campaign_not_found',
      '找不到這個意願活動。',
    );
  }
  await requireTeamMembership(db, row.team_id, userId, { now });
  return campaignDto(db, userId, row, now);
}

function assertCampaignWritable(row: CampaignRow, now: Date) {
  if (Date.parse(row.deadline) <= now.getTime()) {
    throw new TeamServerError(
      409,
      'campaign_expired',
      '這個意願活動已過截止時間。',
    );
  }
  if (!['OPEN', 'THRESHOLD_MET'].includes(row.campaign_status)) {
    throw new TeamServerError(
      409,
      'campaign_closed',
      '這個意願活動已無法修改承諾。',
    );
  }
}

function recalculateCampaignStatement(
  db: TeamDatabase,
  campaignId: string,
  timestamp: string,
) {
  return db
    .prepare(
      `UPDATE group_campaigns
          SET status = CASE
                WHEN (SELECT COUNT(*) FROM group_commitments commitment
                       WHERE commitment.campaign_id = group_campaigns.id
                         AND commitment.status IN ('PLEDGED', 'CONFIRMED')) >= target_people
                 AND (target_quantity IS NULL OR
                      (SELECT COALESCE(SUM(commitment.quantity), 0)
                         FROM group_commitments commitment
                        WHERE commitment.campaign_id = group_campaigns.id
                          AND commitment.status IN ('PLEDGED', 'CONFIRMED')) >= target_quantity)
                THEN 'THRESHOLD_MET' ELSE 'OPEN' END,
              version = version + 1
        WHERE id = ? AND status IN ('OPEN', 'THRESHOLD_MET') AND deadline > ?`,
    )
    .bind(campaignId, timestamp);
}

async function writableCampaignForMember(
  db: TeamDatabase,
  userId: string,
  campaignId: string,
  now: Date,
) {
  const row = await loadCampaign(db, campaignId);
  if (!row) {
    throw new TeamServerError(
      404,
      'campaign_not_found',
      '找不到這個意願活動。',
    );
  }
  await requireTeamMembership(db, row.team_id, userId, {
    write: true,
    now,
  });
  assertCampaignWritable(row, now);
  return row;
}

export async function upsertTeamCommitment(
  db: TeamDatabase,
  userId: string,
  campaignId: string,
  input: unknown,
  options?: TeamServerOptions,
) {
  const parsed = parseUpsertCommitmentInput(input);
  const { now, createId } = serverOptions(options);
  await writableCampaignForMember(db, userId, campaignId, now);
  const existing = await loadCommitment(db, campaignId, userId);
  if (
    existing?.status === 'PLEDGED' &&
    existing.quantity === parsed.quantity &&
    existing.max_cost_twd === parsed.maxCostTwd
  ) {
    return readTeamCampaign(db, userId, campaignId, { now });
  }

  const timestamp = now.toISOString();
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO group_commitments
           (id, campaign_id, user_id, quantity, max_cost_twd, status,
            created_at, updated_at)
         SELECT ?, campaign.id, ?, ?, ?, 'PLEDGED', ?, ?
           FROM group_campaigns campaign
           JOIN teams team ON team.id = campaign.team_id
           JOIN team_members member ON member.team_id = campaign.team_id
          WHERE campaign.id = ? AND campaign.status IN ('OPEN', 'THRESHOLD_MET')
            AND campaign.deadline > ? AND team.status = 'ACTIVE'
            AND member.user_id = ? AND member.member_status = 'ACTIVE'
         ON CONFLICT(campaign_id, user_id) DO UPDATE SET
           quantity = excluded.quantity,
           max_cost_twd = excluded.max_cost_twd,
           status = 'PLEDGED',
           updated_at = excluded.updated_at
         WHERE group_commitments.quantity <> excluded.quantity
            OR group_commitments.max_cost_twd IS NOT excluded.max_cost_twd
            OR group_commitments.status <> 'PLEDGED'`,
      )
      .bind(
        createId(),
        userId,
        parsed.quantity,
        parsed.maxCostTwd,
        timestamp,
        timestamp,
        campaignId,
        timestamp,
        userId,
      ),
    recalculateCampaignStatement(db, campaignId, timestamp),
  ]);
  if (resultChanges(results[0]) !== 1) {
    const current = await loadCommitment(db, campaignId, userId);
    if (
      current?.status !== 'PLEDGED' ||
      current.quantity !== parsed.quantity ||
      current.max_cost_twd !== parsed.maxCostTwd
    ) {
      const latest = await loadCampaign(db, campaignId);
      if (latest) assertCampaignWritable(latest, now);
      throw new TeamServerError(
        409,
        'commitment_conflict',
        '承諾已被其他操作更新，請重新載入。',
      );
    }
  }
  return readTeamCampaign(db, userId, campaignId, { now });
}

export async function withdrawTeamCommitment(
  db: TeamDatabase,
  userId: string,
  campaignId: string,
  options?: TeamServerOptions,
) {
  const { now } = serverOptions(options);
  await writableCampaignForMember(db, userId, campaignId, now);
  const existing = await loadCommitment(db, campaignId, userId);
  if (!existing || existing.status === 'WITHDRAWN') {
    return readTeamCampaign(db, userId, campaignId, { now });
  }

  const timestamp = now.toISOString();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE group_commitments
            SET status = 'WITHDRAWN', updated_at = ?
          WHERE campaign_id = ? AND user_id = ? AND status <> 'WITHDRAWN'
            AND EXISTS (
              SELECT 1
                FROM group_campaigns campaign
                JOIN teams team ON team.id = campaign.team_id
                JOIN team_members member ON member.team_id = campaign.team_id
               WHERE campaign.id = group_commitments.campaign_id
                 AND campaign.status IN ('OPEN', 'THRESHOLD_MET')
                 AND campaign.deadline > ? AND team.status = 'ACTIVE'
                 AND member.user_id = ? AND member.member_status = 'ACTIVE'
            )`,
      )
      .bind(timestamp, campaignId, userId, timestamp, userId),
    recalculateCampaignStatement(db, campaignId, timestamp),
  ]);
  if (resultChanges(results[0]) !== 1) {
    const latest = await loadCommitment(db, campaignId, userId);
    if (latest?.status !== 'WITHDRAWN') {
      throw new TeamServerError(
        409,
        'commitment_conflict',
        '承諾已被其他操作更新，請重新載入。',
      );
    }
  }
  return readTeamCampaign(db, userId, campaignId, { now });
}

function errorShape(error: unknown) {
  if (error instanceof TeamServerError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (error instanceof TeamContractError) {
    return { status: 400, code: error.code, message: error.message };
  }
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    'code' in error &&
    'message' in error &&
    typeof error.status === 'number' &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  ) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }
  return null;
}

export function teamErrorResponse(error: unknown) {
  const known = errorShape(error);
  if (known) {
    return Response.json(
      { error: known.code, message: known.message },
      {
        status: known.status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
  return Response.json(
    {
      error: 'team_service_unavailable',
      message: '團隊服務暫時無法使用。',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function missingTeamDatabaseResponse() {
  return Response.json(
    {
      error: 'team_database_unavailable',
      message: '團隊資料庫尚未啟用。',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
