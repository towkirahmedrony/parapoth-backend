-- Forward-only RBAC hardening. Prepared locally; do not apply to production
-- until reviewed against the live schema and an approved Super Admin bootstrap.
BEGIN;

-- Existing production assignments were inspected before drafting: no user had
-- multiple active role rows. Keep the migration fail-closed if that changes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE is_active IS TRUE
    GROUP BY user_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'RBAC migration stopped: resolve multiple active roles before applying';
  END IF;
END;
$$;

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IS NOT NULL AND role IN ('super_admin','admin','moderator','editor','teacher','student'));
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS valid_roles;
ALTER TABLE public.role_permissions ADD CONSTRAINT valid_roles
  CHECK (role IS NOT NULL AND role IN ('super_admin','admin','moderator','editor','teacher','student'));

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_active_role_per_user
  ON public.user_roles(user_id) WHERE is_active IS TRUE;

-- Canonical, operation-based permissions. This list covers existing routes and
-- the role-management operations implemented in this change.
INSERT INTO public.permissions(action, description) VALUES
 ('users.read','Read user records permitted to the caller'),
 ('users.manage','Manage user accounts within the caller’s authority'),
 ('roles.assign.staff','Assign or revoke moderator, editor, teacher, and student roles'),
 ('roles.assign.admin','Assign or revoke Admin roles'),
 ('roles.assign.super_admin','Assign or revoke Super Admin roles'),
 ('exams.manage','Manage platform exams'),
 ('questions.manage','Create and edit question content'),
 ('questions.review','Review and moderate question content'),
 ('moderation.review','Review moderation reports'),
 ('moderation.action','Perform explicitly authorized moderation actions'),
 ('analytics.read','Read administrative analytics'),
 ('settings.manage','Manage global application settings'),
 ('audit_logs.read','Read security audit records'),
 ('quotas.manage','Manage platform quotas and entitlements'),
 ('enterprise.manage','Manage enterprise operations')
ON CONFLICT (action) DO UPDATE SET description=EXCLUDED.description;

-- Add the canonical mappings without deleting existing permission data.
-- Super Admin is explicit and separate; ordinary Admin receives no
-- role.assign.admin or role.assign.super_admin permission.
INSERT INTO public.role_permissions(role, permission_id)
SELECT r.role, p.id
FROM (VALUES
 ('super_admin','users.read'),('super_admin','users.manage'),
 ('super_admin','roles.assign.staff'),('super_admin','roles.assign.admin'),('super_admin','roles.assign.super_admin'),
 ('super_admin','exams.manage'),('super_admin','questions.manage'),('super_admin','questions.review'),
 ('super_admin','moderation.review'),('super_admin','moderation.action'),('super_admin','analytics.read'),
 ('super_admin','settings.manage'),('super_admin','audit_logs.read'),('super_admin','quotas.manage'),('super_admin','enterprise.manage'),
 ('admin','users.read'),('admin','users.manage'),('admin','roles.assign.staff'),
 ('admin','exams.manage'),('admin','questions.manage'),('admin','questions.review'),
 ('admin','moderation.review'),('admin','moderation.action'),('admin','analytics.read'),
 ('admin','settings.manage'),('admin','quotas.manage'),('admin','enterprise.manage'),
 ('moderator','questions.review'),('moderator','moderation.review'),('moderator','moderation.action'),
 ('editor','questions.manage'),
 ('teacher','questions.manage')
) AS r(role, action)
JOIN public.permissions p ON p.action=r.action
ON CONFLICT (role,permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_permission(p_action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role=ur.role
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE ur.user_id=auth.uid() AND ur.is_active IS TRUE AND p.action=p_action
      AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.account_status='active')
  );
$$;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_permission(text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  target_user_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  old_values jsonb,
  new_values jsonb,
  outcome text NOT NULL CHECK (outcome IN ('success','denied')),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.security_audit_logs TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.security_audit_logs FROM service_role;
DROP POLICY IF EXISTS security_audit_logs_super_admin_read ON public.security_audit_logs;
CREATE POLICY security_audit_logs_super_admin_read ON public.security_audit_logs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid()
      AND ur.role='super_admin' AND ur.is_active IS TRUE
      AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.account_status='active'))
  );

CREATE OR REPLACE FUNCTION public.mirror_legacy_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.security_audit_logs(actor_user_id,action,resource_type,resource_id,outcome)
    VALUES(NEW.user_id,NEW.action,coalesce(NEW.target_table,'unknown'),NEW.target_id,'success');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mirror_legacy_admin_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS legacy_admin_audit_security_mirror ON public.audit_logs;
CREATE TRIGGER legacy_admin_audit_security_mirror
  AFTER INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.mirror_legacy_admin_audit();

CREATE OR REPLACE FUNCTION public.audit_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target uuid;
  v_old jsonb;
  v_new jsonb;
  v_action text;
  v_session_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    v_target := OLD.user_id;
    v_old := jsonb_build_object('role',OLD.role,'is_active',OLD.is_active);
    v_new := NULL;
    v_action := 'roles.assignment.revoked';
    v_actor := coalesce(v_actor,OLD.assigned_by);
  ELSE
    v_target := NEW.user_id;
    v_new := jsonb_build_object('role',NEW.role,'is_active',NEW.is_active);
    IF TG_OP='INSERT' THEN
      v_old := NULL;
      v_action := 'roles.assignment.created';
    ELSE
      v_old := jsonb_build_object('role',OLD.role,'is_active',OLD.is_active);
      v_action := 'roles.assignment.updated';
    END IF;
    v_actor := coalesce(v_actor,NEW.assigned_by);
  END IF;
  INSERT INTO public.security_audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,old_values,new_values,outcome)
  VALUES(v_actor,v_target,v_action,'user_role',v_target::text,v_old,v_new,'success');
  IF TG_OP='UPDATE' AND (OLD.role IS DISTINCT FROM NEW.role OR OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    FOR v_session_id IN
      SELECT s.id FROM public.admin_auth_sessions s WHERE s.user_id=v_target AND s.revoked_at IS NULL FOR UPDATE
    LOOP
      UPDATE public.admin_auth_sessions SET revoked_at=now(),revoked_by=v_actor WHERE id=v_session_id;
      INSERT INTO public.security_audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,outcome)
        VALUES(v_actor,v_target,'admin.session.revoked_role_change','admin_auth_session',v_session_id::text,'success');
    END LOOP;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_user_role_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_roles_security_audit ON public.user_roles;
CREATE TRIGGER user_roles_security_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_role_change();

CREATE OR REPLACE FUNCTION public.audit_role_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role text := CASE WHEN TG_OP='DELETE' THEN OLD.role ELSE NEW.role END;
  v_permission_id integer := CASE WHEN TG_OP='DELETE' THEN OLD.permission_id ELSE NEW.permission_id END;
  v_action text;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  SELECT p.action INTO v_action FROM public.permissions p WHERE p.id=v_permission_id;
  INSERT INTO public.security_audit_logs(actor_user_id,action,resource_type,resource_id,old_values,new_values,outcome)
  VALUES(auth.uid(),'roles.permission.'||lower(TG_OP),'role_permission',v_role||':'||v_action,
    CASE WHEN TG_OP='INSERT' THEN NULL ELSE jsonb_build_object('role',OLD.role,'action',v_action) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE jsonb_build_object('role',NEW.role,'action',v_action) END,'success');
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_role_permission_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS role_permissions_security_audit ON public.role_permissions;
CREATE TRIGGER role_permissions_security_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_role_permission_change();

-- The role write API is a SECURITY DEFINER RPC that derives the actor from
-- auth.uid(); clients and service-role-backed HTTP handlers cannot write roles
-- directly as a substitute for this authorization check.
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON public.permissions FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_role_permission(
  p_role text,
  p_action text,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_permission_id integer;
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id=v_actor
      AND ur.role='super_admin' AND ur.is_active IS TRUE
      AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=v_actor AND pr.account_status='active')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('super_admin','admin','moderator','editor','teacher','student')
     OR p_action IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid permission mapping' USING ERRCODE='22023';
  END IF;
  IF p_role='super_admin' THEN
    RAISE EXCEPTION 'Super Admin permissions are fixed' USING ERRCODE='42501';
  END IF;
  SELECT p.id INTO v_permission_id FROM public.permissions p WHERE p.action=p_action;
  IF v_permission_id IS NULL THEN RAISE EXCEPTION 'unknown permission' USING ERRCODE='22023'; END IF;
  IF p_enabled THEN
    INSERT INTO public.role_permissions(role,permission_id) VALUES(p_role,v_permission_id)
      ON CONFLICT (role,permission_id) DO NOTHING;
  ELSE
    DELETE FROM public.role_permissions WHERE role=p_role AND permission_id=v_permission_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_role_permission(text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_role_permission(text,text,boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.set_role_permission(text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_user_role(
  p_target_user_id uuid,
  p_role text,
  p_is_active boolean DEFAULT true
)
RETURNS public.user_roles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_existing public.user_roles;
  v_result public.user_roles;
  v_allowed_staff text[] := ARRAY['student','moderator','editor','teacher'];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('public.user_roles.assignment')::bigint);
  IF v_actor IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  IF p_target_user_id IS NULL OR p_role IS NULL OR p_is_active IS NULL
     OR p_role NOT IN ('super_admin','admin','moderator','editor','teacher','student') THEN
    RAISE EXCEPTION 'invalid role assignment' USING ERRCODE='22023';
  END IF;
  -- Revocation means a safe downgrade to the default Student role, not a user
  -- with no active authorization record.
  IF NOT p_is_active THEN
    p_role := 'student';
    p_is_active := true;
  END IF;

  SELECT ur.role INTO v_actor_role FROM public.user_roles ur
   JOIN public.profiles pr ON pr.id=ur.user_id AND pr.account_status='active'
   WHERE ur.user_id=v_actor AND ur.is_active IS TRUE LIMIT 1;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF p_target_user_id=v_actor THEN RAISE EXCEPTION 'self role changes are forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_existing FROM public.user_roles ur
   WHERE ur.user_id=p_target_user_id AND ur.is_active IS TRUE
   FOR UPDATE;
  IF FOUND THEN
    IF v_actor_role='admin' AND v_existing.role IN ('admin','super_admin') THEN
      RAISE EXCEPTION 'insufficient role authority' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT p_is_active THEN RAISE EXCEPTION 'no active role to revoke' USING ERRCODE='P0002'; END IF;
    SELECT * INTO v_existing FROM public.user_roles ur
      WHERE ur.user_id=p_target_user_id
      ORDER BY (ur.role=p_role) DESC,ur.updated_at DESC
      LIMIT 1 FOR UPDATE;
    IF FOUND AND v_actor_role='admin' AND v_existing.role IN ('admin','super_admin') THEN
      RAISE EXCEPTION 'insufficient role authority' USING ERRCODE='42501';
    END IF;
  END IF;

  IF v_actor_role='super_admin' THEN
    IF (p_role='super_admin' OR v_existing.role='super_admin')
       AND NOT public.has_permission('roles.assign.super_admin') THEN
      RAISE EXCEPTION 'insufficient role authority' USING ERRCODE='42501';
    END IF;
    IF (p_role='admin' OR v_existing.role='admin')
       AND NOT public.has_permission('roles.assign.admin') THEN
      RAISE EXCEPTION 'insufficient role authority' USING ERRCODE='42501';
    END IF;
    IF (p_role=ANY(v_allowed_staff) OR v_existing.role=ANY(v_allowed_staff))
       AND NOT public.has_permission('roles.assign.staff') THEN
      RAISE EXCEPTION 'insufficient role authority' USING ERRCODE='42501';
    END IF;
  ELSIF v_actor_role='admin' AND p_role=ANY(v_allowed_staff)
        AND public.has_permission('roles.assign.staff')
        AND (v_existing.user_id IS NULL OR v_existing.role=ANY(v_allowed_staff)) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'insufficient role authority' USING ERRCODE='42501';
  END IF;

  IF v_existing.user_id IS NOT NULL AND v_existing.role='super_admin'
     AND (p_role<>'super_admin' OR NOT p_is_active)
     AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=v_existing.user_id AND pr.account_status='active') THEN
    IF (SELECT count(*) FROM public.user_roles ur JOIN public.profiles pr ON pr.id=ur.user_id
        WHERE ur.role='super_admin' AND ur.is_active IS TRUE AND pr.account_status='active') <= 1 THEN
      RAISE EXCEPTION 'cannot remove the last active Super Admin' USING ERRCODE='23514';
    END IF;
  END IF;

  IF v_existing.user_id IS NOT NULL THEN
    UPDATE public.user_roles SET role=p_role,is_active=p_is_active,assigned_by=v_actor
      WHERE id=v_existing.id RETURNING * INTO v_result;
  ELSE
    IF NOT p_is_active THEN RAISE EXCEPTION 'no active role to revoke' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.user_roles(user_id,role,is_active,assigned_by)
      VALUES(p_target_user_id,p_role,true,v_actor) RETURNING * INTO v_result;
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_user_role(uuid,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_user_role(uuid,text,boolean) FROM service_role;
GRANT EXECUTE ON FUNCTION public.assign_user_role(uuid,text,boolean) TO authenticated;

-- Admin and Super Admin remain the only roles recognized by existing broad
-- is_admin() policies. Role management itself is governed by the RPC above.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=auth.uid() AND ur.is_active IS TRUE
      AND ur.role IN ('admin','super_admin')
      AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.account_status='active'));
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- App-level revocation ledger. It stores Supabase session IDs, never JWTs.
CREATE TABLE IF NOT EXISTS public.admin_auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_session_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.admin_auth_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_auth_sessions FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.admin_auth_sessions FROM service_role;
GRANT SELECT ON public.admin_auth_sessions TO service_role;
GRANT SELECT ON public.admin_auth_sessions TO authenticated;
DROP POLICY IF EXISTS admin_auth_sessions_super_admin_read ON public.admin_auth_sessions;
CREATE POLICY admin_auth_sessions_super_admin_read ON public.admin_auth_sessions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid()
      AND ur.role='super_admin' AND ur.is_active IS TRUE
      AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=auth.uid() AND pr.account_status='active'))
  );

CREATE OR REPLACE FUNCTION public.register_admin_auth_session()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session uuid;
  v_id uuid;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=v_user AND ur.is_active IS TRUE AND ur.role IN ('admin','super_admin')
      AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=v_user AND pr.account_status='active'))
    THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_session := nullif(auth.jwt()->>'session_id','')::uuid;
  IF v_session IS NULL THEN RAISE EXCEPTION 'session unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.admin_auth_sessions(user_id,auth_session_id)
    VALUES(v_user,v_session) ON CONFLICT (auth_session_id) DO UPDATE
      SET last_seen_at=now()
      WHERE admin_auth_sessions.user_id=EXCLUDED.user_id AND admin_auth_sessions.revoked_at IS NULL;
  SELECT s.id INTO v_id FROM public.admin_auth_sessions s
    WHERE s.auth_session_id=v_session AND s.user_id=v_user;
  IF v_id IS NULL THEN RAISE EXCEPTION 'session identity mismatch' USING ERRCODE='42501'; END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.register_admin_auth_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_admin_auth_session() FROM service_role;
GRANT EXECUTE ON FUNCTION public.register_admin_auth_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_admin_auth_session(p_session_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target uuid;
  v_target_role text;
BEGIN
  SELECT ur.role INTO v_actor_role FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id=ur.user_id AND pr.account_status='active'
    WHERE ur.user_id=v_actor AND ur.is_active IS TRUE LIMIT 1;
  IF v_actor IS NULL OR v_actor_role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT s.user_id INTO v_target FROM public.admin_auth_sessions s
    WHERE s.id=p_session_record_id AND s.revoked_at IS NULL FOR UPDATE;
  IF v_target IS NULL THEN RAISE EXCEPTION 'session not found' USING ERRCODE='P0002'; END IF;
  SELECT ur.role INTO v_target_role FROM public.user_roles ur
    WHERE ur.user_id=v_target AND ur.is_active IS TRUE LIMIT 1;
  IF v_actor_role='admin' AND v_target_role IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'insufficient role authority' USING ERRCODE='42501';
  END IF;
  UPDATE public.admin_auth_sessions SET revoked_at=now(),revoked_by=v_actor WHERE id=p_session_record_id;
  INSERT INTO public.security_audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,old_values,new_values,outcome)
    VALUES(v_actor,v_target,'admin.session.revoked','admin_auth_session',p_session_record_id::text,
      jsonb_build_object('revoked_at',NULL),jsonb_build_object('revoked_at',now()),'success');
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_admin_auth_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_admin_auth_session(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.revoke_admin_auth_session(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_current_admin_auth_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_session uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  v_record_id uuid;
BEGIN
  IF v_actor IS NULL OR v_session IS NULL THEN
    RAISE EXCEPTION 'session unavailable' USING ERRCODE='42501';
  END IF;
  UPDATE public.admin_auth_sessions
     SET revoked_at=now(),revoked_by=v_actor
   WHERE user_id=v_actor AND auth_session_id=v_session AND revoked_at IS NULL
   RETURNING id INTO v_record_id;
  IF v_record_id IS NOT NULL THEN
    INSERT INTO public.security_audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,old_values,new_values,outcome)
      VALUES(v_actor,v_actor,'admin.session.logout','admin_auth_session',v_record_id::text,
        jsonb_build_object('revoked_at',NULL),jsonb_build_object('revoked_at',now()),'success');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_current_admin_auth_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_current_admin_auth_session() FROM service_role;
GRANT EXECUTE ON FUNCTION public.revoke_current_admin_auth_session() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_account_status(p_target_user_id uuid,p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_old_status public.user_status;
  v_session_id uuid;
BEGIN
  IF v_actor IS NULL OR p_target_user_id IS NULL OR p_status IS NULL OR p_status NOT IN ('active','suspended') THEN
    RAISE EXCEPTION 'invalid account status request' USING ERRCODE='22023';
  END IF;
  SELECT ur.role INTO v_actor_role FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id=ur.user_id AND pr.account_status='active'
    WHERE ur.user_id=v_actor AND ur.is_active IS TRUE LIMIT 1;
  IF v_actor_role IS NULL OR NOT public.has_permission('users.manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_target_user_id=v_actor THEN RAISE EXCEPTION 'self status changes are forbidden' USING ERRCODE='42501'; END IF;
  SELECT pr.account_status INTO v_old_status FROM public.profiles pr WHERE pr.id=p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found' USING ERRCODE='P0002'; END IF;
  SELECT ur.role INTO v_target_role FROM public.user_roles ur WHERE ur.user_id=p_target_user_id AND ur.is_active IS TRUE LIMIT 1;
  IF v_actor_role='admin' AND v_target_role IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'insufficient role authority' USING ERRCODE='42501';
  END IF;
  IF v_target_role='super_admin' AND v_old_status='active' AND p_status='suspended'
     AND (SELECT count(*) FROM public.user_roles ur JOIN public.profiles pr ON pr.id=ur.user_id
          WHERE ur.role='super_admin' AND ur.is_active IS TRUE AND pr.account_status='active') <= 1 THEN
    RAISE EXCEPTION 'cannot suspend the last active Super Admin' USING ERRCODE='23514';
  END IF;
  UPDATE public.profiles SET account_status=p_status::public.user_status WHERE id=p_target_user_id;
  INSERT INTO public.security_audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,old_values,new_values,outcome)
    VALUES(v_actor,p_target_user_id,CASE WHEN p_status='suspended' THEN 'account.suspended' ELSE 'account.restored' END,
      'profile',p_target_user_id::text,jsonb_build_object('account_status',v_old_status),
      jsonb_build_object('account_status',p_status),'success');
  IF p_status='suspended' THEN
    FOR v_session_id IN SELECT id FROM public.admin_auth_sessions WHERE user_id=p_target_user_id AND revoked_at IS NULL FOR UPDATE
    LOOP
      UPDATE public.admin_auth_sessions SET revoked_at=now(),revoked_by=v_actor WHERE id=v_session_id;
      INSERT INTO public.security_audit_logs(actor_user_id,target_user_id,action,resource_type,resource_id,outcome)
        VALUES(v_actor,p_target_user_id,'admin.session.revoked_account_suspension','admin_auth_session',v_session_id::text,'success');
    END LOOP;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_user_account_status(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_account_status(uuid,text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.set_user_account_status(uuid,text) TO authenticated;

COMMIT;
