const STORAGE_KEY = 'idx-api-token-session'

export function readApiToken(): string {
  try { return sessionStorage.getItem(STORAGE_KEY) || '' }
  catch { return '' }
}

export function setApiToken(token: string) {
  if (token && !/^[A-Za-z0-9_-]{24,128}$/.test(token)) {
    throw new Error('Use a URL-safe token with 24-128 characters')
  }
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { throw new Error('This browser blocks session storage') }
}

export function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const token = readApiToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
