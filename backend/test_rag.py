from retrieval_engine import query_sixth_sense
r = query_sixth_sense('SFDR article 8')
print('official:', len(r['official_rules']), 'chunks')
print('expert:', len(r['expert_workflow_context']), 'chunks')
if r['official_rules']:
    print('\nSample chunk:', r['official_rules'][0].page_content[:200])
