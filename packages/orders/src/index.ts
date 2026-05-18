// Order lifecycle + dispatch FSM.
//
// Ported (concept) from FOD-reference/backend/services/orderLifecycleService.js
// — but rewritten in TypeScript with explicit transition guards.

export { transitionOrder } from './order-fsm'
export { transitionDispatch } from './dispatch-fsm'
export { computeTransferPlan } from './transfer-planner'
