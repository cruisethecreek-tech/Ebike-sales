/**
 * The stages a bike moves through while it is in the shop for repair, in
 * order. Shared by Admin > Tickets (the buttons staff press), the customer's
 * progress bar, and the stage emails.
 *
 * "Waiting on parts" is optional: many repairs never need it, so the
 * customer's bar only shows it once the bike has actually waited.
 */
export const REPAIR_STAGES = [
  {
    key: 'checked_in',
    label: 'Checked in',
    short: 'Checked in',
    blurb: "Your bike is at the shop and in line for a technician.",
  },
  {
    key: 'diagnosing',
    label: 'Diagnosing',
    short: 'Diagnosing',
    blurb: 'A technician is inspecting your bike to find the cause.',
  },
  {
    key: 'waiting_parts',
    label: 'Waiting on parts',
    short: 'Parts',
    blurb: "We've ordered what your bike needs and will keep going as soon as it arrives.",
  },
  {
    key: 'repairing',
    label: 'Repairing',
    short: 'Repairing',
    blurb: 'Your bike is on the stand being worked on.',
  },
  {
    key: 'ready',
    label: 'Ready for pickup',
    short: 'Ready',
    blurb: 'All done. Your bike is ready to pick up.',
  },
  {
    key: 'picked_up',
    label: 'Picked up',
    short: 'Picked up',
    blurb: 'Thanks for trusting us with your bike. Enjoy the ride.',
  },
] as const

export type RepairStage = (typeof REPAIR_STAGES)[number]['key']

export function isRepairStage(v: unknown): v is RepairStage {
  return REPAIR_STAGES.some((s) => s.key === v)
}

export function repairStageInfo(stage: string | null | undefined) {
  return REPAIR_STAGES.find((s) => s.key === stage) || null
}

/** A repair still in the shop: has a stage and has not been picked up. */
export function isActiveRepair(stage: string | null | undefined): boolean {
  return isRepairStage(stage) && stage !== 'picked_up'
}

export type StepState = 'done' | 'current' | 'todo'

/**
 * The steps to draw on the customer's progress bar, each marked done,
 * current or still to come. "Picked up" is the end of the story, not a step
 * the customer waits on, so it shows as the last step done only once it
 * happens. "Waiting on parts" appears only when the bike has been there
 * (it is in `visited` or is the current stage).
 */
export function progressSteps(current: string | null | undefined, visited: readonly string[] = []) {
  if (!isRepairStage(current)) return []
  const seen = new Set<string>([...visited, current])
  const shown = REPAIR_STAGES.filter((s) => {
    if (s.key === 'waiting_parts') return seen.has('waiting_parts')
    if (s.key === 'picked_up') return current === 'picked_up'
    return true
  })
  const at = shown.findIndex((s) => s.key === current)
  return shown.map((s, i) => ({
    key: s.key,
    label: s.label,
    short: s.short,
    state: (i < at ? 'done' : i === at ? (current === 'picked_up' ? 'done' : 'current') : 'todo') as StepState,
  }))
}

/** The ticket status that goes with a stage: picked up closes the ticket. */
export function statusForStage(stage: RepairStage): 'in progress' | 'resolved' {
  return stage === 'picked_up' ? 'resolved' : 'in progress'
}
