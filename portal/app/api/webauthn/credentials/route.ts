import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * The rider's own passkey list: what devices can open this account, and a way
 * to revoke one. Both run under the caller's session, so RLS is what enforces
 * "your own" — there is no service-role key on this path.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ credentials: [] }, { status: 401 })

  const { data, error } = await supabase
    .from('webauthn_credentials')
    .select('id, label, created_at, last_used_at, backed_up')
    .order('created_at', { ascending: false })

  if (error) {
    // Say so rather than returning an empty list, which reads identically to
    // "you have no passkeys" and sends people round the setup loop again.
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ credentials: data || [] })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'No passkey given.' }, { status: 400 })

  const { data, error } = await supabase
    .from('webauthn_credentials')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) {
    return NextResponse.json({ error: 'That passkey was not found on your account.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
