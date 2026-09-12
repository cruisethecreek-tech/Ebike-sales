'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdminUser } from '@/lib/require-admin'
import { revalidatePath } from 'next/cache'

export async function redeemCredit(formData: FormData): Promise<void> {
  await requireAdminUser()

  const id = formData.get('id') as string
  const note = formData.get('note') as string

  if (!id) return

  const supabase = await createClient()
  await supabase
    .from('referral_credits')
    .update({ 
      status: 'redeemed',
      redeemed: true,
      redeemed_at: new Date().toISOString(),
      redeemed_note: note 
    })
    .eq('id', id)

  revalidatePath('/admin/referrals')
}

export async function approveAndIssueCredit(formData: FormData): Promise<void> {
  await requireAdminUser()

  const customerId = formData.get('customer_id') as string
  const amount = parseFloat(formData.get('amount') as string) || 100
  const reason = (formData.get('reason') as string) || 'Manual referral approval after verified purchase'

  if (!customerId) return

  const supabase = await createClient()
  await supabase
    .from('referral_credits')
    .insert({
      customer_id: customerId,
      amount,
      reason,
      status: 'Available',
      redeemed: false,
    })

  revalidatePath('/admin/referrals')
  revalidatePath('/dashboard/referrals')
}
