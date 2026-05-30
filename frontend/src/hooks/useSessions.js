import { useState, useCallback } from 'react'

const STORAGE_KEY = 'sixsens_sessions'
const MAX_SESSIONS = 50

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}

function save(sessions) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS))) } catch {}
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function previewOf(messages) {
  return messages.find(m => m.role === 'user')?.content?.slice(0, 80) ?? 'New conversation'
}

export function useSessions() {
  const [sessions,   setSessions]   = useState(load)
  const [currentId,  setCurrentId]  = useState(() => newId())

  const saveMessages = useCallback((messages) => {
    // Don't save sessions with only the greeting
    const hasUserMessage = messages.some(m => m.role === 'user')
    if (!hasUserMessage) return

    setSessions(prev => {
      const existing = prev.findIndex(s => s.id === currentId)
      const entry = {
        id:         currentId,
        startedAt:  existing >= 0 ? prev[existing].startedAt : new Date().toISOString(),
        preview:    previewOf(messages),
        messages,
      }
      const updated = existing >= 0
        ? prev.map(s => s.id === currentId ? entry : s)
        : [entry, ...prev]
      save(updated)
      return updated
    })
  }, [currentId])

  const newChat = useCallback(() => {
    setCurrentId(newId())
  }, [])

  const loadSession = useCallback((id) => {
    setCurrentId(id)
  }, [])

  const currentSession = sessions.find(s => s.id === currentId) ?? null

  return { sessions, currentId, currentSession, saveMessages, newChat, loadSession }
}
