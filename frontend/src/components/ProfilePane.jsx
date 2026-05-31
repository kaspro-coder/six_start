import { useState } from 'react'
import {
  Mail, Phone, MapPin, Building2, Award, BookOpen, MessageSquare,
  FolderKanban, Calendar, ArrowLeft, Dot, ChevronRight, ShieldCheck,
} from 'lucide-react'

// The signed-in employee. In a real deployment this comes from SSO / the directory.
export const CURRENT_USER = {
  name: 'Cosmina Petrescu',
  initials: 'CP',
  role: 'Compliance Officer',
  department: 'Regulatory Affairs',
  location: 'Zurich, CH · Hardturmstrasse 201',
  email: 'cosmina.petrescu@six-group.com',
  phone: '+41 58 399 24 17',
  employeeId: 'SIX-48217',
  manager: 'Priya Rajan',
  startedAt: '2021-03',
  years: 5,
  bio: 'Cosmina owns regulatory controls for reference-data products, translating MiFID II, SFDR and EMIR obligations into operational checks and reporting. She is the compliance reviewer for new instrument onboarding.',
  expertise: ['MiFID II', 'SFDR', 'Product Governance', 'Reporting', 'Onboarding Review'],
}

const PROJECTS = [
  {
    id: 'mifid-rts',
    name: 'MiFID II RTS 27/28 Reporting Refresh',
    role: 'Compliance reviewer',
    status: 'active',
    due: '2026-06-30',
    progress: 72,
    team: ['Priya Rajan', 'Tom Burkhard'],
  },
  {
    id: 'sfdr-pai',
    name: 'SFDR Principal Adverse Impact Disclosures',
    role: 'Lead control owner',
    status: 'active',
    due: '2026-07-15',
    progress: 45,
    team: ['Marc Dubois'],
  },
  {
    id: 'emir-refit',
    name: 'EMIR Refit — Trade Reporting Migration',
    role: 'Contributor',
    status: 'review',
    due: '2026-05-31',
    progress: 90,
    team: ['Sofia Novak', 'Tom Burkhard'],
  },
  {
    id: 'onboarding',
    name: 'Instrument Onboarding Control Framework',
    role: 'Owner',
    status: 'active',
    due: '2026-09-01',
    progress: 30,
    team: ['Anna Steiner'],
  },
]

const EMAILS = [
  {
    id: 'e1', from: 'Priya Rajan', initials: 'PR',
    subject: 'RTS 28 best-execution figures — sign-off needed',
    preview: 'Cosmina, the Q1 venue tables are ready for your compliance review before we publish…',
    time: '09:24', unread: true, tag: 'MiFID II',
  },
  {
    id: 'e2', from: 'Marc Dubois', initials: 'MD',
    subject: 'PAI indicator mapping — data lineage attached',
    preview: 'Sharing the lineage for the 14 mandatory PAI indicators so you can validate the sources…',
    time: 'Yesterday', unread: true, tag: 'SFDR',
  },
  {
    id: 'e3', from: 'SIX Regulatory Desk', initials: 'RD',
    subject: 'ESMA Q&A update — product governance',
    preview: 'A new Q&A clarifies target-market assessment for structured deposits. Action may be required…',
    time: 'Tue', unread: false, tag: 'Governance',
  },
  {
    id: 'e4', from: 'Sofia Novak', initials: 'SN',
    subject: 'EMIR Refit cutover — compliance checklist',
    preview: 'Final checklist before the weekend migration. Please confirm the reporting controls line up…',
    time: 'Mon', unread: false, tag: 'EMIR',
  },
]

const STATUS_STYLES = {
  active: 'bg-emerald-50 text-emerald-600',
  review: 'bg-six-light text-six',
  done:   'bg-neutral-100 text-neutral-500',
}

const SUBTABS = [
  { id: 'overview',    label: 'Overview',    Icon: ShieldCheck },
  { id: 'discussions', label: 'Discussions', Icon: MessageSquare },
  { id: 'inbox',       label: 'Inbox',       Icon: Mail },
  { id: 'projects',    label: 'Projects',    Icon: FolderKanban },
]

export default function ProfilePane({ persona, sessions = [], onOpenDiscussion }) {
  const [tab, setTab] = useState('overview')
  const unread = EMAILS.filter(e => e.unread).length
  const user = persona ? {
    ...CURRENT_USER,
    name: persona.fullName ?? persona.name,
    initials: persona.initials,
    role: persona.role,
    department: persona.department,
    email: persona.id?.startsWith('exp_')
      ? `${(persona.fullName ?? persona.name).toLowerCase().replace(/\s+/g, '.')}@six-group.example`
      : CURRENT_USER.email,
    employeeId: persona.id,
    bio: persona.type === 'expert'
      ? `${persona.fullName ?? persona.name} is a domain expert in ${persona.department}, available to resolve routed CorteX knowledge requests and convert answers into reusable company knowledge.`
      : CURRENT_USER.bio,
    expertise: persona.type === 'expert'
      ? ['Expert resolution', 'Reusable knowledge', persona.department]
      : CURRENT_USER.expertise,
  } : CURRENT_USER

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* Profile header */}
      <div className="shrink-0 bg-white border-b border-neutral-200/80 px-6 pt-6 pb-4">
        <div className="flex items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-six text-white text-xl font-bold shadow-six-glow">
            {user.initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-ink truncate">{user.name}</p>
            <p className="text-sm text-neutral-500">{user.role}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-400">
              <span className="inline-flex items-center gap-1"><Building2 size={11} /> {user.department}</span>
              <span className="inline-flex items-center gap-1"><MapPin size={11} /> {user.location}</span>
            </div>
          </div>
        </div>

        {/* Contact + stats */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <ContactChip Icon={Mail} href={`mailto:${user.email}`} value={user.email} />
          <ContactChip Icon={Phone} href={`tel:${user.phone.replace(/\s/g, '')}`} value={user.phone} />
          <StatChip Icon={Award} label="Years at SIX" value={user.years} />
          <StatChip Icon={FolderKanban} label="Active projects" value={PROJECTS.filter(p => p.status === 'active').length} />
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="shrink-0 flex items-center gap-1 px-4 pt-3 bg-white border-b border-neutral-100">
        {SUBTABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            type="button"
            className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              tab === id ? 'text-six' : 'text-neutral-400 hover:text-ink'
            }`}
          >
            <Icon size={13} />
            {label}
            {id === 'inbox' && unread > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-six px-1 text-[9px] font-bold text-white">{unread}</span>
            )}
            {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-six" />}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scroll-slim px-6 py-5">
        {tab === 'overview'    && <Overview user={user} />}
        {tab === 'discussions' && <Discussions sessions={sessions} onOpenDiscussion={onOpenDiscussion} />}
        {tab === 'inbox'       && <InboxList />}
        {tab === 'projects'    && <ProjectList />}
      </div>
    </div>
  )
}

function ContactChip({ Icon, href, value }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2 rounded-xl border border-neutral-200/80 bg-neutral-50 px-3 py-2 text-[11px] text-ink hover:border-six/30 hover:text-six transition-colors min-w-0"
    >
      <Icon size={13} className="shrink-0 text-neutral-400" />
      <span className="truncate">{value}</span>
    </a>
  )
}

function StatChip({ Icon, label, value }) {
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-neutral-50 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon size={11} className="text-neutral-400" />
        <p className="text-[10px] text-neutral-400 font-medium truncate">{label}</p>
      </div>
      <p className="font-display font-bold text-ink text-lg leading-none">{value}</p>
    </div>
  )
}

function SectionTitle({ children }) {
  return <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2.5">{children}</p>
}

function Overview({ user }) {
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>About</SectionTitle>
        <p className="text-xs text-ink leading-relaxed">{user.bio}</p>
      </div>

      <div>
        <SectionTitle>Areas of expertise</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {user.expertise.map(tag => (
            <span key={tag} className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-six-light text-six">{tag}</span>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle>Details</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
          <DetailRow label="Employee ID" value={user.employeeId} />
          <DetailRow label="Reports to" value={user.manager} />
          <DetailRow label="Department" value={user.department} />
          <DetailRow label="At SIX since" value={fmtMonth(user.startedAt)} />
        </dl>
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] text-neutral-400 font-medium">{label}</dt>
      <dd className="text-ink font-semibold">{value}</dd>
    </div>
  )
}

function Discussions({ sessions, onOpenDiscussion }) {
  if (!sessions.length) {
    return <EmptyState Icon={MessageSquare} title="No discussions yet" hint="Conversations with the assistant will appear here." />
  }
  return (
    <div>
      <SectionTitle>Recent conversations</SectionTitle>
      <ul className="space-y-2">
        {sessions.slice(0, 12).map(s => {
          const date = new Date(s.startedAt)
          const msgs = s.messages?.filter(m => m.role === 'user').length ?? 0
          return (
            <li key={s.id}>
              <button
                onClick={() => onOpenDiscussion?.(s)}
                className="group flex w-full items-center gap-3 rounded-xl border border-neutral-200/80 bg-white px-3.5 py-3 text-left shadow-card hover:border-six/30 transition-colors"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-six-light">
                  <MessageSquare size={14} className="text-six" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-ink truncate leading-snug">{s.preview}</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {msgs} message{msgs !== 1 ? 's' : ''}
                  </p>
                </div>
                <ChevronRight size={14} className="shrink-0 text-neutral-300 group-hover:text-six transition-colors" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function InboxList() {
  return (
    <div>
      <SectionTitle>Inbox</SectionTitle>
      <ul className="space-y-2">
        {EMAILS.map(e => (
          <li key={e.id}>
            <div className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
              e.unread ? 'border-six/20 bg-white shadow-card' : 'border-neutral-200/80 bg-neutral-50/60'
            }`}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-500">
                {e.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-xs truncate ${e.unread ? 'font-bold text-ink' : 'font-semibold text-neutral-600'}`}>{e.from}</p>
                  {e.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-six" />}
                  <span className="ml-auto shrink-0 text-[10px] text-neutral-400">{e.time}</span>
                </div>
                <p className={`text-xs truncate ${e.unread ? 'text-ink' : 'text-neutral-500'}`}>{e.subject}</p>
                <p className="text-[11px] text-neutral-400 truncate mt-0.5">{e.preview}</p>
                <span className="mt-1.5 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-semibold text-neutral-500">{e.tag}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProjectList() {
  return (
    <div>
      <SectionTitle>Projects you work on</SectionTitle>
      <ul className="space-y-2.5">
        {PROJECTS.map(p => (
          <li key={p.id} className="rounded-xl border border-neutral-200/80 bg-white px-3.5 py-3 shadow-card">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-ink leading-snug">{p.name}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{p.role}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATUS_STYLES[p.status]}`}>
                {p.status}
              </span>
            </div>

            {/* Progress */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden">
                <div className="h-full rounded-full bg-six" style={{ width: `${p.progress}%` }} />
              </div>
              <span className="text-[10px] font-semibold text-neutral-400 tabular-nums">{p.progress}%</span>
            </div>

            <div className="mt-2 flex items-center gap-3 text-[10px] text-neutral-400">
              <span className="inline-flex items-center gap-1"><Calendar size={10} /> Due {fmtMonth(p.due, true)}</span>
              <span className="inline-flex items-center gap-1"><Dot size={14} className="-mx-1.5" /> {p.team.join(', ')}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EmptyState({ Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon size={28} className="text-neutral-300" />
      <p className="font-display font-bold text-sm text-ink">{title}</p>
      <p className="text-xs text-neutral-400 max-w-[220px]">{hint}</p>
    </div>
  )
}

function fmtMonth(iso, withDay = false) {
  const d = new Date(iso + (iso.length === 7 ? '-01' : ''))
  return d.toLocaleDateString([], withDay
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'long', year: 'numeric' })
}
