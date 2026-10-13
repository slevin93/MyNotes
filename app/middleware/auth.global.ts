export default defineNuxtRouteMiddleware(async (to) => {
  const requestFetch = useRequestFetch()
  const { user, setupRequired } = await requestFetch<{
    user: { id: string, email: string } | null
    setupRequired: boolean
  }>('/api/auth/me')

  if (user) {
    if (to.path === '/login' || to.path === '/setup') {
      return navigateTo('/')
    }
    return
  }

  const requiredPath = setupRequired ? '/setup' : '/login'
  if (to.path !== requiredPath) {
    return navigateTo(requiredPath)
  }
})
