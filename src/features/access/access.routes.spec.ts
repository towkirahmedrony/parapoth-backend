import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * /api/v1/me/access response contract and admin authorization for the access
 * endpoints. Runs the real controller, middleware and router definitions.
 */

type Row = Record<string, any>;

const QUOTA_STATUS = {
  access: {
    tier: 'free',
    premium: false,
    source: 'free',
    premium_expires_at: null,
    unlimited_all: false,
    unlimited_features: [],
  },
  features: [
    {
      feature: 'exam_start',
      title_bn: 'পরীক্ষা শুরু',
      title_en: 'Exam start',
      unlimited: false,
      limit: 3,
      used: 1,
      remaining: 2,
      reset_at: '2026-10-22T18:00:00.000Z',
    },
  ],
};

const state: {
  rpcCalls: string[];
  roles: Row[];
  profiles: Row[];
  adminSessions: Row[];
  tokens: Record<string, { id: string } | null>;
} = {
  rpcCalls: [],
  roles: [],
  profiles: [],
  adminSessions: [],
  tokens: {},
};

const fakeSupabase = {
  from: (table: string) => {
    let rows: Row[] = [];

    if (table === 'user_roles') rows = state.roles;
    if (table === 'profiles') rows = state.profiles;
    if (table === 'admin_auth_sessions') rows = state.adminSessions;

    const builder: any = {
      select: () => builder,
      eq: (column: string, value: any) => {
        rows = rows.filter((row) => String(row[column]) === String(value));
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected),
    };

    return builder;
  },
  rpc: async (name: string) => {
    state.rpcCalls.push(name);

    if (name === 'get_quota_status') return { data: QUOTA_STATUS, error: null };

    return { data: null, error: null };
  },
  auth: {
    getUser: async (token: string) => {
      const user = state.tokens[token];
      return user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: 'invalid token' } };
    },
  },
};

const require = createRequire(__filename);
const supabaseConfigPath = require.resolve('../../config/supabase');

require.cache[supabaseConfigPath] = {
  id: supabaseConfigPath,
  filename: supabaseConfigPath,
  loaded: true,
  exports: { supabase: fakeSupabase },
} as any;

const accessController = require('./access.controller');
const { accessRoutes } = require('./access.routes');
const { requireAuth } = require('../../middlewares/requireAuth');
const { rbacGuard } = require('../../middlewares/rbacGuard');

const createRes = () => {
  const res: any = { statusCode: 0, body: null };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body: any) => {
    res.body = body;
    return res;
  };
  return res;
};

const invoke = async (handler: any, req: Row) => {
  const res = createRes();
  const errors: any[] = [];
  await handler(req, res, (error: any) => {
    errors.push(error);
  });
  // `catchAsync` forwards thrown errors to next(); mirror the global error
  // handler so a rejected request is observable in these assertions.
  const error = errors[0];
  if (error && typeof error.status === 'number') {
    res.statusCode = error.status;
    res.body = { success: false, message: error.message, data: null, code: error.code };
  }
  return res;
};

const layerNames = (router: any): string[] =>
  (router?.stack ?? []).map((layer: any) => String(layer.name));

beforeEach(() => {
  state.rpcCalls.length = 0;
  state.roles = [];
  state.profiles = [{ id: 'admin-1', account_status: 'active' }];
  state.adminSessions = [{ id: 'session-record-1', user_id: 'admin-1', auth_session_id: '00000000-0000-4000-8000-000000000001', revoked_at: null }];
  state.tokens = { 'valid-admin': { id: 'admin-1' }, 'valid-user': { id: 'user-1' } };
});

test('GET /me/access returns the authoritative get_quota_status payload unchanged', async () => {
  const res = await invoke(accessController.getMyAccess, {
    user: { id: 'user-1' },
    params: {},
    query: {},
    body: {},
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, QUOTA_STATUS);
  assert.deepEqual(Object.keys(res.body.data.access).sort(), [
    'premium',
    'premium_expires_at',
    'source',
    'tier',
    'unlimited_all',
    'unlimited_features',
  ]);
  assert.deepEqual(Object.keys(res.body.data.features[0]).sort(), [
    'feature',
    'limit',
    'remaining',
    'reset_at',
    'title_bn',
    'title_en',
    'unlimited',
    'used',
  ]);
});

test('access responses are user-scoped and never cached across requests', async () => {
  await invoke(accessController.getMyAccess, { user: { id: 'user-1' }, params: {}, query: {}, body: {} });
  await invoke(accessController.getMyAccess, { user: { id: 'user-2' }, params: {}, query: {}, body: {} });

  // No server-side cache: each request re-reads the authoritative function, so
  // an access change (grant, payment) is visible immediately.
  assert.equal(state.rpcCalls.filter((name) => name === 'get_quota_status').length, 2);
});

test('every admin access route is protected by authentication and an admin role guard', () => {
  const router = accessRoutes.adminAccess;
  const stack = router.stack ?? [];

  // The guard chain is registered once for the whole router: requireAuth runs
  // first, then the role guard, then the routes.
  assert.equal(stack[0]?.name, 'requireAuth');
  assert.equal(stack[0]?.handle?.length, 3);

  const second = stack[1];
  assert.ok(!second?.route, 'the role guard must be router-level, not route-level');
  assert.equal(second?.handle?.length, 3, 'expected a (req,res,next) role guard middleware');

  const paths = new Set(
    stack.filter((layer: any) => layer.route).map((layer: any) => layer.route.path)
  );

  assert.deepEqual([...paths].sort(), [
    '/grants',
    '/grants/:id/revoke',
    '/overview',
    '/quotas',
    '/quotas/:feature',
    '/users/:id/access',
    '/users/:id/usage/reset',
    '/users/search',
  ]);
});

test('/me/access requires authentication but no admin role', () => {
  const route = accessRoutes.userAccess.stack?.[0]?.route;

  assert.equal(route?.path, '/');
  const guardNames = (route?.stack ?? []).map((layer: any) => String(layer.name));

  assert.ok(guardNames.includes('requireAuth'), `missing requireAuth: ${guardNames.join(', ')}`);
  assert.equal(
    guardNames.some((name) => name.toLowerCase().includes('rbac')),
    false,
    'the user access route must not require an admin role'
  );
});

test('an unauthenticated request is rejected before the controller runs', async () => {
  const req: Row = { headers: {} };
  const res = await invoke(requireAuth, req);

  assert.equal(res.statusCode, 401);
  assert.equal(state.rpcCalls.length, 0);
});

test('a valid token resolves the acting administrator from the token, not the body', async () => {
  const req: Row = {
    headers: { authorization: 'Bearer valid-admin' },
    body: { user_id: 'spoofed-user', granted_by: 'spoofed-admin' },
  };
  const res = createRes();
  let nextCalled = false;

  await requireAuth(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.user, { id: 'admin-1' });
});

test('an ordinary user is denied every admin access operation', async () => {
  state.roles = [{ user_id: 'user-1', role: 'student', is_active: true }];

  const req: Row = { user: { id: 'user-1' }, headers: {}, body: {}, params: {}, query: {} };
  const res = await invoke(rbacGuard(['admin']), req);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.equal(JSON.stringify(res.body).includes('user_roles'), false, 'no internal details leak');
});

test('an administrator passes the admin guard', async () => {
  state.roles = [{ user_id: 'admin-1', role: 'admin', is_active: true }];

  const req: Row = { user: { id: 'admin-1' }, accessToken: 'verified-user-token', authSessionId: '00000000-0000-4000-8000-000000000001', headers: {}, body: {}, params: {}, query: {} };
  const res = createRes();
  let nextCalled = false;

  await rbacGuard(['admin'])(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 0);
});

test('an all-users grant without explicit confirmation is rejected before persistence', async () => {
  const req: Row = {
    user: { id: 'admin-1' },
    body: {
      scope: 'all',
      grant_type: 'premium',
      reason: 'promo',
      features: null,
      expires_at: null,
    },
    params: {},
    query: {},
  };

  const res = await invoke(accessController.createGrant, req);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Confirmation required for all-users grant');
});
