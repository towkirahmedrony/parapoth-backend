import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * Payment state machine: `paid` is the only successful database status, and
 * approval is idempotent so a retried admin action can never extend a
 * subscription twice.
 */

type Row = Record<string, any>;

const state: {
  paymentRequests: Row[];
  subscriptionPlans: Row[];
  userSubscriptions: Row[];
  profiles: Row[];
  smsLogs: Row[];
  writes: { table: string; patch: Row }[];
  inserts: { table: string; rows: Row[] }[];
  notifications: Row[];
} = {
  paymentRequests: [],
  subscriptionPlans: [],
  userSubscriptions: [],
  profiles: [],
  smsLogs: [],
  writes: [],
  inserts: [],
  notifications: [],
};

let seq = 0;

const rowsFor = (table: string): Row[] => {
  if (table === 'payment_requests') return state.paymentRequests;
  if (table === 'subscription_plans') return state.subscriptionPlans;
  if (table === 'user_subscriptions') return state.userSubscriptions;
  if (table === 'profiles') return state.profiles;
  if (table === 'payment_sms_logs') return state.smsLogs;
  return [];
};

const createBuilder = (table: string) => {
  const filters: { column: string; op: string; value: any }[] = [];
  let inserted: Row[] | null = null;
  let patch: Row | null = null;

  const matching = () =>
    rowsFor(table).filter((row) =>
      filters.every(({ column, op, value }) => {
        const actual = row[column];
        if (op === 'eq') return String(actual) === String(value);
        if (op === 'gt') return Date.parse(String(actual)) > Date.parse(String(value));
        if (op === 'gte') return Date.parse(String(actual)) >= Date.parse(String(value));
        if (op === 'is') return value === null ? actual === null || actual === undefined : String(actual) === String(value);
        return true;
      })
    );

  const resolve = (mode: 'many' | 'single') => {
    if (inserted) {
      const stored = inserted.map((row) => {
        seq += 1;
        const created = { id: `${table}-${seq}`, ...row };
        rowsFor(table).push(created);
        state.inserts.push({ table, rows: [created] });
        return created;
      });
      return { data: mode === 'single' ? stored[0] : stored, error: null };
    }

    if (patch) {
      const rows = matching();
      state.writes.push({ table, patch });
      rows.forEach((row) => Object.assign(row, patch));
      return { data: mode === 'single' ? rows[0] ?? null : rows, error: null };
    }

    const rows = matching();
    return { data: mode === 'single' ? rows[0] ?? null : rows, error: null };
  };

  const builder: any = {
    select: () => builder,
    eq: (column: string, value: any) => {
      filters.push({ column, op: 'eq', value });
      return builder;
    },
    gt: (column: string, value: any) => {
      filters.push({ column, op: 'gt', value });
      return builder;
    },
    gte: (column: string, value: any) => {
      filters.push({ column, op: 'gte', value });
      return builder;
    },
    is: (column: string, value: any) => {
      filters.push({ column, op: 'is', value });
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    insert: (rows: Row[]) => {
      inserted = rows;
      return builder;
    },
    update: (values: Row) => {
      patch = values;
      return builder;
    },
    maybeSingle: async () => {
      const result = resolve('single');
      return { data: result.data, error: result.error };
    },
    single: async () => {
      const result = resolve('single');
      if (!result.data) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: result.data, error: null };
    },
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(resolve('many')).then(onFulfilled, onRejected),
  };

  return builder;
};

const fakeSupabase = {
  from: (table: string) => createBuilder(table),
  rpc: async () => ({ data: null, error: null }),
};

const require = createRequire(__filename);

const stubModule = (request: string, exports: Row) => {
  const resolved = require.resolve(request);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  } as any;
};

const notificationCalls: Row[] = [];

stubModule('../../config/supabase', { supabase: fakeSupabase });
stubModule('../notifications/notifications.service', {
  sendPaymentSuccessNotification: async (userId: string, plan: Row) => {
    notificationCalls.push({ userId, plan });
  },
});

const { approvePayment, rejectPayment, submitPaymentClaim, PaymentError } = require('./finance.service');

const PAYMENT_ID = 'pay-1';

beforeEach(() => {
  seq = 0;
  notificationCalls.length = 0;
  state.paymentRequests = [
    {
      id: PAYMENT_ID,
      user_id: 'user-1',
      plan_id: 'plan-1',
      amount: 500,
      method: 'bkash',
      sender_number: '01700000000',
      trx_id: 'TRX123',
      status: 'pending',
      created_at: '2026-10-20T00:00:00.000Z',
    },
  ];
  state.subscriptionPlans = [
    { id: 'plan-1', name: 'মাসিক', name_en: 'Monthly', duration_days: 30 },
  ];
  state.userSubscriptions = [];
  state.profiles = [{ id: 'user-1', subscription_status: 'free' }];
  state.smsLogs = [{ id: 'sms-1', extracted_trx_id: 'TRX123', linked_request_id: null, status: 'unclaimed' }];
  state.writes = [];
  state.inserts = [];
});

test('manual approval persists the database status paid, never success', async () => {
  const result = await approvePayment(PAYMENT_ID);

  assert.equal(result.status, 'paid');

  const paymentWrite = state.writes.find((write) => write.table === 'payment_requests');
  assert.equal(paymentWrite?.patch.status, 'paid');
  assert.notEqual(paymentWrite?.patch.status, 'success');
});

test('manual approval creates one subscription and activates premium', async () => {
  await approvePayment(PAYMENT_ID);

  assert.equal(state.userSubscriptions.length, 1);
  assert.equal(state.userSubscriptions[0].status, 'active');
  assert.equal(state.profiles[0].subscription_status, 'premium');

  const days = Math.round(
    (Date.parse(state.userSubscriptions[0].end_date) - Date.parse(state.userSubscriptions[0].start_date)) /
      86_400_000
  );
  assert.equal(days, 30);
});

test('manual approval sends exactly one bilingual payment notification', async () => {
  await approvePayment(PAYMENT_ID);

  assert.equal(notificationCalls.length, 1);
  assert.equal(notificationCalls[0].userId, 'user-1');
  assert.equal(notificationCalls[0].plan.days, 30);
  assert.equal(notificationCalls[0].plan.nameEn, 'Monthly');
});

test('approving the same payment twice is rejected and never extends twice', async () => {
  await approvePayment(PAYMENT_ID);
  const endDate = state.userSubscriptions[0].end_date;

  await assert.rejects(
    approvePayment(PAYMENT_ID),
    (error: any) => {
      assert.ok(error instanceof PaymentError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'PAYMENT_NOT_PENDING');
      return true;
    }
  );

  assert.equal(state.userSubscriptions.length, 1);
  assert.equal(state.userSubscriptions[0].end_date, endDate);
  assert.equal(notificationCalls.length, 1, 'a duplicate approval must not notify again');
});

test('a non-pending payment cannot be approved', async () => {
  state.paymentRequests[0].status = 'failed';

  await assert.rejects(approvePayment(PAYMENT_ID), (error: any) => error.status === 409);

  assert.equal(state.userSubscriptions.length, 0);
  assert.equal(state.profiles[0].subscription_status, 'free');
  assert.equal(notificationCalls.length, 0);
});

test('an active subscription is extended by the plan duration instead of duplicated', async () => {
  state.userSubscriptions = [
    {
      id: 'sub-1',
      user_id: 'user-1',
      plan_id: 'plan-1',
      status: 'active',
      start_date: '2026-10-01T00:00:00.000Z',
      end_date: '2026-11-01T00:00:00.000Z',
    },
  ];

  await approvePayment(PAYMENT_ID);

  assert.equal(state.userSubscriptions.length, 1);
  assert.equal(state.userSubscriptions[0].end_date, '2026-12-01T00:00:00.000Z');
});

test('a paid payment cannot be rejected', async () => {
  state.paymentRequests[0].status = 'paid';

  await assert.rejects(rejectPayment(PAYMENT_ID, 'fraud'), (error: any) => error.status === 409);

  assert.equal(state.paymentRequests[0].status, 'paid');
});

test('a pending payment is rejected with failed and a reason', async () => {
  const result = await rejectPayment(PAYMENT_ID, 'trx mismatch');

  assert.equal(result.status, 'failed');
  assert.equal(result.rejection_reason, 'trx mismatch');
});

test('the payment claim fallback inserts pending, never success', async () => {
  // Force the RPC path to fail so the direct insert fallback is used.
  const failing = {
    from: (table: string) => createBuilder(table),
    rpc: async () => ({ data: null, error: { message: 'rpc unavailable' } }),
  };

  stubModule('../../config/supabase', { supabase: failing });
  delete require.cache[require.resolve('./finance.service')];
  const fresh = require('./finance.service');

  const created = await fresh.submitPaymentClaim({
    user_id: 'user-1',
    plan_id: 'plan-1',
    amount: 500,
    method: 'bkash',
    sender_number: '01700000000',
    trx_id: 'TRX999',
  });

  assert.equal(created.status, 'pending');

  // Restore the shared fake for any later test in this file.
  stubModule('../../config/supabase', { supabase: fakeSupabase });
});
