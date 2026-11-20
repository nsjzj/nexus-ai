-- Add stable message ordering without deleting existing conversation history.
alter table public.messages
  add column if not exists position integer;

with ranked_messages as (
  select
    id,
    row_number() over (
      partition by conversation_id
      order by created_at asc, id asc
    ) - 1 as message_position
  from public.messages
  where position is null
)
update public.messages as target
set position = ranked_messages.message_position
from ranked_messages
where target.id = ranked_messages.id;

alter table public.messages
  alter column position set not null;

create unique index if not exists messages_conversation_position_unique_idx
  on public.messages (conversation_id, position);
