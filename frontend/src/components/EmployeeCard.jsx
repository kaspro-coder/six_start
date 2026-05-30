import { Mail, User, Users } from 'lucide-react'

export default function EmployeeCard({ employee, onSelect }) {
  if (!employee) return null
  const name = employee.full_name ?? employee.expert_name
  const active = employee.active ?? employee.employment_status !== 'former'

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? 'bg-six text-white' : 'bg-neutral-200 text-neutral-500'}`}>
          <User size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-ink">{name}</p>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
              {active ? 'Active' : 'Former'}
            </span>
          </div>
          <p className="truncate text-[11px] text-neutral-500">{employee.role_title}</p>
          <p className="truncate text-[10px] text-neutral-400">{employee.department}</p>
        </div>
      </div>

      {employee.profile_summary && (
        <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">{employee.profile_summary}</p>
      )}

      {employee.expertise_tags?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {employee.expertise_tags.slice(0, 5).map(tag => (
            <span key={tag} className="rounded-full bg-six-light px-1.5 py-0.5 text-[9px] font-semibold text-six">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        {employee.email && (
          <a
            href={`mailto:${employee.email}`}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-[10px] font-semibold text-neutral-600 hover:border-six hover:text-six"
          >
            <Mail size={11} /> Email
          </a>
        )}
        <button
          type="button"
          onClick={() => onSelect?.(employee)}
          disabled={!active}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-six px-2 py-1.5 text-[10px] font-bold text-white shadow-six-glow hover:bg-six-dark disabled:bg-neutral-200 disabled:text-neutral-400 disabled:shadow-none"
        >
          <Users size={11} /> Contact
        </button>
      </div>
    </article>
  )
}
