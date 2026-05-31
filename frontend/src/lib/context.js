// Frontend context collector (spec 09 §1).
//
// Builds the UserContext snapshot the backend engine reasons over. The current
// page / workflow stand in for what a real Cluely-style overlay would read off
// the active screen; here we infer them from the mock dashboard the expert
// works in and capture any text the user has highlighted in the window.

const USER_PROFILE = {
  user_id: 'user_cosmina',
  role: 'Junior Compliance Officer',
  department: 'Regulatory Data Services',
  location: 'Zurich',
}

// The surface the user is "looking at". The Expert Space renders the Master
// Data Opening screen, so that's our default current page/workflow.
const DEFAULT_PAGE = '/master-data/opening'

let activeScreenContext = ''

export function setActiveScreenContext(value = '') {
  activeScreenContext = String(value || '').trim().slice(0, 1200)
}

/**
 * Collect the structured user context to send with a question.
 * @param {object} opts
 * @param {string[]} [opts.recentQueries] - prior user questions this session
 * @param {string}   [opts.currentPage]   - override the inferred page
 * @returns {object} UserContext payload for /api/answer
 */
export function collectUserContext({ recentQueries = [], currentPage, screenContext, ...overrides } = {}) {
  let selectedText = ''
  try {
    selectedText = (window.getSelection?.()?.toString() ?? '').trim().slice(0, 400)
  } catch {
    selectedText = ''
  }

  return {
    ...USER_PROFILE,
    ...overrides,
    current_page: currentPage || DEFAULT_PAGE,
    selected_text: selectedText || undefined,
    screen_context: screenContext || activeScreenContext || undefined,
    recent_queries: recentQueries.slice(-5),
  }
}

export { USER_PROFILE }
