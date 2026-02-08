import { redirect } from 'next/navigation'

/**
 * @description Strategic Planner landing page redirect.
 * The landing page has been merged into the Objectives board.
 * Strategic goals are now accessed from objective cards directly.
 * The detail view (/strategic-planner/[objectiveId]) still works.
 */
export default function StrategicPlannerPage() {
  redirect('/new-objectives')
}
