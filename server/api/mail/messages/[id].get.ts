import { requireAuthenticatedUser } from '../../../utils/auth'
import { readMailMessage } from '../../../utils/mail'

export default defineEventHandler(async (event) => {
  await requireAuthenticatedUser(event)
  const { id } = getRouterParams(event)
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Email id is required' })
  }
  return readMailMessage(id)
})
