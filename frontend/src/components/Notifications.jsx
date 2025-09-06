// src/components/Notifications.jsx
import React, { useEffect, useState } from 'react'

const API = (path) => `http://localhost:8080${path}`

export default function Notifications({ token }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)

  async function load() {
    setLoading(true)
    const res = await fetch(API('/api/notifications'), {
      headers: { Authorization: 'Bearer ' + token }
    })
    if (!res.ok) {
      setLoading(false)
      return
    }
    const data = await res.json()
    // sort newest first (assumes createdAt exists; fallback to _id)
    const sorted = (data.notifications || []).sort((a, b) => {
      const da = new Date(a.createdAt || 0).getTime()
      const db = new Date(b.createdAt || 0).getTime()
      return db - da
    })
    setItems(sorted)
    setLastUpdated(new Date())
    setLoading(false)
  }

  async function clearAll() {
    if (!confirm('Clear all notifications?')) return
    const res = await fetch(API('/api/notifications'), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    })
    if (res.ok) {
      setItems([])
      setLastUpdated(new Date())
    } else {
      alert('Failed to clear notifications')
    }
  }

  useEffect(() => {
    load() 
  }, [])

  const newestId = items[0]?._id || items[0]?.createdAt

  return (
    <div>
      <div className="notif-header">
        <h2>Notifications</h2>
        <div className="notif-actions">
          <button className="btn danger" onClick={clearAll} disabled={items.length === 0}>
            Clear All
          </button>
        </div>
      </div>


      <ul className="list notif-list">
        {items.map(n => {
          const id = n._id || n.createdAt
          const isNewest = id === newestId
          const ts = n.createdAt ? new Date(n.createdAt).toLocaleString() : ''
          return (
            <li key={id} className={`notif-item ${isNewest ? 'new' : ''}`}>
              <div className="notif-text">
                {isNewest && <span className="chip">NEW</span>}
                <span>{n.message}</span>
              </div>
              <div className="notif-meta">{ts}</div>
            </li>
          )
        })}
        {items.length === 0 && <li className="muted">No notifications yet.</li>}
      </ul>
    </div>
  )
}
