import {
  describeLedgerEntry, earningsSummary, FEE_RULE_LABEL, formatInr, jobsCovered, jobsCoveredLine, launchLine, payoutSummary, RECHARGE_PACKS, TYPICAL_BILL,
  type RechargePack,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, ErrorBanner, HeroCard, InfoBanner, Screen, TextField, Title, ListSkeleton } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import {
  createTopUpOrder, fetchLedger, fetchMinPayout, fetchPayouts, fetchProviderBookings, requestPayout, verifyTopUpPayment,
} from "@/features/provider/api";
import { PayoutCard } from "@/features/provider/PayoutCard";
import { fetchProviderProfile, providerProfileKey } from "@/features/provider/profile-api";
import { useProviderRuntime } from "@/features/provider/provider-runtime";
import { openCheckout } from "@/lib/razorpay";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function WalletScreen() {
  const queryClient = useQueryClient();
  const { provider } = useSession();
  const rt = useProviderRuntime();
  const providerId = provider?.id ?? null;

  const ledger = useQuery({ queryKey: ["wallet-ledger", providerId], enabled: !!providerId, queryFn: () => fetchLedger(providerId as string) });
  const payouts = useQuery({ queryKey: ["wallet-payouts", providerId], enabled: !!providerId, queryFn: () => fetchPayouts(providerId as string) });
  const profile = useQuery({ queryKey: providerProfileKey(providerId ?? ""), enabled: !!providerId, queryFn: () => fetchProviderProfile(providerId as string) });
  const minPayout = useQuery({ queryKey: ["wallet-min-payout"], queryFn: fetchMinPayout });
  const bookings = useQuery({ queryKey: ["provider-bookings", providerId], enabled: !!providerId, queryFn: () => fetchProviderBookings(providerId as string) });

  const [busy, setBusy] = useState<RechargePack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState("");
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const reloadMoney = async () => {
    await Promise.all([
      rt.refreshWallet(),
      queryClient.invalidateQueries({ queryKey: ["wallet-ledger", providerId] }),
      queryClient.invalidateQueries({ queryKey: ["wallet-payouts", providerId] }),
    ]);
  };

  const recharge = async (pack: RechargePack) => {
    setError(null);
    setNotice(null);
    setBusy(pack);
    try {
      const order = await createTopUpOrder(pack);
      const result = await openCheckout(order);
      if (result.status === "cancelled") { setNotice("Payment cancelled. Nothing was charged."); return; }
      if (result.status === "failed") { setError(result.message); return; }
      setNotice("Payment received, updating your wallet…");
      // Only the server webhook credits the wallet, after Razorpay confirms. The signature check is just for a faster answer.
      const check = result.payment ? await verifyTopUpPayment(result.payment) : null;
      if (check && !check.verified) { setError("We could not confirm this payment yet. If money left your account, it will show here within a few minutes."); }
      const before = ledger.data?.length ?? 0;
      for (let i = 0; i < 10; i += 1) {
        await sleep(2000);
        await reloadMoney();
        const fresh = queryClient.getQueryData<unknown[]>(["wallet-ledger", providerId]);
        if ((fresh?.length ?? 0) > before) { setError(null); setNotice(`${formatInr(pack)} added to your wallet.`); return; }
      }
      setNotice("Payment received. It can take a minute to appear here; you are never charged twice.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusy(null);
    }
  };

  const withdrawNow = async () => {
    const value = Number(withdraw);
    if (!Number.isFinite(value) || value <= 0) { setWithdrawError("Enter a valid amount."); return; }
    setWithdrawError(null);
    setError(null);
    setNotice(null);
    setWithdrawing(true);
    try {
      const result = await requestPayout(value);
      if (!result.ok) { setWithdrawError(result.message); return; }
      setWithdraw("");
      setNotice(`Withdrawal of ${formatInr(result.amount)} requested. We will pay it to your saved UPI or bank account.`);
      await reloadMoney();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not request the withdrawal.");
    } finally {
      setWithdrawing(false);
    }
  };

  const earnings = earningsSummary(bookings.data ?? [], new Date());
  const payoutReady = profile.data ? payoutSummary(profile.data).ready : false;
  const approved = provider?.kyc_status === "approved";
  const canWithdraw = rt.wallet.balance > 0 && rt.wallet.due === 0 && payoutReady && approved;
  const withdrawBlocked = !approved
    ? "Withdrawals open once your identity check is approved."
    : rt.wallet.due > 0
      ? "Recharge to clear what you owe first. Withdrawals open once the balance is positive."
      : !payoutReady
        ? "Add your payout details below, then you can withdraw."
        : "Nothing to withdraw yet.";

  return (
    <Screen>
      <Title>Wallet</Title>
      <ErrorBanner message={error} />
      <InfoBanner message={notice} />

      <HeroCard>
        <Text accessibilityLabel="Jobs covered" className="text-3xl font-extrabold tracking-tight text-fg">
          {rt.launch.active ? "Fee-free launch" : jobsCoveredLine(jobsCovered(rt.wallet.balance))}
        </Text>
        <Text accessibilityLabel="Wallet balance" className="text-base text-muted">{formatInr(rt.wallet.balance)} available</Text>
        {rt.held > 0 ? <Text className="text-sm text-fg">{formatInr(rt.held)} reserved for jobs you accepted (taken when they complete)</Text> : null}
        {rt.wallet.due > 0 ? (
          <Text accessibilityLabel="Wallet dues" className="text-sm font-semibold text-danger">You owe {formatInr(rt.wallet.due)}. A recharge clears it first.</Text>
        ) : null}
        {rt.launch.active
          ? <Text className="text-sm text-ok">{launchLine(rt.launch)}. No fee is taken.</Text>
          : <Text className="text-sm text-muted">HandyFix fee: {FEE_RULE_LABEL}. Reserved when you accept, taken when the job completes. Customers pay you directly.</Text>}
      </HeroCard>

      <Card>
        <Text className="text-lg font-semibold text-fg">Recharge</Text>
        <View className="flex-row gap-2">
          {RECHARGE_PACKS.map((p) => (
            <Pressable key={p.amount} accessibilityRole="button" accessibilityLabel={`Recharge ${formatInr(p.amount)}`}
              disabled={busy !== null} onPress={() => void recharge(p.amount)}
              className={`flex-1 items-center gap-1 rounded-tile border-2 px-2 py-3 ${p.popular ? "border-brand bg-brand-soft" : "border-line bg-card"} ${busy !== null && busy !== p.amount ? "opacity-40" : "active:opacity-80"}`}>
              {p.popular ? <Text className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-onbrand">Most popular</Text> : <View className="h-[20px]" />}
              <Text className="text-2xl font-bold text-fg">{busy === p.amount ? "…" : formatInr(p.amount)}</Text>
              <Text className="text-xs text-muted">about {jobsCovered(p.amount)} jobs</Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-xs text-muted">Pay by UPI or card. "About N jobs" assumes a {formatInr(TYPICAL_BILL)} job.</Text>
      </Card>

      <Card>
        <Text className="text-lg font-semibold text-fg">Withdraw</Text>
        {canWithdraw ? (
          <>
            <TextField label="Amount (₹)" value={withdraw} onChangeText={(v) => { setWithdraw(v.replace(/\D/g, "").slice(0, 6)); setWithdrawError(null); }}
              keyboardType="number-pad" error={withdrawError ?? undefined}
              hint={minPayout.data ? `Minimum ${formatInr(minPayout.data)}. Paid to your saved UPI or bank account.` : "Paid to your saved UPI or bank account."} />
            <Button label="Request withdrawal" variant="secondary" loading={withdrawing} onPress={() => void withdrawNow()} />
          </>
        ) : (
          <Body muted>{withdrawBlocked}</Body>
        )}
        {(payouts.data ?? []).map((p) => (
          <View key={p.id} className="flex-row justify-between">
            <Text className="text-sm text-muted">{(p.requested_at ?? "").slice(0, 10)}</Text>
            <Text className="text-sm text-fg">{formatInr(Number(p.amount))} · {p.status}</Text>
          </View>
        ))}
      </Card>

      {providerId ? <PayoutCard providerId={providerId} /> : null}

      <Card>
        <Text className="text-lg font-semibold text-fg">Earnings</Text>
        <Line label="Today" value={formatInr(earnings.todayTotal)} />
        <Line label="This month" value={`${formatInr(earnings.monthTotal)} · ${earnings.monthJobs} job${earnings.monthJobs === 1 ? "" : "s"}`} />
        <Line label="All time" value={`${formatInr(earnings.total)} · ${earnings.jobs} job${earnings.jobs === 1 ? "" : "s"}`} />
        <Text className="text-xs text-muted">What customers paid you for completed jobs (paid to you directly, before the HandyFix fee).</Text>
      </Card>

      <Card>
        <Text className="text-lg font-semibold text-fg">History</Text>
        {ledger.isPending ? <ListSkeleton rows={2} /> : null}
        {ledger.isError ? <ErrorBanner message="Could not load your wallet history." /> : null}
        {ledger.data && ledger.data.length === 0 ? <Body muted>No wallet activity yet.</Body> : null}
        {(ledger.data ?? []).map((entry) => {
          const l = describeLedgerEntry(entry);
          return (
            <View key={l.id} className="flex-row items-center justify-between gap-3 border-t border-line pt-2">
              <View className="flex-1">
                <Text className="text-base text-fg">{l.label}</Text>
                <Text className="text-xs text-muted">{l.createdAt.slice(0, 10)}{l.note ? ` · ${l.note}` : ""}</Text>
              </View>
              <Text className={`text-base font-semibold ${l.credit ? "text-ok" : "text-danger"}`}>{l.amountText}</Text>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="text-base text-muted">{label}</Text>
      <Text className="flex-1 text-right text-base text-fg">{value}</Text>
    </View>
  );
}
