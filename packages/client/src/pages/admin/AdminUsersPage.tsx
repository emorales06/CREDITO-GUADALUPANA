import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ROLE_LABELS, ROLES, adminCreateUserSchema, type AdminUserDTO, type Role } from '@guadalupana/shared';
import { useAdminUsers, useCreateUser, useDismissReset, useResetPassword, useResetRequests, useUpdateUser } from '../../api/admin.ts';
import { ApiError } from '../../api/client.ts';
import { useAuth } from '../../auth/AuthContext.tsx';
import { firstErrors } from '../../components/auth.tsx';
import { Banner, Dialog, EmptyState, Icon, SkeletonRows, Spinner, formatDate, formatDateTime, initials, useToast } from '../../components/ui.tsx';

interface Secret { username: string; password: string; reason: string }

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data: users, isLoading, error } = useAdminUsers();
  const { data: resets } = useResetRequests();
  const update = useUpdateUser();
  const reset = useResetPassword();
  const dismiss = useDismissReset();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [query, setQuery] = useState('');

  const visible = (users ?? []).filter((u) => `${u.fullName} ${u.username}`.toLowerCase().includes(query.trim().toLowerCase()));
  const onError = (e: Error) => toast('No se pudo completar la acción', 'error', e.message);

  const changeRole = (u: AdminUserDTO, role: Role) =>
    update.mutate({ id: u.id, changes: { role } }, { onSuccess: () => toast(`${u.fullName} ahora es ${ROLE_LABELS[role].toLowerCase()}`), onError });
  const toggleActive = (u: AdminUserDTO) =>
    update.mutate({ id: u.id, changes: { isActive: !u.isActive } }, {
      onSuccess: () => toast(u.isActive ? `${u.fullName} fue desactivado` : `${u.fullName} fue activado`, 'ok', u.isActive ? 'Sus sesiones abiertas se cerraron.' : undefined),
      onError,
    });
  const issueTemp = (userId: number, username: string) =>
    reset.mutate(userId, { onSuccess: (r) => setSecret({ username, password: r.temporaryPassword, reason: 'Contraseña temporal emitida' }), onError });

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="large-title">Usuarios y accesos</h1>
          <p>Cree cuentas, cambie roles, desactive accesos y atienda solicitudes de restablecimiento. Todo queda en la bitácora.</p>
        </div>
        <button type="button" className="btn btn-light" onClick={() => setCreating(true)}><Icon name="plus" /> Nuevo usuario</button>
      </div>

      {resets && resets.length > 0 && (
        <section className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div className="card-head">
            <h2 className="title-3">Solicitudes de restablecimiento</h2>
            <span className="tag tag--accent">{resets.length} pendiente{resets.length === 1 ? '' : 's'}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Usuario</th><th>Solicitada</th><th className="num">Acción</th></tr></thead>
              <tbody>
                {resets.map((r) => (
                  <tr key={r.id}>
                    <td><span className="cell-strong">{r.fullName}</span> <span className="muted small">@{r.username}</span></td>
                    <td className="muted">{formatDateTime(r.createdAt)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn btn-plain btn-sm" onClick={() => dismiss.mutate(r.id, { onSuccess: () => toast('Solicitud descartada'), onError })}>Descartar</button>
                      <button type="button" className="btn btn-primary btn-sm" disabled={reset.isPending} onClick={() => issueTemp(r.userId, r.username)}>Emitir temporal</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <h2 className="title-3">Cuentas</h2>
          <div className="input-wrap" style={{ width: 280, maxWidth: '100%' }}>
            <span className="lead-icon"><Icon name="search" /></span>
            <input className="input" placeholder="Buscar por nombre o usuario" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar usuarios" />
          </div>
        </div>
        {error && <div style={{ padding: '0 20px 16px' }}><Banner tone="error">{error.message}</Banner></div>}
        {isLoading ? <SkeletonRows cols={5} /> : visible.length === 0 ? <EmptyState icon="users" title="Sin coincidencias" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th className="hide-sm">Alta</th><th className="num">Acciones</th></tr></thead>
              <tbody>
                {visible.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="avatar" style={{ width: 30, height: 30, fontSize: '0.65rem' }} aria-hidden="true">{initials(u.fullName)}</span>
                          <div>
                            <div className="cell-strong">{u.fullName} {self && <span className="tag">usted</span>}</div>
                            <div className="muted small">@{u.username}{u.mustChangePassword ? ' · debe cambiar contraseña' : ''}{u.pendingReset ? ' · pidió restablecer' : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select className="input" style={{ height: 36, minHeight: 36, width: 150 }} value={u.role} disabled={update.isPending}
                          aria-label={`Rol de ${u.fullName}`} onChange={(e) => changeRole(u, e.target.value as Role)}>
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button type="button" className="switch" role="switch" aria-checked={u.isActive} aria-label={`Cuenta de ${u.fullName} activa`}
                            disabled={update.isPending || self} onClick={() => toggleActive(u)} />
                          <span className="small muted">{u.isActive ? 'Activa' : 'Inactiva'}</span>
                        </div>
                      </td>
                      <td className="muted hide-sm">{formatDate(u.createdAt)}</td>
                      <td className="num">
                        <button type="button" className="btn btn-secondary btn-sm" disabled={reset.isPending || self} title={self ? 'Use "Cambiar contraseña" en su menú' : undefined} onClick={() => issueTemp(u.id, u.username)}>
                          <Icon name="key" size={15} /> Restablecer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateUserDialog open={creating} onClose={() => setCreating(false)}
        onCreated={(username, password) => { setCreating(false); setSecret({ username, password, reason: 'Cuenta creada' }); }} />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </main>
  );
}

function CreateUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (username: string, password: string) => void }) {
  const create = useCreateUser();
  const [form, setForm] = useState<{ fullName: string; username: string; role: Role }>({ fullName: '', username: '', role: 'ANALISTA' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = adminCreateUserSchema.safeParse(form);
    if (!parsed.success) return setErrors(firstErrors(z.flattenError(parsed.error).fieldErrors));
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (r) => { setForm({ fullName: '', username: '', role: 'ANALISTA' }); onCreated(r.user.username, r.temporaryPassword); },
      onError: (err) => setErrors(err instanceof ApiError && Object.keys(err.fields).length ? firstErrors(err.fields) : { form: err.message }),
    });
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="new-user-title">
      <h2 id="new-user-title" className="title-2" style={{ marginBottom: 6 }}>Nuevo usuario</h2>
      <p className="muted small" style={{ margin: '0 0 18px' }}>Se generará una contraseña temporal; el usuario deberá cambiarla en su primer acceso.</p>
      <form className="grid" style={{ gap: 14 }} onSubmit={submit} noValidate>
        {errors.form && <Banner tone="error">{errors.form}</Banner>}
        <div className="field">
          <label htmlFor="nu-name">Nombre completo</label>
          <input id="nu-name" className="input" value={form.fullName} aria-invalid={errors.fullName ? true : undefined} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
          {errors.fullName && <span className="error">{errors.fullName}</span>}
        </div>
        <div className="field">
          <label htmlFor="nu-user">Usuario</label>
          <input id="nu-user" className="input" value={form.username} aria-invalid={errors.username ? true : undefined} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))} />
          {errors.username && <span className="error">{errors.username}</span>}
        </div>
        <div className="field">
          <label htmlFor="nu-role">Rol</label>
          <select id="nu-role" className="input" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>{create.isPending && <Spinner />} Crear usuario</button>
        </div>
      </form>
    </Dialog>
  );
}

/** La contraseña temporal se muestra una sola vez; no se guarda en el navegador. */
function SecretDialog({ secret, onClose }: { secret: Secret | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={secret !== null} onClose={onClose} labelledBy="secret-title">
      {secret && (
        <>
          <h2 id="secret-title" className="title-2" style={{ marginBottom: 6 }}>{secret.reason}</h2>
          <p className="muted small" style={{ margin: '0 0 16px' }}>
            Entregue esta contraseña temporal a <b>@{secret.username}</b> por un canal seguro. No se volverá a mostrar.
          </p>
          <div className="secret">
            <span>{secret.password}</span>
            <button type="button" className="btn btn-plain btn-sm" onClick={() => void navigator.clipboard.writeText(secret.password).then(() => setCopied(true))}>
              <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copiada' : 'Copiar'}
            </button>
          </div>
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={() => { setCopied(false); onClose(); }}>Listo</button>
        </>
      )}
    </Dialog>
  );
}
