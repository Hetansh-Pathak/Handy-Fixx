import {
  DISPUTE_APPEAL_MIN, DISPUTE_REASON_LABEL, DISPUTE_REPLY_MIN, disputeActions, disputeStatusText, disputeWindowHours, isDisputeWindowOpen,
  isSafetyReport, openDisputeReasons, validateDisputeDetails, type DisputeReason,
} from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, Chip, ErrorBanner, InfoBanner, TextField } from "@/components/ui";
import { appealDispute, disputeKey, fetchDispute, raiseDispute, replyToDispute, type DisputeRow } from "./api";

function useDispute(bookingId: string, enabled: boolean) {
  return useQuery({
    queryKey: disputeKey(bookingId),
    queryFn: () => fetchDispute(bookingId),
    enabled,
    // A decision can arrive at any time within 48 hours; a slow poll is enough.
    refetchInterval: (q) => (q.state.data && q.state.data.status !== "closed" ? 60_000 : false),
  });
}

const view = (d: DisputeRow) => ({ status: d.status, outcome: d.outcome, providerReply: d.provider_reply, appealedAt: d.appealed_at });

/** A one-field form with a submit button, used for reply and appeal. */
function NoteForm({ label, button, min, onSubmit }: { label: string; button: string; min: number; onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (text.trim().length < min) { setError(`Write at least ${min} characters.`); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send it.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View className="gap-2">
      <TextField label={label} value={text} onChangeText={setText} multiline maxLength={1000} error={error ?? undefined} />
      <Button label={button} variant="secondary" loading={busy} onPress={() => void submit()} />
    </View>
  );
}

function DisputeSummary({ d, side, onAppeal, onReply }: {
  d: DisputeRow; side: "customer" | "provider"; onAppeal: (note: string) => Promise<void>; onReply?: (reply: string) => Promise<void>;
}) {
  const actions = disputeActions(view(d), side);
  return (
    <Card>
      <Text className="text-lg font-semibold text-fg">{side === "customer" ? "Your report" : "Customer reported a problem"}</Text>
      <Text className="text-sm font-semibold text-brand">{DISPUTE_REASON_LABEL[d.category]}</Text>
      <Body>{d.details}</Body>
      {d.provider_reply ? <Text className="text-sm text-muted">Pro's reply: {d.provider_reply}</Text> : null}
      <Text className="text-sm text-fg">{disputeStatusText(view(d))}</Text>
      {d.decision_note ? <Text className="text-sm text-muted">Admin's reason: {d.decision_note}</Text> : null}
      {actions.canReply && onReply ? <NoteForm label="Your side (photos and notes help)" button="Send reply" min={DISPUTE_REPLY_MIN} onSubmit={onReply} /> : null}
      {actions.canAppeal ? <NoteForm label="Appeal once: why should a second admin look again?" button="Appeal" min={DISPUTE_APPEAL_MIN} onSubmit={onAppeal} /> : null}
      <Text className="text-xs text-muted">HandyFix attached the job timeline (price, trip, arrival, code time and approved extras). Everything is kept in the audit log.</Text>
    </Card>
  );
}

/** Customer, on the completed-job screen: "Report a problem", open 24 h (48 h for repair quality). */
export function CustomerDispute({ bookingId, completedAt }: { bookingId: string; completedAt: string | null }) {
  const queryClient = useQueryClient();
  const dispute = useDispute(bookingId, true);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: disputeKey(bookingId) });

  if (dispute.isPending) return null;
  if (dispute.data) {
    return <DisputeSummary d={dispute.data} side="customer" onAppeal={async (n) => { await appealDispute(dispute.data!.id, n); await refresh(); }} />;
  }
  if (!completedAt) return null;
  const now = new Date();
  const done = new Date(completedAt);
  const reasons = openDisputeReasons(done, now);
  if (!reasons.length) return null;
  const windowOpen = isDisputeWindowOpen(done, now);
  const hoursLeft = Math.max(0, Math.ceil(disputeWindowHours("poor_work") - (now.getTime() - done.getTime()) / 3_600_000));

  const submit = async () => {
    if (!reason) { setError("Pick what went wrong."); return; }
    const problem = validateDisputeDetails(details);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await raiseDispute(bookingId, reason, details);
      setOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your report.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Card>
        <Button label="Report a problem" variant="secondary" onPress={() => setOpen(true)} />
        <Text className="text-xs text-muted">
          {windowOpen ? `Open for 24 hours after the job (48 hours for repair quality, about ${hoursLeft} h left).` : "The normal window has closed. Safety reports (harassment or theft) can still be made."}
        </Text>
      </Card>
    );
  }
  return (
    <Card>
      <Text className="text-lg font-semibold text-fg">What went wrong?</Text>
      <ErrorBanner message={error} />
      <View className="flex-row flex-wrap gap-2">
        {reasons.map((r) => <Chip key={r} label={DISPUTE_REASON_LABEL[r]} selected={reason === r} onPress={() => { setReason(r); setError(null); }} />)}
      </View>
      {reason && isSafetyReport(reason) ? (
        <InfoBanner message="Safety reports skip the queue: the pro is suspended at once while HandyFix looks into it. If you are in danger, call 112." />
      ) : null}
      <TextField label="Describe what happened" value={details} onChangeText={setDetails} multiline maxLength={1000} placeholder="The tap still leaks after the repair." />
      <Button label="Send report" loading={busy} onPress={() => void submit()} />
      <Button label="Cancel" variant="secondary" disabled={busy} onPress={() => setOpen(false)} />
      <Text className="text-xs text-muted">The pro can reply within 24 hours. An admin decides within 48 hours. Either side can appeal once.</Text>
    </Card>
  );
}

/** Pro, on a completed job: see the report, reply once within 24 h, appeal once after a decision. */
export function ProviderDispute({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const dispute = useDispute(bookingId, true);
  if (!dispute.data) return null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: disputeKey(bookingId) });
  const d = dispute.data;
  return (
    <DisputeSummary
      d={d}
      side="provider"
      onReply={async (r) => { await replyToDispute(d.id, r); await refresh(); }}
      onAppeal={async (n) => { await appealDispute(d.id, n); await refresh(); }}
    />
  );
}
