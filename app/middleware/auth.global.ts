export default defineNuxtRouteMiddleware(async (to) => {
  const requestFetch = useRequestFetch()
  const { user } = await requestFetch<{ user: { id: string, email: string } | null }>('/api/auth/me')
  const isAuthPage = ['/login', '/register'].includes(to.path)

  if (!isAuthPage && !user) {
    return navigateTo('/login')
  }
  if (isAuthPage && user) {
    return navigateTo('/')
  }
})
