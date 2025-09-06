import React, { useState } from 'react'
import Auth from './components/Auth.jsx'
import Tasks from './components/Tasks.jsx'
import Notifications from './components/Notifications.jsx'

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')

  function logout() {
    localStorage.removeItem('token')
    setToken('')
  }

  return (
    <div className="container">
      <header className="header">
        <h1>TodoWithMicroservice</h1>
        {token && <button className="btn secondary" onClick={logout}>Logout</button>}
      </header>

      {!token ? (
        <Auth setToken={setToken} />
      ) : (
        <div className="grid">
          <div className="card"><Tasks token={token} /></div>
          <div className="card"><Notifications token={token} /></div>
        </div>
      )}
    </div>
  )
}
