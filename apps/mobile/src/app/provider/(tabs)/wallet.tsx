import {
  describeLedgerEntry, earningsSummary, formatInr, launchLine, topUpChoices, validateTopUp,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, Chip, ErrorBanner, InfoBanner, Screen, TextField, Title } from "@/components/ui";
import { useSession } from "@/features/auth/session-provider";
import {
  createTopUpOrder, fetchLedger, fetchMinPayout, fetchPayouts, fetchProviderBookings, requestPayout,
} from "@/features/provider/api";
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
  const minPayout = useQuery({ queryKey: ["wallet-min-payout"], queryFn: fetchMinPayout });
  const bookings = useQuery({ queryKey: ["provider-bookings", providerId], enabled: !!providerId, queryFn: () => fetchProviderBookings(providerId as string) });

  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  const topUp = async () => {
    const value = Number(amount);
    const check = validateTopUp(value);
    if (!check.ok) { setAmountError(check.error); return; }
    setAmountError(null);
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const order = await createTopUpOrder(value);
      const result = await openCheckout(order);
      if (result.status === "cancelled") { setNotice("Payment cancelled. Nothing was charged."); return; }
      if (result.status === "failed") { setError(result.message); return; }
      setAmount("");
      setNotice("Payment received. Your wallet updates in a few seconds.");
      // The server webhook credits the wallet after Razorpay confirms; watch the ledger until it shows up.
      const before = ledger.data?.length ?? 0;
      for (let i = 0; i < 10; i += 1) {
        await sleep(2000);
        await reloadMoney();
        const fresh = queryClient.getQueryData<unknown[]>(["wallet-ledger", providerId]);
        if ((fresh?.length ?? 0) > before) { setNotice("Wallet topped up."); return; }
      }
      setNotice("Payment received. It can take a minute to appear. Pull this screen again later; you are not charged twice.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment.");
    } finally {
      setBusy(false);
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
  const canWithdraw = rt.wallet.balance > 0 && rt.wallet.due === 0;

  return (
    <Screen>
      <Title>Wallet</Title>
      <ErrorBanner message={error} />
      <InfoBanner message={notice} />

      <Card>
        <View className="flex-row items-end justify-between">
          <View>
            <Text className="text-sm text-muted">Balance</Text>
            <Text accessibilityLabel="Wallet balance" className="text-4xl font-bold text-fg">{formatInr(rt.wallet.balance)}</Text>
          </View>
          {rt.wallet.due > 0 ? (
            <View className="items-end">
              <Text className="text-sm text-muted">Dues</Text>
              <Text accessibilityLabel="Wallet dues" className="text-2xl font-bold text-danger">{formatInr(rt.wallet.due)}</Text>
            </View>
          ) : null}
        </View>
        {rt.launch.active
          ? <Text className="text-sm text-ok">{launchLine(rt.launch)}. The ₹15–50 fee is waived.</Text>
          : <Text className="text-sm text-muted">A flat ₹15 / ₹30 / ₹50 fee is taken from this balance when a job completes. Customers pay you directly.</Text>}
      </Card>

      <Card>
        <Text className="text-lg font-semibold text-fg">Add money</Text>
        <View className="flex-row flex-wrap gap-2">
          {topUpChoices(rt.wallet.due).map((v) => (
            <Chip key={v} label={formatInr(v)} selected={amount === String(v)} onPress={() => { setAmount(String(v)); setAmountError(null); }} />
          ))}
        </View>
        <TextField label="Amount (₹)" value={amount} onChangeText={(v) => { setAmount(v.replace(/\D/g, "").slice(0, 5)); setAmountError(null); }}
          keyboardType="number-pad" error={amountError ?? undefined} hint="Whole rupees, ₹100 to ₹50,000. Pay by UPI or card." />
        <Button label="Pay with Razorpay" loading={busy} onPress={() => void topUp()} />
        {rt.wallet.due > 0 ? <Text className="text-xs text-muted">Top-ups clear your dues first.</Text> : null}
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
          <Body muted>{rt.wallet.due > 0 ? "Clear your dues first. Withdrawals open once the balance is positive." : "Nothing to withdraw yet."}</Body>
        )}
        {(payouts.data ?? []).map((p) => (
          <View key={p.id} className="flex-row justify-between">
            <Text className="text-sm text-muted">{p.requested_at.slice(0, 10)}</Text>
            <Text className="text-sm text-fg">{formatInr(Number(p.amount))} · {p.status}</Text>
          </View>
        ))}
      </Card>

      <Card>
        <Text className="text-lg font-semibold text-fg">Earnings</Text>
        <Line label="Today" value={formatInr(earnings.todayTotal)} />
        <Line label="This month" value={`${formatInr(earnings.monthTotal)} · ${earnings.monthJobs} job${earnings.monthJobs === 1 ? "" : "s"}`} />
        <Line label="All time" value={`${formatInr(earnings.total)} · ${earnings.jobs} job${earnings.jobs === 1 ? "" : "s"}`} />
        <Text className="text-xs text-muted">What customers paid you for completed jobs (paid to you directly, before the HandyFix fee).</Text>
      </Card>

      <Card>
        <Text className="text-lg font-semibold text-fg">History</Text>
        {ledger.isPending ? <Body muted>Loading…</Body> : null}
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
