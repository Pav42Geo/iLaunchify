// Computes the transfer split for an order based on platform fee config
// and per-dispatch costs.
//
// Per docs/PAYMENTS.md:
//   total = subtotal + tax + shipping
//   manufacturer gets manufacturer dispatch.costCents (released when product ships)
//   print provider gets print dispatch.costCents (released when label ships)
//   creator gets: subtotal − manufacturer cost − print cost − application fee (released after returns window)
//   platform retains application fee (withheld at charge time)

import type { OrderTransferPlan } from '@ilaunchify/types'

interface PlanInput {
  orderId: string
  subtotalCents: number
  totalCents: number
  creatorUserId: string
  manufacturer: { userId: string; costCents: number }
  printProvider: { userId: string; costCents: number }
  baseFeeRateBp: number
  feeOverrideBp?: number
  feeFloorCents: number
}

export function computeTransferPlan(input: PlanInput): OrderTransferPlan {
  const feeRateBp = input.feeOverrideBp ?? input.baseFeeRateBp
  const computedFee = Math.floor((input.subtotalCents * feeRateBp) / 10_000)
  const applicationFeeCents = Math.max(computedFee, input.feeFloorCents)

  const creatorAmountCents =
    input.subtotalCents - input.manufacturer.costCents - input.printProvider.costCents - applicationFeeCents

  if (creatorAmountCents < 0) {
    throw new Error(
      `Negative creator payout for order ${input.orderId}: ` +
      `subtotal=${input.subtotalCents}, manuf=${input.manufacturer.costCents}, ` +
      `print=${input.printProvider.costCents}, fee=${applicationFeeCents}`
    )
  }

  return {
    orderId: input.orderId,
    totalCents: input.totalCents,
    applicationFeeCents,
    splits: [
      {
        destinationType: 'MANUFACTURER',
        destinationUserId: input.manufacturer.userId,
        amountCents: input.manufacturer.costCents,
        reason: 'PRODUCT_COST',
      },
      {
        destinationType: 'PRINT_PROVIDER',
        destinationUserId: input.printProvider.userId,
        amountCents: input.printProvider.costCents,
        reason: 'LABEL_COST',
      },
      {
        destinationType: 'CREATOR',
        destinationUserId: input.creatorUserId,
        amountCents: creatorAmountCents,
        reason: 'CREATOR_PAYOUT',
      },
    ],
  }
}
