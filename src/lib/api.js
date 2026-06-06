import toast from 'react-hot-toast'

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
    this.authHeaders = {}
  }

  setAuth(token, userId, role, agencyId, officeId, email) {
    this.authHeaders = {}
    if (token) this.authHeaders['x-auth-token'] = token
    if (userId) this.authHeaders['x-auth-user'] = userId
    if (role) this.authHeaders['x-auth-role'] = role
    if (agencyId) this.authHeaders['x-auth-agency'] = agencyId
    if (officeId) this.authHeaders['x-auth-office'] = officeId
    if (email) this.authHeaders['x-auth-email'] = email
  }

  async request(method, url, data, params) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...this.authHeaders,
      },
      credentials: 'include',
    }

    if (data && method !== 'DELETE') {
      options.body = JSON.stringify(data)
    }

    let fullUrl = `${this.baseUrl}${url}`
    if (params) {
      const search = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          search.append(key, value)
        }
      })
      const qs = search.toString()
      if (qs) fullUrl += `?${qs}`
    }

    try {
      const res = await fetch(fullUrl, options)

      if (!res.ok) {
        let errorBody = {}
        try {
          const text = await res.text()
          if (text) {
            errorBody = JSON.parse(text)
          }
        } catch (e) {
          // Silently ignore parse error
        }
        const message = errorBody.error || errorBody.message || `Error ${res.status}`
        const err = new Error(message)
        err.status = res.status
        err.body = errorBody
        throw err
      }

      if (res.status === 204) return null

      const text = await res.text()
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch (e) {
        return text
      }
    } catch (err) {
      if (err.status) {
        if (err.status === 401) {
          localStorage.removeItem('crm-inmobiliario-store')
          window.location.href = '/login'
          return
        } else if (err.status === 403) {
          toast.error('No tienes permiso para realizar esta acción.')
        } else {
          toast.error(err.message)
        }
      } else if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
        toast.error('Error de conexión. Verifica tu internet.')
      }
      throw err
    }
  }

  get(url, params) {
    return this.request('GET', url, null, params)
  }

  post(url, data) {
    return this.request('POST', url, data)
  }

  patch(url, data) {
    return this.request('PATCH', url, data)
  }

  delete(url) {
    return this.request('DELETE', url)
  }
}

const api = new ApiClient(BASE_URL)

export { api, ApiClient }
export default api
