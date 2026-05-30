import { useState } from 'react'
import ExpertSpace from './components/ExpertSpace.jsx'
import ChatPane from './components/ChatPane.jsx'
import SessionsPane from './components/SessionsPane.jsx'
import FloatingWindow from './components/FloatingWindow.jsx'
import { useSessions } from './hooks/useSessions.js'

export default function App() {
  const [capturedProcedures, setCapturedProcedures] = useState([])
  const { sessions, currentId, currentSession, saveMessages, newChat, loadSession } = useSessions()

  return (
    <div className="min-h-screen bg-canvas">
      <BackgroundShell>
        <ExpertSpace onWorkflowCaptured={proc => setCapturedProcedures(prev => [proc, ...prev])} />
      </BackgroundShell>

      <FloatingWindow>
        {(activeTab) => {
          if (activeTab === 'chat') return (
            <ChatPane
              key={currentId}
              capturedProcedures={capturedProcedures}
              initialMessages={currentSession?.messages}
              onMessagesChange={saveMessages}
            />
          )
          if (activeTab === 'sessions') return (
            <SessionsPane
              sessions={sessions}
              onLoadSession={loadSession}
              onNewChat={newChat}
            />
          )
          if (activeTab === 'library') return (
            <PlaceholderPane icon="📚" label="Library" sub="Referenced documents will appear here" />
          )
        }}
      </FloatingWindow>
    </div>
  )
}

function PlaceholderPane({ icon, label, sub }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
      <span className="text-3xl">{icon}</span>
      <p className="font-display font-bold text-ink">{label}</p>
      <p className="text-xs text-neutral-400">{sub}</p>
    </div>
  )
}

function BackgroundShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 bg-white border-b border-neutral-200/80">
        <div className="flex items-center gap-2.5">
          <span className="font-display text-base font-extrabold tracking-tight text-ink">SIX</span>
          <span className="text-neutral-300 text-lg font-light">|</span>
          <span className="text-sm font-medium text-neutral-500">Reference Data System</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-neutral-400 font-medium">
          <span>Jacob · SME</span>
          <span className="h-7 w-7 rounded-full bg-neutral-200 grid place-items-center text-xs font-bold text-ink">J</span>
        </div>
      </header>
      <main className="flex-1 px-6 py-6 max-w-5xl mx-auto w-full">{children}</main>
    </div>
  )
}
