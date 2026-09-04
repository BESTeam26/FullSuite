-- Custom Workspaces — owner experience. Three data-level rules the UI must
-- never be the only enforcer of.

-- 1. Fields retire, they are not deleted while values reference them.
alter table public.workspace_fields add column archived_at timestamptz;
create trigger work_item_field_values_updated_at before update on public.work_item_field_values
  for each row execute function public.set_updated_at();

-- 2. A field value is only as free as its field type says. Custom fields never
--    become authorization or workflow truth; they are typed data on an item.
create or replace function public.work_item_field_values_validate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text; v_options jsonb; v_archived timestamptz; v_ws uuid; v_item_ws uuid;
begin
  select f.field_type, f.options, f.archived_at, f.workspace_id into v_type, v_options, v_archived, v_ws
    from public.workspace_fields f where f.id = new.field_id;
  select w.workspace_id into v_item_ws from public.work_items w where w.id = new.work_item_id;
  if v_type is null or v_item_ws is null or v_ws is distinct from v_item_ws then
    raise exception 'field belongs to another workspace' using errcode = '23514';
  end if;
  if v_archived is not null then
    raise exception 'field is archived' using errcode = '23514';
  end if;
  if new.value is null or jsonb_typeof(new.value) = 'null' then
    return new;  -- clearing a value is always allowed
  end if;
  case v_type
    when 'text' then
      if jsonb_typeof(new.value) <> 'string' or length(new.value #>> '{}') > 2000 then
        raise exception 'text field expects a string of at most 2000 characters' using errcode = '23514'; end if;
    when 'number' then
      if jsonb_typeof(new.value) <> 'number' then
        raise exception 'number field expects a number' using errcode = '23514'; end if;
    when 'date' then
      if jsonb_typeof(new.value) <> 'string' or (new.value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'date field expects YYYY-MM-DD' using errcode = '23514'; end if;
      perform (new.value #>> '{}')::date;
    when 'select' then
      if jsonb_typeof(new.value) <> 'string'
         or not (coalesce(v_options -> 'choices', '[]'::jsonb) ? (new.value #>> '{}')) then
        raise exception 'select field expects one of its choices' using errcode = '23514'; end if;
    when 'checkbox' then
      if jsonb_typeof(new.value) <> 'boolean' then
        raise exception 'checkbox field expects true or false' using errcode = '23514'; end if;
    else
      raise exception 'unsupported field type %', v_type using errcode = '23514';
  end case;
  return new;
end $$;
revoke execute on function public.work_item_field_values_validate() from public, anon, authenticated;
create trigger work_item_field_values_validate before insert or update on public.work_item_field_values
  for each row execute function public.work_item_field_values_validate();

-- Select options must be a {"choices": [...strings]} object, or absent.
alter table public.workspace_fields add constraint workspace_fields_options_shape check (
  options is null
  or (jsonb_typeof(options) = 'object'
      and (options -> 'choices' is null or jsonb_typeof(options -> 'choices') = 'array'))
);

-- 3. An assignee must be a legitimate person for the record: for
--    ORGANIZATION-scope work an active member of that organization, or — in a
--    workspace shared under a live TalentOps engagement — staff of the agency;
--    for AGENCY-scope work, staff of the agency. Frontend pickers are already
--    server-authorized (assignable_profiles); this makes the rule true for a
--    guessed id too.
create or replace function public.work_items_assignee_allowed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null then return new; end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;

  if new.scope = 'AGENCY' then
    if not exists (select 1 from public.agency_memberships am where am.user_id = new.assigned_to and am.agency_id = new.agency_id) then
      raise exception 'assignee is not staff of this agency' using errcode = '23514';
    end if;
    return new;
  end if;

  if exists (select 1 from public.org_memberships om where om.user_id = new.assigned_to and om.organization_id = new.organization_id) then
    return new;
  end if;
  if new.workspace_id is not null
     and exists (select 1 from public.agency_memberships am where am.user_id = new.assigned_to and am.agency_id = new.agency_id)
     and exists (
       select 1 from public.workspace_shares s
         join public.fulfillment_engagements e on e.id = s.engagement_id
        where s.workspace_id = new.workspace_id and s.revoked_at is null and s.access = 'work'
          and (s.board_id is null or s.board_id = new.board_id)
          and e.service = 'talentops' and e.organization_id = new.organization_id
          and public.engagement_is_live(e.status, e.effective_from, e.effective_to)) then
    return new;
  end if;
  raise exception 'assignee is not a member of this organization (or BES staff under a live work share)' using errcode = '23514';
end $$;
revoke execute on function public.work_items_assignee_allowed() from public, anon, authenticated;
create trigger work_items_assignee_allowed before insert or update on public.work_items
  for each row execute function public.work_items_assignee_allowed();

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
