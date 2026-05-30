// Accounts you can sign in as. Experts receive the Expert Inbox (incoming
// knowledge requests); non-experts (e.g. a compliance officer) do not.
export const USERS = [
  {
    id: 'cosmina',
    name: 'Cosmina Petrescu',
    role: 'Compliance Officer',
    department: 'Regulatory Affairs',
    initials: 'CP',
    isExpert: false,
  },
  {
    id: 'priya',
    name: 'Priya Rajan',
    role: 'Head of Regulatory Compliance',
    department: 'Regulatory Affairs',
    initials: 'PR',
    isExpert: true,
  },
  {
    id: 'anna',
    name: 'Anna Steiner',
    role: 'Senior Settlement Specialist',
    department: 'Securities Services',
    initials: 'AS',
    isExpert: true,
  },
]
