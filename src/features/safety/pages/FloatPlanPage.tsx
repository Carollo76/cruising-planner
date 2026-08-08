import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { v4 as uuid } from 'uuid';
import {
  ArrowLeft,
  Save,
  Share2,
  Printer,
  Plus,
  Trash2,
  Sailboat,
  Navigation,
  Users,
  Shield,
  Radio,
  Phone,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { db } from '../../../db/database';
import { useSettingsStore } from '../../../stores/settings-store';
import type { Trip, Route } from '../../../types/navigation';
import type { CrewMember } from '../../../types/crew';
import type {
  FloatPlan,
  FloatPlanCrew,
  SafetyEquipment,
  ShoreContact,
  EmergencyContact,
} from '../../../types/safety';

/* ──────────────────────────── constants ──────────────────────────── */

const INPUT =
  'w-full rounded-lg bg-slate-800 px-3 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-sea-500 placeholder:text-slate-500';
const LABEL = 'mb-1 block text-xs font-medium text-slate-400';
const SECTION_CARD = 'rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden';
const SECTION_HEADER =
  'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/50';

const DEFAULT_EMERGENCY_CONTACTS: EmergencyContact[] = [
  {
    name: 'USCG Sector Long Island Sound',
    phone: '(203) 468-4401',
    vhfChannel: 'Ch 16',
    type: 'coast-guard',
    region: 'Long Island Sound',
  },
  {
    name: 'TowBoatUS',
    phone: '(800) 391-4869',
    type: 'towing',
  },
  {
    name: 'SeaTow',
    phone: '(800) 473-2869',
    type: 'towing',
  },
];

const COMM_OPTIONS = [
  'VHF Radio',
  'Cell Phone',
  'Satellite Phone',
  'AIS',
  'DSC',
  'Satellite Messenger',
] as const;

const SWIMMING_ABILITIES: FloatPlanCrew['swimmingAbility'][] = [
  'strong',
  'moderate',
  'weak',
  'none',
];

/* ──────────────────────────── helpers ──────────────────────────── */

/** Stable id per trip so re-saving updates the same plan instead of piling up copies. */
function floatPlanId(tripId?: string): string {
  return tripId ? `floatplan-${tripId}` : 'floatplan-default';
}

function formatDuration(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/* ──────────────────────────── Section wrapper ──────────────────────────── */

function Section({
  title,
  icon: Icon,
  iconColor,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={SECTION_CARD}>
      <button type="button" className={SECTION_HEADER} onClick={() => setOpen(!open)}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
        <span className="flex-1 text-sm font-semibold text-slate-100">{title}</span>
        <span className="text-xs text-slate-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="border-t border-slate-800 px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

/* ──────────────────────────── Main component ──────────────────────────── */

export function FloatPlanPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { boatConfig, setBoatConfig } = useSettingsStore();

  /* ── loading state ── */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [route, setRoute] = useState<Route | null>(null);

  /* ── vessel ── */
  const [vesselName, setVesselName] = useState('');
  const [vesselMakeModel, setVesselMakeModel] = useState('');
  const [loa, setLoa] = useState('');
  const [draft, setDraft] = useState('');
  const [hullColor, setHullColor] = useState('White');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [hailingPort, setHailingPort] = useState('');
  const [mmsi, setMmsi] = useState('');
  const [callSign, setCallSign] = useState('');
  const [engineType, setEngineType] = useState('');
  const [fuelCapacity, setFuelCapacity] = useState('');
  const [waterCapacity, setWaterCapacity] = useState('');

  /* ── trip ── */
  const [departurePoint, setDeparturePoint] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [destinationPoint, setDestinationPoint] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [routeDescription, setRouteDescription] = useState('');
  const [totalDistance, setTotalDistance] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [cruisingSpeed, setCruisingSpeed] = useState('');

  /* ── crew ── */
  const [crew, setCrew] = useState<(FloatPlanCrew & { _id: string })[]>([]);

  /* ── safety equipment ── */
  const [safety, setSafety] = useState<SafetyEquipment>({
    lifeJackets: 6,
    throwableDevices: 1,
    fireExtinguishers: 2,
    flares: true,
    horn: true,
    epirb: false,
    lifeRaft: false,
    firstAidKit: true,
    flashlights: 2,
    vhfRadio: true,
    anchor: true,
  });

  /* ── comm ── */
  const [commEquipment, setCommEquipment] = useState<string[]>(['VHF Radio', 'Cell Phone']);

  /* ── shore contact ── */
  const [shoreContact, setShoreContact] = useState<ShoreContact>({
    name: '',
    phone: '',
    email: '',
    relationship: '',
  });

  /* ── emergency contacts ── */
  const [emergencyContacts, setEmergencyContacts] = useState<
    (EmergencyContact & { _id: string })[]
  >(DEFAULT_EMERGENCY_CONTACTS.map((c) => ({ ...c, _id: uuid() })));

  /* ──────────────────────────── Auto-populate on load ──────────────────────────── */

  useEffect(() => {
    async function load() {
      try {
        const tripId = searchParams.get('tripId');

        // 1. Find trip
        let foundTrip: Trip | undefined;
        if (tripId) {
          foundTrip = await db.trips.get(tripId);
        }
        if (!foundTrip) {
          foundTrip = await db.trips.where('status').anyOf('planning', 'active').first();
        }

        // 2. Load route
        let foundRoute: Route | undefined;
        if (foundTrip && foundTrip.routeIds.length > 0) {
          foundRoute = await db.routes.get(foundTrip.routeIds[0]);
        }
        if (!foundRoute) {
          foundRoute = await db.routes.orderBy('createdAt').last();
        }

        // 3. Load crew
        let crewMembers: CrewMember[] = [];
        if (foundTrip && foundTrip.crewIds.length > 0) {
          const all = await db.crewMembers.bulkGet(foundTrip.crewIds);
          crewMembers = all.filter(Boolean) as CrewMember[];
        }
        if (crewMembers.length === 0) {
          crewMembers = await db.crewMembers.toArray();
        }

        // Set trip / route state
        if (foundTrip) setTrip(foundTrip);
        if (foundRoute) setRoute(foundRoute);

        // ── Vessel info from boatConfig ──
        setVesselName(boatConfig.name || '');
        setVesselMakeModel(`${boatConfig.make} ${boatConfig.model}`.trim());
        setLoa(boatConfig.loa ? String(boatConfig.loa) : '');
        setDraft(boatConfig.draft ? String(boatConfig.draft) : '');
        setHullColor(boatConfig.hullColor || 'White');
        setRegistrationNumber(boatConfig.registrationNumber || '');
        setHailingPort(boatConfig.hailingPort || '');
        setMmsi(boatConfig.mmsi || '');
        setCallSign(boatConfig.callSign || '');
        setEngineType(boatConfig.engineHP ? `${boatConfig.engineHP} HP Diesel` : '');
        setFuelCapacity(boatConfig.fuelCapacityGallons ? String(boatConfig.fuelCapacityGallons) : '');
        setWaterCapacity(
          boatConfig.waterCapacityGallons ? String(boatConfig.waterCapacityGallons) : ''
        );
        setCruisingSpeed(boatConfig.cruisingSpeedKnots ? String(boatConfig.cruisingSpeedKnots) : '');

        // ── Trip details from route ──
        if (foundRoute) {
          const wps = [...foundRoute.waypoints].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
          if (wps.length > 0) {
            setDeparturePoint(wps[0].name || 'Departure');
            setDestinationPoint(wps[wps.length - 1].name || 'Destination');
            setRouteDescription(wps.map((w) => w.name).join(' \u2192 '));
          }
          setTotalDistance(
            foundRoute.totalDistanceNM ? `${foundRoute.totalDistanceNM.toFixed(1)} NM` : ''
          );
          setEstimatedDuration(
            foundRoute.totalEstimatedTimeHours
              ? formatDuration(foundRoute.totalEstimatedTimeHours)
              : ''
          );
        }

        // ── Dates from trip ──
        if (foundTrip) {
          if (foundTrip.startDate) {
            setDepartureTime(foundTrip.startDate);
          }
          if (foundTrip.endDate) {
            setEstimatedArrival(foundTrip.endDate);
          }
        }

        // ── Crew manifest ──
        if (crewMembers.length > 0) {
          setCrew(
            crewMembers.map((m) => ({
              _id: uuid(),
              name: m.name,
              age: m.age,
              medicalConditions: m.medicalInfo || '',
              swimmingAbility: 'strong' as const,
            }))
          );
        }

        // ── Restore a previously saved plan, overriding the auto-populated defaults ──
        // Without this the page could only ever be re-derived from boat/trip/route, so
        // everything typed here (crew, safety counts, shore contact) came back blank.
        const existing = await db.floatPlans.get(floatPlanId(foundTrip?.id));
        if (existing) {
          setVesselName(existing.vesselName);
          setHailingPort(existing.hailingPort);
          if (existing.mmsi) setMmsi(existing.mmsi);
          setDeparturePoint(existing.departurePoint);
          setDepartureTime(existing.departureTime);
          setDestinationPoint(existing.destinationPoint);
          setEstimatedArrival(existing.estimatedArrival);
          setRouteDescription(existing.routeDescription);
          setEngineType(existing.engineType);
          if (existing.fuelCapacity) setFuelCapacity(String(existing.fuelCapacity));
          if (existing.waterCapacity) setWaterCapacity(String(existing.waterCapacity));
          setSafety(existing.safetyEquipment);
          setCommEquipment(existing.communicationEquipment);
          setShoreContact(existing.shoreContact);
          setCrew(existing.crew.map((c) => ({ ...c, _id: uuid() })));
          if (existing.emergencyContacts.length > 0) {
            setEmergencyContacts(existing.emergencyContacts.map((c) => ({ ...c, _id: uuid() })));
          }
          setSavedAt(existing.generatedAt);
        }
      } catch (err) {
        console.error('FloatPlan load error:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* ──────────────────────────── Crew helpers ──────────────────────────── */

  const addCrewMember = () =>
    setCrew((prev) => [
      ...prev,
      { _id: uuid(), name: '', age: undefined, medicalConditions: '', swimmingAbility: 'strong' },
    ]);

  const removeCrewMember = (id: string) => setCrew((prev) => prev.filter((c) => c._id !== id));

  const updateCrewMember = (id: string, field: string, value: unknown) =>
    setCrew((prev) => prev.map((c) => (c._id === id ? { ...c, [field]: value } : c)));

  /* ──────────────────────────── Emergency contact helpers ──────────────────────────── */

  const addEmergencyContact = () =>
    setEmergencyContacts((prev) => [
      ...prev,
      { _id: uuid(), name: '', phone: '', type: 'personal' as const },
    ]);

  const removeEmergencyContact = (id: string) =>
    setEmergencyContacts((prev) => prev.filter((c) => c._id !== id));

  const updateEmergencyContact = (id: string, field: string, value: unknown) =>
    setEmergencyContacts((prev) =>
      prev.map((c) => (c._id === id ? { ...c, [field]: value } : c))
    );

  /* ──────────────────────────── Safety equipment helpers ──────────────────────────── */

  const updateSafety = (field: keyof SafetyEquipment, value: unknown) =>
    setSafety((prev) => ({ ...prev, [field]: value }));

  /* ──────────────────────────── Comm toggles ──────────────────────────── */

  const toggleComm = (item: string) =>
    setCommEquipment((prev) =>
      prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item]
    );

  /* ──────────────────────────── Build float plan text ──────────────────────────── */

  const buildPlanText = useCallback(() => {
    const line = '\u2550'.repeat(43);
    const crewCount = crew.length;
    const arrivalForDeadline = estimatedArrival
      ? (() => {
          try {
            const d = new Date(estimatedArrival);
            const deadline = new Date(d.getTime() + 2 * 60 * 60 * 1000);
            return format(deadline, 'HH:mm');
          } catch {
            return estimatedArrival;
          }
        })()
      : 'N/A';

    let text = '';
    text += `${line}\n`;
    text += `         FLOAT PLAN\n`;
    text += `${line}\n\n`;

    text += `VESSEL: ${vesselName} \u2014 ${vesselMakeModel}\n`;
    text += `LOA: ${loa} ft  Draft: ${draft} ft  Color: ${hullColor}\n`;
    text += `Registration: ${registrationNumber || 'N/A'}  MMSI: ${mmsi || 'N/A'}`;
    if (callSign) text += `  Call Sign: ${callSign}`;
    text += '\n';
    text += `Engine: ${engineType}  Fuel: ${fuelCapacity} gal\n\n`;

    text += `DEPARTURE: ${departurePoint}\n`;
    text += `  Date/Time: ${departureTime ? (() => { try { return format(new Date(departureTime), 'EEE MMM d, yyyy HH:mm'); } catch { return departureTime; } })() : 'TBD'}\n\n`;

    text += `DESTINATION: ${destinationPoint}\n`;
    text += `  ETA: ${estimatedArrival ? (() => { try { return format(new Date(estimatedArrival), 'EEE MMM d, yyyy HH:mm'); } catch { return estimatedArrival; } })() : 'TBD'}\n\n`;

    text += `ROUTE: ${routeDescription || 'N/A'}\n`;
    text += `  Distance: ${totalDistance || 'N/A'}  Speed: ${cruisingSpeed ? `${cruisingSpeed} kt` : 'N/A'}\n\n`;

    text += `CREW (${crewCount} persons):\n`;
    crew.forEach((c, i) => {
      text += `  ${i + 1}. ${c.name || 'Unknown'}`;
      if (c.swimmingAbility) text += `, ${c.swimmingAbility} swimmer`;
      if (c.medicalConditions) text += ` [${c.medicalConditions}]`;
      text += '\n';
    });
    text += '\n';

    text += `SAFETY EQUIPMENT:\n  `;
    const items: string[] = [];
    if (safety.lifeJackets) items.push(`\u2713 Life Jackets: ${safety.lifeJackets}`);
    if (safety.throwableDevices) items.push(`\u2713 Throwable: ${safety.throwableDevices}`);
    if (safety.fireExtinguishers) items.push(`\u2713 Fire Ext: ${safety.fireExtinguishers}`);
    if (safety.flares) items.push('\u2713 Flares');
    if (safety.horn) items.push('\u2713 Horn');
    if (safety.epirb) items.push('\u2713 EPIRB');
    if (safety.lifeRaft) items.push('\u2713 Life Raft');
    if (safety.firstAidKit) items.push('\u2713 First Aid');
    if (safety.flashlights) items.push(`\u2713 Flashlights: ${safety.flashlights}`);
    if (safety.vhfRadio) items.push('\u2713 VHF Radio');
    if (safety.anchor) items.push('\u2713 Anchor');
    text += items.join('  ');
    text += '\n\n';

    text += `COMMUNICATION: ${commEquipment.join(', ') || 'None'}\n\n`;

    text += `SHORE CONTACT: ${shoreContact.name || 'N/A'} \u2014 ${shoreContact.phone || 'N/A'}\n`;
    if (shoreContact.email) text += `  Email: ${shoreContact.email}\n`;
    text += `  \u26A0 IF NOT HEARD FROM BY ${arrivalForDeadline},\n`;
    text += `    CALL USCG: (203) 468-4401 or VHF Ch 16\n\n`;

    text += `EMERGENCY:\n`;
    emergencyContacts.forEach((c) => {
      text += `  ${c.name}: ${c.phone}`;
      if (c.vhfChannel) text += `, ${c.vhfChannel}`;
      text += '\n';
    });

    text += `${line}\n`;
    text += `Generated by Cruising Planner \u2014 ${format(new Date(), 'EEE MMM d, yyyy HH:mm')}\n`;

    return text;
  }, [
    vesselName,
    vesselMakeModel,
    loa,
    draft,
    hullColor,
    registrationNumber,
    mmsi,
    callSign,
    engineType,
    fuelCapacity,
    departurePoint,
    departureTime,
    destinationPoint,
    estimatedArrival,
    routeDescription,
    totalDistance,
    cruisingSpeed,
    crew,
    safety,
    commEquipment,
    shoreContact,
    emergencyContacts,
  ]);

  /* ──────────────────────────── Save ──────────────────────────── */

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Vessel details belong to the boat, not to one float plan. Persist them back to
      // Boat Config so they are pre-filled everywhere and never need retyping.
      const [make, ...modelParts] = vesselMakeModel.trim().split(' ');
      setBoatConfig({
        ...boatConfig,
        name: vesselName || boatConfig.name,
        make: make || boatConfig.make,
        model: modelParts.join(' ') || boatConfig.model,
        loa: parseFloat(loa) || boatConfig.loa,
        draft: parseFloat(draft) || boatConfig.draft,
        fuelCapacityGallons: parseFloat(fuelCapacity) || boatConfig.fuelCapacityGallons,
        waterCapacityGallons: parseFloat(waterCapacity) || boatConfig.waterCapacityGallons,
        cruisingSpeedKnots: parseFloat(cruisingSpeed) || boatConfig.cruisingSpeedKnots,
        registrationNumber: registrationNumber || undefined,
        hailingPort: hailingPort || undefined,
        mmsi: mmsi || undefined,
        callSign: callSign || undefined,
        hullColor: hullColor || undefined,
      });

      const plan: FloatPlan = {
        // Stable per trip — re-saving updates this plan rather than creating a duplicate.
        id: floatPlanId(trip?.id),
        tripId: trip?.id,
        vesselName,
        vesselDescription: `${vesselMakeModel}, LOA ${loa} ft, ${hullColor}`,
        hailingPort,
        mmsi: mmsi || undefined,
        crew: crew.map(({ _id, ...rest }) => rest),
        departurePoint,
        departureTime,
        destinationPoint,
        estimatedArrival,
        routeDescription,
        waypoints: route?.waypoints.map((w) => w.position) || [],
        safetyEquipment: safety,
        fuelCapacity: parseFloat(fuelCapacity) || 0,
        waterCapacity: parseFloat(waterCapacity) || 0,
        engineType,
        communicationEquipment: commEquipment,
        emergencyContacts: emergencyContacts.map(({ _id, ...rest }) => rest),
        shoreContact,
        generatedAt: Date.now(),
      };
      await db.floatPlans.put(plan);
      // Read back before reporting success — a float plan that only looks saved is a
      // safety problem, since this is the document shore contacts rely on.
      if (!(await db.floatPlans.get(plan.id))) {
        throw new Error('the plan was written but could not be read back from local storage');
      }
      setSavedAt(plan.generatedAt);
    } catch (err) {
      setSaveError(`Could not save this float plan: ${(err as Error).message}`);
      console.error('Save float plan error:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ──────────────────────────── Share ──────────────────────────── */

  const handleShare = async () => {
    const text = buildPlanText();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Float Plan', text });
        return;
      } catch {
        // user cancelled or API failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      alert('Float plan copied to clipboard');
    } catch {
      // last resort: select-all from a textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Float plan copied to clipboard');
    }
  };

  /* ──────────────────────────── Print ──────────────────────────── */

  const handlePrint = () => {
    const text = buildPlanText();
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Float Plan</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: #111;
      background: #fff;
      padding: 24px 32px;
    }
    h1 {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 12px;
      letter-spacing: 2px;
    }
    .divider {
      border-top: 2px double #333;
      margin: 8px 0 16px;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.6;
    }
    .footer {
      margin-top: 24px;
      text-align: center;
      font-size: 10px;
      color: #666;
      border-top: 1px solid #ccc;
      padding-top: 8px;
    }
    @media print {
      body { padding: 12px 16px; }
    }
  </style>
</head>
<body>
  <pre>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(htmlContent);
      win.document.close();
    }
  };

  /* ──────────────────────────── Loading state ──────────────────────────── */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sea-400 border-t-transparent" />
      </div>
    );
  }

  /* ──────────────────────────── Render ──────────────────────────── */

  return (
    <div className="min-h-screen pb-48">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/planner/safety')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-100">Float Plan</h1>
            {trip && (
              <p className="text-xs text-slate-500">
                {trip.name} &middot; {trip.status}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {/* ═══════ Section 1: Vessel Information ═══════ */}
        <Section title="Vessel Information" icon={Sailboat} iconColor="text-sea-400">
          <p className="mb-3 text-xs text-slate-500">
            Pre-filled from Boat Config. Anything you change here is saved back to Boat Config when
            you save this plan, so you only enter it once.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Vessel Name</label>
              <input
                className={INPUT}
                value={vesselName}
                onChange={(e) => setVesselName(e.target.value)}
                placeholder="e.g. Our Boat"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Make / Model</label>
              <input
                className={INPUT}
                value={vesselMakeModel}
                onChange={(e) => setVesselMakeModel(e.target.value)}
                placeholder="e.g. Beneteau Oceanis 37"
              />
            </div>
            <div>
              <label className={LABEL}>LOA (ft)</label>
              <input
                className={INPUT}
                value={loa}
                onChange={(e) => setLoa(e.target.value)}
                placeholder="36.8"
              />
            </div>
            <div>
              <label className={LABEL}>Draft (ft)</label>
              <input
                className={INPUT}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="5.9"
              />
            </div>
            <div>
              <label className={LABEL}>Hull Color</label>
              <input
                className={INPUT}
                value={hullColor}
                onChange={(e) => setHullColor(e.target.value)}
                placeholder="White"
              />
            </div>
            <div>
              <label className={LABEL}>Registration #</label>
              <input
                className={INPUT}
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Hailing Port</label>
              <input
                className={INPUT}
                value={hailingPort}
                onChange={(e) => setHailingPort(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>MMSI</label>
              <input
                className={INPUT}
                value={mmsi}
                onChange={(e) => setMmsi(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Call Sign</label>
              <input
                className={INPUT}
                value={callSign}
                onChange={(e) => setCallSign(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Engine Type</label>
              <input
                className={INPUT}
                value={engineType}
                onChange={(e) => setEngineType(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Fuel Capacity (gal)</label>
              <input
                className={INPUT}
                value={fuelCapacity}
                onChange={(e) => setFuelCapacity(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Water Capacity (gal)</label>
              <input
                className={INPUT}
                value={waterCapacity}
                onChange={(e) => setWaterCapacity(e.target.value)}
              />
            </div>
          </div>
        </Section>

        {/* ═══════ Section 2: Trip Details ═══════ */}
        <Section title="Trip Details" icon={Navigation} iconColor="text-blue-400">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Departure Point</label>
              <input
                className={INPUT}
                value={departurePoint}
                onChange={(e) => setDeparturePoint(e.target.value)}
                placeholder="Marina or anchorage"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Departure Date/Time</label>
              <input
                type="datetime-local"
                className={INPUT}
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Destination</label>
              <input
                className={INPUT}
                value={destinationPoint}
                onChange={(e) => setDestinationPoint(e.target.value)}
                placeholder="Final destination"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Estimated Arrival</label>
              <input
                type="datetime-local"
                className={INPUT}
                value={estimatedArrival}
                onChange={(e) => setEstimatedArrival(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Route Description</label>
              <input
                className={INPUT}
                value={routeDescription}
                onChange={(e) => setRouteDescription(e.target.value)}
                placeholder="Waypoint A → Waypoint B → Waypoint C"
              />
            </div>
            <div>
              <label className={LABEL}>Total Distance</label>
              <input
                className={INPUT}
                value={totalDistance}
                onChange={(e) => setTotalDistance(e.target.value)}
                placeholder="42.5 NM"
              />
            </div>
            <div>
              <label className={LABEL}>Est. Duration</label>
              <input
                className={INPUT}
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                placeholder="7h 5m"
              />
            </div>
            <div>
              <label className={LABEL}>Cruising Speed (kt)</label>
              <input
                className={INPUT}
                value={cruisingSpeed}
                onChange={(e) => setCruisingSpeed(e.target.value)}
                placeholder="6.0"
              />
            </div>
          </div>
        </Section>

        {/* ═══════ Section 3: Crew Manifest ═══════ */}
        <Section title={`Crew Manifest (${crew.length})`} icon={Users} iconColor="text-green-400">
          <div className="space-y-3">
            {crew.map((member) => (
              <div
                key={member._id}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Crew Member</span>
                  <button
                    type="button"
                    onClick={() => removeCrewMember(member._id)}
                    className="rounded p-1 text-slate-500 transition-colors hover:bg-red-900/30 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={LABEL}>Name</label>
                    <input
                      className={INPUT}
                      value={member.name}
                      onChange={(e) => updateCrewMember(member._id, 'name', e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Age</label>
                    <input
                      type="number"
                      className={INPUT}
                      value={member.age ?? ''}
                      onChange={(e) =>
                        updateCrewMember(
                          member._id,
                          'age',
                          e.target.value ? parseInt(e.target.value) : undefined
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Swimming Ability</label>
                    <select
                      className={INPUT}
                      value={member.swimmingAbility}
                      onChange={(e) =>
                        updateCrewMember(member._id, 'swimmingAbility', e.target.value)
                      }
                    >
                      {SWIMMING_ABILITIES.map((a) => (
                        <option key={a} value={a}>
                          {a.charAt(0).toUpperCase() + a.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className={LABEL}>Medical Conditions</label>
                    <input
                      className={INPUT}
                      value={member.medicalConditions || ''}
                      onChange={(e) =>
                        updateCrewMember(member._id, 'medicalConditions', e.target.value)
                      }
                      placeholder="None"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addCrewMember}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 py-2.5 text-sm text-slate-400 transition-colors hover:border-sea-500 hover:text-sea-400"
            >
              <Plus className="h-4 w-4" />
              Add Person
            </button>
          </div>
        </Section>

        {/* ═══════ Section 4: Safety Equipment ═══════ */}
        <Section title="Safety Equipment" icon={Shield} iconColor="text-amber-400">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Number inputs */}
            <div>
              <label className={LABEL}>Life Jackets</label>
              <input
                type="number"
                min={0}
                className={INPUT}
                value={safety.lifeJackets}
                onChange={(e) => updateSafety('lifeJackets', parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={LABEL}>Throwable Devices</label>
              <input
                type="number"
                min={0}
                className={INPUT}
                value={safety.throwableDevices}
                onChange={(e) => updateSafety('throwableDevices', parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={LABEL}>Fire Extinguishers</label>
              <input
                type="number"
                min={0}
                className={INPUT}
                value={safety.fireExtinguishers}
                onChange={(e) => updateSafety('fireExtinguishers', parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className={LABEL}>Flashlights</label>
              <input
                type="number"
                min={0}
                className={INPUT}
                value={safety.flashlights}
                onChange={(e) => updateSafety('flashlights', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Boolean checkboxes */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(
              [
                ['flares', 'Flares'],
                ['horn', 'Horn'],
                ['epirb', 'EPIRB'],
                ['lifeRaft', 'Life Raft'],
                ['firstAidKit', 'First Aid Kit'],
                ['vhfRadio', 'VHF Radio'],
                ['anchor', 'Anchor'],
              ] as [keyof SafetyEquipment, string][]
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800/50 px-3 py-2.5 transition-colors hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={!!safety[key]}
                  onChange={(e) => updateSafety(key, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-sea-500 focus:ring-sea-500"
                />
                <span className="text-sm text-slate-200">{label}</span>
              </label>
            ))}
          </div>
        </Section>

        {/* ═══════ Section 5: Communication Equipment ═══════ */}
        <Section title="Communication Equipment" icon={Radio} iconColor="text-purple-400">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {COMM_OPTIONS.map((item) => {
              const active = commEquipment.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleComm(item)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                    active
                      ? 'bg-sea-600/20 text-sea-400 ring-1 ring-sea-500'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </Section>

        {/* ═══════ Section 6: Shore Contact ═══════ */}
        <Section title="Shore Contact" icon={Phone} iconColor="text-red-400" defaultOpen={true}>
          {/* Alert box */}
          <div className="mb-4 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
            <p className="text-xs leading-relaxed text-amber-200">
              Your shore contact should have this float plan and know to call the Coast Guard if you
              don't report by the estimated arrival time.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Name</label>
              <input
                className={INPUT}
                value={shoreContact.name}
                onChange={(e) => setShoreContact((p) => ({ ...p, name: e.target.value }))}
                placeholder="Shore contact name"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Phone</label>
              <input
                type="tel"
                className={INPUT}
                value={shoreContact.phone}
                onChange={(e) => setShoreContact((p) => ({ ...p, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Email</label>
              <input
                type="email"
                className={INPUT}
                value={shoreContact.email || ''}
                onChange={(e) => setShoreContact((p) => ({ ...p, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={LABEL}>Relationship</label>
              <input
                className={INPUT}
                value={shoreContact.relationship}
                onChange={(e) => setShoreContact((p) => ({ ...p, relationship: e.target.value }))}
                placeholder="e.g. Spouse, Parent, Friend"
              />
            </div>
          </div>
        </Section>

        {/* ═══════ Section 7: Emergency Contacts ═══════ */}
        <Section
          title={`Emergency Contacts (${emergencyContacts.length})`}
          icon={AlertTriangle}
          iconColor="text-red-400"
        >
          <div className="space-y-3">
            {emergencyContacts.map((contact) => (
              <div
                key={contact._id}
                className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3"
              >
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div className="col-span-2 sm:col-span-1">
                    <label className={LABEL}>Name / Organization</label>
                    <input
                      className={INPUT}
                      value={contact.name}
                      onChange={(e) =>
                        updateEmergencyContact(contact._id, 'name', e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Phone</label>
                    <input
                      type="tel"
                      className={INPUT}
                      value={contact.phone}
                      onChange={(e) =>
                        updateEmergencyContact(contact._id, 'phone', e.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className={LABEL}>VHF Channel</label>
                    <input
                      className={INPUT}
                      value={contact.vhfChannel || ''}
                      onChange={(e) =>
                        updateEmergencyContact(contact._id, 'vhfChannel', e.target.value)
                      }
                      placeholder="e.g. Ch 16"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeEmergencyContact(contact._id)}
                  className="mt-6 rounded p-1 text-slate-500 transition-colors hover:bg-red-900/30 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addEmergencyContact}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 py-2.5 text-sm text-slate-400 transition-colors hover:border-sea-500 hover:text-sea-400"
            >
              <Plus className="h-4 w-4" />
              Add Contact
            </button>
          </div>
        </Section>
      </div>

      {/* ═══════ Bottom Actions (fixed) ═══════ */}
      {/* Sits directly above the bottom nav. Previously bottom-0/z-20, which put it
          underneath the z-50 nav — the Save button was invisible and untappable. */}
      <div className="above-bottom-nav fixed left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        {saveError && (
          <p className="mx-auto mb-2 max-w-2xl rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {saveError}
          </p>
        )}
        {!saveError && savedAt && (
          <p className="mx-auto mb-2 max-w-2xl text-center text-xs text-green-400">
            Saved {format(new Date(savedAt), 'MMM d, h:mm a')} — vessel details also stored in Boat
            Config
          </p>
        )}
        <div className="mx-auto flex max-w-2xl gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-sea-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-sea-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Float Plan'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
