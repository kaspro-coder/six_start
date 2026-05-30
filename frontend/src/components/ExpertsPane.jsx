import { useState } from 'react'
import { Mail, BookOpen, Award, ChevronRight, X } from 'lucide-react'
import ContactExpertModal from './ContactExpertModal.jsx'

const EXPERTS = [
  {
    id: 'jacob',
    name: 'Jacob Müller',
    initials: 'JM',
    role: 'Master Data SME',
    years: 12,
    department: 'Reference Data Services',
    bio: 'Jacob owns the end-to-end Master Data Opening and mutation process. His workflows cover ISIN onboarding, ESG classification, and SFDR instrument tagging — knowledge built over a decade of regulatory change.',
    expertise: ['Master Data Opening', 'SFDR Classification', 'ESG Data', 'MiFID II', 'Counterparty Onboarding'],
    procedures: 7,
    color: 'bg-six text-white',
  },
  {
    id: 'elena',
    name: 'Elena Vasquez',
    initials: 'EV',
    role: 'Regulatory Compliance Lead',
    years: 9,
    department: 'Compliance & Regulatory Affairs',
    bio: 'Elena leads the regulatory interpretation practice, translating evolving EU and US rules into operational checklists. She is the go-to for FATCA edge cases and MiFID II product governance.',
    expertise: ['FATCA Reporting', 'MiFID II Product Governance', 'Regulatory Reporting', 'Compliance Audits'],
    procedures: 5,
    color: 'bg-indigo-500 text-white',
  },
  {
    id: 'thomas',
    name: 'Thomas Brunner',
    initials: 'TB',
    role: 'Reference Data Specialist',
    years: 15,
    department: 'Reference Data Services',
    bio: 'Thomas is the institutional memory of the Reference Data team. With 15 years of service, he has seen every system migration and can resolve data integrity issues that stump the whole department.',
    expertise: ['Counterparty Data', 'Instrument Reference Data', 'Data Lineage', 'Reconciliation', 'System Migration'],
    procedures: 9,
    color: 'bg-emerald-600 text-white',
  },
  {
    id: 'priya',
    name: 'Priya Sharma',
    initials: 'PS',
    role: 'ESG Data Analyst',
    years: 6,
    department: 'Sustainable Finance',
    bio: 'Priya specialises in the intersection of ESG taxonomy and regulatory disclosure. She built the internal PAI indicator framework and trains junior analysts on SFDR Article 8/9 classification.',
    expertise: ['SFDR Article 8/9', 'EU Taxonomy', 'PAI Indicators', 'ESG Ratings', 'Disclosure RTS'],
    procedures: 4,
    color: 'bg-teal-600 text-white',
  },
  {
    id: 'marco',
    name: 'Marco Ferreira',
    initials: 'MF',
    role: 'Operations Manager',
    years: 11,
    department: 'Data Operations',
    bio: "Marco runs the day-to-day data operations workflow. His team handles bulk instrument updates, vendor feed reconciliation, and exception management. He's the person who keeps the lights on.",
    expertise: ['Bulk Data Processing', 'Vendor Feeds', 'Exception Management', 'SLA Management', 'Team Procedures'],
    procedures: 6,
    color: 'bg-amber-600 text-white',
  },
]

export default function ExpertsPane() {
  const [selected, setSelected]   = useState(null)
  const [messaging, setMessaging] = useState(false)

  const expert = EXPERTS.find(e => e.id === selected)

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ── Roster grid ───────────────────────────────────────────── */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden ${selected ? 'max-w-[420px]' : ''}`}>
        <div className="px-6 pt-6 pb-4 shrink-0 border-b border-neutral-100">
          <h1 className="font-display font-bold text-ink text-base">Expert Roster</h1>
          <p className="text-xs text-neutral-400 mt-0.5">Veteran employees whose knowledge is captured in SIXsens</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-3">
            {EXPERTS.map(e => (
              <ExpertCard
                key={e.id}
                expert={e}
                active={selected === e.id}
                onClick={() => setSelected(selected === e.id ? null : e.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Profile panel ──────────────────────────────────────────── */}
      {expert && (
        <div className="w-[400px] shrink-0 flex flex-col border-l border-neutral-200/80 bg-white overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-start gap-3 px-5 py-4 border-b border-neutral-100 shrink-0">
            <div className={`h-12 w-12 rounded-2xl grid place-items-center text-base font-bold shrink-0 ${expert.color}`}>
              {expert.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-ink text-sm">{expert.name}</p>
              <p className="text-xs text-neutral-500">{expert.role}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">{expert.department}</p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="grid h-6 w-6 place-items-center rounded-md hover:bg-neutral-100 text-neutral-400 hover:text-ink transition-colors shrink-0"
            >
              <X size={13} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Stats row */}
            <div className="flex gap-3">
              <Stat icon={Award} label="Years at SIX" value={expert.years} />
              <Stat icon={BookOpen} label="Captured procedures" value={expert.procedures} />
            </div>

            {/* Bio */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1.5">About</p>
              <p className="text-xs text-ink leading-relaxed">{expert.bio}</p>
            </div>

            {/* Expertise */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Areas of expertise</p>
              <div className="flex flex-wrap gap-1.5">
                {expert.expertise.map(tag => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-3 border-t border-neutral-100 shrink-0 flex gap-2">
            <button
              onClick={() => setMessaging(true)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-six text-white text-xs font-semibold py-2 hover:bg-six/90 transition-colors"
            >
              <Mail size={12} />
              Contact expert
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 text-ink text-xs font-semibold py-2 hover:bg-neutral-50 transition-colors">
              <BookOpen size={12} />
              View procedures
            </button>
          </div>
        </div>
      )}

      {messaging && expert && (
        <ContactExpertModal
          expert={{ ...expert, expert_name: expert.name, role_title: expert.role, expertise_tags: expert.expertise }}
          onClose={() => setMessaging(false)}
          onSubmitted={() => setMessaging(false)}
        />
      )}
    </div>
  )
}

function ExpertCard({ expert, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
        active
          ? 'border-six/30 bg-six-light'
          : 'border-neutral-200/70 bg-white hover:border-six/20 hover:bg-neutral-50 shadow-card'
      }`}
    >
      <div className={`h-10 w-10 rounded-xl grid place-items-center text-sm font-bold shrink-0 ${expert.color}`}>
        {expert.initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">{expert.name}</p>
        <p className="text-xs text-neutral-500">{expert.role} · {expert.years}y</p>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {expert.expertise.slice(0, 3).map(tag => (
            <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
              {tag}
            </span>
          ))}
          {expert.expertise.length > 3 && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-400">
              +{expert.expertise.length - 3}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={14} className={`shrink-0 transition-colors ${active ? 'text-six' : 'text-neutral-300'}`} />
    </button>
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

