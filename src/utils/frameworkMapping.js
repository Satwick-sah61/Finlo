/**
 * frameworkMapping — maps Finio expense category IDs to framework bucket IDs.
 *
 * Two mapping modes:
 *   STANDARD_MAP  — 3-bucket (needs / wants / savings) for 50/30/20, 60/20/20, 75/15/10
 *   FINIO_MAP     — 7-bucket for Finio Smart Split (Indian context)
 */

// ─── Bucket IDs ───────────────────────────────────────────────────────────────

export const BUCKET = {
  // Standard 3-bucket
  NEEDS:   'needs',
  WANTS:   'wants',
  SAVINGS: 'savings',
  // Finio Smart 7-bucket
  HOUSING:       'housing',
  FOOD_TRANSPORT: 'food_transport',
  LOANS_DEBT:    'loans_debt',
  INVESTMENTS:   'investments',
  GOALS:         'goals',
  SELF:          'self',
  MISC:          'misc',
}

// ─── Standard 3-bucket mapping ───────────────────────────────────────────────
// Covers 50/30/20, 60/20/20, 75/15/10 frameworks

export const STANDARD_CATEGORY_MAP = {
  housing:       BUCKET.NEEDS,
  food:          BUCKET.NEEDS,
  transport:     BUCKET.NEEDS,
  health:        BUCKET.NEEDS,
  education:     BUCKET.NEEDS,
  loans:         BUCKET.NEEDS,
  lifestyle:     BUCKET.WANTS,
  family:        BUCKET.WANTS,
  miscellaneous: BUCKET.WANTS,
  savings:       BUCKET.SAVINGS,
}

// ─── Finio Smart Split 7-bucket mapping ──────────────────────────────────────

export const FINIO_SMART_CATEGORY_MAP = {
  housing:       BUCKET.HOUSING,
  food:          BUCKET.FOOD_TRANSPORT,
  transport:     BUCKET.FOOD_TRANSPORT,
  loans:         BUCKET.LOANS_DEBT,
  savings:       BUCKET.INVESTMENTS,
  health:        BUCKET.SELF,
  education:     BUCKET.SELF,
  lifestyle:     BUCKET.SELF,
  family:        BUCKET.MISC,
  miscellaneous: BUCKET.MISC,
  // goals bucket is populated from goals data, not expenses
}

// ─── Framework preset definitions ────────────────────────────────────────────

export const FRAMEWORK_PRESETS = [
  {
    id:          '50_30_20',
    name:        '50/30/20 Rule',
    description: 'Popularised by Elizabeth Warren. Simple and effective for most earners.',
    categoryMap: STANDARD_CATEGORY_MAP,
    buckets: [
      {
        id: BUCKET.NEEDS,
        label: 'Needs',
        targetPct: 50,
        color: '#6366F1',
        description: 'Housing, food, transport, health, education, loan EMIs',
      },
      {
        id: BUCKET.WANTS,
        label: 'Wants',
        targetPct: 30,
        color: '#F59E0B',
        description: 'Lifestyle, entertainment, dining out, hobbies',
      },
      {
        id: BUCKET.SAVINGS,
        label: 'Savings & Investments',
        targetPct: 20,
        color: '#10B981',
        description: 'SIPs, FDs, PPF, emergency fund, goals',
      },
    ],
  },
  {
    id:          '60_20_20',
    name:        '60/20/20 Rule',
    description: 'More room for committed expenses. Good if you have rent + EMIs.',
    categoryMap: STANDARD_CATEGORY_MAP,
    buckets: [
      {
        id: BUCKET.NEEDS,
        label: 'Committed',
        targetPct: 60,
        color: '#6366F1',
        description: 'All fixed, non-negotiable expenses',
      },
      {
        id: BUCKET.SAVINGS,
        label: 'Savings',
        targetPct: 20,
        color: '#10B981',
        description: 'Investments and emergency fund',
      },
      {
        id: BUCKET.WANTS,
        label: 'Personal',
        targetPct: 20,
        color: '#F59E0B',
        description: 'Discretionary spending',
      },
    ],
  },
  {
    id:          '75_15_10',
    name:        '75/15/10 Rule',
    description: 'Aggressive savings. Best for high-income earners with lean lifestyles.',
    categoryMap: STANDARD_CATEGORY_MAP,
    buckets: [
      {
        id: BUCKET.NEEDS,
        label: 'Living',
        targetPct: 75,
        color: '#6366F1',
        description: 'All living expenses including wants and needs',
        includesWants: true,
      },
      {
        id: BUCKET.SAVINGS,
        label: 'Investments',
        targetPct: 15,
        color: '#8B5CF6',
        description: 'SIPs, stocks, mutual funds',
      },
      {
        id: BUCKET.WANTS,  // re-used as "emergency savings" in this context
        label: 'Emergency Savings',
        targetPct: 10,
        color: '#10B981',
        description: 'Emergency fund, liquid savings',
        hiddenInMap: true, // special: both needs+wants go into "living"
      },
    ],
  },
  {
    id:          'finio_smart',
    name:        'Finio Smart Split',
    description: 'Optimised for Indian earners — accounts for EMIs, goals, and self-growth.',
    categoryMap: FINIO_SMART_CATEGORY_MAP,
    isFinioSmart: true,
    buckets: [
      {
        id: BUCKET.HOUSING,
        label: 'Housing',
        targetPct: 30,
        color: '#3B82F6',
        description: 'Rent, maintenance, utilities, internet',
      },
      {
        id: BUCKET.FOOD_TRANSPORT,
        label: 'Food & Transport',
        targetPct: 15,
        color: '#F97316',
        description: 'Groceries, dining, commute, fuel',
      },
      {
        id: BUCKET.LOANS_DEBT,
        label: 'Loans & Debt',
        targetPct: 10,
        color: '#EF4444',
        description: 'EMI payments across all loans',
      },
      {
        id: BUCKET.INVESTMENTS,
        label: 'Investments & Savings',
        targetPct: 20,
        color: '#10B981',
        description: 'SIPs, FDs, PPF, NPS, emergency fund',
      },
      {
        id: BUCKET.GOALS,
        label: 'Goals',
        targetPct: 10,
        color: '#6366F1',
        description: 'Monthly contributions to active financial goals',
        fromGoals: true, // populated from goals data, not expense categories
      },
      {
        id: BUCKET.SELF,
        label: 'Self & Growth',
        targetPct: 10,
        color: '#8B5CF6',
        description: 'Health, education, lifestyle, personal development',
      },
      {
        id: BUCKET.MISC,
        label: 'Miscellaneous',
        targetPct: 5,
        color: '#94A3B8',
        description: 'Family, gifts, subscriptions, other',
      },
    ],
  },
]
