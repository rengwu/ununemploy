-- Completed legacy turns retain their engine as historical provenance.
-- Pending/retryable requests keep IDs, messages, revisions, errors and state.
UPDATE profile_turns
SET engine='assistant', context='{"page":"profile","dirty":false}'
WHERE engine='profile' AND state!='complete';
