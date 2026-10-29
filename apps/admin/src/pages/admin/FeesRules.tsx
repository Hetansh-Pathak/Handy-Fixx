import React, { useMemo, useState } from 'react';
import { PLATFORM_RULES, feePreview, formatInr } from '@handyfix/shared';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 7);

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? 'border-t pt-2 font-semibold' : ''}`}>
    <span className="text-muted-foreground">{label}</span>
    <span>{value}</span>
  </div>
);

/** Read-only view of the pro-fee model (single source: packages/shared PLATFORM_RULES) with a bill calculator. */
const AdminFeesRules: React.FC = () => {
  const [bill, setBill] = useState('349');
  const [parts, setParts] = useState('0');
  const [launch, setLaunch] = useState(false);
  const r = PLATFORM_RULES;
  const preview = useMemo(
    () => feePreview({ serviceBill: Number(bill), parts: Number(parts), launchActive: launch }),
    [bill, parts, launch],
  );
  const monthLabel = `${r.launch.months} month${r.launch.months === 1 ? '' : 's'}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Fees &amp; rules</h1>
        <p className="text-sm text-muted-foreground">
          The current pro-fee model as the apps apply it. Numbers are read from one shared source; changing them needs a new app release and a matching database proposal.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Rules in force</h2>
          <Row label="Customer platform fee" value={formatInr(r.customerFee)} />
          <Row label="Pro fee on a completed job" value={`${Math.round(r.fee.rate * 100)}% of the service bill`} />
          <Row label="Minimum / maximum fee" value={`${formatInr(r.fee.min)} / ${formatInr(r.fee.max)}`} />
          <Row label="Parts and materials" value={r.fee.partsExcluded ? 'Not in the fee' : 'In the fee'} />
          <Row label="Fee-free launch" value={`first ${r.launch.jobs} jobs or ${monthLabel}, whichever ends first`} />
          <Row label="When the fee is set aside" value={r.wallet.holdsFeeOnAccept ? 'When the pro accepts' : 'After the job'} />
          <Row label="New dues allowed" value={r.wallet.allowsDues ? 'Yes' : 'No: not enough wallet = cannot accept'} />
          <Row label="Recharge packs" value={r.wallet.packs.map((p) => formatInr(p)).join(' · ')} />
          <Row label="Always free for the pro" value={r.freeActions.join(', ')} />
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">Try a bill</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              Service bill (₹)
              <Input className="mt-1" inputMode="numeric" aria-label="Service bill" value={bill} onChange={(e) => setBill(digits(e.target.value))} />
            </label>
            <label className="text-xs text-muted-foreground">
              Parts (₹, not in the fee)
              <Input className="mt-1" inputMode="numeric" aria-label="Parts" value={parts} onChange={(e) => setParts(digits(e.target.value))} />
            </label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={launch} onChange={(e) => setLaunch(e.target.checked)} />
            Pro is in the launch period
          </label>
          <div className="mt-3">
            <Row label="Customer pays the pro" value={formatInr(preview.customerPays)} />
            <Row label="Fee by the rule" value={formatInr(preview.ruleFee)} />
            <Row label="Waived (launch)" value={formatInr(preview.waived)} />
            <Row label="Leaves the pro's wallet" value={formatInr(preview.charged)} />
            <Row label="Pro keeps" value={formatInr(preview.proNets)} strong />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminFeesRules;
