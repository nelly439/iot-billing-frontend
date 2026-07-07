'use client';

import dynamic from 'next/dynamic';
import { useWallet } from '@/components/providers/WalletProvider';
import { RestoreTransactionBanner } from '@/components/wallet/RestoreTransactionBanner';

/**
 * This page must always render per-request. `searchParams` (the billing
 * date range) are only available at request time, not at build time. If
 * this page were statically generated, `searchParams` would be `{}` at
 * build time, and any analytics fetch keyed off it would silently fall
 * back to an all-time / unscoped query baked into the static HTML.
 * Forcing dynamic rendering guarantees the response always matches the
 * requested date range.
 */
export const dynamic = 'force-dynamic';

const MAX_RANGE_DAYS = 365;
const DEFAULT_RANGE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - DEFAULT_RANGE_DAYS * MS_PER_DAY);
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

interface DashboardPageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const { from, to } = params;

  if (!from || !to) {
    const def = defaultRange();
    redirect(`/dashboard?from=${def.from}&to=${def.to}`);
  }

  if (!isValidDateString(from) || !isValidDateString(to)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400">Invalid date range supplied.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RestoreTransactionBanner />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Active Devices</p>
          <p className="mt-1 text-2xl font-bold text-green-400">1,247</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Total Power Output</p>
          <p className="mt-1 text-2xl font-bold text-blue-400">84.2 kW</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Escrow Locked</p>
          <p className="mt-1 text-2xl font-bold text-yellow-400">12,450 XLM</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">Network</p>
          <p className="mt-1 text-2xl font-bold text-purple-400">{metrics.network}</p>
        </div>
      </div>
    );
  }

  if (rangeDays > MAX_RANGE_DAYS) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-400">
          Date range too large (max {MAX_RANGE_DAYS} days). Please narrow your selection.
        </p>
      </div>
    );
  }

  const analytics = generateMockAnalytics(fromDate, toDate);

  return <DashboardClient analytics={analytics} />;
}
