import React, { useState } from 'react'

const API = (path) => `http://localhost:8080${path}`

export default function Auth({ setToken }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  async function register() {
    setStatus('')
    const res = await fetch(API('/api/users/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    })
    const data = await res.json()
    if (res.ok) {
      localStorage.setItem('token', data.token)
      setToken(data.token)
    } else {
      setStatus(data.error || 'Registration failed')
    }
  }

  async function login() {
    setStatus('')
    const res = await fetch(API('/api/users/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (res.ok) {
      localStorage.setItem('token', data.token)
      setToken(data.token)
    } else {
      setStatus(data.error || 'Login failed')
    }
  }

  return (
    <div>
      <h2>Login / Register</h2>
      <div className="stack">
        <input placeholder="Name (register)" value={name} onChange={e => setName(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div className="row">
        <button className="btn" onClick={register}>Register</button>
        <button className="btn" onClick={login}>Login</button>
      </div>
      {status && <p className="status">{status}</p>}
    </div>
  )
}
