import { NextRequest, NextResponse } from 'next/server'
import { requireAdminKey, corsFor } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: corsFor(req) })
}

export async function POST(req: NextRequest) {
  // These routes run with the service-role key and return/write customer
  // records. Reject anything without the shared admin key.
  const denied = requireAdminKey(req)
  if (denied) return denied
  const corsHeaders = corsFor(req)

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const invoiceNumber = String(formData.get('invoiceNumber') || '').trim().toUpperCase()
    const type = String(formData.get('type') || 'supplier').trim()

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'No file provided' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Limit to 20MB
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: 'File size exceeds 20MB limit' },
        { status: 400, headers: corsHeaders }
      )
    }

    const supabase = getAdminClient()

    // Ensure documents bucket exists
    const { data: buckets } = await supabase.storage.listBuckets()
    if (!buckets?.some((b) => b.name === 'documents')) {
      await supabase.storage.createBucket('documents', {
        public: true,
        fileSizeLimit: 20971520,
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
      })
    }

    const cleanInvoice = (invoiceNumber || 'DOC').replace(/[^A-Z0-9_-]/g, '_')
    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const ext = originalName.split('.').pop() || 'pdf'
    const fileName = `${type}_${cleanInvoice}_${Date.now()}.${ext}`
    const storagePath = `invoices/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      throw uploadError
    }

    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath)

    // If customer PDF, also record in Supabase invoice row
    if (invoiceNumber && type === 'customer') {
      await supabase
        .from('invoices')
        .update({ pdf_url: publicUrl })
        .eq('invoice_number', invoiceNumber)
    }

    return NextResponse.json(
      {
        ok: true,
        url: publicUrl,
        fileName: file.name,
        storagePath,
        invoiceNumber,
        type,
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (err: any) {
    console.error('Invoice file upload failed:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Upload failed' },
      { status: 500, headers: corsHeaders }
    )
  }
}
