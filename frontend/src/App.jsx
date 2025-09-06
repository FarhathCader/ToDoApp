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
      <footer className="footer">
        <a href="http://localhost:8080/healthz" target="_blank" rel="noreferrer">Gateway Health</a> ·
        <a href="http://localhost:8080/metrics" target="_blank" rel="noreferrer">Metrics</a> ·
        <a href="http://localhost:15672" target="_blank" rel="noreferrer">RabbitMQ UI</a>
      </footer>
    </div>
  )
}
