-- 0153 — the activation page knows which address it is for.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED, AND THE TRADE-OFF I AM MAKING DELIBERATELY
--
-- The activation page asked the invited person to TYPE their email, because
-- nothing about an invitation could be read before sign-in. The reasoning was
-- sound as far as it went: the token then identifies nobody, so a forwarded
-- link leaks no name.
--
-- It is the wrong balance in practice, and Dee is right about why. That
-- address is the person's login from then on, so the first thing the platform
-- ever asks them is to guess a value it already knows. A typo does not produce
-- "check your spelling" — it produces an account on the wrong address and an
-- invitation that silently will not match, which is a worse failure than the
-- one the secrecy prevented.
--
-- So the address is disclosed, and ONLY under conditions that keep the
-- disclosure bounded:
--
--   • the token must be a real invitation — a guess reveals nothing, and a
--     uuid is 122 bits of randomness that nobody guesses;
--   • it must not have expired;
--   • it must not already be accepted.
--
-- What a holder of a live link learns is one email address and the fact that
-- it was invited. What they still cannot do is use it: `accept_invitation`
-- requires the CALLER'S OWN authenticated email to match, and that check is
-- untouched. The link remains useless to anybody but the recipient.
--
-- Returns nothing at all rather than an error for a bad token, so the function
-- cannot be used to tell "expired" from "never existed" from "already used".
-- ---------------------------------------------------------------------------
create or replace function public.invitation_preview(p_token uuid)
returns table (email text, kind text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.email::text, i.kind::text, i.expires_at
    from public.invitations i
   where i.token = p_token
     and i.accepted_at is null
     and i.expires_at > now()
$$;
revoke execute on function public.invitation_preview(uuid) from public;
/* anon as well as authenticated: the whole point is that this runs for
   somebody who has no account yet. */
grant execute on function public.invitation_preview(uuid) to anon, authenticated;

comment on function public.invitation_preview(uuid) is
  'The address a live invitation was sent to, so the activation page can show it instead of asking the person to retype their own login. Returns nothing for a token that is unknown, expired or already used — so it cannot distinguish those three. Accepting still requires the caller''s own email to match.';
