import { createError } from 'h3'
import { requireAuthenticatedUser } from '../../../utils/auth'
import { deleteMailMessage } from '../../../utils/mail'

export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Email id is required' })
  }
  await deleteMailMessage(id)
  return { success: true }
})
