-- Applied to production as migration 20261024095926_persist_normalized_signup_username.
-- Previous live history ended at 20261024075947; this is a forward-only change.
-- This forward-only change updates the existing auth.users profile trigger;
-- it does not rewrite existing profiles, roles, or other application data.
BEGIN;

-- The existing profiles.username column already has a lowercase-format CHECK
-- constraint and a UNIQUE index. Fail before changing the trigger if the live
-- data does not satisfy the corresponding case-folded policy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE username IS NOT NULL
      AND (username !~ '^[a-z0-9_]{3,20}$' OR username <> lower(username))
  ) THEN
    RAISE EXCEPTION 'Username migration stopped: invalid existing username found';
  END IF;

  IF EXISTS (
    SELECT lower(username)
    FROM public.profiles
    WHERE username IS NOT NULL
    GROUP BY lower(username)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Username migration stopped: case-insensitive duplicate found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username text := nullif(lower(btrim(NEW.raw_user_meta_data ->> 'username')), '');
BEGIN
  IF v_username IS NOT NULL AND v_username !~ '^[a-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'Invalid username' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, username, account_status)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    v_username,
    'active'
  );

  RETURN NEW;
END;
$$;

COMMIT;
