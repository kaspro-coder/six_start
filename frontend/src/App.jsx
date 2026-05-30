import { useState, useEffect } from 'react'
import ExpertSpace from './components/ExpertSpace.jsx'
import ChatPane from './components/ChatPane.jsx'
import SessionsPane from './components/SessionsPane.jsx'
import ExpertInbox from './components/escalation/ExpertInbox.jsx'
import FloatingWindow from './components/FloatingWindow.jsx'
import { useSessions } from './hooks/useSessions.js'
import { listKnowledgeRequests } from './lib/api.js'

export default function App() {
  const [capturedProcedures, setCapturedProcedures] = useState([])
  const [selectedExpert, setSelectedExpert] = useState(null)
  const [activeTab, setActiveTab] = useState('chat')
  const [requestPing, setRequestPing] = useState(0)   // bumps when a request is sent/resolved
  const [openRequests, setOpenRequests] = useState(0) // unread count for the Inbox badge
  const { sessions, currentId, currentSession, saveMessages, newChat, loadSession } = useSessions()

  // Keep the Inbox tab badge in sync with the expert's open requests.
  useEffect(() => {
    let cancelled = false
    listKnowledgeRequests()
      .then(d => {
        if (cancelled) return
        const open = (d.requests ?? []).filter(r => r.status === 'open' || r.status === 'in_review')
        setOpenRequests(open.length)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [requestPing, activeTab])

  const bumpRequests = () => setRequestPing(p => p + 1)

  return (
    <div className="min-h-screen bg-canvas">
      <BackgroundShell>
        <ExpertSpace onWorkflowCaptured={proc => setCapturedProcedures(prev => [proc, ...prev])} />
      </BackgroundShell>

      <FloatingWindow
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabBadges={{ inbox: openRequests }}
      >
        {(activeTab) => {
          if (activeTab === 'chat') return (
            <ChatPane
              key={currentId}
              capturedProcedures={capturedProcedures}
              initialMessages={currentSession?.messages}
              onMessagesChange={saveMessages}
              onSelectExpert={setSelectedExpert}
              onRequestCreated={bumpRequests}
              onGoToInbox={() => setActiveTab('inbox')}
            />
          )
          if (activeTab === 'inbox') return (
            <ExpertInbox refreshSignal={requestPing} onChanged={bumpRequests} />
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
      {selectedExpert && (
        <ExpertDirectoryModal
          expert={selectedExpert}
          onClose={() => setSelectedExpert(null)}
        />
      )}
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

function ExpertDirectoryModal({ expert, onClose }) {
  const expertise =
    expert.area_of_domain_expertise ||
    expert.domain_expertise ||
    'Master Data - ESG Sub-classifications'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/70 px-4 backdrop-blur-sm">
      <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-800 bg-ink text-white shadow-elevated">
        <div className="border-b border-neutral-800 px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-six">
            Internal company directory
          </p>
          <h2 className="mt-2 font-display text-xl font-extrabold tracking-display">
            {expert.expert_name}
          </h2>
          <p className="mt-1 text-sm text-neutral-400">{expert.role_title}</p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <DirectoryField label="Department" value={expert.department} />
            <DirectoryField label="Email" value={expert.email} />
            <DirectoryField label="Domain expertise" value={expertise} wide />
          </div>

          <label className="block">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Teams / email escalation draft
            </span>
            <textarea
              className="min-h-32 w-full resize-none rounded-xl border border-neutral-800 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-six focus:ring-4 focus:ring-six/20"
              defaultValue={`Hi ${expert.expert_name}, could you review this SIXsens escalation and confirm the correct handling path?`}
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 border-t border-neutral-800 px-6 py-4">
          <button
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-900"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
          <button
            className="rounded-lg bg-six px-4 py-2 text-sm font-semibold text-white shadow-six-glow transition-colors hover:bg-six-dark"
            type="button"
          >
            Send message
          </button>
        </div>
      </section>
    </div>
  )
}

function DirectoryField({ label, value, wide = false }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
        {label}
      </p>
      <p className="mt-1 rounded-lg border border-neutral-800 bg-black/25 px-3 py-2 text-sm text-neutral-200">
        {value || 'Not available'}
      </p>
    </div>
  )
}
