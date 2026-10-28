import { checkOwnRate, formatInr, groupSubItems, offerRowsForService, readBand, type ProSubItemRow } from "@handyfix/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CheckSquare, ChevronDown, ChevronUp, Square } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, TextInput, View } from "react-native";
import { Text } from "@/components/text";
import { Body, Button, Card, ErrorBanner, InfoBanner, ListSkeleton, Screen, ScreenHeader } from "@/components/ui";
import { providerRowKey, useSession } from "@/features/auth/session-provider";
import { fetchServices } from "@/features/customer/catalog-api";
import type { ServiceRow } from "@/features/customer/types";
import { fetchProviderProfile, providerProfileKey } from "@/features/provider/profile-api";
import { catalogueJobsKey, fetchCatalogueJobs, fetchMySubItems, myServicesKey, saveMyServices, type CatalogueJob } from "@/features/provider/services-api";
import { loadErrorMessage } from "@/lib/load-error";
import { useThemeColors } from "@/theme/theme";

export default function MyServices() {
  const { provider } = useSession();
  return provider ? <MyServicesScreen providerId={provider.id} /> : null;
}

type Draft = {
  on: Set<string>;
  /** service id → ticked job ids */
  ticked: Map<string, Set<string>>;
  /** job id → what the pro typed as their own rate */
  rates: Map<string, string>;
};

/** Start from what is saved: a service with no saved jobs means every job is ticked. */
function initialDraft(serviceIds: string[], jobs: CatalogueJob[], saved: ProSubItemRow[]): Draft {
  const savedBy = new Map<string, ProSubItemRow>(saved.map((r) => [r.sub_item_id, r]));
  const ticked = new Map<string, Set<string>>();
  const rates = new Map<string, string>();
  const byService = new Map<string, CatalogueJob[]>();
  for (const j of jobs) byService.set(j.service_id, [...(byService.get(j.service_id) ?? []), j]);
  for (const [serviceId, list] of byService) {
    const mine = list.filter((j) => savedBy.has(j.id));
    ticked.set(serviceId, new Set((mine.length ? mine : list).map((j) => j.id)));
    for (const j of mine) {
      const price = savedBy.get(j.id)?.custom_price;
      if (price != null && Number(price) > 0) rates.set(j.id, String(Math.round(Number(price))));
    }
  }
  return { on: new Set(serviceIds), ticked, rates };
}

function MyServicesScreen({ providerId }: { providerId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const services = useQuery({ queryKey: ["services"], queryFn: fetchServices });
  const jobs = useQuery({ queryKey: catalogueJobsKey, queryFn: fetchCatalogueJobs });
  const profile = useQuery({ queryKey: providerProfileKey(providerId), queryFn: () => fetchProviderProfile(providerId) });
  const saved = useQuery({ queryKey: myServicesKey(providerId), queryFn: () => fetchMySubItems(providerId) });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [rateErrors, setRateErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filled = useRef(false);

  const loaded = services.isSuccess && jobs.isSuccess && profile.isSuccess && saved.isSuccess;
  const jobsOn = saved.data !== null; // false until the job table exists in the database

  // Fill once from the saved data (never overwrite what the pro is changing).
  useEffect(() => {
    if (!loaded || filled.current) return;
    filled.current = true;
    setDraft(initialDraft(profile.data?.service_ids ?? [], jobs.data ?? [], saved.data ?? []));
  }, [loaded, profile.data, jobs.data, saved.data]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/provider/profile"));
  const loadError = services.error ?? jobs.error ?? profile.error ?? saved.error;
  if (loadError) {
    return <Screen><ScreenHeader title="My services" onBack={back} /><ErrorBanner message={loadErrorMessage("your services", loadError)} /></Screen>;
  }
  if (!draft) return <Screen><ScreenHeader title="My services" onBack={back} /><ListSkeleton rows={5} /></Screen>;

  const jobsOf = (serviceId: string) => (jobs.data ?? []).filter((j) => j.service_id === serviceId);
  const update = (change: (d: Draft) => void) => {
    setError(null); // any change answers the last message
    setDraft((prev) => {
      if (!prev) return prev;
      const next: Draft = { on: new Set(prev.on), ticked: new Map(prev.ticked), rates: new Map(prev.rates) };
      change(next);
      return next;
    });
  };

  const toggleService = (id: string) => update((d) => { if (d.on.has(id)) d.on.delete(id); else d.on.add(id); });
  const toggleJob = (serviceId: string, jobId: string) => update((d) => {
    const set = new Set(d.ticked.get(serviceId) ?? []);
    if (set.has(jobId)) set.delete(jobId); else set.add(jobId);
    d.ticked.set(serviceId, set);
  });
  const setAll = (serviceId: string, all: boolean) => update((d) => d.ticked.set(serviceId, new Set(all ? jobsOf(serviceId).map((j) => j.id) : [])));
  const setRate = (jobId: string, text: string) => {
    update((d) => d.rates.set(jobId, text));
    setRateErrors(({ [jobId]: _removed, ...rest }) => rest);
  };

  const save = async () => {
    const serviceIds = (services.data ?? []).map((s) => s.id).filter((id) => draft.on.has(id));
    if (!serviceIds.length) return setError("Turn on at least one service you do.");
    const errs: Record<string, string> = {};
    const rows: { subItemId: string; customPrice: number | null }[] = [];
    for (const serviceId of serviceIds) {
      const list = jobsOf(serviceId);
      if (!list.length) continue;
      const ticked = draft.ticked.get(serviceId) ?? new Set<string>();
      if (!list.some((j) => ticked.has(j.id))) {
        const name = services.data?.find((s) => s.id === serviceId)?.name ?? "a service";
        setOpen((prev) => new Set(prev).add(serviceId));
        return setError(`Tick at least one job in ${name}, or turn it off.`);
      }
      const rates = new Map<string, number | null>();
      for (const j of list.filter((x) => ticked.has(x.id))) {
        const check = checkOwnRate(draft.rates.get(j.id) ?? "", { min: j.price_min, max: j.price_max });
        if (check.ok) rates.set(j.id, check.price);
        else errs[j.id] = check.error;
      }
      rows.push(...offerRowsForService({ subItemIds: list.map((j) => j.id), ticked, rates }));
    }
    setRateErrors(errs);
    if (Object.keys(errs).length) return setError("Some prices need fixing. Check the highlighted jobs.");

    setBusy(true);
    setError(null);
    try {
      await saveMyServices({ providerId, serviceIds, rows: jobsOn ? rows : null });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: providerProfileKey(providerId) }),
        queryClient.invalidateQueries({ queryKey: providerRowKey(userId) }),
        queryClient.invalidateQueries({ queryKey: myServicesKey(providerId) }),
      ]);
      back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your services could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="My services" onBack={back} />
      <Body muted>Turn on the services you do, then untick any job you don't do. You only get requests for ticked jobs.</Body>
      <InfoBanner message={jobsOn ? null : "Choosing single jobs switches on with the next HandyFix update. Until then you get every job in the services you turn on."} />
      <ErrorBanner message={error} />

      {(services.data ?? []).map((s) => (
        <ServiceCard key={s.id} service={s} jobs={jobsOf(s.id)} draft={draft} jobsOn={jobsOn} expanded={open.has(s.id)} rateErrors={rateErrors}
          onToggle={() => toggleService(s.id)}
          onExpand={() => setOpen((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
          onToggleJob={(jobId) => toggleJob(s.id, jobId)} onAll={(all) => setAll(s.id, all)} onRate={setRate} />
      ))}

      <Button label="Save services" loading={busy} onPress={() => void save()} />
    </Screen>
  );
}

function ServiceCard(props: {
  service: ServiceRow; jobs: CatalogueJob[]; draft: Draft; jobsOn: boolean; expanded: boolean; rateErrors: Record<string, string>;
  onToggle: () => void; onExpand: () => void; onToggleJob: (jobId: string) => void; onAll: (all: boolean) => void; onRate: (jobId: string, text: string) => void;
}) {
  const colors = useThemeColors();
  const { service, jobs, draft } = props;
  const on = draft.on.has(service.id);
  const ticked = draft.ticked.get(service.id) ?? new Set<string>();
  const count = jobs.filter((j) => ticked.has(j.id)).length;
  const summary = !jobs.length ? "No separate jobs" : count === jobs.length ? `All ${jobs.length} jobs` : `${count} of ${jobs.length} jobs`;

  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-fg">{service.name}</Text>
          {on && props.jobsOn ? <Text className="text-sm text-muted">{summary}</Text> : null}
        </View>
        <Switch accessibilityLabel={`${service.name} on or off`} value={on} onValueChange={props.onToggle}
          trackColor={{ true: colors.brand, false: colors.switchOff }} thumbColor={colors.white} />
      </View>

      {on && props.jobsOn && jobs.length ? (
        <Pressable accessibilityRole="button" onPress={props.onExpand} className="min-h-[44px] flex-row items-center gap-1">
          <Text className="font-semibold text-brand">{props.expanded ? "Hide jobs" : "Choose jobs and prices"}</Text>
          {props.expanded ? <ChevronUp size={18} color={colors.brand} /> : <ChevronDown size={18} color={colors.brand} />}
        </Pressable>
      ) : null}

      {on && props.jobsOn && props.expanded ? (
        <View className="gap-3">
          <View className="flex-row gap-4">
            <Pressable accessibilityRole="button" onPress={() => props.onAll(true)} hitSlop={8}><Text className="text-sm font-semibold text-brand">Tick all</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => props.onAll(false)} hitSlop={8}><Text className="text-sm font-semibold text-brand">Untick all</Text></Pressable>
          </View>
          {groupSubItems(jobs).map((group) => (
            <View key={group.section} className="gap-1">
              <Text className="text-xs font-semibold uppercase tracking-wider text-muted">{group.section}</Text>
              {group.items.map((j) => (
                <JobRow key={j.id} job={j} ticked={ticked.has(j.id)} rate={draft.rates.get(j.id) ?? ""} error={props.rateErrors[j.id]}
                  onToggle={() => props.onToggleJob(j.id)} onRate={(t) => props.onRate(j.id, t)} />
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function JobRow({ job, ticked, rate, error, onToggle, onRate }: {
  job: CatalogueJob; ticked: boolean; rate: string; error?: string; onToggle: () => void; onRate: (text: string) => void;
}) {
  const colors = useThemeColors();
  const band = readBand({ min: job.price_min, max: job.price_max });
  return (
    <View className="gap-1 py-1">
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ticked }} onPress={onToggle} className="min-h-[44px] flex-row items-center gap-3">
        {ticked ? <CheckSquare size={22} color={colors.brand} /> : <Square size={22} color={colors.mutedSoft} />}
        <Text className="flex-1 text-base text-fg">{job.name}</Text>
        <Text className="text-sm text-muted">{formatInr(job.base_price)}</Text>
      </Pressable>
      {ticked && band ? (
        <View className="ml-9 gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-sm text-muted">Your price ₹</Text>
            <TextInput value={rate} onChangeText={onRate} keyboardType="number-pad" maxLength={6} placeholder={String(job.base_price)}
              accessibilityLabel={`Your price for ${job.name}`} placeholderTextColor={colors.mutedSoft}
              style={{ fontFamily: "PlusJakartaSans_400Regular" }}
              className={`min-h-[44px] w-24 rounded-lg border bg-field px-3 text-base text-fg ${error ? "border-danger" : "border-line"}`} />
          </View>
          <Text className={`text-xs ${error ? "text-danger" : "text-muted"}`}>
            {error ?? `Allowed ${formatInr(band.min)} to ${formatInr(band.max)}. Leave empty for ${formatInr(job.base_price)}.`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
