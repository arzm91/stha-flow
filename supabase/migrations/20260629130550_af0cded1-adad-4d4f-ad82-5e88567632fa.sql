revoke execute on function public.has_role(uuid, public.app_role) from authenticated, anon, public;
revoke execute on function public.can_access_page(uuid, text, boolean) from authenticated, anon, public;
revoke execute on function public.effective_owner(uuid) from authenticated, anon, public;
revoke execute on function public.set_effective_owner() from authenticated, anon, public;

grant execute on function public.has_role(uuid, public.app_role) to service_role;
grant execute on function public.can_access_page(uuid, text, boolean) to service_role;
grant execute on function public.effective_owner(uuid) to service_role;
grant execute on function public.set_effective_owner() to service_role;