import { getAuthenticatedUser } from '../../utils/auth'

export default defineEventHandler(event => ({
  user: getAuthenticatedUser(event)
}))
