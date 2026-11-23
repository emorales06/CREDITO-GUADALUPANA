import { Link } from 'react-router-dom';
import { BUREAU_STATUSES, REQUEST_STATUSES, ROLE_LABELS, ROLES, STATUS_LABELS, formatUSD } from '@guadalupana/shared';
import { useAdminAudit, useAdminOverview } from '../../api/admin.ts';
import { Banner, EmptyState, SkeletonRows, formatDateTime } from '../../components/ui.tsx';

const BUREAU_LABELS = { PENDIENTE: 'En cola', CONSULTANDO: 'Consultando', COMPLETADO: 'Completadas', FALLIDO: 'Fallidas' } as const;

const bytes = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const duration = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

export function AdminOverviewPage() {
  const { data: o, isLoading, error } = useAdminOverview();
  const { data: audit } = useAdminAudit();

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="large-title">Resumen del sistema</h1>
          <p>Vista detallada de usuarios, solicitudes, buró, presupuesto y bitácoras. Se actualiza cada 15 segundos.</p>
        </div>
      </div>

      {error && <Banner tone="error" title="No se pudo cargar el resumen">{error.message}</Banner>}
      {isLoading || !o ? (
        <div className="card"><SkeletonRows rows={6} cols={4} /></div>
      ) : (
        <div className="grid" style={{ gap: 20 }}>
          <div className="stat-grid">
            <section className="stat">
              <h3>Presupuesto</h3>
              <dl>
                <div><dt>Total</dt><dd>{formatUSD(o.budget.totalCents)}</dd></div>
                <div><dt>Desembolsado</dt><dd>{formatUSD(o.budget.approvedCents)}</dd></div>
                <div><dt>Disponible</dt><dd>{formatUSD(o.budget.availableCents)}</dd></div>
                <div><dt>Utilizado</dt><dd>{((o.budget.approvedCents / o.budget.totalCents) * 100).toFixed(1)} %</dd></div>
              </dl>
            </section>
            <section className="stat">
              <h3>Solicitudes</h3>
              <dl>
                {REQUEST_STATUSES.map((s) => (
                  <div key={s}><dt>{STATUS_LABELS[s]}</dt><dd>{o.requests[s].count} · {formatUSD(o.requests[s].amountCents)}</dd></div>
                ))}
              </dl>
            </section>
            <section className="stat">
              <h3>Buró crediticio</h3>
              <dl>
                {BUREAU_STATUSES.map((s) => <div key={s}><dt>{BUREAU_LABELS[s]}</dt><dd>{o.bureau[s]}</dd></div>)}
                <div><dt>Intentos promedio</dt><dd>{o.bureau.avgAttempts}</dd></div>
              </dl>
            </section>
            <section className="stat">
              <h3>Usuarios</h3>
              <dl>
                {ROLES.map((r) => <div key={r}><dt>{ROLE_LABELS[r]}</dt><dd>{o.users[r]}</dd></div>)}
                <div><dt>Inactivos</dt><dd>{o.users.inactive}</dd></div>
                <div>
                  <dt>Restablecimientos pendientes</dt>
                  <dd>{o.pendingResets > 0 ? <Link to="/admin/usuarios">{o.pendingResets} por atender</Link> : 0}</dd>
                </div>
              </dl>
            </section>
            <section className="stat">
              <h3>Sistema</h3>
              <dl>
                <div><dt>Versión del esquema</dt><dd>v{o.system.schemaVersion}</dd></div>
                <div><dt>Base de datos</dt><dd>{bytes(o.system.dbSizeBytes)}</dd></div>
                <div><dt>Node.js</dt><dd>{o.system.node}</dd></div>
                <div><dt>En línea</dt><dd>{duration(o.system.uptimeSeconds)}</dd></div>
                <div><dt>Eventos de auditoría</dt><dd>{o.auditEntries} + {o.adminEntries} admin.</dd></div>
              </dl>
            </section>
          </div>

          <section className="card" style={{ overflow: 'hidden' }}>
            <div className="card-head">
              <h2 className="title-3">Bitácora administrativa</h2>
              <span className="muted small">Inmutable · altas, cambios de rol, contraseñas y apariencia</span>
            </div>
            {!audit?.length ? (
              <EmptyState icon="shield" title="Sin eventos administrativos" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Objetivo</th><th>Detalle</th></tr></thead>
                  <tbody>
                    {audit.map((e) => (
                      <tr key={e.id}>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.timestamp)}</td>
                        <td className="cell-strong">{e.actor}</td>
                        <td><span className="tag tag--accent">{e.action.replaceAll('_', ' ').toLowerCase()}</span></td>
                        <td className="muted">{e.target}</td>
                        <td style={{ maxWidth: 420 }}>{e.detail ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
