import { supabase } from './supabase'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']

export function validateFile(file) {
  if (file.size > MAX_SIZE) return `File "${file.name}" exceeds 10 MB limit`
  if (!ALLOWED_TYPES.some(t => file.type.startsWith(t.split('/')[0] + '/') || file.type === t)) {
    return `File "${file.name}" must be an image or PDF`
  }
  return null
}

export async function uploadAttachment(ticketId, organizationId, file, userId) {
  const uuid = crypto.randomUUID()
  const storagePath = `${organizationId}/${ticketId}/${uuid}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('ticket-attachments')
    .upload(storagePath, file, { contentType: file.type })

  if (uploadError) throw uploadError

  const { data, error: insertError } = await supabase
    .from('ticket_attachments')
    .insert({
      ticket_id: ticketId,
      uploaded_by: userId,
      storage_path: storagePath,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size
    })
    .select()
    .single()

  if (insertError) throw insertError
  return data
}

export async function getAttachmentUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from('ticket-attachments')
    .createSignedUrl(storagePath, 60)
  if (error) throw error
  return data.signedUrl
}
