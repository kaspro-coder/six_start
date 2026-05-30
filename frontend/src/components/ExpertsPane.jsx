import { useRef, useState, useMemo } from 'react'
import { Mail, Phone, BookOpen, Award, X, ExternalLink, Search } from 'lucide-react'
import ContactExpertModal from './ContactExpertModal.jsx'

const EMPLOYEES = [
  {
    id: 'anna', name: 'Anna Steiner', initials: 'AS',
    role: 'Senior Settlement Specialist', department: 'Securities Services',
    online: true, criticality: 'critical',
    bestFor: ['SWIFT', 'MT548', 'settlement'],
    expertise: ['SWIFT', 'MT548', 'Settlement', 'Matching', 'Cross-border'],
    years: 11, procedures: 8,
    email: 'anna.steiner@six-group.com', phone: '+41 58 399 21 01',
    bio: 'Anna owns SWIFT settlement exception handling and MT-series message flows across Securities Services. She is the first responder for failed settlements and cross-border matching breaks.',
  },
  {
    id: 'tom', name: 'Tom Burkhard', initials: 'TB',
    role: 'Lead Post-Trade Engineer', department: 'Core Infrastructure',
    online: false, criticality: 'high',
    bestFor: ['reconciliation', 'post-trade', 'FIX protocol'],
    expertise: ['Reconciliation', 'Post-Trade', 'FIX Protocol', 'Break Detection', 'Connectivity'],
    years: 9, procedures: 6,
    email: 'tom.burkhard@six-group.com', phone: '+41 58 399 21 02',
    bio: 'Tom leads the post-trade reconciliation platform and the FIX connectivity layer. He designed the automated break-detection pipeline used across clearing.',
  },
  {
    id: 'priya', name: 'Priya Rajan', initials: 'PR',
    role: 'Head of Regulatory Compliance', department: 'Regulatory Affairs',
    online: true, criticality: 'high',
    bestFor: ['MiFID II', 'SFDR', 'EMIR'],
    expertise: ['MiFID II', 'SFDR', 'EMIR', 'Regulatory Reporting', 'Product Governance'],
    years: 14, procedures: 12,
    email: 'priya.rajan@six-group.com', phone: '+41 58 399 21 03',
    bio: 'Priya heads regulatory compliance, translating EU regulation (MiFID II, SFDR, EMIR) into operational controls and reporting obligations.',
  },
  {
    id: 'marc', name: 'Marc Dubois', initials: 'MD',
    role: 'Data Governance Lead', department: 'Data Management',
    online: true, criticality: 'medium',
    bestFor: ['data governance', 'access', 'classification'],
    expertise: ['Data Governance', 'Access Control', 'Classification', 'Data Lineage', 'Policy'],
    years: 8, procedures: 5,
    email: 'marc.dubois@six-group.com', phone: '+41 58 399 21 04',
    bio: 'Marc runs the data governance framework — access policies, data classification, and lineage across the reference-data estate.',
  },
  {
    id: 'sofia', name: 'Sofia Novak', initials: 'SN',
    role: 'Senior Clearing Operations Manager', department: 'SIX x-clear',
    online: false, criticality: 'critical',
    bestFor: ['clearing', 'CCP', 'margin'],
    expertise: ['Clearing', 'CCP', 'Margin', 'Default Management', 'Collateral'],
    years: 13, procedures: 9,
    email: 'sofia.novak@six-group.com', phone: '+41 58 399 21 05',
    bio: 'Sofia manages CCP clearing operations and margin processes at SIX x-clear, including default-fund and intraday margin calls.',
  },
  {
    id: 'lukas', name: 'Lukas Weber', initials: 'LW',
    role: 'Platform Architect – Market Operations', department: 'Technology',
    online: true, criticality: 'medium',
    bestFor: ['exchange', 'market operations', 'risk'],
    expertise: ['Exchange', 'Market Operations', 'Risk', 'Matching Engine', 'Market Data'],
    years: 10, procedures: 7,
    email: 'lukas.weber@six-group.com', phone: '+41 58 399 21 06',
    bio: 'Lukas architects the market-operations platform spanning the exchange matching engine, market data, and operational risk controls.',
  },

  // ── Regular employees (not subject-matter experts) ──────────────────
  {
    id: 'lena', name: 'Lena Hofer', initials: 'LH',
    role: 'Operations Associate', department: 'Securities Services',
    online: true, expert: false,
    bestFor: ['onboarding', 'data entry'],
    expertise: ['Onboarding', 'Data Entry', 'Settlement Support'],
    years: 2, procedures: 0,
    email: 'lena.hofer@six-group.com', phone: '+41 58 399 21 07',
    bio: 'Lena supports the settlement operations team with counterparty onboarding and day-to-day data entry. She escalates exceptions to the settlement specialists.',
  },
  {
    id: 'david', name: 'David Meier', initials: 'DM',
    role: 'Compliance Analyst', department: 'Regulatory Affairs',
    online: false, expert: false,
    bestFor: ['reporting', 'monitoring'],
    expertise: ['Regulatory Reporting', 'Transaction Monitoring'],
    years: 3, procedures: 1,
    email: 'david.meier@six-group.com', phone: '+41 58 399 21 08',
    bio: 'David runs routine regulatory reporting and transaction monitoring under the guidance of the compliance leads.',
  },
  {
    id: 'nina', name: 'Nina Roth', initials: 'NR',
    role: 'Client Support Specialist', department: 'Member Services',
    online: true, expert: false,
    bestFor: ['support', 'queries'],
    expertise: ['Client Support', 'Query Handling', 'Member Onboarding'],
    years: 4, procedures: 0,
    email: 'nina.roth@six-group.com', phone: '+41 58 399 21 09',
    bio: 'Nina is the first point of contact for member queries, handling support tickets and routing technical issues to the right teams.',
  },
  {
    id: 'felix', name: 'Felix Brunner', initials: 'FB',
    role: 'Junior Data Analyst', department: 'Data Management',
    online: true, expert: false,
    bestFor: ['data quality', 'reporting'],
    expertise: ['Data Quality', 'Reporting', 'Reconciliation Support'],
    years: 1, procedures: 0,
    email: 'felix.brunner@six-group.com', phone: '+41 58 399 21 10',
    bio: 'Felix supports the data management team with data-quality checks and reporting, learning the governance framework from the senior leads.',
  },
]

export default function ExpertsPane() {
  const [selectedId, setSelectedId] = useState(null)
  const [messaging, setMessaging]   = useState(false)
  const [query, setQuery]           = useState('')
  const [dept, setDept]             = useState('All Departments')

  const departments = useMemo(
    () => ['All Departments', ...Array.from(new Set(EMPLOYEES.map(e => e.department))).sort()],
    []
  )

  const filtered = EMPLOYEES.filter(e => {
    const q = query.toLowerCase()
    const hit = e.name.toLowerCase().includes(q) ||
      e.role.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q) ||
      e.bestFor.some(t => t.toLowerCase().includes(q))
    return hit && (dept === 'All Departments' || e.department === dept)
  })

  const employee = EMPLOYEES.find(e => e.id === selectedId)
  const open = !!employee
  const lastRef = useRef(null)
  if (employee) lastRef.current = employee
  const shown = employee ?? lastRef.current

  return (
    <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden bg-canvas">
      {/* Search + department filter */}
      <div className="px-6 pt-6 pb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, domain, or department…"
              className="w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 py-2.5 text-sm outline-none transition-shadow focus:border-six focus:ring-4 focus:ring-six/10"
            />
          </div>
          <select
            value={dept}
            onChange={e => setDept(e.target.value)}
            className="shrink-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-600 outline-none transition-shadow focus:border-six focus:ring-4 focus:ring-six/10 cursor-pointer"
          >
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Card grid — 3 per row on wide screens */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(e => (
            <ExpertCard
              key={e.id}
              employee={e}
              onProfile={() => setSelectedId(e.id)}
              onContact={() => { setSelectedId(e.id); setMessaging(true) }}
            />
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="text-center text-xs text-neutral-400 py-10">No experts found.</p>
        )}
      </div>

      {/* Profile slide-in panel (right) */}
      <div
        onClick={() => setSelectedId(null)}
        className={`absolute inset-0 bg-black/20 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />
      <aside
        className={`absolute inset-y-0 right-0 z-10 w-[380px] max-w-[90%] flex flex-col bg-white border-l border-neutral-200/80 shadow-elevated transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {shown && (
          <ProfilePanel
            employee={shown}
            onClose={() => setSelectedId(null)}
            onContact={() => setMessaging(true)}
          />
        )}
      </aside>

      {messaging && employee && (
        <ContactExpertModal
          expert={{ ...employee, expert_name: employee.name, role_title: employee.role, expertise_tags: employee.expertise }}
          onClose={() => setMessaging(false)}
          onSubmitted={() => setMessaging(false)}
        />
      )}
    </div>
  )
}

function StatusDot({ online }) {
  return (
    <span
      title={online ? 'Online' : 'Offline'}
      className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-neutral-300'}`}
    />
  )
}

function ExpertCard({ employee, onProfile, onContact }) {
  return (
    <div className="flex flex-col rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-card">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm font-bold text-neutral-500">
          {employee.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-base font-bold text-ink truncate">{employee.name}</p>
            {employee.expert !== false && (
              <span className="shrink-0 rounded-full bg-six-light px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-six">
                Expert
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 truncate">{employee.role}</p>
          <p className="text-xs text-neutral-400 truncate">{employee.department}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusDot online={employee.online} />
          <span className={`text-[11px] font-medium ${employee.online ? 'text-emerald-600' : 'text-neutral-400'}`}>
            {employee.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Best for */}
      <div className="mt-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Best for</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {employee.bestFor.map(tag => (
            <span key={tag} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-500">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center border-t border-neutral-100 pt-3">
        <button
          type="button"
          onClick={onContact}
          className="flex flex-1 items-center justify-center gap-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:text-six"
        >
          <Mail size={13} /> Contact
        </button>
        <span className="h-4 w-px bg-neutral-200" />
        <button
          type="button"
          onClick={onProfile}
          className="flex flex-1 items-center justify-center gap-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:text-six"
        >
          <ExternalLink size={13} /> Profile
        </button>
      </div>
    </div>
  )
}

function ProfilePanel({ employee, onClose, onContact }) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-neutral-100 shrink-0">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-neutral-100 text-base font-bold text-neutral-500">
          {employee.initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-ink text-sm">{employee.name}</p>
          <p className="text-xs text-neutral-500">{employee.role}</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">{employee.department}</p>
          <div className="mt-1.5">
            <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${employee.online ? 'text-emerald-600' : 'text-neutral-400'}`}>
              <StatusDot online={employee.online} /> {employee.online ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="grid h-6 w-6 place-items-center rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-ink transition-colors shrink-0"
          type="button"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Contact</p>
          <div className="space-y-1.5">
            <a href={`mailto:${employee.email}`} className="flex items-center gap-2 text-xs text-ink hover:text-six transition-colors">
              <Mail size={12} className="text-neutral-400 shrink-0" />
              <span className="truncate">{employee.email}</span>
            </a>
            <a href={`tel:${employee.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-xs text-ink hover:text-six transition-colors">
              <Phone size={12} className="text-neutral-400 shrink-0" />
              <span>{employee.phone}</span>
            </a>
          </div>
        </div>

        <div className="flex gap-3">
          <Stat icon={Award} label="Years at SIX" value={employee.years} />
          <Stat icon={BookOpen} label="Captured procedures" value={employee.procedures} />
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5">About</p>
          <p className="text-xs text-ink leading-relaxed">{employee.bio}</p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Areas of expertise</p>
          <div className="flex flex-wrap gap-1.5">
            {employee.expertise.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-600">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-neutral-100 shrink-0 flex gap-2">
        <button
          onClick={onContact}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-six text-white text-xs font-semibold py-2 hover:bg-six/90 transition-colors"
          type="button"
        >
          <Mail size={12} /> Contact expert
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 text-ink text-xs font-semibold py-2 hover:bg-neutral-50 transition-colors"
          type="button"
        >
          <BookOpen size={12} /> View procedures
        </button>
      </div>
    </>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex-1 rounded-xl border border-neutral-200/80 bg-neutral-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} className="text-neutral-400" />
        <p className="text-[10px] text-neutral-400 font-medium">{label}</p>
      </div>
      <p className="font-display font-bold text-ink text-xl">{value}</p>
    </div>
  )
}
