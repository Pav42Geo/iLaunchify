import { z } from 'zod'

export const TransferSplitSchema = z.object({
  destinationType: z.enum(['CREATOR', 'MANUFACTURER', 'PRINT_PROVIDER']),
  destinationUserId: z.string(),
  amountCents: z.number().int().positive(),
  reason: z.enum(['PRODUCT_COST', 'LABEL_COST', 'CREATOR_PAYOUT', 'CREATOR_BONUS', 'REFUND_CLAWBACK']),
})
export type TransferSplit = z.infer<typeof TransferSplitSchema>

export const OrderTransferPlanSchema = z.object({
  orderId: z.string(),
  totalCents: z.number().int().positive(),
  applicationFeeCents: z.number().int().nonnegative(),
  splits: z.array(TransferSplitSchema),
})
export type OrderTransferPlan = z.infer<typeof OrderTransferPlanSchema>
