import React, { useEffect, useState } from 'react'

const API = (path) => `http://localhost:8080${path}`

export default function Tasks({ token }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch(API('/api/tasks'), {
      headers: { Authorization: 'Bearer ' + token }
    })
    const data = await res.json()
    setTasks(data.tasks || [])
    setLoading(false)
  }

  async function createTask() {
    if (!title.trim()) return
    await fetch(API('/api/tasks'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ title, description })
    })
    setTitle(''); setDescription('')
    await load()
  }

  async function completeTask(id) {
    await fetch(API(`/api/tasks/${id}/complete`), { method: 'POST', headers: { Authorization: 'Bearer ' + token } })
    await load()
  }

  async function openTask(id) {
    await fetch(API(`/api/tasks/${id}/open`), {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    })
    await load()
  }

  async function deleteTask(id) {
    await fetch(API(`/api/tasks/${id}`), { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
    await load()
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <h2>Your Tasks</h2>
      <div className="row">
        <input placeholder="New task title" value={title} onChange={e => setTitle(e.target.value)} />
        <input placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} />
        <button className="btn" onClick={createTask}>Add</button>
      </div>
      {loading ? <p>Loading…</p> : (
        <ul className="list">
          {tasks.map(t => (
            <li key={t.id} className="list-item">
              <span className={`badge ${t.status === 'DONE' ? 'done' : ''}`}>{t.status}</span>
              <span className="task-title">{t.title}</span>
              <div className="spacer" />
              {t.status === 'DONE' ? (
                <button className="btn secondary" onClick={() => openTask(t.id)}>Open</button>
              ) : (
                <button className="btn secondary" onClick={() => completeTask(t.id)}>Complete</button>
              )}
              <button className="btn danger" onClick={() => deleteTask(t.id)}>Delete</button>
            </li>
          ))}

          {tasks.length === 0 && <li>No tasks yet.</li>}
        </ul>
      )}
    </div>
  )
}
