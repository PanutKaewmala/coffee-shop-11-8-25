-- Canonical, data-free fingerprints used by the TALVO staging recovery gate.
--
-- Set talvo.manifest_scope to one of:
--   talvo-post       - every object in talvo plus the four public artifacts
--                      owned by the migration.
--   public-baseline  - every non-extension public object except those four
--                      migration-owned artifacts.
--
-- The caller compares both object_count and manifest_sha256. Definitions are
-- encoded as jsonb and length-prefixed before hashing so embedded delimiters or
-- newlines cannot make two different manifests hash the same input stream.

create temporary view talvo_recovery_manifest as
with
params as (
  select current_setting('talvo.manifest_scope', true) as scope
),
scoped_relations as (
  select c.*, n.nspname
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join params p
  where (
      p.scope='talvo-post'
      and (
        n.nspname='talvo'
        or (
          n.nspname='public'
          and c.relname='branch_shop_id_id_uidx'
          and c.relkind in ('i','I')
        )
      )
    )
    or (
      p.scope='public-baseline'
      and n.nspname='public'
      and not (
        c.relname='branch_shop_id_id_uidx'
        and c.relkind in ('i','I')
      )
      and not exists(
        select 1
        from pg_catalog.pg_depend d
        where d.classid='pg_class'::regclass
          and d.objid=c.oid
          and d.deptype='e'
      )
    )
),
scoped_types as (
  select t.*, n.nspname
  from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid=t.typnamespace
  cross join params p
  where (p.scope='talvo-post' and n.nspname='talvo')
     or (
       p.scope='public-baseline'
       and n.nspname='public'
       and not exists(
         select 1
         from pg_catalog.pg_depend d
         where d.classid='pg_type'::regclass
           and d.objid=t.oid
           and d.deptype='e'
       )
     )
),
scoped_functions as (
  select p.*, n.nspname, l.lanname
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_language l on l.oid=p.prolang
  cross join params scope
  where (
      scope.scope='talvo-post'
      and (
        n.nspname='talvo'
        or p.oid=to_regprocedure(
          'public.create_talvo_supply_item(uuid,text,uuid,numeric,boolean,text,text)'
        )
      )
    )
    or (
      scope.scope='public-baseline'
      and n.nspname='public'
      and p.oid is distinct from to_regprocedure(
        'public.create_talvo_supply_item(uuid,text,uuid,numeric,boolean,text,text)'
      )
      and not exists(
        select 1
        from pg_catalog.pg_depend d
        where d.classid='pg_proc'::regclass
          and d.objid=p.oid
          and d.deptype='e'
      )
    )
),
manifest_rows(kind, object_identity, definition) as (
  select
    'scope',
    coalesce(p.scope,'<unset>'),
    jsonb_build_object('scope',p.scope)::text
  from params p

  union all

  select
    'schema',
    format('%I@%s',n.nspname,n.oid),
    jsonb_build_object(
      'owner',pg_get_userbyid(n.nspowner),
      'acl',n.nspacl,
      'comment',obj_description(n.oid,'pg_namespace')
    )::text
  from pg_catalog.pg_namespace n
  cross join params p
  where (p.scope='talvo-post' and n.nspname='talvo')
     or (p.scope='public-baseline' and n.nspname='public')

  union all

  select
    'relation',
    format('%I.%I@%s',r.nspname,r.relname,r.oid),
    jsonb_build_object(
      'kind',r.relkind,
      'persistence',r.relpersistence,
      'owner',pg_get_userbyid(r.relowner),
      'acl',r.relacl,
      'options',r.reloptions,
      'rls',r.relrowsecurity,
      'force_rls',r.relforcerowsecurity,
      'replica_identity',r.relreplident,
      'is_partition',r.relispartition,
      'partition_bound',pg_get_expr(r.relpartbound,r.oid,true),
      'partition_key',case when r.relkind='p' then pg_get_partkeydef(r.oid) end,
      'tablespace',ts.spcname,
      'comment',obj_description(r.oid,'pg_class')
    )::text
  from scoped_relations r
  left join pg_catalog.pg_tablespace ts on ts.oid=r.reltablespace

  union all

  select
    'column',
    format('%I.%I.%I#%s@%s',n.nspname,c.relname,a.attname,a.attnum,a.attrelid),
    jsonb_build_object(
      'type',format_type(a.atttypid,a.atttypmod),
      'dimensions',a.attndims,
      'not_null',a.attnotnull,
      'has_default',a.atthasdef,
      'default',pg_get_expr(ad.adbin,ad.adrelid,true),
      'identity',a.attidentity,
      'generated',a.attgenerated,
      'collation',case when a.attcollation<>0 then a.attcollation::regcollation::text end,
      'storage',a.attstorage,
      'compression',a.attcompression,
      'statistics',a.attstattarget,
      'options',a.attoptions,
      'fdw_options',a.attfdwoptions,
      'acl',a.attacl,
      'missing_value',a.attmissingval::text,
      'comment',col_description(a.attrelid,a.attnum)
    )::text
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  left join pg_catalog.pg_attrdef ad
    on ad.adrelid=a.attrelid and ad.adnum=a.attnum
  cross join params p
  where a.attnum>0
    and not a.attisdropped
    and (
      exists(select 1 from scoped_relations r where r.oid=a.attrelid)
      or (
        p.scope='talvo-post'
        and n.nspname='public'
        and c.relname='branch'
        and a.attname='is_active'
      )
    )
    and not (
      p.scope='public-baseline'
      and n.nspname='public'
      and c.relname='branch'
      and a.attname='is_active'
    )

  union all

  select
    'constraint',
    format('%s.%I@%s',
      coalesce(format('%I.%I',rn.nspname,rc.relname),format_type(con.contypid,null)),
      con.conname,
      con.oid
    ),
    jsonb_build_object(
      'type',con.contype,
      'definition',pg_get_constraintdef(con.oid,true),
      'deferrable',con.condeferrable,
      'deferred',con.condeferred,
      'validated',con.convalidated,
      'no_inherit',con.connoinherit,
      'local',con.conislocal,
      'inherit_count',con.coninhcount,
      'parent_oid',con.conparentid,
      'comment',obj_description(con.oid,'pg_constraint')
    )::text
  from pg_catalog.pg_constraint con
  left join pg_catalog.pg_class rc on rc.oid=con.conrelid
  left join pg_catalog.pg_namespace rn on rn.oid=rc.relnamespace
  where exists(select 1 from scoped_relations r where r.oid=con.conrelid)
     or exists(select 1 from scoped_types t where t.oid=con.contypid)

  union all

  select
    'index',
    format('%I.%I@%s',r.nspname,r.relname,r.oid),
    jsonb_build_object(
      'definition',pg_get_indexdef(i.indexrelid,0,true),
      'unique',i.indisunique,
      'primary',i.indisprimary,
      'exclusion',i.indisexclusion,
      'immediate',i.indimmediate,
      'clustered',i.indisclustered,
      'valid',i.indisvalid,
      'checkxmin',i.indcheckxmin,
      'ready',i.indisready,
      'live',i.indislive,
      'replica_identity',i.indisreplident,
      'keys',i.indkey::text,
      'classes',i.indclass::text,
      'collations',i.indcollation::text,
      'options',i.indoption::text,
      'expressions',pg_get_expr(i.indexprs,i.indrelid,true),
      'predicate',pg_get_expr(i.indpred,i.indrelid,true)
    )::text
  from pg_catalog.pg_index i
  join scoped_relations r on r.oid=i.indexrelid

  union all

  select
    'view',
    format('%I.%I@%s',r.nspname,r.relname,r.oid),
    jsonb_build_object('definition',pg_get_viewdef(r.oid,true))::text
  from scoped_relations r
  where r.relkind in ('v','m')

  union all

  select
    'sequence',
    format('%I.%I@%s',r.nspname,r.relname,r.oid),
    jsonb_build_object(
      'type',format_type(s.seqtypid,null),
      'start',s.seqstart,
      'increment',s.seqincrement,
      'max',s.seqmax,
      'min',s.seqmin,
      'cache',s.seqcache,
      'cycle',s.seqcycle
    )::text
  from pg_catalog.pg_sequence s
  join scoped_relations r on r.oid=s.seqrelid

  union all

  select
    'inheritance',
    format('%I.%I->%s#%s',child.nspname,child.relname,parent.oid,inh.inhseqno),
    jsonb_build_object(
      'parent',format('%I.%I',pn.nspname,parent.relname),
      'detach_pending',inh.inhdetachpending
    )::text
  from pg_catalog.pg_inherits inh
  join scoped_relations child on child.oid=inh.inhrelid
  join pg_catalog.pg_class parent on parent.oid=inh.inhparent
  join pg_catalog.pg_namespace pn on pn.oid=parent.relnamespace

  union all

  select
    'function',
    format('%I.%I(%s)@%s',f.nspname,f.proname,pg_get_function_identity_arguments(f.oid),f.oid),
    jsonb_build_object(
      'kind',f.prokind,
      'definition',case when f.prokind in ('f','p') then pg_get_functiondef(f.oid) end,
      'result',pg_get_function_result(f.oid),
      'owner',pg_get_userbyid(f.proowner),
      'language',f.lanname,
      'acl',f.proacl,
      'security_definer',f.prosecdef,
      'leakproof',f.proleakproof,
      'strict',f.proisstrict,
      'returns_set',f.proretset,
      'volatility',f.provolatile,
      'parallel',f.proparallel,
      'cost',f.procost,
      'rows',f.prorows,
      'config',f.proconfig,
      'source',case when f.prokind not in ('f','p') then f.prosrc end,
      'binary',f.probin,
      'comment',obj_description(f.oid,'pg_proc')
    )::text
  from scoped_functions f

  union all

  select
    'trigger',
    format('%I.%I.%I@%s',n.nspname,c.relname,t.tgname,t.oid),
    jsonb_build_object(
      'definition',pg_get_triggerdef(t.oid,true),
      'enabled',t.tgenabled,
      'deferrable',t.tgdeferrable,
      'initially_deferred',t.tginitdeferred,
      'arguments',encode(t.tgargs,'hex'),
      'old_table',t.tgoldtable,
      'new_table',t.tgnewtable,
      'comment',obj_description(t.oid,'pg_trigger')
    )::text
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  cross join params p
  where not t.tgisinternal
    and (
      exists(select 1 from scoped_relations r where r.oid=t.tgrelid)
      or (
        p.scope='talvo-post'
        and n.nspname='public'
        and c.relname='branch'
        and t.tgname='talvo_supply_item_integrity_from_branch'
      )
    )
    and not (
      p.scope='public-baseline'
      and n.nspname='public'
      and c.relname='branch'
      and t.tgname='talvo_supply_item_integrity_from_branch'
    )

  union all

  select
    'policy',
    format('%I.%I.%I@%s',r.nspname,r.relname,p.polname,p.oid),
    jsonb_build_object(
      'permissive',p.polpermissive,
      'command',p.polcmd,
      'roles',(
        select jsonb_agg(
          case when role_oid=0 then 'PUBLIC' else pg_get_userbyid(role_oid) end
          order by role_oid
        )
        from unnest(p.polroles) as roles(role_oid)
      ),
      'using',pg_get_expr(p.polqual,p.polrelid,true),
      'check',pg_get_expr(p.polwithcheck,p.polrelid,true)
    )::text
  from pg_catalog.pg_policy p
  join scoped_relations r on r.oid=p.polrelid

  union all

  select
    'type',
    format('%I.%I@%s',t.nspname,t.typname,t.oid),
    jsonb_build_object(
      'kind',t.typtype,
      'category',t.typcategory,
      'preferred',t.typispreferred,
      'defined',t.typisdefined,
      'delimiter',t.typdelim,
      'owner',pg_get_userbyid(t.typowner),
      'acl',t.typacl,
      'relation_oid',t.typrelid,
      'element_oid',t.typelem,
      'array_oid',t.typarray,
      'input',t.typinput::regproc::text,
      'output',t.typoutput::regproc::text,
      'receive',t.typreceive::regproc::text,
      'send',t.typsend::regproc::text,
      'modifier_input',t.typmodin::regproc::text,
      'modifier_output',t.typmodout::regproc::text,
      'analyze',t.typanalyze::regproc::text,
      'alignment',t.typalign,
      'storage',t.typstorage,
      'not_null',t.typnotnull,
      'base_oid',t.typbasetype,
      'modifier',t.typtypmod,
      'dimensions',t.typndims,
      'collation_oid',t.typcollation,
      'default_binary',t.typdefaultbin,
      'default_value',t.typdefault,
      'comment',obj_description(t.oid,'pg_type')
    )::text
  from scoped_types t

  union all

  select
    'enum-label',
    format('%I.%I.%s@%s',t.nspname,t.typname,e.enumlabel,e.oid),
    jsonb_build_object('sort_order',e.enumsortorder)::text
  from pg_catalog.pg_enum e
  join scoped_types t on t.oid=e.enumtypid

  union all

  select
    'range',
    format('%I.%I@%s',t.nspname,t.typname,t.oid),
    jsonb_build_object(
      'subtype',r.rngsubtype,
      'multirange',r.rngmultitypid,
      'collation',r.rngcollation,
      'subtype_opclass',r.rngsubopc,
      'canonical',r.rngcanonical::regproc::text,
      'subtype_diff',r.rngsubdiff::regproc::text
    )::text
  from pg_catalog.pg_range r
  join scoped_types t on t.oid=r.rngtypid

  union all

  select
    'rule',
    format('%I.%I.%I@%s',r.nspname,r.relname,rw.rulename,rw.oid),
    jsonb_build_object(
      'definition',pg_get_ruledef(rw.oid,true),
      'enabled',rw.ev_enabled,
      'instead',rw.is_instead
    )::text
  from pg_catalog.pg_rewrite rw
  join scoped_relations r on r.oid=rw.ev_class
  where rw.rulename<>'_RETURN'

  union all

  select
    'default-acl',
    format('%I.%s.%s@%s',n.nspname,pg_get_userbyid(d.defaclrole),d.defaclobjtype,d.oid),
    jsonb_build_object('acl',d.defaclacl)::text
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
  cross join params p
  where (p.scope='talvo-post' and n.nspname='talvo')
     or (p.scope='public-baseline' and n.nspname='public')
),
canonical as (
  select
    count(*)::bigint as object_count,
    string_agg(
      length(kind)::text||':'||kind||
      length(object_identity)::text||':'||object_identity||
      length(definition)::text||':'||definition,
      E'\n'
      order by kind,object_identity,definition
    ) as manifest_text
  from manifest_rows
)
select
  object_count,
  encode(
    extensions.digest(
      convert_to(coalesce(manifest_text,''),'UTF8'),
      'sha256'
    ),
    'hex'
  ) as manifest_sha256
from canonical;
