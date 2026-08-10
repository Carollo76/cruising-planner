import { formatLocalTime } from '../../../utils/time';
import { angularDifference } from '../../../utils/route-geometry';
import type {
  ArrivalDeadlineConstraint,
  BridgeConstraint,
  ServiceHoursConstraint,
  ConstraintVerdict,
  CurrentGateConstraint,
  DaylightConstraint,
  EvaluationContext,
  PlanningConstraint,
  SeaStateConstraint,
  TideHeightConstraint,
} from '../model/constraints';

/**
 * One evaluator per constraint kind. Each answers the same question in its own terms:
 * given that the boat is here at this moment, is that fine, awkward, or unacceptable?
 *
 * Penalties are on a common scale so the solver can add them without knowing what they
 * mean: roughly "minutes of passage time this is worth avoiding".
 */

export function evaluateCurrentGate(
  constraint: CurrentGateConstraint,
  context: EvaluationContext
): ConstraintVerdict {
  const current = context.currents;
  if (!current) {
    return {
      status: 'unknown',
      detail: 'No current prediction cached for this gate — transit timing not assessed.',
    };
  }

  // Positive helps, negative hinders. Computed by the caller, which knows the course.
  const along = current.signedKn;
  const strength = Math.abs(along);
  const when = formatLocalTime(context.at);

  if (strength < 0.3) {
    return { status: 'ok', detail: `Slack water at ${when} — no current worth timing.` };
  }

  if (along > 0) {
    return {
      status: 'ok',
      detail: `${strength.toFixed(1)} kn fair ${current.kind} at ${when} — carrying you through.`,
    };
  }

  if (strength >= constraint.hardFoulSpeedKn) {
    return {
      status: 'fail',
      detail: `${strength.toFixed(1)} kn foul ${current.kind} at ${when} — impractical to transit.`,
      remedies: [
        'Leave earlier or later to arrive nearer slack',
        'Wait for the turn of the tide before entering',
        'Take the alternative passage if the route allows',
      ],
    };
  }

  if (strength >= constraint.cautionSpeedKn) {
    // Scaled by how far past caution it is, so 2.4 kn foul is worse than 1.1 kn foul.
    const over = strength - constraint.cautionSpeedKn;
    const span = Math.max(0.1, constraint.hardFoulSpeedKn - constraint.cautionSpeedKn);
    return {
      status: 'caution',
      detail: `${strength.toFixed(1)} kn foul ${current.kind} at ${when} — slow going.`,
      penalty: 30 + 90 * (over / span),
    };
  }

  return {
    status: 'caution',
    detail: `${strength.toFixed(1)} kn foul ${current.kind} at ${when} — mild, but against you.`,
    penalty: 10 * strength,
  };
}

export function evaluateTideHeight(
  constraint: TideHeightConstraint,
  context: EvaluationContext
): ConstraintVerdict {
  // Refusing to guess is the whole point: an invented controlling depth produces a
  // confident answer about whether the boat floats.
  if (constraint.controllingDepthFt === null) {
    return {
      status: 'unknown',
      detail:
        'Controlling depth unknown for this entrance — this recommendation does not account ' +
        'for whether there is enough water. Check the chart.',
    };
  }
  if (context.tideHeightFt === undefined) {
    return {
      status: 'unknown',
      detail: 'No tide prediction cached for this entrance — depth not assessed.',
    };
  }

  const available = constraint.controllingDepthFt + context.tideHeightFt;
  const needed = context.boat.draftFt + constraint.safetyMarginFt;
  const spare = available - needed;
  const when = formatLocalTime(context.at);

  if (spare >= 0) {
    return {
      status: 'ok',
      detail:
        `${available.toFixed(1)} ft at ${when} — ${spare.toFixed(1)} ft over your ` +
        `${context.boat.draftFt.toFixed(1)} ft draft plus ${constraint.safetyMarginFt.toFixed(1)} ft margin.`,
    };
  }

  // Inside the margin is uncomfortable; below bare draft is aground.
  if (available >= context.boat.draftFt) {
    return {
      status: 'caution',
      detail:
        `${available.toFixed(1)} ft at ${when} — clears your ${context.boat.draftFt.toFixed(1)} ft ` +
        `draft but eats into the ${constraint.safetyMarginFt.toFixed(1)} ft margin.`,
      penalty: 40 + 60 * Math.min(1, -spare / Math.max(0.1, constraint.safetyMarginFt)),
    };
  }

  return {
    status: 'fail',
    detail:
      `${available.toFixed(1)} ft at ${when} — less than your ${context.boat.draftFt.toFixed(1)} ft draft.`,
    remedies: [
      'Arrive nearer high water',
      'Anchor outside and enter on the flood',
      'Choose a deeper harbour for this night',
    ],
  };
}

export function evaluateDaylight(
  constraint: DaylightConstraint,
  context: EvaluationContext
): ConstraintVerdict {
  if (!context.daylight) {
    return { status: 'unknown', detail: 'Daylight hours not computed for this position.' };
  }

  const { civilDawn, civilDusk } = context.daylight;
  const when = formatLocalTime(context.at);

  if (context.at >= civilDawn && context.at <= civilDusk) {
    return { status: 'ok', detail: `${when} — in daylight.` };
  }

  if (constraint.allowNightArrival) {
    return {
      status: 'caution',
      detail: `${when} — in darkness, which you have accepted for this stop.`,
      penalty: 45,
    };
  }

  const shortfallMin =
    context.at < civilDawn
      ? Math.round((civilDawn - context.at) / 60_000)
      : Math.round((context.at - civilDusk) / 60_000);

  return {
    status: 'fail',
    detail:
      `${when} — ${shortfallMin} min outside civil twilight ` +
      `(${formatLocalTime(civilDawn)}–${formatLocalTime(civilDusk)}).`,
    remedies: [
      shortfallMin < 120 ? 'Shift departure by an hour or two' : 'Start the day earlier',
      'Accept a night arrival for this stop',
      'Split the passage with an intermediate stop',
    ],
  };
}

export function evaluateSeaState(
  constraint: SeaStateConstraint,
  context: EvaluationContext
): ConstraintVerdict {
  // Spec §8: if wind data is not available, say so rather than staying silent.
  if (!context.wind) {
    return {
      status: 'unknown',
      detail: 'No wind forecast available — wind-against-tide not checked for this passage.',
    };
  }
  if (!context.currents) {
    return {
      status: 'unknown',
      detail: 'No current prediction cached — wind-against-tide not checked.',
    };
  }

  const { speedKn, directionDeg } = context.wind;
  const opposing = angularDifference(directionDeg, context.currents.directionDeg) > 120;

  if (!opposing || speedKn < constraint.warnWindKn) {
    return { status: 'ok', detail: `Wind ${Math.round(speedKn)} kn — no wind-against-tide concern.` };
  }

  return {
    status: 'caution',
    detail:
      `Wind ${Math.round(speedKn)} kn opposing a ${context.currents.speedKn.toFixed(1)} kn ` +
      `current — steep standing waves likely.`,
    penalty: 60 + 10 * (speedKn - constraint.warnWindKn),
  };
}

export function evaluateArrivalDeadline(
  constraint: ArrivalDeadlineConstraint,
  context: EvaluationContext
): ConstraintVerdict {
  if (context.at <= constraint.deadline) {
    return {
      status: 'ok',
      detail: `In by ${formatLocalTime(context.at)}, ahead of the ${formatLocalTime(constraint.deadline)} deadline.`,
    };
  }
  const lateMin = Math.round((context.at - constraint.deadline) / 60_000);
  return {
    status: 'fail',
    detail:
      `Arrives ${formatLocalTime(context.at)}, ${lateMin} min after the ` +
      `${formatLocalTime(constraint.deadline)} you wanted to be in by.`,
    remedies: [
      'Leave earlier',
      'Accept a later arrival for this day',
      'Split the hop with an intermediate stop',
    ],
  };
}

/**
 * Parses a `HH:MM-HH:MM` window and says whether a local time falls inside it.
 * A window whose end is before its start runs through midnight.
 */
export function withinWindow(localHHMM: string, window: string): boolean {
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(window.trim());
  if (!match) return false;

  const minutes = (h: string, m: string) => Number(h) * 60 + Number(m);
  const [, sh, sm, eh, em] = match;
  const start = minutes(sh, sm);
  const end = minutes(eh, em);
  const [nowH, nowM] = localHHMM.split(':');
  const now = minutes(nowH, nowM);

  return start <= end ? now >= start && now <= end : now >= start || now <= end;
}

export function evaluateBridge(
  constraint: BridgeConstraint,
  context: EvaluationContext
): ConstraintVerdict {
  const when = formatLocalTime(context.at);

  // Air draft first: a bridge the boat fits under never needs to open.
  if (constraint.closedClearanceFt !== null) {
    if (context.boat.airDraftFt === null) {
      return {
        status: 'unknown',
        detail:
          `This bridge has ${constraint.closedClearanceFt} ft clearance closed, but your air ` +
          `draft is not recorded — set it in Boat Config to check whether you fit under.`,
      };
    }
    // Two feet of slop for tide and rigging; charted clearance is at mean high water.
    if (context.boat.airDraftFt + 2 <= constraint.closedClearanceFt) {
      return {
        status: 'ok',
        detail:
          `${constraint.closedClearanceFt} ft clearance against your ` +
          `${context.boat.airDraftFt} ft air draft — no opening needed.`,
      };
    }
  }

  if (constraint.openingWindows.length === 0) {
    return {
      status: 'unknown',
      detail: `No opening schedule recorded for this bridge — confirm before you rely on ${when}.`,
    };
  }

  const open = constraint.openingWindows.some((w) => withinWindow(when, w));
  if (open) {
    const notice = constraint.noticeMinutes
      ? ` Call ${constraint.noticeMinutes} min ahead.`
      : '';
    return { status: 'ok', detail: `Opens at ${when} (${constraint.openingWindows.join(', ')}).${notice}` };
  }

  return {
    status: 'fail',
    detail: `Closed at ${when} — it opens ${constraint.openingWindows.join(', ')}.`,
    remedies: [
      'Shift departure so you reach the bridge inside an opening window',
      'Wait at anchor for the next opening',
      'Take a route that avoids the bridge',
    ],
  };
}

const SERVICE_LABELS: Record<ServiceHoursConstraint['service'], string> = {
  launch: 'Launch service',
  fuel: 'Fuel dock',
  harbourmaster: 'Harbourmaster',
  lock: 'Lock',
};

export function evaluateServiceHours(
  constraint: ServiceHoursConstraint,
  context: EvaluationContext
): ConstraintVerdict {
  const when = formatLocalTime(context.at);
  const label = SERVICE_LABELS[constraint.service];

  if (constraint.windows.length === 0) {
    return { status: 'unknown', detail: `${label} hours not recorded — confirm with the marina.` };
  }

  if (constraint.windows.some((w) => withinWindow(when, w))) {
    return { status: 'ok', detail: `${label} open at ${when} (${constraint.windows.join(', ')}).` };
  }

  // A lock you cannot pass stops the passage; a fuel dock you miss is an inconvenience.
  if (constraint.service === 'lock') {
    return {
      status: 'fail',
      detail: `Lock closed at ${when} — it operates ${constraint.windows.join(', ')}.`,
      remedies: ['Arrive inside the operating window', 'Wait for the next opening'],
    };
  }

  return {
    status: 'caution',
    detail: `${label} closed at ${when} (open ${constraint.windows.join(', ')}).`,
    penalty: constraint.service === 'launch' ? 50 : 20,
  };
}

/**
 * Dispatches to the right evaluator.
 *
 * The switch is exhaustive over the union; TypeScript fails the build if a variant is
 * added without one, which is the point of modelling constraints this way.
 */
export function evaluate(
  constraint: PlanningConstraint,
  context: EvaluationContext
): ConstraintVerdict {
  switch (constraint.kind) {
    case 'current-gate':
      return evaluateCurrentGate(constraint, context);
    case 'tide-height':
      return evaluateTideHeight(constraint, context);
    case 'daylight':
      return evaluateDaylight(constraint, context);
    case 'sea-state':
      return evaluateSeaState(constraint, context);
    case 'arrival-deadline':
      return evaluateArrivalDeadline(constraint, context);
    case 'bridge':
      return evaluateBridge(constraint, context);
    case 'service-hours':
      return evaluateServiceHours(constraint, context);
  }
}
