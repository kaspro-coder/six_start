import { useState, useCallback } from 'react'
import ExpertSpace from './components/ExpertSpace.jsx'
import ChatPane from './components/ChatPane.jsx'
import SessionsPane from './components/SessionsPane.jsx'
import LibraryPane from './components/LibraryPane.jsx'
import ExpertsPane from './components/ExpertsPane.jsx'
import GraphPane from './components/GraphPane.jsx'
import ProfilePane from './components/ProfilePane.jsx'
import FloatingWindow from './components/FloatingWindow.jsx'
import ExpertInbox from './components/escalation/ExpertInbox.jsx'
import MessageInbox from './components/escalation/MessageInbox.jsx'
import ContactExpertModal from './components/ContactExpertModal.jsx'
import Login from './components/Login.jsx'
import { useSessions } from './hooks/useSessions.js'

const PERSONAS = [
  {
    id: 'user_cosmina',
    key: 'cosmina',
    name: 'Cosmina',
    fullName: 'Cosmina Petrescu',
    initials: 'CP',
    role: 'Compliance Officer',
    department: 'Regulatory Affairs',
    type: 'employee',
  },
  {
    id: 'exp_jacob_keller',
    key: 'jacob',
    name: 'Jacob',
    fullName: 'Jacob Keller',
    initials: 'JK',
    role: 'ESG & SFDR Workflow Expert',
    department: 'Regulatory Data Services',
    type: 'expert',
  },
  {
    id: 'exp_walter_meier',
    key: 'walter',
    name: 'Walter',
    fullName: 'Walter Meier',
    initials: 'WM',
    role: 'Senior Reference Data SME',
    department: 'Master Data Operations',
    type: 'expert',
  },
]

export default function App() {
  const [currentUser, setCurrentUser]               = useState(null)
  const [capturedProcedures, setCapturedProcedures] = useState([])
  const [inboxUnread, setInboxUnread]               = useState(0)
  const [inboxRefresh, setInboxRefresh]             = useState(0)
  const [contactExpert, setContactExpert]           = useState(null)
  const [personaKey, setPersonaKey]                 = useState('cosmina')
  const { sessions, currentId, currentSession, saveMessages, newChat, loadSession } = useSessions()
  const persona = PERSONAS.find(p => p.key === personaKey) ?? PERSONAS[0]

  const handleRequestCreated = useCallback(() => {
    setInboxUnread(n => n + 1)
    setInboxRefresh(n => n + 1)
  }, [])

  const handleInboxChanged = useCallback(() => {
    setInboxRefresh(n => n + 1)
  }, [])

  // All hooks are above this line — only return after them (Rules of Hooks).
  if (!currentUser) return <Login onLogin={setCurrentUser} />

  return (
    <div className="min-h-screen bg-canvas">
      <BackgroundShell>
        <ExpertSpace onWorkflowCaptured={proc => setCapturedProcedures(prev => [proc, ...prev])} />
      </BackgroundShell>

      <FloatingWindow
        user={currentUser}
        onLogout={() => setCurrentUser(null)}
        tabBadges={{ inbox: inboxUnread }}
        persona={persona}
        personas={PERSONAS}
        onSwitchPersona={setPersonaKey}
      >
        {(activeTab, setActiveTab) => {
          if (activeTab === 'chat') return (
            <ChatPane
              key={currentId}
              persona={persona}
              capturedProcedures={capturedProcedures}
              initialMessages={currentSession?.messages}
              onMessagesChange={saveMessages}
              onRequestCreated={handleRequestCreated}
              onGoToInbox={() => { setInboxUnread(0); setActiveTab('inbox') }}
              onSelectExpert={setContactExpert}
            />
          )
          if (activeTab === 'sessions') return (
            <SessionsPane
              sessions={sessions}
              onLoadSession={s => { loadSession(s); setActiveTab('chat') }}
              onNewChat={() => { newChat(); setActiveTab('chat') }}
            />
          )
          if (activeTab === 'library')  return <LibraryPane />
          if (activeTab === 'experts')  return <ExpertsPane />
          if (activeTab === 'graph')    return <GraphPane />
          if (activeTab === 'profile')  return (
            <ProfilePane
              persona={persona}
              sessions={sessions}
              onOpenDiscussion={s => { loadSession(s.id); setActiveTab('chat') }}
            />
          )
          if (activeTab === 'inbox' && persona.type === 'expert')    return (
            <ExpertInbox
              persona={persona}
              refreshSignal={inboxRefresh}
              onChanged={handleInboxChanged}
            />
          )
          if (activeTab === 'inbox')    return (
            <MessageInbox
              persona={persona}
              refreshSignal={inboxRefresh}
              onChanged={handleInboxChanged}
            />
          )
        }}
      </FloatingWindow>

      {contactExpert && (
        <ContactExpertModal
          expert={contactExpert}
          persona={persona}
          onClose={() => setContactExpert(null)}
          onSubmitted={() => { handleRequestCreated(); setContactExpert(null) }}
          onGoToInbox={() => { setContactExpert(null); setInboxUnread(0) }}
        />
      )}
    </div>
  )
}

function BackgroundShell({ children }) {
  return (
    <div className="sixsens-background-shell min-h-screen flex flex-col">
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
