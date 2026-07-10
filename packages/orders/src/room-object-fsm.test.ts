import { describe, it, expect } from 'vitest'
import {
  BUILD_OBJECT_ALLOWED_TRANSITIONS,
  MILESTONE_ALLOWED_TRANSITIONS,
  ROOM_ALLOWED_TRANSITIONS,
  assertBuildObjectTransition,
  assertMilestoneTransition,
  assertRoomTransition,
  isBuildObjectTransitionAllowed,
  isMilestoneTransitionAllowed,
  isRoomTransitionAllowed,
} from './room-object-fsm'

describe('room-object-fsm — BuildObject lifecycle (spec §5)', () => {
  it('happy path: DRAFT → SUBMITTED → IN_REVIEW → APPROVED → LOCKED', () => {
    const path = ['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'LOCKED'] as const
    for (let i = 0; i < path.length - 1; i++) {
      expect(isBuildObjectTransitionAllowed(path[i]!, path[i + 1]!)).toBe(true)
    }
  })

  it('revision loop: IN_REVIEW → CHANGES_REQUESTED → SUBMITTED (new version) → IN_REVIEW', () => {
    expect(isBuildObjectTransitionAllowed('IN_REVIEW', 'CHANGES_REQUESTED')).toBe(true)
    expect(isBuildObjectTransitionAllowed('CHANGES_REQUESTED', 'SUBMITTED')).toBe(true)
    expect(isBuildObjectTransitionAllowed('SUBMITTED', 'IN_REVIEW')).toBe(true)
  })

  it('re-open sends APPROVED and LOCKED back to IN_REVIEW (prototype packaging card)', () => {
    expect(isBuildObjectTransitionAllowed('APPROVED', 'IN_REVIEW')).toBe(true)
    expect(isBuildObjectTransitionAllowed('LOCKED', 'IN_REVIEW')).toBe(true)
  })

  it('no skipping review: DRAFT/SUBMITTED cannot jump to APPROVED or LOCKED', () => {
    expect(isBuildObjectTransitionAllowed('DRAFT', 'APPROVED')).toBe(false)
    expect(isBuildObjectTransitionAllowed('SUBMITTED', 'APPROVED')).toBe(false)
    expect(isBuildObjectTransitionAllowed('DRAFT', 'LOCKED')).toBe(false)
    expect(isBuildObjectTransitionAllowed('CHANGES_REQUESTED', 'APPROVED')).toBe(false)
  })

  it('assert throws with the object name; same-state is idempotent', () => {
    expect(() => assertBuildObjectTransition('DRAFT', 'SUBMITTED')).not.toThrow()
    expect(() => assertBuildObjectTransition('APPROVED', 'APPROVED')).not.toThrow()
    expect(() => assertBuildObjectTransition('DRAFT', 'LOCKED')).toThrow(
      /Invalid BuildObject transition/,
    )
  })

  it('every enum value has a row in the table', () => {
    expect(Object.keys(BUILD_OBJECT_ALLOWED_TRANSITIONS).sort()).toEqual(
      ['APPROVED', 'CHANGES_REQUESTED', 'DRAFT', 'IN_REVIEW', 'LOCKED', 'SUBMITTED'].sort(),
    )
  })
})

describe('room-object-fsm — CoCreationRoom lifecycle', () => {
  it('ACTIVE ⇄ PAUSED; either closes; closed rooms are dead ends', () => {
    expect(isRoomTransitionAllowed('ACTIVE', 'PAUSED')).toBe(true)
    expect(isRoomTransitionAllowed('PAUSED', 'ACTIVE')).toBe(true)
    expect(isRoomTransitionAllowed('ACTIVE', 'CLOSED_WON')).toBe(true)
    expect(isRoomTransitionAllowed('ACTIVE', 'CLOSED_CANCELLED')).toBe(true)
    expect(isRoomTransitionAllowed('PAUSED', 'CLOSED_CANCELLED')).toBe(true)
    expect(ROOM_ALLOWED_TRANSITIONS.CLOSED_WON).toEqual([])
    expect(ROOM_ALLOWED_TRANSITIONS.CLOSED_CANCELLED).toEqual([])
  })

  it('a paused room cannot close won without resuming (deliberate friction)', () => {
    expect(isRoomTransitionAllowed('PAUSED', 'CLOSED_WON')).toBe(false)
  })

  it('assert throws on reviving a closed room', () => {
    expect(() => assertRoomTransition('CLOSED_WON', 'ACTIVE')).toThrow(
      /Invalid CoCreationRoom transition/,
    )
  })
})

describe('room-object-fsm — RoomMilestone escrow lifecycle', () => {
  it('happy path: PENDING → FUNDED_ESCROW → RELEASED', () => {
    expect(isMilestoneTransitionAllowed('PENDING', 'FUNDED_ESCROW')).toBe(true)
    expect(isMilestoneTransitionAllowed('FUNDED_ESCROW', 'RELEASED')).toBe(true)
  })

  it('funds can only move once escrowed — PENDING cannot release or refund', () => {
    expect(isMilestoneTransitionAllowed('PENDING', 'RELEASED')).toBe(false)
    expect(isMilestoneTransitionAllowed('PENDING', 'REFUNDED')).toBe(false)
  })

  it('dispute path: FUNDED_ESCROW → DISPUTED → RELEASED | REFUNDED', () => {
    expect(isMilestoneTransitionAllowed('FUNDED_ESCROW', 'DISPUTED')).toBe(true)
    expect(isMilestoneTransitionAllowed('DISPUTED', 'RELEASED')).toBe(true)
    expect(isMilestoneTransitionAllowed('DISPUTED', 'REFUNDED')).toBe(true)
  })

  it('RELEASED and REFUNDED are terminal — no clawbacks through the FSM', () => {
    expect(MILESTONE_ALLOWED_TRANSITIONS.RELEASED).toEqual([])
    expect(MILESTONE_ALLOWED_TRANSITIONS.REFUNDED).toEqual([])
    expect(() => assertMilestoneTransition('RELEASED', 'REFUNDED')).toThrow(
      /Invalid RoomMilestone transition/,
    )
  })
})
